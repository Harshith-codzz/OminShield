# OmniShield AI — Execution Guide

> **Platform:** Linux only (WSL2 on Windows is fully supported)
> **Stack:** Python 3.10+, Node.js 20, Redis 7, React + Vite

---

## Prerequisites — Install once in WSL2 Ubuntu

Open **PowerShell as Administrator** and install WSL2:

```powershell
wsl --install -d Ubuntu-22.04
```

Restart when prompted, then open the **Ubuntu** app and run:

```bash
sudo apt update && sudo apt upgrade -y

sudo apt install -y \
    redis-server \
    python3 \
    python3-pip \
    python3-venv \
    tmux \
    curl

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify everything
redis-cli --version && python3 --version && node --version && npm --version
```

---

## Step 1 — Copy the project into WSL2

```bash
# Windows drive is mounted at /mnt/c/ inside WSL2
cp -r "/mnt/c/Users/Harshith N/.gemini/antigravity/scratch/omnishield-ai" ~/omnishield-ai
cd ~/omnishield-ai
```

---

## Step 2 — Set your Gemini API Key (optional)

Enables AI-powered playbooks for Critical alerts.  
Get a free key at → https://aistudio.google.com/app/apikey

```bash
# Temporary (current session only)
export GEMINI_API_KEY="your-key-here"

# Permanent
echo 'export GEMINI_API_KEY="your-key-here"' >> ~/.bashrc && source ~/.bashrc
```

> The system works fully without a key — it falls back to local MITRE playbooks.

---

## Step 3 — One-command launch (recommended)

```bash
cd ~/omnishield-ai
chmod +x setup.sh
./setup.sh
```

`setup.sh` automatically:
1. Checks dependencies (`redis-cli`, `python3`, `node`, `npm`)
2. Starts Redis if not already running
3. Creates Python `venv` and runs `pip install -r requirements.txt`
4. Runs `npm install` in `dashboard/`
5. Creates `/tmp/log_pipe` FIFO
6. Launches all 4 components in a **tmux** session called `omnishield`

### Open the dashboard

After setup completes, open in your **Windows browser**:

```
http://localhost:3000
```

WSL2 forwards ports to Windows automatically — no extra config needed.

---

## Navigating tmux windows

```bash
# Attach to the running session
tmux attach -t omnishield

# Switch windows:
Ctrl+B  then  0   →  backend     (FastAPI + ML + Redis consumer)
Ctrl+B  then  1   →  dash        (React Vite dashboard)
Ctrl+B  then  2   →  ingest      (py_ingest.py FIFO→Redis)
Ctrl+B  then  3   →  chaos       (gen_chaos.py event generator)

# Detach (leave everything running):  Ctrl+B then D
# Kill everything:
tmux kill-session -t omnishield
```

---

## Manual Step-by-Step (if setup.sh fails)

Open **5 separate WSL2 terminal tabs** in order:

### Terminal 1 — Redis

```bash
sudo service redis-server start
redis-cli ping          # must print: PONG
```

---

### Terminal 2 — Backend

```bash
cd ~/omnishield-ai
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

GEMINI_API_KEY="your-key" python3 backend.py
```

**Expected output:**
```
[BACKEND] Consumer group 'omnishield' created.
[BACKEND] Warming up ML model (500 iterations)...
[BACKEND] ML warmup complete.
[BACKEND] OmniShield AI backend ready.
```

---

### Terminal 3 — Dashboard

```bash
cd ~/omnishield-ai/dashboard
npm install
npm run dev
```

**Expected output:**
```
  VITE v5.x  ready in xxx ms
  ➜  Local:   http://localhost:3000/
```

---

### Terminal 4 — Python Ingester (run BEFORE chaos!)

```bash
cd ~/omnishield-ai
source venv/bin/activate

# Create FIFO if it doesn't exist
[ -p /tmp/log_pipe ] || mkfifo /tmp/log_pipe

# Start ingester — will block here waiting for gen_chaos.py to open the pipe
python3 py_ingest.py --verbose
```

**Expected output once chaos starts:**
```
[INGEST] Connected to Redis 127.0.0.1:6379
[INGEST] Reading from: /tmp/log_pipe
[STATS] ingested=5000  eps=1043  errors=0
```

---

### Terminal 5 — Chaos Generator (run LAST)

```bash
cd ~/omnishield-ai
source venv/bin/activate
python3 gen_chaos.py
```

**Expected output:**
```
[CHAOS] ProcA-Normal  PID=12345
[CHAOS] ProcB-Attacks PID=12346
[CHAOS] ProcC-FP      PID=12347
[CHAOS] ProcD-Coord   PID=12348
[CHAOS] EPS=1087  dropped=0  queue≈23
```

---

## Verify the system is working

```bash
# Health check
curl http://localhost:8000/health
# Expected: {"status":"ok","gemini":false,"clients":1}

# Live stats
curl http://localhost:8000/stats
# Expected: {"total":12500,"eps":1043.2,"critical":87,"high":210,...}

# Check Redis is receiving data
redis-cli xlen logs:raw
# Expected: a growing number (>0)
```

---

## Stopping everything

```bash
# If using tmux
tmux kill-session -t omnishield

# If running manually — press Ctrl+C in each terminal
# For gen_chaos.py: first Ctrl+C triggers graceful shutdown
#                   second Ctrl+C forces immediate exit if stuck

# Clean up FIFO after stopping
rm -f /tmp/log_pipe
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `redis-cli ping` → `Connection refused` | Redis not running | `sudo service redis-server start` |
| `backend.py` exits immediately | Redis not up yet | Start Redis first, then backend |
| `py_ingest.py` hangs at "waiting for writer" | `gen_chaos.py` not started yet | Start chaos generator last |
| Dashboard shows blank / RECONNECTING | Backend not running | Check Terminal 2 for errors |
| `gen_chaos.py` stuck in shutdown loop | Pipe broken | Press Ctrl+C a **second** time to force-exit |
| `npm install` fails | Node version too old | Ensure Node 18+ (`node --version`) |
| Port 3000 already in use | Another process | `kill $(lsof -ti:3000)` |
| Port 8000 already in use | Another process | `kill $(lsof -ti:8000)` |

---

## Architecture Overview

```
gen_chaos.py          →  /tmp/log_pipe (FIFO)
    4 processes           non-blocking O_NONBLOCK writes
    ~1000+ EPS

py_ingest.py          →  Redis Stream: logs:raw
    reads FIFO line-by-line
    batches 75 lines per pipeline.execute()

backend.py            →  SSE /stream endpoint
    xreadgroup consumer
    River ML anomaly scoring
    MITRE rule classifier
    Gemini AI playbooks (optional)

dashboard/            →  http://localhost:3000
    React + Zustand + React Flow
    60ms alert drain  |  500ms graph refresh
```

---

## File Reference

| File | Purpose |
|------|---------|
| `backend.py` | FastAPI backend — ML, rules, Redis consumer, SSE broadcaster |
| `gen_chaos.py` | Chaos monkey — generates 1000+ EPS of synthetic security events |
| `py_ingest.py` | Python FIFO→Redis ingester (replaces C++ binary) |
| `redis_stream_ingest.cpp` | Original C++ ingester — kept for reference, not used |
| `setup.sh` | One-command launcher |
| `requirements.txt` | Python dependencies |
| `dashboard/` | React SOC dashboard (Vite + Tailwind + Zustand + React Flow) |
