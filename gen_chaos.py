"""
gen_chaos.py — OmniShield AI Chaos Monkey
4-process ECS event generator targeting 1000+ EPS.
"""

import errno
import json
import multiprocessing
import os
import random
import signal
import stat
import sys
import time
from datetime import datetime, timezone

# ── Constants ─────────────────────────────────────────────────────────────────
FIFO_PATH    = "/tmp/log_pipe"
ATTACKER_IP  = "203.0.113.200"
VICTIM_IP    = "192.168.1.50"
C2_IP        = "45.33.32.156"
BACKUP_SRC   = "10.0.0.10"
BACKUP_DST   = "10.0.0.20"

PRIVATE_IPS = (
    [f"10.0.0.{i}"     for i in range(1, 80)] +
    [f"192.168.1.{i}"  for i in range(1, 60)] +
    [f"172.16.0.{i}"   for i in range(1, 40)]
)
PUBLIC_IPS = [
    "45.33.32.156","104.21.44.67","198.41.128.1","8.8.8.8",
    "1.1.1.1","185.199.108.153","52.84.125.21","13.107.42.14",
    "151.101.1.69","172.217.14.206","93.184.216.34",
]
PROC_NAMES = ["nginx","apache2","mysqld","postgres","redis-server",
              "python3","node","java","chrome","curl","rsync"]
USERS      = ["alice","bob","charlie","dave"]

# Safe ports for normal traffic — excludes lateral-movement and C2 trigger ports
_INT_PORTS = [80,443,3306,5432,6379,8080,8443,27017,9200,25,587,123,1433]
_PUB_PORTS = [80,443,8443,8080,9200,993,995,2096]   # no 4444/53
_SAFE_ACTS = ["http_request","dns_query","file_read","file_write","process_start"]
_PROTOCOLS = ["tcp","udp","icmp"]

def _ts() -> str:
    return datetime.now(timezone.utc).isoformat()

# ── Pool builders ─────────────────────────────────────────────────────────────

def _normal_pool(n: int) -> list:
    """ECS normal traffic. Safe ports/bytes so NO backend rule fires."""
    pool = []
    for _ in range(n):
        pub   = random.random() < 0.35
        src   = random.choice(PRIVATE_IPS)
        dst   = random.choice(PUBLIC_IPS) if pub else random.choice(PRIVATE_IPS)
        dir_  = "outbound" if pub else "internal"
        dport = random.choice(_PUB_PORTS if pub else _INT_PORTS)
        # bytes >= 600 for public so C2 rule (bytes<500) never fires
        bmin  = 600 if pub else 64
        nb    = random.randint(bmin, 65536) + random.randint(bmin, 65536)
        ev = {
            "@timestamp": "__TS__",
            "ecs": {"version": "8.11.0"},
            "event": {"kind":"event","category":["network"],"type":["connection"],
                      "action": random.choice(_SAFE_ACTS),"dataset":"network.flow"},
            "network": {"protocol": random.choice(_PROTOCOLS),"bytes": nb,"direction": dir_},
            "source":      {"ip": src, "port": random.randint(1024,65535), "bytes": nb//2},
            "destination": {"ip": dst, "port": dport,                      "bytes": nb//2},
            "process": {"name": random.choice(PROC_NAMES),"pid": random.randint(1000,65000)},
            "user":    {"name": random.choice(USERS),"roles":["user"]},
            "labels":  {},
            "host":    {"ip":[src],"os":{"type":"linux"}},
        }
        pool.append(json.dumps(ev))
    return pool


def _bf_pool(n: int) -> list:
    """Brute-force SSH auth_failure events."""
    pool = []
    for _ in range(n):
        ev = {
            "@timestamp": "__TS__",
            "ecs": {"version":"8.11.0"},
            "event": {"kind":"event","category":["authentication"],"type":["start"],
                      "action":"authentication_failure","dataset":"auth.log"},
            "network": {"protocol":"ssh","bytes": random.randint(200,499),"direction":"inbound"},
            "source":      {"ip": ATTACKER_IP,"port": random.randint(40000,65000),"bytes":150},
            "destination": {"ip": VICTIM_IP,  "port": 22,                         "bytes":80},
            "process": {"name":"sshd","pid": random.randint(1000,65000)},
            "user":    {"name": random.choice(["root","admin","ubuntu"]),"roles":["user"]},
            "labels":  {},
            "host":    {"ip":[VICTIM_IP],"os":{"type":"linux"}},
        }
        pool.append(json.dumps(ev))
    return pool


def _c2_pool(n: int) -> list:
    """C2 beacon: victim → external, <500 bytes, ports 80/443/8080/4444."""
    pool = []
    for _ in range(n):
        port = random.choice([80,443,8080,4444])
        ev = {
            "@timestamp": "__TS__",
            "ecs": {"version":"8.11.0"},
            "event": {"kind":"event","category":["network"],"type":["connection"],
                      "action":"network_connect","dataset":"network.flow"},
            "network": {"protocol":"tcp","bytes": random.randint(50,499),"direction":"outbound"},
            "source":      {"ip": VICTIM_IP,"port": random.randint(40000,65000),"bytes":200},
            "destination": {"ip": C2_IP,    "port": port,                       "bytes":100},
            "process": {"name":"svchost","pid": random.randint(1000,65000)},
            "user":    {"name":"SYSTEM","roles":["user"]},
            "labels":  {},
            "host":    {"ip":[VICTIM_IP],"os":{"type":"windows"}},
        }
        pool.append(json.dumps(ev))
    return pool


def _exfil_pool(n: int) -> list:
    """Exfiltration: >5MB to public IP, non-admin user."""
    srcs = ["192.168.1.25","10.0.0.55","172.16.0.30"]
    dsts = ["104.21.44.67","151.101.1.69","13.107.42.14"]
    pool = []
    for _ in range(n):
        src = random.choice(srcs); dst = random.choice(dsts)
        nb  = random.randint(8_000_000, 50_000_000)
        ev  = {
            "@timestamp": "__TS__",
            "ecs": {"version":"8.11.0"},
            "event": {"kind":"event","category":["network","file"],"type":["connection"],
                      "action":"network_connect","dataset":"network.flow"},
            "network": {"protocol":"https","bytes": nb,"direction":"outbound"},
            "source":      {"ip": src,"port": random.randint(1024,65535),"bytes": nb-4096},
            "destination": {"ip": dst,"port": 443,"bytes":4096},
            "process": {"name": random.choice(["rclone","curl","wget"]),"pid": random.randint(1000,65000)},
            "user":    {"name": random.choice(["alice","bob"]),"roles":["user"]},
            "labels":  {},
            "host":    {"ip":[src],"os":{"type":"linux"}},
        }
        pool.append(json.dumps(ev))
    return pool


def _lateral_pool(n: int) -> list:
    """Lateral movement: private→private on SMB/RDP ports."""
    srcs = ["192.168.1.30","10.0.0.15","172.16.0.5"]
    dsts = ["192.168.1.100","10.0.0.50","192.168.1.200"]
    pool = []
    for _ in range(n):
        src = random.choice(srcs)
        dst = random.choice([d for d in dsts if d != src]) or dsts[0]
        nb  = random.randint(5000, 500_000)
        ev  = {
            "@timestamp": "__TS__",
            "ecs": {"version":"8.11.0"},
            "event": {"kind":"event","category":["network"],"type":["connection"],
                      "action":"network_connect","dataset":"network.flow"},
            "network": {"protocol":"smb","bytes": nb,"direction":"internal"},
            "source":      {"ip": src,"port": random.randint(1024,65535),"bytes": nb-1024},
            "destination": {"ip": dst,"port": random.choice([445,3389,135,139]),"bytes":1024},
            "process": {"name": random.choice(["smbclient","mstsc","wmic"]),"pid": random.randint(1000,65000)},
            "user":    {"name": random.choice(["alice","bob"]),"roles":["user"]},
            "labels":  {},
            "host":    {"ip":[src],"os":{"type":"windows"}},
        }
        pool.append(json.dumps(ev))
    return pool


def _emit(tmpl: str) -> str:
    return tmpl.replace('"__TS__"', f'"{_ts()}"', 1)

# ── Process A — Normal traffic (~600 EPS) ─────────────────────────────────────

def proc_a_normal(q: multiprocessing.Queue):
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    pool = _normal_pool(1000); n = len(pool); idx = 0
    BATCH = 150; interval = BATCH / 600.0
    while True:
        t0 = time.monotonic()
        for _ in range(BATCH):
            try: q.put_nowait(_emit(pool[idx]))
            except Exception: pass
            idx = (idx + 1) % n
        gap = interval - (time.monotonic() - t0)
        if gap > 0: time.sleep(gap)

# ── Process B — Attacks (BF + C2 + Exfil + Lateral) ──────────────────────────

def proc_b_attacks(q: multiprocessing.Queue):
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    bf  = _bf_pool(500);     bf_n  = len(bf);  bf_i  = 0
    c2  = _c2_pool(200);     c2_n  = len(c2);  c2_i  = 0
    ex  = _exfil_pool(100);  ex_n  = len(ex);  ex_i  = 0
    lat = _lateral_pool(100);lat_n = len(lat); lat_i = 0

    bf_next = c2_next = time.monotonic()
    ex_next  = time.monotonic() + 6.0
    lat_next = time.monotonic() + 10.0
    bf_pause = False; bf_pause_end = 0.0

    while True:
        now = time.monotonic()

        # Attack 1 — Brute Force (8–20 per burst, short pause between bursts)
        if not bf_pause and now >= bf_next:
            for _ in range(random.randint(8, 20)):
                try: q.put_nowait(_emit(bf[bf_i])); bf_i = (bf_i+1)%bf_n
                except Exception: pass
            bf_pause = True; bf_pause_end = now + random.uniform(0.05, 0.3)
        if bf_pause and now >= bf_pause_end:
            bf_pause = False; bf_next = now + random.uniform(0.01, 0.15)

        # Attack 2 — C2 Beacon (~80ms interval, <500 bytes)
        if now >= c2_next:
            try: q.put_nowait(_emit(c2[c2_i])); c2_i = (c2_i+1)%c2_n
            except Exception: pass
            c2_next = now + 0.08 + random.uniform(-0.01, 0.01)

        # Attack 3 — Exfiltration (every 6–12s, burst of 3–8 events)
        if now >= ex_next:
            for _ in range(random.randint(3, 8)):
                try: q.put_nowait(_emit(ex[ex_i])); ex_i = (ex_i+1)%ex_n
                except Exception: pass
            ex_next = now + random.uniform(6.0, 12.0)

        # Attack 4 — Lateral Movement (every 8–15s, burst of 2–6)
        if now >= lat_next:
            for _ in range(random.randint(2, 6)):
                try: q.put_nowait(_emit(lat[lat_i])); lat_i = (lat_i+1)%lat_n
                except Exception: pass
            lat_next = now + random.uniform(8.0, 15.0)

        time.sleep(0.002)

# ── Process C — False Positive (admin nightly backup) ────────────────────────

def proc_c_fp(q: multiprocessing.Queue):
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    pid = random.randint(1000, 65000)
    while True:
        nb = random.randint(10_000_000_000, 50_000_000_000)   # 10–50 GB
        ev = {
            "@timestamp": _ts(),
            "ecs": {"version":"8.11.0"},
            "event": {"kind":"event","category":["network","file"],"type":["connection"],
                      "action":"file_transfer","dataset":"network.flow"},
            "network": {"protocol":"smb","bytes": nb,"direction":"internal"},
            "source":      {"ip": BACKUP_SRC,"port": random.randint(1024,65535),"bytes": nb},
            "destination": {"ip": BACKUP_DST,"port": 445,"bytes":1024},
            "process": {"name":"smbd","pid": pid},
            "user":    {"name":"backup_admin","roles":["admin"]},
            "labels":  {
                "false_positive_candidate": True,
                "is_scheduled_backup":      True,
                "admin_justification":      "nightly-backup-job",
            },
            "host": {"ip":[BACKUP_SRC],"os":{"type":"linux"}},
            "file": {"path":"/mnt/nas/backups/nightly","size": nb},
        }
        try: q.put_nowait(json.dumps(ev))
        except Exception: pass
        time.sleep(0.5)

# ── Process D — Coordinator (sole FIFO writer) ────────────────────────────────

def proc_d_coordinator(q: multiprocessing.Queue, stop: multiprocessing.Event):
    signal.signal(signal.SIGINT, signal.SIG_IGN)

    # Ensure FIFO exists
    if not os.path.exists(FIFO_PATH):
        os.mkfifo(FIFO_PATH)
    elif not stat.S_ISFIFO(os.stat(FIFO_PATH).st_mode):
        print(f"[CHAOS] ERROR: {FIFO_PATH} is not a FIFO", file=sys.stderr); return

    # Wait for reader to attach (O_NONBLOCK open returns ENXIO until reader opens)
    fd = None
    while not stop.is_set():
        try:
            fd = os.open(FIFO_PATH, os.O_WRONLY | os.O_NONBLOCK)
            print("[CHAOS] FIFO reader connected — streaming started.", file=sys.stderr, flush=True)
            break
        except OSError as e:
            if e.errno in (errno.ENXIO, errno.ENOENT):
                print("[CHAOS] Waiting for FIFO reader...", file=sys.stderr, flush=True)
                time.sleep(0.1)
            else:
                raise

    if fd is None:
        return   # stop fired before reader attached

    out = os.fdopen(fd, "w", buffering=1)   # line-buffered text wrapper

    ingested = dropped = 0
    stats_ts = time.monotonic()

    try:
        while not stop.is_set():
            for _ in range(2000):
                try:
                    line = q.get_nowait()
                except Exception:
                    break
                if line is None:     # sentinel — clean shutdown
                    return
                try:
                    out.write(line + "\n")
                    ingested += 1
                except BlockingIOError:
                    dropped += 1     # FIFO buffer full — drop & continue
                except BrokenPipeError:
                    print("[CHAOS] Reader disconnected — exiting.", file=sys.stderr)
                    return

            now = time.monotonic()
            if now - stats_ts >= 5.0:
                eps = ingested / (now - stats_ts)
                print(f"[CHAOS] EPS={eps:.0f}  written={ingested}  dropped={dropped}"
                      f"  queue≈{q.qsize()}", file=sys.stderr, flush=True)
                ingested = dropped = 0; stats_ts = now

            time.sleep(0.0001)   # 100µs spin
    finally:
        try: out.close()
        except Exception: pass

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    multiprocessing.set_start_method("fork", force=True)

    q    = multiprocessing.Queue(maxsize=10000)
    stop = multiprocessing.Event()
    _sig_count = [0]

    def _handler(signum, frame):
        _sig_count[0] += 1
        if _sig_count[0] == 1:
            print("\n[CHAOS] Signal received — shutting down...", file=sys.stderr)
            stop.set()
            try: q.put_nowait(None)   # sentinel for coordinator
            except Exception: pass
        else:
            print("\n[CHAOS] Second signal — forcing exit.", file=sys.stderr)
            os._exit(1)

    signal.signal(signal.SIGINT,  _handler)
    signal.signal(signal.SIGTERM, _handler)

    procs = [
        multiprocessing.Process(target=proc_a_normal,      args=(q,),       name="ProcA-Normal",  daemon=True),
        multiprocessing.Process(target=proc_b_attacks,     args=(q,),       name="ProcB-Attacks", daemon=True),
        multiprocessing.Process(target=proc_c_fp,          args=(q,),       name="ProcC-FP",      daemon=True),
        multiprocessing.Process(target=proc_d_coordinator, args=(q, stop),  name="ProcD-Coord",   daemon=False),
    ]

    print("[CHAOS] Building pools and starting processes...", file=sys.stderr, flush=True)
    for p in procs:
        p.start()
        print(f"[CHAOS] {p.name} PID={p.pid}", file=sys.stderr, flush=True)
    print("[CHAOS] Target: 1000+ EPS  (A:~600 normal + B:~400 attacks)", file=sys.stderr, flush=True)

    procs[3].join()   # wait for coordinator (only non-daemon)
    for p in procs[:3]:
        if p.is_alive(): p.terminate()
    for p in procs[:3]:
        p.join(timeout=3)
    print("[CHAOS] All processes stopped.", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
