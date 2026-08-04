"""Customer karte (期 / 永続 / 宿題) CRUD and tenancy."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from services.client_karte_service import (
    list_karte_for_rag_export,
    upsert_karte_entry,
)
from tests.test_smoke import _admin_headers

client = TestClient(app)


@pytest.fixture(autouse=True)
def enable_header_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")


@pytest.fixture
def karte_db(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("services.client_karte_service.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("services.client_karte_service.KARTE_DB_PATH", tmp_path / "client_karte.db")
    yield tmp_path


def test_upsert_list_and_rag_chunks(karte_db) -> None:
    task = upsert_karte_entry(
        "firm_default",
        "c1",
        {
            "horizon": "task",
            "title": "源泉票の再提出",
            "body": "次回打合せまでに社労士へ依頼",
            "due_date": "2026-08-15",
            "status": "open",
        },
        actor="tester@example.com",
    )
    assert task["content_sha256"]
    assert task["horizon"] == "task"

    permanent = upsert_karte_entry(
        "firm_default",
        "c1",
        {
            "horizon": "permanent",
            "title": "役員借入の経緯",
            "body": "創業時の個人立替。返済スケジュールは別紙。",
        },
        actor="tester@example.com",
    )
    assert permanent["period_key"] is None

    period = upsert_karte_entry(
        "firm_default",
        "c1",
        {
            "horizon": "period_end",
            "period_key": "2025",
            "title": "期末棚卸の確認",
            "body": "実地棚卸の結果を照合する",
        },
        actor="tester@example.com",
    )
    assert period["period_key"] == "2025"

    r = client.get("/api/clients/c1/karte", headers=_admin_headers())
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) >= 3

    rag = client.get("/api/clients/c1/karte/rag-chunks", headers=_admin_headers())
    assert rag.status_code == 200, rag.text
    chunks = rag.json()["chunks"]
    assert chunks
    assert chunks[0]["metadata"]["source"] == "client_karte"
    assert chunks[0]["metadata"]["firm_id"] == "firm_default"


def test_period_requires_period_key(karte_db) -> None:
    with pytest.raises(ValueError, match="period_key"):
        upsert_karte_entry(
            "firm_default",
            "c1",
            {"horizon": "period", "title": "x", "body": "y"},
        )


def test_api_upsert_and_delete(karte_db) -> None:
    headers = {**_admin_headers(), "Content-Type": "application/json"}
    created = client.put(
        "/api/clients/c1/karte",
        headers=headers,
        json={
            "horizon": "task",
            "title": "API宿題",
            "body": "資料を送る",
            "status": "open",
        },
    )
    assert created.status_code == 200, created.text
    entry_id = created.json()["id"]

    deleted = client.delete(f"/api/clients/c1/karte/{entry_id}", headers=_admin_headers())
    assert deleted.status_code == 200, deleted.text

    listed = client.get("/api/clients/c1/karte", headers=_admin_headers())
    assert all(i["id"] != entry_id for i in listed.json()["items"])


def test_rag_export_helper(karte_db) -> None:
    upsert_karte_entry(
        "firm_default",
        "c1",
        {"horizon": "permanent", "title": "A", "body": "B"},
    )
    chunks = list_karte_for_rag_export("firm_default", "c1")
    assert chunks[0]["text"].startswith("A")


def test_api_karte_rag_sync(karte_db, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr("services.rag_index_service.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("services.rag_index_service.RAG_DB_PATH", tmp_path / "rag_index.db")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    headers = {**_admin_headers(), "Content-Type": "application/json"}
    created = client.put(
        "/api/clients/c1/karte",
        headers=headers,
        json={"horizon": "permanent", "title": "源泉注意", "body": "毎年確認"},
    )
    assert created.status_code == 200, created.text

    sync = client.post("/api/clients/c1/karte/rag-sync", headers=_admin_headers())
    assert sync.status_code == 200, sync.text
    body = sync.json()
    assert body["entries"] >= 1
    assert body["ingested"] + body["reused"] >= 1
