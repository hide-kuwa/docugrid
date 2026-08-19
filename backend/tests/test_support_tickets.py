"""Support tickets (S3) + chat suggest_ticket."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from services import support_ticket_service as tickets
from tests.test_smoke import _admin_headers

client = TestClient(app)


@pytest.fixture(autouse=True)
def enable_header_auth(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("DOCUGRID_SUPPORT_INBOX_EMAIL", raising=False)
    monkeypatch.setattr(tickets, "SUPPORT_TICKETS_DB_PATH", tmp_path / "support_tickets.db")
    monkeypatch.setattr(tickets, "STORAGE_DIR", tmp_path)
    tickets.init_support_tickets_db()


def test_create_and_list_ticket_firm_scoped() -> None:
    res = client.post(
        "/api/support/tickets",
        headers=_admin_headers(),
        json={
            "kind": "bug",
            "subject": "保存が見えない",
            "body": "いつ: 今日\n画面: Doc\n操作: 格納\nメッセージ: なし",
            "surface_id": "support.assistant",
            "preferred_channel": "email",
        },
    )
    assert res.status_code == 200, res.text
    ticket = res.json()["ticket"]
    assert ticket["id"].startswith("stk_")
    assert ticket["email_status"] in {"stored_only", "queued_no_smtp", "sent", "smtp_incomplete"}

    listed = client.get("/api/support/tickets", headers=_admin_headers())
    assert listed.status_code == 200
    ids = [t["id"] for t in listed.json()["tickets"]]
    assert ticket["id"] in ids

    one = client.get(f"/api/support/tickets/{ticket['id']}", headers=_admin_headers())
    assert one.status_code == 200
    assert one.json()["ticket"]["subject"] == "保存が見えない"


def test_chat_suggests_ticket_on_bug_words() -> None:
    res = client.post(
        "/api/support/chat",
        headers=_admin_headers(),
        json={"message": "不具合でエラーが出ます", "surface_id": "support.assistant"},
    )
    assert res.status_code == 200, res.text
    assert res.json().get("suggest_ticket") is True


def test_cross_firm_ticket_not_readable() -> None:
    """Another firm's ticket id must 404 for the caller's firm (no IDOR)."""
    from services.tenancy import FIRM_BETA_ID

    other = tickets.create_ticket(
        firm_id=FIRM_BETA_ID,
        created_by_email="beta@example.com",
        created_by_role="admin",
        kind="bug",
        subject="他事務所の件",
        body="漏洩確認用",
        surface_id="support.assistant",
        error_message="",
        preferred_channel="email",
    )
    assert other["id"].startswith("stk_")

    missing = client.get(
        f"/api/support/tickets/{other['id']}",
        headers=_admin_headers(),
    )
    assert missing.status_code == 404

    listed = client.get("/api/support/tickets", headers=_admin_headers())
    assert listed.status_code == 200
    ids = [t["id"] for t in listed.json()["tickets"]]
    assert other["id"] not in ids


def test_chat_suggests_ticket_when_still_stuck() -> None:
    res = client.post(
        "/api/support/chat",
        headers=_admin_headers(),
        json={"message": "まだダメです。解決しない", "surface_id": "support.assistant"},
    )
    assert res.status_code == 200, res.text
    assert res.json().get("suggest_ticket") is True


def test_ticket_status_and_metrics() -> None:
    created = client.post(
        "/api/support/tickets",
        headers=_admin_headers(),
        json={
            "kind": "bug",
            "subject": "指標テスト",
            "body": "本文",
            "preferred_channel": "email",
        },
    )
    assert created.status_code == 200, created.text
    tid = created.json()["ticket"]["id"]

    patched = client.patch(
        f"/api/support/tickets/{tid}",
        headers=_admin_headers(),
        json={"status": "resolved", "note": "メールで解決"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["ticket"]["status"] == "resolved"

    metrics = client.get("/api/support/metrics", headers=_admin_headers())
    assert metrics.status_code == 200, metrics.text
    m = metrics.json()["metrics"]
    assert m["total_tickets"] >= 1
    assert "resolution_rate" in m
    assert "phone_rate" in m
