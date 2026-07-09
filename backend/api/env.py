"""Load backend/.env for local development."""

from __future__ import annotations

import os
from pathlib import Path


def load_local_env() -> None:
    """Load backend/.env for local dev (production should inject env via host)."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.is_file():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key:
            os.environ[key] = value.strip()
