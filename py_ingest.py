"""
py_ingest.py — OmniShield AI Python FIFO-to-Redis Ingestion Pipeline
Replaces redis_stream_ingest.cpp — no compilation required.

Reads newline-delimited JSON from /tmp/log_pipe (or --input path) and
pushes each line into a Redis Stream using redis-py pipelining.

Two-phase batching (mirrors the C++ design):
  - Read up to BATCH_SIZE lines from the FIFO.
  - Call pipe.xadd() for each line  (local buffer only, no network I/O).
  - Call pipe.execute() once to flush the entire batch in a single round-trip.

Usage:
    python3 py_ingest.py [--host 127.0.0.1] [--port 6379]
                         [--stream logs:raw] [--field data]
                         [--batch 75] [--input /tmp/log_pipe]
                         [--verbose]
"""

import argparse
import sys
import time
import redis

# ─── CLI ─────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="OmniShield AI Python ingester")
    p.add_argument("--host",    default="127.0.0.1")
    p.add_argument("--port",    type=int, default=6379)
    p.add_argument("--stream",  default="logs:raw")
    p.add_argument("--field",   default="data")
    p.add_argument("--batch",   type=int, default=75,
                   help="Lines to buffer before flushing to Redis (default 75)")
    p.add_argument("--input",   default="/tmp/log_pipe",
                   help="Path to FIFO or regular file (default /tmp/log_pipe)")
    p.add_argument("--verbose", action="store_true")
    return p.parse_args()


# ─── Redis connect with retry ─────────────────────────────────────────────────

def connect_redis(host, port, max_attempts=5):
    for attempt in range(1, max_attempts + 1):
        try:
            r = redis.Redis(host=host, port=port,
                            socket_connect_timeout=5,
                            socket_timeout=5,
                            decode_responses=False)
            r.ping()
            print(f"[INGEST] Connected to Redis {host}:{port}", file=sys.stderr, flush=True)
            return r
        except redis.exceptions.ConnectionError as exc:
            wait = 0.2 * attempt
            print(f"[INGEST] Redis connect error (attempt {attempt}): {exc} — retrying in {wait:.1f}s",
                  file=sys.stderr, flush=True)
            time.sleep(wait)
    print("[INGEST] FATAL: could not connect to Redis after 5 attempts.", file=sys.stderr)
    sys.exit(1)


# ─── Flush batch to Redis via pipeline ───────────────────────────────────────

def flush_batch(r, stream, field, batch, errors, verbose):
    """
    Phase 1: call pipe.xadd() for each line  → local buffer only (no I/O).
    Phase 2: pipe.execute()                   → single round-trip to Redis.
    Returns updated error count.
    """
    if not batch:
        return errors

    pipe = r.pipeline(transaction=False)
    for line in batch:
        # xadd(name, fields, id='*')  —  '*' lets Redis auto-generate the ID
        pipe.xadd(stream, {field: line.encode() if isinstance(line, str) else line})

    try:
        pipe.execute()
    except redis.exceptions.RedisError as exc:
        errors += 1
        print(f"[INGEST] pipeline.execute() error: {exc}", file=sys.stderr, flush=True)
        if verbose:
            raise

    return errors


# ─── Main ingestion loop ──────────────────────────────────────────────────────

def main():
    args = parse_args()

    r = connect_redis(args.host, args.port)

    # Open FIFO / file — blocks until the writer (gen_chaos.py) opens it
    print(f"[INGEST] Opening input: {args.input}  (waiting for writer if FIFO)…",
          file=sys.stderr, flush=True)
    try:
        fin = open(args.input, "r", buffering=1)   # line-buffered
    except OSError as exc:
        print(f"[INGEST] Cannot open {args.input}: {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"[INGEST] Reading from: {args.input}", file=sys.stderr, flush=True)

    ingested   = 0
    errors     = 0
    stats_ts   = time.monotonic()
    last_stats = 0
    batch: list[str] = []

    try:
        for line in fin:
            line = line.rstrip("\n")
            if not line:
                continue

            batch.append(line)

            if len(batch) >= args.batch:
                errors    = flush_batch(r, args.stream, args.field, batch, errors, args.verbose)
                ingested += len(batch)
                batch.clear()

                if args.verbose:
                    print(f"[INGEST] flushed batch  ingested={ingested}", file=sys.stderr)

            # Stats every 5 seconds
            now = time.monotonic()
            if now - stats_ts >= 5.0:
                elapsed   = now - stats_ts
                delta     = ingested - last_stats
                eps       = delta / elapsed
                print(f"[STATS] ingested={ingested}  eps={eps:.0f}  errors={errors}",
                      file=sys.stderr, flush=True)
                last_stats = ingested
                stats_ts   = now

        # FIFO closed — flush remaining lines
        if batch:
            errors = flush_batch(r, args.stream, args.field, batch, errors, args.verbose)
            ingested += len(batch)
            batch.clear()

    except KeyboardInterrupt:
        # Ctrl+C — flush what we have and exit cleanly
        if batch:
            flush_batch(r, args.stream, args.field, batch, errors, args.verbose)
            ingested += len(batch)
        print(f"\n[INGEST] Interrupted — final: ingested={ingested}  errors={errors}",
              file=sys.stderr, flush=True)
    finally:
        fin.close()

    print(f"[INGEST] Done. ingested={ingested}  errors={errors}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
