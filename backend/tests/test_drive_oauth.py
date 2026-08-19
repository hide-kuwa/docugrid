"""Google Drive OAuth (firm consent) unit tests."""

from __future__ import annotations

from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from main import app
from services.drive_oauth import (
    build_authorize_url,
    clear_drive_oauth,
    drive_oauth_connected,
)
from services.drive_context import invalidate_drive_service_cache

client = TestClient(app)


def _admin_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "admin",
        "X-Docugrid-User": "admin@taxx.jp",
        "X-Docugrid-Stakeholder": "actor-admin",
        "X-Docugrid-Client": "c1",
    }


def test_drive_oauth_start_requires_client_secret(monkeypatch) -> None:
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "test-client.apps.googleusercontent.com")
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("GOOGLE_DRIVE_OAUTH_CLIENT_SECRET", raising=False)
    r = client.get("/api/drive/oauth/start", headers=_admin_headers())
    assert r.status_code == 503
    detail = str(r.json().get("detail") or "")
    assert "SECRET" in detail or "シークレット" in detail or "未設定" in detail


def test_drive_oauth_start_returns_authorize_url(monkeypatch) -> None:
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "test-client.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "test-secret")
    r = client.get("/api/drive/oauth/start", headers=_admin_headers())
    assert r.status_code == 200, r.text
    body = r.json()
    assert "accounts.google.com" in body["authorize_url"]
    assert "test-client.apps.googleusercontent.com" in body["authorize_url"]
    assert body["redirect_uri"].endswith("/api/drive/oauth/callback")


def test_drive_oauth_callback_persists_tokens(monkeypatch) -> None:
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "test-client.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "test-secret")
    monkeypatch.setenv("DOCUGRID_FRONTEND_URL", "http://localhost:3000")
    monkeypatch.setenv("DOCUGRID_SECRET_ENCRYPTION_KEY", "z" * 40)

    url = build_authorize_url(firm_id="firm_default", actor_email="admin@taxx.jp")
    state = parse_qs(urlparse(url).query)["state"][0]

    clear_drive_oauth("firm_default")
    invalidate_drive_service_cache("firm_default")

    with (
        patch(
            "services.drive_oauth._exchange_code",
            return_value={
                "access_token": "access-xyz",
                "refresh_token": "refresh-xyz",
                "expires_in": 3600,
            },
        ),
        patch("services.drive_oauth._fetch_user_email", return_value="drive@firm.example"),
        patch(
            "services.drive_oauth._ensure_default_root_folder",
            return_value=("folder-root-1", "DocuGrid"),
        ),
        patch("services.drive_oauth.load_oauth_credentials"),
    ):
        r = client.get(
            "/api/drive/oauth/callback",
            params={"code": "auth-code", "state": state},
            follow_redirects=False,
        )
    assert r.status_code in (302, 307)
    loc = r.headers.get("location") or ""
    assert "drive_oauth=ok" in loc
    assert drive_oauth_connected("firm_default")

    status = client.get("/api/drive/status", headers=_admin_headers())
    assert status.status_code == 200
    body = status.json()
    assert body["auth_method"] == "oauth"
    assert body["connected_email"] == "drive@firm.example"
    assert body["drive_credentials_configured"] is True

    clear_drive_oauth("firm_default")
    invalidate_drive_service_cache("firm_default")


def test_drive_status_reports_oauth_available(monkeypatch) -> None:
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "test-client.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "test-secret")
    r = client.get("/api/drive/status", headers=_admin_headers())
    assert r.status_code == 200
    assert r.json()["oauth_available"] is True
