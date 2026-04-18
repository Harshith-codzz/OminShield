#!/usr/bin/env bash
# setup.sh — OmniShield AI one-command launcher
#
# Startup order (hardcoded):
#   1. Redis              (must be up before anything else)
#   2. backend.py         (creates consumer group, warms ML model)
#   3. npm run dev        (dashboard on :3000)
#   4. py_ingest.py       (blocks on FIFO — waits for data)
#   5. gen_chaos.py       (opens FIFO, starts writing — unblocks ingester)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─── Color helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fatal()   { echo -e "${RED}[FATAL]${NC} $*" >&2; exit 1; }

# ─── 1. Dependency checks ─────────────────────────────────────────────────────
info "Checking required tools..."

check_cmd() {
    local cmd="$1" hint="$2"
    if ! command -v "$cmd" &>/dev/null; then
        fatal "'$cmd' not found. $hint"
    fi
    success "$cmd found: $(command -v "$cmd")"
}

check_cmd redis-cli "Install Redis: https://redis.io/docs/getting-started/installation/"
check_cmd python3   "Install Python 3.9+: https://python.org/downloads"
check_cmd node      "Install Node.js 18+: https://nodejs.org"
check_cmd npm       "npm should come with Node.js"

# ─── 2. Start Redis if not running ───────────────────────────────────────────
info "Checking Redis..."
if redis-cli ping &>/dev/null; then
    success "Redis already running."
else
    warn "Redis not responding — attempting to start..."
    if command -v redis-server &>/dev/null; then
        redis-server --daemonize yes --loglevel warning
        sleep 1
        if redis-cli ping &>/dev/null; then
            success "Redis started."
        else
            fatal "Could not start Redis. Please start it manually: redis-server"
        fi
    else
        fatal "redis-server not found. Install Redis first."
    fi
fi

# ─── 3. Python venv + pip install ────────────────────────────────────────────
info "Setting up Python virtual environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
# shellcheck disable=SC1091
source venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
success "Python dependencies installed."

# ─── 4. npm install ──────────────────────────────────────────────────────────
info "Installing dashboard npm packages..."
(cd dashboard && npm install --silent)
success "npm packages installed."

# ─── 5. (Skipped) C++ build — replaced by py_ingest.py ──────────────────────────
info "Using Python ingester (py_ingest.py) — no C++ compilation needed."

# ─── 6. Create FIFO ──────────────────────────────────────────────────────────
if [ ! -p /tmp/log_pipe ]; then
    mkfifo /tmp/log_pipe
    success "FIFO created at /tmp/log_pipe"
else
    success "FIFO /tmp/log_pipe already exists."
fi

# ─── 7 & 8. Launch all components ────────────────────────────────────────────
if command -v tmux &>/dev/null; then
    info "tmux detected — launching in 'omnishield' session with named windows."

    # Kill existing session if any
    tmux kill-session -t omnishield 2>/dev/null || true

    # Create session with backend window (window 0)
    tmux new-session -d -s omnishield -n backend \
        "source venv/bin/activate && python3 backend.py; read"

    sleep 2  # Give backend time to connect to Redis and create consumer group

    # Dashboard (window 1)
    tmux new-window -t omnishield -n dash \
        "cd dashboard && npm run dev; read"

    sleep 1

    # Ingester (window 2) — py_ingest.py blocks on FIFO until chaos starts
    tmux new-window -t omnishield -n ingest \
        "source venv/bin/activate && python3 py_ingest.py --verbose; read"

    sleep 0.5

    # Chaos generator (window 3) — opens FIFO, unblocks ingester
    tmux new-window -t omnishield -n chaos \
        "source venv/bin/activate && python3 gen_chaos.py; read"

    # Select the dashboard window
    tmux select-window -t omnishield:dash

    echo ""
    echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${GREEN}  OmniShield AI — running${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  ${CYAN}Dashboard${NC} : http://localhost:3000"
    echo -e "  ${CYAN}API      ${NC} : http://localhost:8000/health"
    echo -e "  ${CYAN}Stream   ${NC} : http://localhost:8000/stream"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "Attach to session: ${BOLD}tmux attach -t omnishield${NC}"
    echo -e "Kill session:      ${BOLD}tmux kill-session -t omnishield${NC}"

else
    # ── No tmux: background processes with EXIT trap ──────────────────────
    info "tmux not found — launching as background processes."
    warn "Install tmux for a better experience: sudo apt install tmux"

    PIDS=()

    cleanup() {
        warn "Shutting down all processes..."
        for pid in "${PIDS[@]}"; do
            kill "$pid" 2>/dev/null || true
        done
        wait 2>/dev/null || true
        info "All processes stopped."
    }
    trap cleanup EXIT INT TERM

    # Create logs directory before starting any process
    mkdir -p logs

    # 1. Backend
    source venv/bin/activate
    python3 backend.py > logs/backend.log 2>&1 &
    PIDS+=($!)
    success "backend.py started (PID ${PIDS[-1]})"
    sleep 2

    # 2. Dashboard
    (cd dashboard && npm run dev) > logs/dashboard.log 2>&1 &
    PIDS+=($!)
    success "Dashboard started (PID ${PIDS[-1]})"
    sleep 1

    # 3. Ingester (py_ingest.py)
    python3 py_ingest.py --verbose > logs/ingest.log 2>&1 &
    PIDS+=($!)
    success "py_ingest.py started (PID ${PIDS[-1]})"
    sleep 0.5

    # 4. Chaos generator
    python3 gen_chaos.py > logs/chaos.log 2>&1 &
    PIDS+=($!)
    success "gen_chaos.py started (PID ${PIDS[-1]})"

    echo ""
    echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${GREEN}  OmniShield AI — running${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  ${CYAN}Dashboard${NC} : http://localhost:3000"
    echo -e "  ${CYAN}API      ${NC} : http://localhost:8000/health"
    echo -e "  ${CYAN}Stream   ${NC} : http://localhost:8000/stream"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Logs: ./logs/{backend,dashboard,ingest,chaos}.log"
    echo "Press Ctrl+C to stop all processes."

    # Block until Ctrl+C
    wait
fi
