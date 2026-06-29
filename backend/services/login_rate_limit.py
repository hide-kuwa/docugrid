"""Simple in-memory login rate limiter (per client IP)."""

from __future__ import annotations

import os
import time
from collections import defaultdict

_WINDOW_SEC = 60
_MAX_ATTEMPTS = 20
_attempts: dict[str, list[float]] = defaultdict(list)


def _max_attempts() -> int:
    try:
        return int(os.environ.get("DOCUGRID_LOGIN_RATE_LIMIT", str(_MAX_ATTEMPTS)))
    except ValueError:
        return _MAX_ATTEMPTS


def _window_sec() -> int:
    try:
        return int(os.environ.get("DOCUGRID_LOGIN_RATE_WINDOW_SEC", str(_WINDOW_SEC)))
    except ValueError:
        return _WINDOW_SEC


def login_rate_limit_exceeded(client_ip: str) -> bool:
    """Return True when the IP exceeded allowed login attempts in the window."""
    if not client_ip:
        return False
    now = time.time()
    window = _window_sec()
    bucket = [t for t in _attempts[client_ip] if now - t < window]
    if len(bucket) >= _max_attempts():
        _attempts[client_ip] = bucket
        return True
    bucket.append(now)
    _attempts[client_ip] = bucket
    return False


def reset_login_rate_limits() -> None:
    _attempts.clear()


_MCP_WINDOW_SEC = 3600
_MCP_MAX_ISSUES = 10
_mcp_attempts: dict[str, list[float]] = defaultdict(list)


def _mcp_max_issues() -> int:
    try:
        return int(os.environ.get("DOCUGRID_MCP_TOKEN_RATE_LIMIT", str(_MCP_MAX_ISSUES)))
    except ValueError:
        return _MCP_MAX_ISSUES


def mcp_token_rate_limit_exceeded(actor_key: str) -> bool:
    """Per-user MCP token issuance limit (default 10/hour)."""
    if not actor_key:
        return False
    now = time.time()
    bucket = [t for t in _mcp_attempts[actor_key] if now - t < _MCP_WINDOW_SEC]
    if len(bucket) >= _mcp_max_issues():
        _mcp_attempts[actor_key] = bucket
        return True
    bucket.append(now)
    _mcp_attempts[actor_key] = bucket
    return False


def reset_mcp_token_rate_limits() -> None:
    _mcp_attempts.clear()
