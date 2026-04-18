# OmniShield AI — Extended Detection & Response Platform

> Production-ready 4-tier XDR platform processing 1000+ security logs/second with MITRE ATT&CK mapping, River ML anomaly detection, Gemini AI playbooks, and a React SOC dashboard.

---

## Architecture

```
gen_chaos.py          redis_stream_ingest.cpp     backend.py           dashboard/
 (4 processes)   →   (C++ hiredis pipeline)   →  (FastAPI+uvloop)  →  (React+Vite)
  FIFO /tmp/log_pipe   Redis Stream logs:raw       SSE /stream         :3000
```

### Tier Overview

| Tier | Component | Technology | Role |
|------|-----------|-----------|------|
| 1 | `gen_chaos.py` | Python multiprocessing | 1000+ EPS chaos generator |
| 2 | `redis_stream_ingest.cpp` | C++17 + hiredis + libevent | FIFO → Redis Stream ingestion |
| 3 | `backend.py` | FastAPI + uvloop + River ML | Detection, scoring, Gemini AI |
| 4 | `dashboard/` | React + Zustand + React Flow | Real-time SOC dashboard |

---

## Threat Detection

| Threat | MITRE ID | Detection Rule |
|--------|----------|---------------|
| Brute Force | T1110 | `action == authentication_failure` |
| C2 Beaconing | T1071 | `bytes < 500 AND dst external AND port in (80,443,8080,4444,53)` |
| Data Exfiltration | T1048 | `bytes > 5MB AND dst external AND user not admin` |
| Lateral Movement | T1021 | `src private AND dst private AND port in (22,445,3389,135,139)` |

### Confidence Score Formula

```
score = (0.40 × rule_hit) + (0.40 × anomaly_score) + (0.20 × cross_layer_hit)

Critical = score > 0.85
High     = score > 0.65
Medium   = score > 0.40
Low      = everything else
```

### False Positive Detection

The **admin nightly backup** (Process C in gen_chaos.py) is deterministically identified via label:
```json
{
  "labels": {
    "false_positive_candidate": true,
    "is_scheduled_backup": true,
    "admin_justification": "nightly-backup-job"
  }
}
```
The backend checks this label **before** any ML scoring or Gemini calls — zero ML involvement.

---

## Quick Start

### Prerequisites

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y redis-server libhiredis-dev libevent-dev build-essential \
                    python3 python3-venv nodejs npm tmux

# Set Gemini API key (optional — system works without it)
export GEMINI_API_KEY="your-key-here"
```

### Launch

```bash
git clone <repo> omnishield-ai
cd omnishield-ai
chmod +x setup.sh
./setup.sh
```

Then open **http://localhost:3000**

### Manual startup order (if not using setup.sh)

```bash
# 1. Redis (must be first)
redis-server --daemonize yes

# 2. Backend (creates consumer group + ML warmup)
source venv/bin/activate
python3 backend.py &

# 3. Dashboard
cd dashboard && npm run dev &

# 4. C++ Ingester (blocks on FIFO)
./redis_stream_ingest --verbose &

# 5. Chaos generator (unblocks ingester)
python3 gen_chaos.py
```

---

## Configuration

### backend.py environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection URL |
| `STREAM_KEY` | `logs:raw` | Redis Stream key |
| `CONSUMER_GROUP` | `omnishield` | Consumer group name |
| `GEMINI_API_KEY` | _(empty)_ | Google Gemini API key |

### redis_stream_ingest CLI flags

```
--host      127.0.0.1       Redis host
--port      6379            Redis port
--stream    logs:raw        Stream key
--field     data            Field name in XADD
--batch     75              Events per pipeline flush
--interval  20              Timer interval (ms)
--input     /tmp/log_pipe   Input FIFO/file path
--verbose                   Print XADD errors
```

---

## Performance Design

### Why 1000+ EPS doesn't freeze the browser

| Problem | Solution |
|---------|----------|
| 1000 `setState` calls/sec freezes Chrome | SSE events buffered in `useRef`, drained into Zustand at 60ms ticks |
| Unvirtualized list lags with 500 items | `react-window` FixedSizeList — only ~12 DOM nodes ever rendered |
| React Flow re-renders on every alert | `_pendingGraphAlerts` drained and graph rebuilt every 500ms only |
| Node positions reset on every update | Stable `_posCache` Map keyed by IP, random position assigned once |

### Why the C++ pipeline doesn't stall

| Problem | Solution |
|---------|----------|
| FIFO 64KB buffer fills → writer blocks | `O_NONBLOCK` on FIFO open; `BlockingIOError` caught and dropped |
| `redisAsyncCommand` has no batch control | Forbidden; use `redisAppendCommand` + `redisGetReply` (true pipelining) |
| JSON parsing in C++ wastes CPU | Forbidden; raw `%b` format pushes bytes directly |
| SSE ghost connections leak memory | `active_clients` is a `set`, `finally` block always calls `discard(q)` |

---

## Dashboard Components

| Component | Description |
|-----------|-------------|
| **MetricCards** | 4 cards: Total, EPS, Critical, High — `tabular-nums` prevents layout shifts |
| **AlertList** | Virtualized `FixedSizeList` — all required badges, severity filter |
| **BlastRadius** | React Flow graph — 500ms updates, stable node positions, animated Critical edges |
| **PlaybookPanel** | Local MITRE playbook always shown; Gemini playbook overlaid when available |
| **LiveIndicator** | Pulsing green dot when SSE connected |

---

## File Structure

```
omnishield-ai/
├── gen_chaos.py                # Task 1 — Chaos Monkey (4 processes)
├── redis_stream_ingest.cpp     # Task 2 — C++ ingestion pipeline
├── backend.py                  # Task 3 — FastAPI ML + Gemini backend
├── requirements.txt            # Python dependencies
├── setup.sh                    # One-command launcher
├── dashboard/
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx             # SSE connection + back-pressure buffering
│       ├── store.js            # Zustand store with ring buffer + graph cache
│       ├── index.css
│       └── components/
│           ├── MetricCards.jsx
│           ├── AlertList.jsx   # react-window virtualized list
│           ├── BlastRadius.jsx # React Flow graph
│           ├── PlaybookPanel.jsx
│           └── LiveIndicator.jsx
```
