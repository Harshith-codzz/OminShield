# api/index.py — Vercel serverless entrypoint
# Vercel's Python runtime scans this file for an `app` ASGI variable.
# We re-export the FastAPI instance from backend.py.

import sys
import os

# Add repo root to path so `backend` module is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import app  # noqa: F401 — `app` MUST be importable at module level

__all__ = ["app"]
