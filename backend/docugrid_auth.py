"""
JWT-based auth for DocuGrid API.

- Issue tokens at POST /api/auth/login (implemented in main.py).
- Protected routes resolve identity from Bearer token first; optional header fallback for tests.
"""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt

from services.tenancy import DEFAULT_FIRM_ID, stakeholder_firm_id

JWT_ALG = "HS256"
DEV_JWT_SECRET = "dev-insecure-change-me"
MIN_JWT_SECRET_LEN = 32
SESSION_COOKIE_NAME = "docugrid_session"
CSRF_COOKIE_NAME = "docugrid_csrf"
CSRF_HEADER_NAME = "X-CSRF-Token"

CSRF_EXEMPT_PREFIXES = (
    "/api/auth/login",
    "/api/auth/google",
    "/api/auth/logout",
    "/api/auth/config",
    "/docs",
    "/openapi.json",
    "/redoc",
)


def get_app_env() -> str:
    return os.environ.get("DOCUGRID_ENV", "development").strip().lower()


def is_production() -> bool:
    return get_app_env() in ("production", "prod")


def get_jwt_exp_hours() -> float:
    try:
        return float(os.environ.get("DOCUGRID_JWT_EXP_HOURS", "24"))
    except ValueError:
        return 24.0


def get_jwt_exp_seconds() -> int:
    return int(get_jwt_exp_hours() * 3600)

# Mirrors frontend STAKEHOLDER_MASTER id -> appRoleId
STAKEHOLDER_ROLE_BY_ID: dict[str, str] = {
    "actor-admin": "platform_admin",
    "actor-s1": "operator",
    "actor-s2": "reviewer",
    "actor-s3": "approver",
    "actor-c1": "client_uploader",
    "actor-c-ceo": "viewer",
    "actor-c-sales": "client_uploader",
    "actor-c-controller": "client_uploader",
    "actor-b1": "viewer",
    "actor-tp1": "viewer",
    "actor-tax1": "viewer",
    "actor-beta-admin": "firm_admin",
    "actor-beta-staff": "operator",
}


def _jwt_secret() -> str:
    return os.environ.get("DOCUGRID_JWT_SECRET", DEV_JWT_SECRET)


def jwt_secret_is_dev_default() -> bool:
    return _jwt_secret() == DEV_JWT_SECRET


def session_cookie_enabled() -> bool:
    raw = os.environ.get("DOCUGRID_SESSION_COOKIE")
    if raw is None:
        return True
    return raw.lower() in ("1", "true", "yes")


def session_cookie_secure() -> bool:
    raw = os.environ.get("DOCUGRID_SESSION_COOKIE_SECURE")
    if raw is not None:
        return raw.lower() in ("1", "true", "yes")
    return is_production()


def get_access_token_from_request(request) -> str | None:
    """Bearer header first, then httpOnly session cookie."""
    token = get_bearer_token(request.headers.get("Authorization"))
    if token:
        return token
    if session_cookie_enabled():
        cookie = request.cookies.get(SESSION_COOKIE_NAME)
        if cookie and cookie.strip():
            return cookie.strip()
    return None


def header_auth_allowed() -> bool:
    raw = os.environ.get("DOCUGRID_ALLOW_HEADER_AUTH")
    if raw is None:
        return not is_production()
    return raw.lower() in ("1", "true", "yes")


def legacy_files_enabled() -> bool:
    """Legacy GET /files (firm-root PDF listing). Off by default in production."""
    raw = os.environ.get("DOCUGRID_ALLOW_LEGACY_FILES")
    if raw is not None:
        return raw.lower() in ("1", "true", "yes")
    return not is_production()


def csrf_protection_enabled() -> bool:
    raw = os.environ.get("DOCUGRID_CSRF")
    if raw is None:
        return session_cookie_enabled()
    return raw.lower() in ("1", "true", "yes")


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def is_csrf_exempt_path(path: str) -> bool:
    if path in ("/",):
        return True
    return any(path.startswith(prefix) for prefix in CSRF_EXEMPT_PREFIXES)


def attach_csrf_cookie(response, *, max_age: int | None = None) -> None:
    if not csrf_protection_enabled():
        return
    token = generate_csrf_token()
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=token,
        httponly=False,
        secure=session_cookie_secure(),
        samesite="lax",
        max_age=max_age or get_jwt_exp_seconds(),
        path="/",
    )


def clear_csrf_cookie(response) -> None:
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")


def ensure_csrf_cookie_on_response(request, response) -> None:
    """Issue CSRF cookie when session exists but CSRF cookie is missing (e.g. after deploy)."""
    if not csrf_protection_enabled() or not session_cookie_enabled():
        return
    if not get_access_token_from_request(request):
        return
    if request.cookies.get(CSRF_COOKIE_NAME):
        return
    attach_csrf_cookie(response)


def csrf_validation_failed(request) -> bool:
    if not csrf_protection_enabled():
        return False
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return False
    path = request.url.path
    if is_csrf_exempt_path(path):
        return False
    if get_bearer_token(request.headers.get("Authorization")):
        return False
    if header_auth_allowed() and (request.headers.get("X-Docugrid-Role") or "").strip():
        return False
    if not request.cookies.get(SESSION_COOKIE_NAME):
        return False
    cookie = request.cookies.get(CSRF_COOKIE_NAME) or ""
    header = (request.headers.get(CSRF_HEADER_NAME) or "").strip()
    return not cookie or not header or cookie != header


def get_cors_origins() -> list[str] | None:
    """
    Explicit CORS allowlist. None => development localhost regex only (see main.py).
    """
    raw = os.environ.get("DOCUGRID_CORS_ORIGINS", "").strip()
    if not raw:
        return None
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def validate_auth_config(*, strict: bool | None = None) -> list[str]:
    """
    Validate auth-related environment. In production (strict=True by default),
    raises RuntimeError on fatal misconfiguration.
    Returns non-fatal warnings for development.
    """
    if strict is None:
        strict = is_production()
    warnings: list[str] = []
    secret = _jwt_secret()

    if is_production():
        if jwt_secret_is_dev_default() or len(secret) < MIN_JWT_SECRET_LEN:
            msg = (
                f"DOCUGRID_JWT_SECRET must be set to a random value of at least "
                f"{MIN_JWT_SECRET_LEN} characters in production"
            )
            if strict:
                raise RuntimeError(msg)
            warnings.append(msg)
        if header_auth_allowed():
            msg = "DOCUGRID_ALLOW_HEADER_AUTH must be false in production"
            if strict:
                raise RuntimeError(msg)
            warnings.append(msg)
        from services.member_directory import login_stakeholder_pick_allowed

        if login_stakeholder_pick_allowed():
            msg = "DOCUGRID_ALLOW_LOGIN_STAKEHOLDER_PICK must be false in production"
            if strict:
                raise RuntimeError(msg)
            warnings.append(msg)
        from services.google_oauth import get_google_oauth_client_id
        from services.member_directory import password_login_allowed

        if not get_google_oauth_client_id():
            msg = "GOOGLE_OAUTH_CLIENT_ID must be set in production"
            if strict:
                raise RuntimeError(msg)
            warnings.append(msg)
        if password_login_allowed():
            msg = "DOCUGRID_ALLOW_PASSWORD_LOGIN must be false in production"
            if strict:
                raise RuntimeError(msg)
            warnings.append(msg)
        if get_cors_origins() is None:
            msg = "DOCUGRID_CORS_ORIGINS must be set in production (comma-separated frontend URLs)"
            if strict:
                raise RuntimeError(msg)
            warnings.append(msg)
        if legacy_files_enabled():
            warnings.append(
                "DOCUGRID_ALLOW_LEGACY_FILES should be false in production — "
                "use slot document APIs instead of GET /files"
            )
    elif jwt_secret_is_dev_default():
        warnings.append(
            "Using default DOCUGRID_JWT_SECRET — set a strong secret before production"
        )

    return warnings


def create_access_token(
    *,
    sub: str,
    role: str,
    stid: str,
    firm_id: str | None = None,
    member_id: str | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    exp_seconds = get_jwt_exp_seconds()
    fid = (firm_id or "").strip() or stakeholder_firm_id(stid)
    mid = (member_id or "").strip() or stid
    payload = {
        "sub": sub,
        "role": role,
        "stid": stid,
        "firm_id": fid,
        "mid": mid,
        "iat": now,
        "exp": now + timedelta(seconds=exp_seconds),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALG)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        return None


def get_bearer_token(authorization: str | None) -> str | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization[7:].strip() or None


@dataclass(frozen=True)
class AuthIdentity:
    role: str
    email: str
    stakeholder_id: str
    firm_id: str = DEFAULT_FIRM_ID
    member_id: str = ""


def resolve_identity(request) -> AuthIdentity:
    """
    Prefer validated JWT. If no/invalid Bearer token, allow legacy headers when
    DOCUGRID_ALLOW_HEADER_AUTH is enabled (defaults true for local/tests).
    """
    cached = getattr(request.state, "_dg_identity", None)
    if cached is not None:
        return cached

    # Dev/test: explicit legacy headers win over session cookie (pytest uses both on one client).
    if header_auth_allowed():
        role = (request.headers.get("X-Docugrid-Role") or "").strip()
        if role:
            stid = (request.headers.get("X-Docugrid-Stakeholder") or "").strip()
            firm_hdr = (request.headers.get("X-Docugrid-Firm") or "").strip()
            identity = AuthIdentity(
                role=role,
                email=(request.headers.get("X-Docugrid-User") or "").strip(),
                stakeholder_id=stid,
                firm_id=firm_hdr or stakeholder_firm_id(stid),
                member_id=stid,
            )
            request.state._dg_identity = identity
            return identity

    token = get_access_token_from_request(request)
    if token:
        payload = decode_access_token(token)
        if not payload:
            from fastapi import HTTPException

            raise HTTPException(status_code=401, detail="Invalid or expired token")
        role = (payload.get("role") or "").strip()
        if not role:
            from fastapi import HTTPException

            raise HTTPException(status_code=401, detail="Invalid token payload")
        stid = (payload.get("stid") or "").strip()
        identity = AuthIdentity(
            role=role,
            email=(payload.get("sub") or "").strip(),
            stakeholder_id=stid,
            firm_id=(payload.get("firm_id") or "").strip() or stakeholder_firm_id(stid),
            member_id=(payload.get("mid") or "").strip() or stid,
        )
        request.state._dg_identity = identity
        return identity

    from fastapi import HTTPException

    raise HTTPException(status_code=401, detail="Bearer token required")


def peek_identity_for_audit(request) -> tuple[str | None, str | None, str | None]:
    """
    Best-effort identity for audit rows. Never raises (invalid token -> header fallback).
    Used by denial logging and when avoiding re-raising inside exception handlers.
    """
    token = get_access_token_from_request(request)
    if token:
        payload = decode_access_token(token)
        if payload:
            return (
                (payload.get("role") or "").strip() or None,
                (payload.get("sub") or "").strip() or None,
                (payload.get("stid") or "").strip() or None,
            )
    if header_auth_allowed():
        return (
            (request.headers.get("X-Docugrid-Role") or "").strip() or None,
            (request.headers.get("X-Docugrid-User") or "").strip() or None,
            (request.headers.get("X-Docugrid-Stakeholder") or "").strip() or None,
        )
    return (None, None, None)
