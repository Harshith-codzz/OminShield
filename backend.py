"""
backend.py — OmniShield AI ML & Cognitive Backend
FastAPI + uvloop + redis.asyncio + River ML + Gemini
"""

import asyncio
import json
import os
import sys
import time
from typing import Optional

try:
    import uvloop
    asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())
except ImportError:
    pass  # uvloop not available on this platform (e.g. Vercel build phase on Windows)

import orjson
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from redis.asyncio import Redis as aioredis
from redis.exceptions import ResponseError

import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold

# SPEC: correct path is river.feature_extraction.FeatureHasher (NOT river.preprocessing)
from river import anomaly, compose, feature_extraction, preprocessing

# ─── Config ──────────────────────────────────────────────────────────────────
REDIS_URL      = os.getenv("REDIS_URL",      "redis://127.0.0.1:6379")
STREAM_KEY     = os.getenv("STREAM_KEY",     "logs:raw")
CONSUMER_GROUP = os.getenv("CONSUMER_GROUP", "omnishield")
CONSUMER_NAME  = os.getenv("CONSUMER_NAME",  "backend-1")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# ─── MITRE local fallback dictionary ─────────────────────────────────────────
# FIX: removed erroneous [] subscript operator that was on the closing brace
MITRE_PLAYBOOKS = {
    "brute_force": {
        "technique_id":   "T1110",
        "technique_name": "Brute Force",
        "tactic":         "Credential Access",
        "description":    "Adversary attempted repeated authentication failures to gain access.",
        "firewall_cmds": [
            "iptables -A INPUT -s {src_ip} -p tcp --dport 22 -j DROP",
            "iptables -A INPUT -s {src_ip} -j DROP",
            "fail2ban-client set sshd banip {src_ip}",
        ],
        "investigation":  "1. Check /var/log/auth.log for failure patterns.\n2. Identify targeted accounts.\n3. Reset credentials if any succeeded.\n4. Enable MFA.\n5. Review SSH key policies.",
    },
    "c2_beacon": {
        "technique_id":   "T1071",
        "technique_name": "Application Layer Protocol",
        "tactic":         "Command and Control",
        "description":    "Victim host making periodic small outbound connections to external C2 server.",
        "firewall_cmds": [
            "iptables -A OUTPUT -s {src_ip} -d {dst_ip} -j DROP",
            "iptables -A FORWARD -s {src_ip} -d {dst_ip} -j DROP",
            "ip route add blackhole {dst_ip}/32",
        ],
        "investigation":  "1. Capture packets from {src_ip} to {dst_ip}.\n2. Check process list for unknown binaries.\n3. Inspect scheduled tasks and startup items.\n4. Run memory forensics.\n5. Isolate host immediately.",
    },
    "exfiltration": {
        "technique_id":   "T1048",
        "technique_name": "Exfiltration Over Alternative Protocol",
        "tactic":         "Exfiltration",
        "description":    "Large volume of data transferred from internal host to external destination.",
        "firewall_cmds": [
            "iptables -A OUTPUT -s {src_ip} -d {dst_ip} -j DROP",
            "iptables -A OUTPUT -s {src_ip} -m limit --limit 1MB/s -j ACCEPT",
        ],
        "investigation":  "1. Identify what data was transferred.\n2. Check DLP logs.\n3. Review user activity on {src_ip}.\n4. Determine if credentials were compromised.\n5. Notify data protection officer.",
    },
    "lateral_movement": {
        "technique_id":   "T1021",
        "technique_name": "Remote Services",
        "tactic":         "Lateral Movement",
        "description":    "Internal host connecting to another internal host via administrative protocol.",
        "firewall_cmds": [
            "iptables -A FORWARD -s {src_ip} -d {dst_ip} -p tcp --dport 445 -j DROP",
            "iptables -A FORWARD -s {src_ip} -d {dst_ip} -p tcp --dport 22 -j DROP",
            "iptables -A FORWARD -s {src_ip} -d {dst_ip} -p tcp --dport 3389 -j DROP",
        ],
        "investigation":  "1. Map all hosts {src_ip} connected to.\n2. Check for pass-the-hash or pass-the-ticket.\n3. Review admin share access.\n4. Inspect WMI/PSExec activity.\n5. Segment affected subnet.",
    },
}

# ─── ML model (module-level singleton) ───────────────────────────────────────
# SPEC: feature_extraction.FeatureHasher with missing_values="zeros" (exact spec requirement)
ml_model = compose.Pipeline(
    ("hasher",  feature_extraction.FeatureHasher(n_features=1024, missing_values="zeros")),
    ("scaler",  preprocessing.StandardScaler()),
    ("anomaly", anomaly.HalfSpaceTrees(n_trees=25, height=8, window_size=256, seed=42)),
)

# ─── Gemini model ─────────────────────────────────────────────────────────────
_gemini_model: Optional[object] = None
_gemini_available = False

def _init_gemini():
    global _gemini_model, _gemini_available
    if not GEMINI_API_KEY:
        print("[BACKEND] GEMINI_API_KEY not set — Gemini disabled.", file=sys.stderr)
        return
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        _gemini_model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            safety_settings={
                HarmCategory.HARM_CATEGORY_HATE_SPEECH:       HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_HARASSMENT:        HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
            },
        )
        _gemini_available = True
        print("[BACKEND] Gemini initialised.", file=sys.stderr)
    except Exception as exc:
        print(f"[BACKEND] Gemini init failed: {exc}", file=sys.stderr)

# ─── SSE broadcaster — global SET of asyncio.Queue ────────────────────────────
active_clients: set = set()

# ─── Stats counters ───────────────────────────────────────────────────────────
_stats = {"total": 0, "critical": 0, "high": 0, "medium": 0, "low": 0}
_eps_window: list = []

# ─── Global Redis client ──────────────────────────────────────────────────────
redis_client: Optional[aioredis] = None

# ─── FastAPI app ──────────────────────────────────────────────────────────────
app = FastAPI(title="OmniShield AI", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _is_private(ip: str) -> bool:
    return ip.startswith(("10.", "172.16.", "192.168."))


def _extract_features(event: dict) -> dict:
    src  = event.get("source", {})
    dst  = event.get("destination", {})
    net  = event.get("network", {})
    proc = event.get("process", {})
    return {
        "src_port":  str(src.get("port", 0)),
        "dst_port":  str(dst.get("port", 0)),
        "bytes":     str(net.get("bytes", 0)),
        "protocol":  str(net.get("protocol", "")),
        "action":    str(event.get("event", {}).get("action", "")),
        "proc_name": str(proc.get("name", "")),
        "direction": str(net.get("direction", "")),
    }


def _classify_rule(event: dict):
    """
    Returns (threat_type: str | None, is_fp: bool).
    Priority: false positive label → threat rules → None.
    """
    labels = event.get("labels", {})
    if labels.get("false_positive_candidate"):
        return None, True

    ev_action  = event.get("event", {}).get("action", "")
    src_ip     = event.get("source", {}).get("ip", "")
    dst_ip     = event.get("destination", {}).get("ip", "")
    dst_port   = event.get("destination", {}).get("port", 0)
    net_bytes  = event.get("network", {}).get("bytes", 0)
    user_roles = event.get("user", {}).get("roles", [])

    # Brute Force
    if ev_action == "authentication_failure":
        return "brute_force", False

    # C2 Beaconing
    if (
        net_bytes < 500
        and not _is_private(dst_ip)
        and dst_port in (80, 443, 8080, 4444, 53)
        and ev_action in ("network_connect", "http_request")
    ):
        return "c2_beacon", False

    # Data Exfiltration (admin role excluded)
    if (
        net_bytes > 5_000_000
        and not _is_private(dst_ip)
        and "admin" not in user_roles
    ):
        return "exfiltration", False

    # Lateral Movement
    if (
        _is_private(src_ip)
        and _is_private(dst_ip)
        and src_ip != dst_ip
        and dst_port in (22, 445, 3389, 135, 139)
    ):
        return "lateral_movement", False

    return None, False


def _confidence_score(rule_hit: float, anomaly_score: float, cross_layer: bool) -> float:
    cross = 1.0 if cross_layer else 0.0
    return (0.40 * rule_hit) + (0.40 * anomaly_score) + (0.20 * cross)


def _severity(score: float) -> str:
    if score > 0.85: return "Critical"
    if score > 0.65: return "High"
    if score > 0.40: return "Medium"
    return "Low"


def _build_local_playbook(threat_type: str, src_ip: str, dst_ip: str) -> dict:
    pb = dict(MITRE_PLAYBOOKS.get(threat_type, {}))
    if "firewall_cmds" in pb:
        pb["firewall_cmds"] = [
            cmd.format(src_ip=src_ip, dst_ip=dst_ip)
            for cmd in pb["firewall_cmds"]
        ]
    if "investigation" in pb:
        pb["investigation"] = pb["investigation"].format(src_ip=src_ip, dst_ip=dst_ip)
    return pb


def _broadcast(payload: bytes):
    dead = []
    for q in active_clients:
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            dead.append(q)
    for q in dead:
        active_clients.discard(q)


# ─── Gemini async task ────────────────────────────────────────────────────────

async def _call_gemini(alert: dict):
    """Runs in a background task. Never called for FPs or non-Critical."""
    src_ip      = alert.get("src_ip", "")
    dst_ip      = alert.get("dst_ip", "")
    threat_type = alert.get("threat_type", "")
    alert_id    = alert.get("id", "")

    dedup_key = f"gemini_dedup:{src_ip}:{threat_type}"
    acquired  = await redis_client.set(dedup_key, 1, ex=90, nx=True)
    if not acquired:
        return  # already processing this src+type combo

    prompt = f"""You are a senior SOC analyst. Analyze this security alert and respond ONLY with a valid JSON object. No markdown, no preamble, no explanation outside the JSON.

Alert:
- Threat Type: {threat_type}
- Source IP: {src_ip}
- Destination IP: {dst_ip}
- Severity: {alert.get('severity')}
- Confidence: {alert.get('confidence_score')}
- MITRE Technique: {alert.get('playbook', {}).get('technique_id')}

Required JSON fields (respond with EXACTLY these keys):
{{
  "mitre_id": "T1XXX",
  "mitre_name": "Technique name",
  "tactic": "Tactic name",
  "plain_english": "One clear sentence explaining what happened.",
  "is_false_positive": false,
  "false_positive_reason": null,
  "firewall_cmds": ["iptables -A INPUT -s {src_ip} -j DROP"],
  "investigation_steps": ["Step 1", "Step 2"],
  "confidence_explanation": "Why this score was assigned."
}}"""

    try:
        loop     = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: _gemini_model.generate_content(prompt),
        )
        text = response.text.strip()
        # Strip markdown code fences if model adds them despite instructions
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        playbook = json.loads(text)
        playbook["ai_enhanced"] = True
        payload  = b"data: " + orjson.dumps({
            "type":     "playbook",
            "alert_id": alert_id,
            "playbook": playbook,
        }) + b"\n\n"
        _broadcast(payload)
    except Exception as exc:
        print(f"[BACKEND] Gemini error for {alert_id}: {exc}", file=sys.stderr)
        # Silently fall back — local playbook already attached to alert


# ─── ML warmup ────────────────────────────────────────────────────────────────
# FIX: function body was split/interleaved — fully reconstructed in correct order

def _warmup_ml():
    import random as _rnd
    print("[BACKEND] Warming up ML model (1000 iterations)...", file=sys.stderr)

    # Phase 1: 700 normal events — establishes the baseline the model learns as "normal"
    for _ in range(700):
        features = {
            "src_port":  str(_rnd.randint(1024, 65535)),
            "dst_port":  str(_rnd.choice([80, 443, 8080, 3306, 5432, 25, 110])),
            "bytes":     str(_rnd.randint(200, 50000)),
            "protocol":  _rnd.choice(["tcp", "udp"]),
            "action":    _rnd.choice(["network_connect", "http_request", "dns_query", "file_read"]),
            "proc_name": _rnd.choice(["nginx", "curl", "python3", "chrome", "firefox", "sshd"]),
            "direction": _rnd.choice(["inbound", "outbound", "internal"]),
        }
        ml_model.score_one(features)
        ml_model.learn_one(features)

    # Phase 2: 300 attack-pattern events — teaches the model what anomalies look like
    # These are scored but NOT learned (so model stays biased toward normal baseline)
    attack_samples = []
    for _ in range(100):  # brute force
        attack_samples.append({
            "src_port":  str(_rnd.randint(1024, 65535)),
            "dst_port":  "22",
            "bytes":     str(_rnd.randint(100, 400)),
            "protocol":  "tcp",
            "action":    "authentication_failure",
            "proc_name": "sshd",
            "direction": "inbound",
        })
    for _ in range(100):  # C2 beacon
        attack_samples.append({
            "src_port":  str(_rnd.randint(1024, 65535)),
            "dst_port":  str(_rnd.choice([4444, 8080, 53])),
            "bytes":     str(_rnd.randint(50, 300)),
            "protocol":  "tcp",
            "action":    "network_connect",
            "proc_name": _rnd.choice(["cmd.exe", "powershell", "bash", "nc"]),
            "direction": "outbound",
        })
    for _ in range(100):  # exfiltration
        attack_samples.append({
            "src_port":  str(_rnd.randint(1024, 65535)),
            "dst_port":  str(_rnd.choice([443, 80, 21])),
            "bytes":     str(_rnd.randint(8_000_000, 50_000_000)),
            "protocol":  "tcp",
            "action":    "file_transfer",
            "proc_name": _rnd.choice(["rclone", "scp", "ftp", "curl"]),
            "direction": "outbound",
        })
    # Score attacks so model sees contrast — but don't learn them (baseline stays normal)
    for f in attack_samples:
        ml_model.score_one(f)

    print("[BACKEND] ML warmup complete.", file=sys.stderr)


# ─── Processing loop ──────────────────────────────────────────────────────────

async def processing_loop(rc: aioredis):
    import uuid
    global _stats, _eps_window

    print("[BACKEND] Processing loop started.", file=sys.stderr)

    while True:
        try:
            raw_batch = await rc.xreadgroup(
                groupname=CONSUMER_GROUP,
                consumername=CONSUMER_NAME,
                streams={STREAM_KEY: ">"},
                count=100,
                block=50,
            )
        except Exception as exc:
            print(f"[BACKEND] xreadgroup error: {exc}", file=sys.stderr)
            await asyncio.sleep(0.5)
            continue

        if not raw_batch:
            continue

        for stream_name, messages in raw_batch:
            for msg_id, fields in messages:
                try:
                    raw_data = fields.get(b"data") or fields.get("data")
                    if raw_data is None:
                        continue
                    if isinstance(raw_data, (bytes, bytearray)):
                        event = orjson.loads(raw_data)
                    else:
                        event = orjson.loads(raw_data.encode())
                except Exception as exc:
                    print(f"[BACKEND] Parse error: {exc}", file=sys.stderr)
                    await rc.xack(STREAM_KEY, CONSUMER_GROUP, msg_id)
                    continue

                # Step 2 — Rule classifier
                threat_type, is_fp = _classify_rule(event)

                # Step 3 — ML scoring
                features     = _extract_features(event)
                anomaly_score = ml_model.score_one(features)
                ml_model.learn_one(features)
                anomaly_score = max(0.0, min(1.0, float(anomaly_score)))

                # Step 4 — Cross-layer correlation
                # Check BOTH src_ip AND dst_ip so that:
                #   brute_force (attacker→victim) stores corr:victim
                #   c2_beacon   (victim→C2)       finds  corr:victim → cross_layer=True
                src_ip  = event.get("source", {}).get("ip", "")
                dst_ip  = event.get("destination", {}).get("ip", "")
                pid     = event.get("process", {}).get("pid", 0)
                cross_layer = False
                for _ip in filter(None, [src_ip, dst_ip]):
                    existing = await rc.get(f"corr:{_ip}")
                    if existing is not None:
                        cross_layer = True
                # Register BOTH IPs so future events on either side correlate
                if src_ip:
                    await rc.setex(f"corr:{src_ip}", 90, str(pid))
                if dst_ip:
                    await rc.setex(f"corr:{dst_ip}", 90, str(pid))

                # Step 5 — Confidence score
                rule_hit = 1.0 if threat_type else 0.0
                score    = _confidence_score(rule_hit, anomaly_score, cross_layer)
                severity = _severity(score)

                # Build alert
                alert_id = str(uuid.uuid4())
                local_pb = (
                    _build_local_playbook(threat_type, src_ip, dst_ip)
                    if threat_type else {}
                )
                alert = {
                    "id":                       alert_id,
                    "timestamp":                event.get("@timestamp", ""),
                    "threat_type":              threat_type,
                    "severity":                 severity,
                    "confidence_score":         round(score, 4),
                    "anomaly_score":            round(anomaly_score, 4),
                    "cross_layer":              cross_layer,
                    "is_false_positive":        is_fp,
                    "is_false_positive_candidate": is_fp,
                    "src_ip":                   src_ip,
                    "dst_ip":                   dst_ip,
                    "dst_port":                 event.get("destination", {}).get("port", 0),
                    "action":                   event.get("event", {}).get("action", ""),
                    "bytes":                    event.get("network", {}).get("bytes", 0),
                    "user":                     event.get("user", {}).get("name", ""),
                    "process":                  event.get("process", {}).get("name", ""),
                    "pid":                      pid,
                    "playbook":                 local_pb,
                    "labels":                   event.get("labels", {}),
                    "type":                     "alert",
                }

                # Step 7 — XACK (before broadcast)
                await rc.xack(STREAM_KEY, CONSUMER_GROUP, msg_id)

                # Update stats
                _stats["total"] += 1
                _stats[severity.lower()] = _stats.get(severity.lower(), 0) + 1
                _eps_window.append(time.monotonic())

                # Only broadcast real threats
                if threat_type or is_fp:
                    payload = b"data: " + orjson.dumps(alert) + b"\n\n"
                    _broadcast(payload)

                # Step 6 — Gemini (Critical, non-FP only)
                if severity == "Critical" and not is_fp and _gemini_available and threat_type:
                    asyncio.create_task(_call_gemini(alert))


async def _stats_reporter():
    while True:
        await asyncio.sleep(5)
        now = time.monotonic()
        cutoff = now - 10.0
        _eps_window[:] = [t for t in _eps_window if t > cutoff]
        eps = len(_eps_window) / 10.0
        print(
            f"[BACKEND] total={_stats['total']}  eps={eps:.1f}  "
            f"critical={_stats.get('critical',0)}  high={_stats.get('high',0)}  "
            f"clients={len(active_clients)}",
            file=sys.stderr, flush=True,
        )


# ─── Startup ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    global redis_client

    # 1. Connect to Redis
    redis_client = aioredis.from_url(
        REDIS_URL, decode_responses=False, max_connections=20
    )

    # 2. Create consumer group
    try:
        await redis_client.xgroup_create(
            STREAM_KEY, CONSUMER_GROUP, id="0", mkstream=True
        )
        print(f"[BACKEND] Consumer group '{CONSUMER_GROUP}' created.", file=sys.stderr)
    except ResponseError as exc:
        if "BUSYGROUP" in str(exc):
            print(f"[BACKEND] Consumer group already exists — continuing.", file=sys.stderr)
        else:
            raise

    # 3. ML warmup (sync — runs before event loop tasks start)
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _warmup_ml)

    # 4. Init Gemini
    await loop.run_in_executor(None, _init_gemini)

    # 5. Start background tasks
    asyncio.create_task(processing_loop(redis_client))
    asyncio.create_task(_stats_reporter())
    print("[BACKEND] OmniShield AI backend ready.", file=sys.stderr)


# ─── SSE endpoint ─────────────────────────────────────────────────────────────

@app.get("/stream")
async def stream_alerts(request: Request):
    q = asyncio.Queue(maxsize=2000)
    active_clients.add(q)

    async def event_generator():
        yield b": connected\n\n"
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield msg
                except asyncio.TimeoutError:
                    yield b": heartbeat\n\n"
                except asyncio.CancelledError:
                    raise
        except asyncio.CancelledError:
            raise
        finally:
            active_clients.discard(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── Health + Stats endpoints ─────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "gemini": _gemini_available, "clients": len(active_clients)}


@app.get("/stats")
async def stats():
    now = time.monotonic()
    cutoff = now - 10.0
    _eps_window[:] = [t for t in _eps_window if t > cutoff]
    eps = len(_eps_window) / 10.0
    return {
        "total":    _stats["total"],
        "eps":      round(eps, 1),
        "critical": _stats.get("critical", 0),
        "high":     _stats.get("high", 0),
        "medium":   _stats.get("medium", 0),
        "low":      _stats.get("low", 0),
    }


# ─── Entrypoint ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "backend:app",
        host="0.0.0.0",
        port=8000,
        loop="uvloop",
        log_level="warning",
    )
