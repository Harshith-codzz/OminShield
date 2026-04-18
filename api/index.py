# api/index.py — Vercel entrypoint shim
# Vercel looks for an `app` variable in api/index.py (or other recognized files).
# We simply re-export the FastAPI instance from our actual backend module.

import sys
import os

# Ensure the repo root is on the path so `backend` can be imported
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import app  # noqa: F401  — `app` must be importable at module level

__all__ = ["app"]
