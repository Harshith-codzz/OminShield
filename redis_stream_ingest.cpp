// redis_stream_ingest.cpp — OmniShield AI High-Performance C++ Ingestion Pipeline
//
// Build command:
//   g++ -std=c++17 -O2 -o redis_stream_ingest redis_stream_ingest.cpp \
//       -lhiredis -levent -lpthread
//
// Reads newline-delimited JSON from a named FIFO (or file), batches entries,
// and pushes them into a Redis Stream using true hiredis pipelining.
//
// Design:
//   Thread 1 (Reader)  — reads FIFO, fills shared deque, triggers immediate
//                         flush via event_base_once() when batch_size reached.
//   Thread 2 (libevent) — owns Redis connection, runs flush_pipeline() on
//                         a recurring timer AND on the zero-timeval one-shot
//                         triggered by Thread 1.
//
// Prohibitions enforced:
//   ✗ No redisAsyncCommand
//   ✗ No redisGetReply inside the append/buffer phase
//   ✗ No JSON parsing in C++
//   ✗ No blocking Redis commands inside the libevent loop

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstring>
#include <deque>
#include <fstream>
#include <iostream>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

// hiredis (blocking context for pipelined writes)
#include <hiredis/hiredis.h>

// libevent
#include <event2/event.h>
#include <event2/util.h>

// POSIX
#include <signal.h>
#include <unistd.h>

// ─── Tuneable defaults ────────────────────────────────────────────────────────
static const char*  DEFAULT_HOST      = "127.0.0.1";
static int          DEFAULT_PORT      = 6379;
static const char*  DEFAULT_STREAM    = "logs:raw";
static const char*  DEFAULT_FIELD     = "data";
static int          DEFAULT_BATCH     = 75;
static int          DEFAULT_INTERVAL  = 20;   // ms
static const char*  DEFAULT_INPUT     = "/tmp/log_pipe";

// ─── Shared state ─────────────────────────────────────────────────────────────
struct SharedState {
    std::deque<std::string> deque;
    std::mutex              mtx;

    std::atomic<uint64_t>   ingested{0};
    std::atomic<uint64_t>   errors{0};
    std::atomic<bool>       done{false};

    // libevent base (owned by event-loop thread)
    struct event_base*      evbase{nullptr};

    // Pointer to EvCtx — set by event-loop thread, read by reader thread
    // for event_base_once() one-shot flush callbacks
    std::atomic<void*>      evctx_ptr{nullptr};

    // Config
    std::string  host{DEFAULT_HOST};
    int          port{DEFAULT_PORT};
    std::string  stream{DEFAULT_STREAM};
    std::string  field{DEFAULT_FIELD};
    int          batch_size{DEFAULT_BATCH};
    int          interval_ms{DEFAULT_INTERVAL};
    std::string  input_path{DEFAULT_INPUT};
    bool         verbose{false};
};

static SharedState G;

// ─── Redis reconnect helper ───────────────────────────────────────────────────
static redisContext* connect_redis(const std::string& host, int port) {
    redisContext* ctx = nullptr;
    for (int attempt = 1; attempt <= 5; ++attempt) {
        ctx = redisConnect(host.c_str(), port);
        if (ctx && ctx->err == 0) return ctx;
        int wait_ms = 200 * attempt;
        std::cerr << "[INGEST] Redis connect error (attempt " << attempt << "): "
                  << (ctx ? ctx->errstr : "null context") << " — retrying in "
                  << wait_ms << "ms\n";
        if (ctx) { redisFree(ctx); ctx = nullptr; }
        std::this_thread::sleep_for(std::chrono::milliseconds(wait_ms));
    }
    std::cerr << "[INGEST] FATAL: could not connect to Redis after 5 attempts.\n";
    return nullptr;
}

// ─── flush_pipeline — mandatory two-phase pattern ────────────────────────────
//
//  Phase 1 (buffer): redisAppendCommand for each log → local hiredis buffer only.
//                    Zero network I/O during this phase.
//  Phase 2 (harvest): first redisGetReply() flushes entire buffer in ONE syscall;
//                     subsequent calls harvest one reply each.
//
static void flush_pipeline(redisContext*& ctx, std::vector<std::string>& batch) {
    if (batch.empty()) return;

    // Phase 1 — buffer phase (no network I/O)
    for (const auto& line : batch) {
        const char* data_ptr = line.data();
        size_t      data_len = line.size();
        redisAppendCommand(ctx, "XADD %s * %s %b",
                           G.stream.c_str(),
                           G.field.c_str(),
                           data_ptr, data_len);
    }

    // Phase 2 — harvest phase (one flush syscall + reply loop)
    size_t n = batch.size();
    for (size_t i = 0; i < n; ++i) {
        redisReply* reply = nullptr;
        if (redisGetReply(ctx, (void**)&reply) == REDIS_ERR) {
            std::cerr << "[INGEST] redisGetReply error: " << ctx->errstr << "\n";
            G.errors.fetch_add(1, std::memory_order_relaxed);
            // Reconnect with backoff — drop in-flight batch
            redisFree(ctx);
            ctx = connect_redis(G.host, G.port);
            if (!ctx) { G.done.store(true); return; }
            break;
        }
        if (reply) {
            if (G.verbose && reply->type == REDIS_REPLY_ERROR) {
                std::cerr << "[INGEST] XADD error: " << reply->str << "\n";
            }
            freeReplyObject(reply);
            G.ingested.fetch_add(1, std::memory_order_relaxed);
        }
    }

    batch.clear();
}

// ─── Callback context for libevent callbacks ─────────────────────────────────
struct EvCtx {
    redisContext*       ctx{nullptr};
    std::vector<std::string> batch;
    uint64_t            last_stats_ingested{0};
    std::chrono::steady_clock::time_point last_stats_time;
};

// ─── Timer/one-shot callback shared by both flush triggers ───────────────────
static void on_flush(evutil_socket_t, short, void* arg) {
    auto* ec = static_cast<EvCtx*>(arg);

    // Drain the shared deque into the local batch
    {
        std::lock_guard<std::mutex> lk(G.mtx);
        while (!G.deque.empty()) {
            ec->batch.push_back(std::move(G.deque.front()));
            G.deque.pop_front();
        }
    }

    if (ec->batch.empty()) return;
    flush_pipeline(ec->ctx, ec->batch);
}

// ─── Stats reporter callback (every 5 seconds) ───────────────────────────────
static void on_stats(evutil_socket_t, short, void* arg) {
    auto* ec = static_cast<EvCtx*>(arg);
    auto  now = std::chrono::steady_clock::now();
    double elapsed = std::chrono::duration<double>(now - ec->last_stats_time).count();
    if (elapsed < 0.1) return;

    uint64_t total    = G.ingested.load(std::memory_order_relaxed);
    uint64_t delta    = total - ec->last_stats_ingested;
    double   eps      = delta / elapsed;
    uint64_t errs     = G.errors.load(std::memory_order_relaxed);

    fprintf(stderr, "[STATS] ingested=%lu  eps=%.0f  errors=%lu\n",
            (unsigned long)total, eps, (unsigned long)errs);

    ec->last_stats_ingested = total;
    ec->last_stats_time     = now;
}

// ─── Wrapper passed to event_base_once() from reader thread ──────────────────
static void once_flush_cb(evutil_socket_t fd, short what, void* arg) {
    on_flush(fd, what, arg);
}

// ─── libevent event-loop thread (Thread 2) ───────────────────────────────────
static void event_loop_thread() {
    redisContext* ctx = connect_redis(G.host, G.port);
    if (!ctx) { G.done.store(true); return; }

    struct event_base* base = event_base_new();
    G.evbase = base;   // publish so reader thread can call event_base_once()

    EvCtx ec;
    ec.ctx             = ctx;
    ec.last_stats_time = std::chrono::steady_clock::now();
    G.evctx_ptr.store(&ec, std::memory_order_release);  // publish for reader thread

    // Recurring flush timer
    struct timeval tv_flush;
    tv_flush.tv_sec  = G.interval_ms / 1000;
    tv_flush.tv_usec = (G.interval_ms % 1000) * 1000;
    struct event* ev_timer = event_new(base, -1, EV_PERSIST, on_flush, &ec);
    event_add(ev_timer, &tv_flush);

    // Recurring stats timer (5s)
    struct timeval tv_stats{5, 0};
    struct event* ev_stats = event_new(base, -1, EV_PERSIST, on_stats, &ec);
    event_add(ev_stats, &tv_stats);

    // Run until done
    while (!G.done.load(std::memory_order_relaxed)) {
        event_base_loop(base, EVLOOP_ONCE | EVLOOP_NONBLOCK);
        std::this_thread::sleep_for(std::chrono::microseconds(500));
    }

    // Final flush
    {
        std::lock_guard<std::mutex> lk(G.mtx);
        while (!G.deque.empty()) {
            ec.batch.push_back(std::move(G.deque.front()));
            G.deque.pop_front();
        }
    }
    flush_pipeline(ec.ctx, ec.batch);

    event_free(ev_timer);
    event_free(ev_stats);
    event_base_free(base);
    redisFree(ec.ctx);
    std::cerr << "[INGEST] Event loop thread exited cleanly.\n";
}

// ─── Reader thread (Thread 1) ─────────────────────────────────────────────────
static void reader_thread() {
    // Wait for libevent thread to publish evbase
    while (!G.evbase && !G.done.load()) {
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }

    std::ifstream fin(G.input_path);
    if (!fin.is_open()) {
        std::cerr << "[INGEST] Cannot open input: " << G.input_path << "\n";
        G.done.store(true);
        return;
    }
    std::cerr << "[INGEST] Reading from: " << G.input_path << "\n";

    std::string line;
    while (!G.done.load() && std::getline(fin, line)) {
        if (line.empty()) continue;

        bool do_immediate_flush = false;
        {
            std::lock_guard<std::mutex> lk(G.mtx);
            G.deque.push_back(std::move(line));
            if ((int)G.deque.size() >= G.batch_size) {
                do_immediate_flush = true;
            }
        }

        if (do_immediate_flush && G.evbase) {
            // Fire a zero-timeval one-shot event on the event-loop thread
            struct timeval tv_zero{0, 0};
            event_base_once(G.evbase, -1, EV_TIMEOUT, once_flush_cb, G.evctx_ptr.load(std::memory_order_acquire), &tv_zero);
        }
    }

    std::cerr << "[INGEST] Input stream ended — signalling shutdown.\n";
    G.done.store(true);
}

// ─── CLI parsing ──────────────────────────────────────────────────────────────
static void parse_args(int argc, char* argv[]) {
    for (int i = 1; i < argc; ++i) {
        std::string arg(argv[i]);
        if (arg == "--host"     && i+1 < argc) { G.host       = argv[++i]; }
        else if (arg == "--port"     && i+1 < argc) { G.port       = std::stoi(argv[++i]); }
        else if (arg == "--stream"   && i+1 < argc) { G.stream     = argv[++i]; }
        else if (arg == "--field"    && i+1 < argc) { G.field      = argv[++i]; }
        else if (arg == "--batch"    && i+1 < argc) { G.batch_size = std::stoi(argv[++i]); }
        else if (arg == "--interval" && i+1 < argc) { G.interval_ms= std::stoi(argv[++i]); }
        else if (arg == "--input"    && i+1 < argc) { G.input_path = argv[++i]; }
        else if (arg == "--verbose")                { G.verbose    = true; }
        else {
            std::cerr << "Unknown flag: " << arg << "\n";
        }
    }
}

// ─── Signal handler ───────────────────────────────────────────────────────────
static void sig_handler(int) {
    std::cerr << "\n[INGEST] Signal received — stopping.\n";
    G.done.store(true);
}

// ─── main ─────────────────────────────────────────────────────────────────────
int main(int argc, char* argv[]) {
    signal(SIGINT,  sig_handler);
    signal(SIGTERM, sig_handler);

    parse_args(argc, argv);

    std::cerr << "[INGEST] OmniShield AI ingestion pipeline starting\n"
              << "         host=" << G.host << ":" << G.port
              << "  stream=" << G.stream
              << "  batch=" << G.batch_size
              << "  interval=" << G.interval_ms << "ms\n"
              << "         input=" << G.input_path << "\n";

    // Thread 2: libevent + Redis
    std::thread ev_thread(event_loop_thread);

    // Thread 1: FIFO reader
    std::thread rd_thread(reader_thread);

    rd_thread.join();
    G.done.store(true);
    ev_thread.join();

    std::cerr << "[INGEST] Final: ingested=" << G.ingested.load()
              << "  errors=" << G.errors.load() << "\n";
    return 0;
}
