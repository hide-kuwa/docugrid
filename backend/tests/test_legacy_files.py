"""Legacy GET /files API gate (disabled by default in production)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _admin_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "admin",
        "X-Docugrid-Stakeholder": "actor-admin",
        "X-Docugrid-User": "admin@test.local",
    }


def test_auth_config_exposes_legacy_files_flag(monkeypatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_LEGACY_FILES", "true")
    r = client.get("/api/auth/config")
    assert r.status_code == 200
    assert r.json()["legacy_files"] is True

    monkeypatch.setenv("DOCUGRID_ALLOW_LEGACY_FILES", "false")
    r2 = client.get("/api/auth/config")
    assert r2.status_code == 200
    assert r2.json()["legacy_files"] is False


def test_legacy_files_disabled_returns_410(monkeypatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_LEGACY_FILES", "false")
    r = client.get("/files", headers=_admin_headers())
    assert r.status_code == 410
    assert "disabled" in r.json()["detail"].lower()


def test_validate_auth_config_requires_cors_in_production(monkeypatch) -> None:
    from docugrid_auth import validate_auth_config

    monkeypatch.setenv("DOCUGRID_ENV", "production")
    monkeypatch.setenv("DOCUGRID_JWT_SECRET", "x" * 32)
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "false")
    monkeypatch.setenv("DOCUGRID_ALLOW_LOGIN_STAKEHOLDER_PICK", "false")
    monkeypatch.setenv("DOCUGRID_ALLOW_PASSWORD_LOGIN", "false")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "test-client-id")
    monkeypatch.delenv("DOCUGRID_CORS_ORIGINS", raising=False)
    with pytest.raises(RuntimeError, match="DOCUGRID_CORS_ORIGINS"):
        validate_auth_config()
