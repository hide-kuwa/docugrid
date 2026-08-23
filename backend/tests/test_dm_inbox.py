"""DM unified inbox workspace."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from services.dm_inbox_service import ingest_item, list_inbox, workspace_payload
from services.messaging_channels_service import update_channels
from tests.test_smoke import _admin_headers

client = TestClient(app)


@pytest.fixture(autouse=True)
def enable_header_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")


@pytest.fixture
def dm_paths(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("services.dm_inbox_service.DM_INBOX_DB_PATH", tmp_path / "dm_inbox.db")
    monkeypatch.setattr("services.dm_inbox_service.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("services.messaging_channels_service.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("services.firm_settings.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("services.client_comms_service.COMMS_DB_PATH", tmp_path / "comms.db")
    monkeypatch.setattr("services.client_comms_service.STORAGE_DIR", tmp_path)
    yield tmp_path


def test_ingest_and_list(dm_paths) -> None:
    item = ingest_item(
        firm_id="firm_default",
        channel="slack",
        title="資料催促",
        body="源泉徴収票をお願いします",
        direction="inbound",
        external_id="slack:1",
    )
    assert item["channel"] == "slack"
    items = list_inbox("firm_default", channel="slack")
    assert len(items) == 1
    # upsert by external_id
    ingest_item(
        firm_id="firm_default",
        channel="slack",
        title="資料催促（更新）",
        body="再送",
        external_id="slack:1",
    )
    items2 = list_inbox("firm_default", channel="slack")
    assert len(items2) == 1
    assert "更新" in items2[0]["title"]


def test_workspace_shows_connected_tool(dm_paths) -> None:
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
    payload = workspace_payload("firm_default")
    slack = next(t for t in payload["tools"] if t["id"] == "slack")
    assert slack["ready"] is True
    assert any("接続" in (i.get("title") or "") for i in payload["items"])


def test_dm_workspace_api(dm_paths) -> None:
    r = client.get("/api/dm/workspace", headers=_admin_headers())
    assert r.status_code == 200
    body = r.json()
    assert "tools" in body
    assert "items" in body

    put = client.put(
        "/api/dm/tools",
        headers=_admin_headers(),
        json={
            "email": {
                "enabled": True,
                "provider": "local",
                "from_email": "ops@example.com",
            }
        },
    )
    assert put.status_code == 200
    assert put.json()["channels"]["email"]["ready"] is True

    send = client.post(
        "/api/dm/send",
        headers=_admin_headers(),
        json={"channel": "email", "text": "hello local", "to": "a@example.com"},
    )
    assert send.status_code == 200
    assert send.json()["send"]["mode"] == "local"

    sim = client.post(
        "/api/dm/simulate-inbound",
        headers=_admin_headers(),
        json={"channel": "slack", "count": 2},
    )
    assert sim.status_code == 200
    assert len(sim.json()["items"]) == 2

    hooks = client.get("/api/dm/inbound-hooks", headers=_admin_headers())
    assert hooks.status_code == 200
    token = hooks.json()["token"]
    firm_id = hooks.json()["firm_id"]

    inbound = client.post(
        f"/api/public/messaging/{firm_id}/slack?token={token}",
        json={"text": "hello from slack webhook", "user": "U1", "ts": "1.2", "channel": "C1"},
    )
    assert inbound.status_code == 200
    assert inbound.json()["ingested"] >= 1

    post = client.post(
        "/api/dm/inbox",
        headers=_admin_headers(),
        json={
            "channel": "email",
            "title": "入ってきたメール",
            "body": "本文",
            "direction": "inbound",
        },
    )
    assert post.status_code == 200
    listed = client.get("/api/dm/workspace?channel=email", headers=_admin_headers())
    assert listed.status_code == 200
    assert any(i["title"] == "入ってきたメール" for i in listed.json()["items"])


def test_ingest_system_handoff_with_meta(dm_paths) -> None:
    post = client.post(
        "/api/dm/inbox",
        headers=_admin_headers(),
        json={
            "channel": "system",
            "title": "契約書をお渡し",
            "body": "資料を枠に保存しました。",
            "direction": "outbound",
            "client_id": "c1",
            "participants": "事務所",
            "meta": {
                "event": "authoring_handoff",
                "slot_doc_id": "doc_abc",
                "slot_label": "契約書",
                "filename": "foo.pdf",
            },
        },
    )
    assert post.status_code == 200, post.text
    item = post.json()
    assert item["channel"] == "system"
    assert item["direction"] == "outbound"
    assert item["meta"]["event"] == "authoring_handoff"
    assert item["meta"]["slot_doc_id"] == "doc_abc"
    listed = client.get(
        "/api/dm/workspace?channel=system&client_id=c1",
        headers=_admin_headers(),
    )
    assert listed.status_code == 200
    assert any(i["title"] == "契約書をお渡し" for i in listed.json()["items"])


def test_ingest_rejects_cross_firm_client(dm_paths) -> None:
    from services.tenancy import FIRM_BETA_ID

    r = client.post(
        "/api/dm/inbox",
        headers={
            "X-Docugrid-Role": "admin",
            "X-Docugrid-User": "beta-admin@example.com",
            "X-Docugrid-Stakeholder": "actor-beta-admin",
            "X-Docugrid-Client": "c_beta_1",
            "X-Docugrid-Firm": FIRM_BETA_ID,
        },
        json={
            "channel": "system",
            "title": "leak",
            "body": "nope",
            "direction": "outbound",
            "client_id": "c1",
        },
    )
    assert r.status_code in (403, 404), r.text
