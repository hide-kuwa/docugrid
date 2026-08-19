"""Messaging channels (email / Slack / LINE) firm settings."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from services.messaging_channels_service import (
    get_channels_public,
    send_test_message,
    update_channels,
    validate_channel,
)
from tests.test_smoke import _admin_headers

client = TestClient(app)


@pytest.fixture(autouse=True)
def enable_header_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")


@pytest.fixture
def messaging_paths(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("services.messaging_channels_service.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("services.firm_settings.STORAGE_DIR", tmp_path)
    yield tmp_path


def test_update_and_public_masks_secrets(messaging_paths) -> None:
    saved = update_channels(
        "firm_default",
        {
            "email": {
                "enabled": True,
                "provider": "resend",
                "from_email": "noreply@example.com",
                "api_key": "re_secret_key_1234",
            },
            "slack": {
                "enabled": True,
                "mode": "webhook",
                "webhook_url": "https://hooks.slack.com/services/T/B/xxx1234",
            },
            "line": {
                "enabled": True,
                "mode": "messaging_api",
                "channel_access_token": "line_token_abcd",
            },
        },
    )
    assert saved["email"]["ready"] is True
    assert saved["email"]["api_key_configured"] is True
    assert saved["email"]["api_key_last4"] == "1234"
    assert "api_key" not in saved["email"]
    assert saved["slack"]["ready"] is True
    assert saved["line"]["ready"] is True
    assert "webhook_url" not in saved["slack"]


def test_validate_incomplete(messaging_paths) -> None:
    update_channels("firm_default", {"email": {"enabled": True, "from_email": ""}})
    result = validate_channel("firm_default", "email")
    assert result["ok"] is False


def test_dry_run_test(messaging_paths) -> None:
    update_channels(
        "firm_default",
        {
            "slack": {
                "enabled": True,
                "mode": "webhook",
                "webhook_url": "https://hooks.slack.com/services/T/B/xxx",
            }
        },
    )
    result = send_test_message("firm_default", "slack", dry_run=True)
    assert result["ok"] is True
    assert result["dry_run"] is True


def test_messaging_channels_api(messaging_paths) -> None:
    get_r = client.get("/api/messaging-channels", headers=_admin_headers())
    assert get_r.status_code == 200
    assert "email" in get_r.json()

    put_r = client.put(
        "/api/messaging-channels",
        headers=_admin_headers(),
        json={
            "email": {
                "enabled": True,
                "provider": "resend",
                "from_email": "ops@example.com",
                "api_key": "secret9999",
            }
        },
    )
    assert put_r.status_code == 200
    assert put_r.json()["email"]["ready"] is True
    assert put_r.json()["email"]["api_key_last4"] == "9999"

    test_r = client.post(
        "/api/messaging-channels/test",
        headers=_admin_headers(),
        json={"channel": "email", "dry_run": True},
    )
    assert test_r.status_code == 200
    assert test_r.json()["ok"] is True

    # firm isolation: secrets stay on firm storage path
    pub = get_channels_public("firm_default")
    assert pub["email"]["from_email"] == "ops@example.com"


def test_local_lab_ready_and_send(messaging_paths, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr("services.dm_inbox_service.DM_INBOX_DB_PATH", tmp_path / "dm_inbox.db")
    monkeypatch.setattr("services.dm_inbox_service.STORAGE_DIR", tmp_path)
    from services.messaging_channels_service import enable_local_lab
    from services.messaging_send_service import send_channel_message

    pub = enable_local_lab("firm_default")
    assert pub["email"]["ready"] is True
    assert pub["slack"]["ready"] is True
    assert pub["line"]["ready"] is True
    assert pub["email"]["provider"] == "local"
    assert pub["slack"]["mode"] == "local"
    assert pub["line"]["mode"] == "local"

    for ch in ("email", "slack", "line"):
        result = send_channel_message("firm_default", ch, text=f"hello {ch}")
        assert result["ok"] is True, result
        assert result["mode"] == "local"


def test_dm_enable_local_api(messaging_paths, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr("services.dm_inbox_service.DM_INBOX_DB_PATH", tmp_path / "dm_inbox.db")
    monkeypatch.setattr("services.dm_inbox_service.STORAGE_DIR", tmp_path)
    r = client.post(
        "/api/dm/enable-local",
        headers=_admin_headers(),
        json={"seed": True, "count": 1},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["channels"]["slack"]["ready"] is True
    assert len(body["seeded"]) == 3
    send = client.post(
        "/api/dm/send",
        headers=_admin_headers(),
        json={"channel": "slack", "text": "local send works"},
    )
    assert send.status_code == 200
    assert send.json()["send"]["mode"] == "local"
