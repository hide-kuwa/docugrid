"""Firm-level Google Drive OAuth (user consent) — preferred over service-account JSON."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlencode

import jwt
import requests
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from docugrid_auth import _jwt_secret
from services.drive import DRIVE_FULL_SCOPE, FOLDER_MIME, DriveConfigurationError
from services.firm_settings import (
    _encrypt_secret,
    _decrypt_secret,
    _firm_dir,
    _load_json,
    _write_json,
)
from services.tenancy import DEFAULT_FIRM_ID

logger = logging.getLogger(__name__)

DRIVE_OAUTH_SCOPES = list(DRIVE_FULL_SCOPE) + [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
]
TOKEN_URI = "https://oauth2.googleapis.com/token"
AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth"
DEFAULT_ROOT_FOLDER_NAME = "DocuGrid"


def drive_oauth_path(firm_id: str) -> Path:
    return _firm_dir(firm_id) / "drive_oauth.json"


def drive_oauth_client_id() -> str:
    return (
        os.environ.get("GOOGLE_DRIVE_OAUTH_CLIENT_ID")
        or os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
        or os.environ.get("DOCUGRID_GOOGLE_CLIENT_ID")
        or ""
    ).strip()


def drive_oauth_client_secret() -> str:
    return (
        os.environ.get("GOOGLE_DRIVE_OAUTH_CLIENT_SECRET")
        or os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET")
        or ""
    ).strip()


def drive_oauth_redirect_uri() -> str:
    explicit = (os.environ.get("GOOGLE_DRIVE_OAUTH_REDIRECT_URI") or "").strip()
    if explicit:
        return explicit
    api_base = (os.environ.get("DOCUGRID_API_PUBLIC_URL") or "").strip().rstrip("/")
    if api_base:
        return f"{api_base}/api/drive/oauth/callback"
    # Local default — must match Google Cloud Console redirect URI
    return "http://localhost:8000/api/drive/oauth/callback"


def drive_oauth_frontend_return_url(*, ok: bool, error: str = "") -> str:
    front = (os.environ.get("DOCUGRID_FRONTEND_URL") or "http://localhost:3000").rstrip("/")
    params = {"tab": "drive", "drive_oauth": "ok" if ok else "error"}
    if error:
        params["drive_oauth_error"] = error[:120]
    return f"{front}/settings?{urlencode(params)}"


def drive_oauth_configured() -> bool:
    return bool(drive_oauth_client_id() and drive_oauth_client_secret())


def drive_oauth_connected(firm_id: str) -> bool:
    raw = _load_json(drive_oauth_path(firm_id))
    return bool((raw.get("refresh_token_encrypted") or "").strip())


def get_drive_oauth_email(firm_id: str) -> Optional[str]:
    email = (_load_json(drive_oauth_path(firm_id)).get("email") or "").strip()
    return email or None


def clear_drive_oauth(firm_id: str) -> None:
    path = drive_oauth_path(firm_id)
    if path.exists():
        path.unlink()


def build_authorize_url(*, firm_id: str, actor_email: str) -> str:
    if not drive_oauth_configured():
        raise DriveConfigurationError(
            "Google Drive OAuth が未設定です。"
            "GOOGLE_OAUTH_CLIENT_ID と GOOGLE_OAUTH_CLIENT_SECRET を設定し、"
            f"リダイレクト URI に {drive_oauth_redirect_uri()} を追加してください。"
        )
    fid = (firm_id or "").strip() or DEFAULT_FIRM_ID
    now = datetime.now(timezone.utc)
    state = jwt.encode(
        {
            "purpose": "drive_oauth",
            "firm_id": fid,
            "actor": (actor_email or "").strip().lower(),
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=15)).timestamp()),
        },
        _jwt_secret(),
        algorithm="HS256",
    )
    params = {
        "client_id": drive_oauth_client_id(),
        "redirect_uri": drive_oauth_redirect_uri(),
        "response_type": "code",
        "scope": " ".join(DRIVE_OAUTH_SCOPES),
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent",
        "state": state,
    }
    return f"{AUTH_URI}?{urlencode(params)}"


def _decode_oauth_state(state: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(state, _jwt_secret(), algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise DriveConfigurationError("invalid_oauth_state") from exc
    if payload.get("purpose") != "drive_oauth":
        raise DriveConfigurationError("invalid_oauth_state")
    firm_id = (payload.get("firm_id") or "").strip()
    if not firm_id:
        raise DriveConfigurationError("invalid_oauth_state")
    return payload


def _exchange_code(code: str) -> dict[str, Any]:
    res = requests.post(
        TOKEN_URI,
        data={
            "code": code,
            "client_id": drive_oauth_client_id(),
            "client_secret": drive_oauth_client_secret(),
            "redirect_uri": drive_oauth_redirect_uri(),
            "grant_type": "authorization_code",
        },
        timeout=30,
    )
    if res.status_code >= 400:
        logger.warning("Drive OAuth token exchange failed: %s", res.text[:300])
        raise DriveConfigurationError("token_exchange_failed")
    data = res.json()
    if not data.get("refresh_token") and not data.get("access_token"):
        raise DriveConfigurationError("token_exchange_failed")
    return data


def _fetch_user_email(access_token: str) -> str:
    res = requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=20,
    )
    if res.status_code >= 400:
        return ""
    return str((res.json() or {}).get("email") or "").strip().lower()


def _save_oauth_tokens(
    firm_id: str,
    *,
    token_payload: dict[str, Any],
    email: str,
    existing_refresh: str = "",
) -> None:
    refresh = (token_payload.get("refresh_token") or existing_refresh or "").strip()
    access = (token_payload.get("access_token") or "").strip()
    if not refresh:
        raise DriveConfigurationError("refresh_token_missing")
    expires_in = int(token_payload.get("expires_in") or 3600)
    expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=max(60, expires_in - 60))
    ).isoformat()
    payload = {
        "auth_method": "oauth",
        "email": email,
        "refresh_token_encrypted": _encrypt_secret(refresh),
        "access_token_encrypted": _encrypt_secret(access) if access else "",
        "expires_at": expires_at,
        "token_uri": TOKEN_URI,
        "scopes": DRIVE_OAUTH_SCOPES,
        "updated_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    }
    _write_json(drive_oauth_path(firm_id), payload)


def load_oauth_credentials(firm_id: str) -> Credentials:
    raw = _load_json(drive_oauth_path(firm_id))
    refresh_enc = (raw.get("refresh_token_encrypted") or "").strip()
    if not refresh_enc:
        raise DriveConfigurationError("Drive OAuth is not connected")
    refresh = _decrypt_secret(refresh_enc)
    if not refresh:
        raise DriveConfigurationError("Drive OAuth token decrypt failed")
    access_enc = (raw.get("access_token_encrypted") or "").strip()
    access = _decrypt_secret(access_enc) if access_enc else None
    creds = Credentials(
        token=access,
        refresh_token=refresh,
        token_uri=TOKEN_URI,
        client_id=drive_oauth_client_id(),
        client_secret=drive_oauth_client_secret(),
        scopes=DRIVE_OAUTH_SCOPES,
    )
    if not creds.valid:
        if not creds.refresh_token:
            raise DriveConfigurationError("refresh_token_missing")
        creds.refresh(GoogleAuthRequest())
        _save_oauth_tokens(
            firm_id,
            token_payload={
                "refresh_token": creds.refresh_token,
                "access_token": creds.token,
                "expires_in": 3500,
            },
            email=(raw.get("email") or ""),
            existing_refresh=refresh,
        )
    return creds


def _ensure_default_root_folder(creds: Credentials) -> tuple[str, str]:
    service = build("drive", "v3", credentials=creds, cache_discovery=False)
    query = (
        f"name='{DEFAULT_ROOT_FOLDER_NAME}' and mimeType='{FOLDER_MIME}' "
        "and 'root' in parents and trashed=false"
    )
    listed = (
        service.files()
        .list(
            q=query,
            fields="files(id,name)",
            pageSize=1,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        )
        .execute()
    )
    files = listed.get("files") or []
    if files:
        return files[0]["id"], files[0].get("name") or DEFAULT_ROOT_FOLDER_NAME
    created = (
        service.files()
        .create(
            body={
                "name": DEFAULT_ROOT_FOLDER_NAME,
                "mimeType": FOLDER_MIME,
                "parents": ["root"],
            },
            fields="id,name",
            supportsAllDrives=True,
        )
        .execute()
    )
    return created["id"], created.get("name") or DEFAULT_ROOT_FOLDER_NAME


def complete_oauth_callback(code: str, state: str) -> dict[str, Any]:
    """Exchange code, persist tokens, ensure DocuGrid root folder. Returns firm_id + meta."""
    claims = _decode_oauth_state(state)
    firm_id = str(claims["firm_id"])
    token_payload = _exchange_code(code)
    access = str(token_payload.get("access_token") or "")
    email = _fetch_user_email(access) if access else ""
    existing = _load_json(drive_oauth_path(firm_id))
    existing_refresh = ""
    if (existing.get("refresh_token_encrypted") or "").strip():
        existing_refresh = _decrypt_secret(existing["refresh_token_encrypted"]) or ""
    _save_oauth_tokens(
        firm_id,
        token_payload=token_payload,
        email=email or (existing.get("email") or ""),
        existing_refresh=existing_refresh,
    )
    creds = load_oauth_credentials(firm_id)
    folder_id, folder_name = _ensure_default_root_folder(creds)
    share_result: dict[str, Any] = {}
    try:
        from services.drive_share import share_root_with_firm_members

        share_result = share_root_with_firm_members(
            firm_id,
            root_folder_id=folder_id,
            connected_email=email or get_drive_oauth_email(firm_id) or "",
        )
    except Exception as exc:
        logger.info("auto share after oauth skipped firm=%s: %s", firm_id, exc)
        share_result = {"ok": False, "message": str(exc)[:120]}
    return {
        "firm_id": firm_id,
        "email": email or get_drive_oauth_email(firm_id) or "",
        "root_folder_id": folder_id,
        "root_folder_name": folder_name,
        "actor": claims.get("actor") or "",
        "share": share_result,
    }
