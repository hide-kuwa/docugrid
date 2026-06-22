"""Google OAuth routes for the FastAPI backend."""
from __future__ import annotations

import json
import logging
import secrets
import time
from typing import Any, Dict, Optional
from urllib.parse import urlencode

import requests
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from . import crud

from . import schemas
from .config import settings
from .database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
DEFAULT_FRONTEND_CALLBACK_PATH = "/auth/callback"
STATE_TTL_SECONDS = 600

_state_store: Dict[str, float] = {}


def _remember_state(state: str) -> None:
    """Store state with a timestamp so we can validate the callback."""
    now = time.time()
    # Remove expired entries to keep the map bounded.
    expired = [key for key, created_at in _state_store.items() if now - created_at > STATE_TTL_SECONDS]
    for key in expired:
        _state_store.pop(key, None)
    _state_store[state] = now


def _consume_state(state: str) -> bool:
    """Validate and remove the one-time state token."""
    created_at = _state_store.pop(state, None)
    if created_at is None:
        return False
    return time.time() - created_at <= STATE_TTL_SECONDS


def _build_redirect_uri(request: Request) -> str:
    base_url = (
        settings.backend_base_url.rstrip("/")
        if getattr(settings, "backend_base_url", None)
        else str(request.base_url).rstrip("/")
    )
    return f"{base_url}{router.prefix}/callback"


def _frontend_callback_url(token: str) -> str:
    base = settings.frontend_base_url.rstrip("/")
    return f"{base}{DEFAULT_FRONTEND_CALLBACK_PATH}?token={token}"


def _exchange_code_for_tokens(code: str, redirect_uri: str) -> Dict[str, Any]:
    payload = {
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
    }
    try:
        response = requests.post(GOOGLE_TOKEN_URL, data=payload, timeout=10)
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.exception("Failed to exchange code for tokens: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to communicate with Google OAuth servers.",
        ) from exc
    return response.json()


def _fetch_user_info(access_token: str) -> Dict[str, Any]:
    headers = {"Authorization": f"Bearer {access_token}"}
    try:
        response = requests.get(GOOGLE_USERINFO_URL, headers=headers, timeout=10)
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.exception("Failed to fetch Google user info: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to retrieve Google user information.",
        ) from exc
    return response.json()


@router.get("/login/google")
def login_with_google(request: Request) -> RedirectResponse:
    """Redirect the user to Google's OAuth consent screen."""
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google OAuth credentials are not configured.",
        )

    state = secrets.token_urlsafe(32)
    _remember_state(state)

    params = {
        "client_id": settings.google_client_id,
        "response_type": "code",
        "redirect_uri": _build_redirect_uri(request),
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
    }

    url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    return RedirectResponse(url=url, status_code=status.HTTP_302_FOUND)


@router.get("/callback")
def google_callback(
    request: Request,
    code: str,
    state: str,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Handle Google's callback by exchanging the code and creating a user."""
    if not _consume_state(state):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OAuth state parameter.")

    redirect_uri = _build_redirect_uri(request)
    token_data = _exchange_code_for_tokens(code, redirect_uri)

    access_token: Optional[str] = token_data.get("access_token")
    id_token: Optional[str] = token_data.get("id_token")

    if not access_token:
        logger.error("Google token exchange did not return an access token: %s", json.dumps(token_data))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google authentication failed.",
        )

    user_info = _fetch_user_info(access_token)
    email = user_info.get("email")
    name = user_info.get("name") or user_info.get("given_name")

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account does not expose an email address.",
        )

    user = crud.get_user_by_email(db, email)
    if not user:
        user_in = schemas.UserCreate(email=email, name=name or "Unknown User")
        user = crud.create_user(db, user_in)
        logger.info("Created new user %s with Google authentication.", email)

    token_to_return = id_token or access_token
    redirect_url = _frontend_callback_url(token_to_return)
    return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)


@router.get("/health")
def auth_healthcheck() -> Dict[str, str]:
    """Simple health endpoint so tests can confirm the router is mounted."""
    return {"status": "ok"}
