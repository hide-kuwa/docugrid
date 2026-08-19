"""Tax progress board API tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from services.tax_progress_service import board_payload, due_on_for_stage, upsert_cell
from tests.test_smoke import _admin_headers

client = TestClient(app)


@pytest.fixture(autouse=True)
def enable_header_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")


@pytest.fixture
def tax_paths(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("services.tax_progress_service.TAX_PROGRESS_DB_PATH", tmp_path / "tax_progress.db")
    monkeypatch.setattr("services.tax_progress_service.STORAGE_DIR", tmp_path)
    yield tmp_path


def test_due_on_for_stage() -> None:
    from datetime import date

    due = due_on_for_stage(3, 12, ref=date(2026, 8, 6))
    assert due.startswith("2026-")


def test_upsert_and_board(tax_paths) -> None:
    clients = [
        {
            "id": "c1",
            "name": "テスト株式会社",
            "fiscalMonth": 3,
            "assignees": [],
            "primary_assignee_id": None,
            "primary_assignee_name": "",
        }
    ]
    upsert_cell(
        "firm_default",
        client_id="c1",
        pack="closing",
        stage_id="docs_received",
        status="done",
        source="manual",
        cycle_key="FY2026",
    )
    payload = board_payload(
        "firm_default",
        pack="closing",
        clients=clients,
        cycle_key="FY2026",
    )
    assert payload["summary"]["clients"] == 1
    row = payload["rows"][0]
    docs = next(s for s in row["stages"] if s["stage_id"] == "docs_received")
    assert docs["status"] == "done"


def test_tax_progress_api(tax_paths) -> None:
    packs = client.get("/api/tax-progress/packs", headers=_admin_headers())
    assert packs.status_code == 200
    assert any(p["id"] == "closing" for p in packs.json()["packs"])

    board = client.get("/api/tax-progress/board?pack=closing", headers=_admin_headers())
    assert board.status_code == 200
    body = board.json()
    assert "rows" in body
    assert body["pack"] == "closing"

    if body["rows"]:
        cid = body["rows"][0]["client_id"]
        put = client.put(
            "/api/tax-progress/cell",
            headers=_admin_headers(),
            json={
                "client_id": cid,
                "pack": "closing",
                "stage_id": "docs_received",
                "status": "done",
                "cycle_key": body["cycle_key"],
            },
        )
        assert put.status_code == 200
        assert put.json()["cell"]["status"] == "done"
