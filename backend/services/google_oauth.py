"""Verify Google Sign-In ID tokens (OpenID Connect)."""

from __future__ import annotations

import os
from typing import Any

from fastapi import HTTPException
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token


def get_google_oauth_client_id() -> str:
    return (
        os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
        or os.environ.get("DOCUGRID_GOOGLE_CLIENT_ID")
        or ""
    ).strip()


def verify_google_id_token(token: str, *, client_id: str | None = None) -> dict[str, Any]:
    """Validate a Google Identity Services credential (JWT id_token)."""
    cid = (client_id or get_google_oauth_client_id()).strip()
    if not cid:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured")
    if not (token or "").strip():
        raise HTTPException(status_code=400, detail="Missing Google credential")
    try:
        claims = id_token.verify_oauth2_token(
            token.strip(),
            google_requests.Request(),
            cid,
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid Google credential") from exc
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(status_code=401, detail="Invalid Google token issuer")
    return claims
