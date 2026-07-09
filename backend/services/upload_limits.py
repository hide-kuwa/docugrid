"""Upload size limits for file endpoints."""

from __future__ import annotations

import os

from fastapi import HTTPException

DEFAULT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MiB


def max_upload_bytes() -> int:
    raw = os.environ.get("DOCUGRID_MAX_UPLOAD_BYTES", "").strip()
    if not raw:
        return DEFAULT_MAX_UPLOAD_BYTES
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_MAX_UPLOAD_BYTES
    return max(1, value)


def enforce_upload_size(content: bytes) -> None:
    limit = max_upload_bytes()
    if len(content) > limit:
        raise HTTPException(
            status_code=413,
            detail=f"Upload too large (max {limit} bytes)",
        )
