"""Client family tree (家系図) storage, validation and tenancy."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from main import app
from services.client_family_tree_service import init_client_family_tree_db
from services.tenancy import DEFAULT_FIRM_ID, FIRM_BETA_ID, invalidate_client_firm_cache
from tests.test_security import _admin_headers

client = TestClient(app)


@pytest.fixture(autouse=True)
def enable_header_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")


@pytest.fixture
def family_db(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("services.client_family_tree_service.STORAGE_DIR", tmp_path)
    monkeypatch.setattr(
        "services.client_family_tree_service.FAMILY_TREE_DB_PATH", tmp_path / "client_family_tree.db"
    )
    init_client_family_tree_db()
    master_path = tmp_path / "client_master.json"
    master_path.write_text(
        json.dumps(
            {
                "clients": [
                    {"id": "c1", "name": "山田 太郎", "fiscalMonth": 12, "category": "individual", "firmId": DEFAULT_FIRM_ID},
                    {"id": "c2", "name": "山田 花子", "fiscalMonth": 12, "category": "individual", "firmId": DEFAULT_FIRM_ID},
                    {"id": "c_beta_1", "name": "Beta", "fiscalMonth": 3, "category": "corporate", "firmId": FIRM_BETA_ID},
                ],
                "groups": [],
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr("services.tenancy.CLIENT_MASTER_PATH", master_path)
    invalidate_client_firm_cache()
    yield tmp_path
    invalidate_client_firm_cache()


def _tree() -> dict:
    return {
        "decedent_id": "f",
        "members": [
            {"id": "f", "generation": 1, "relation": "父", "name": "山田 一郎", "birth_date": "1945-04-01", "spouse_id": "m", "deceased": True},
            {"id": "m", "generation": 1, "relation": "母", "name": "山田 春子", "spouse_id": "f"},
            {
                "id": "s1",
                "generation": 2,
                "relation": "長男",
                "name": "山田 太郎",
                "linked_client_id": "c1",
                "parent_ids": ["f", "m"],
                "cohabitation": "separate",
                "address": "東京都千代田区1-1",
            },
            {"id": "s2", "generation": 2, "relation": "長女", "name": "鈴木 花子", "parent_ids": ["f", "m"]},
        ],
    }


def _put(body: dict, client_id: str = "c1", headers: dict | None = None):
    return client.put(
        f"/api/clients/{client_id}/family-tree",
        headers={**(headers or _admin_headers(client_id)), "Content-Type": "application/json"},
        json=body,
    )


def test_family_tree_roundtrip(family_db) -> None:
    empty = client.get("/api/clients/c1/family-tree", headers=_admin_headers("c1"))
    assert empty.status_code == 200, empty.text
    assert empty.json()["members"] == []

    saved = _put(_tree())
    assert saved.status_code == 200, saved.text

    loaded = client.get("/api/clients/c1/family-tree", headers=_admin_headers("c1")).json()
    assert loaded["decedent_id"] == "f"
    by_id = {m["id"]: m for m in loaded["members"]}
    assert by_id["s1"]["linked_client_id"] == "c1"
    assert by_id["s2"]["linked_client_id"] is None
    assert by_id["f"]["deceased"] is True
    assert loaded["updated_by"]


def test_family_tree_rejects_link_to_other_firm_client(family_db) -> None:
    body = _tree()
    body["members"][3]["linked_client_id"] = "c_beta_1"
    r = _put(body)
    assert r.status_code == 400
    assert "linked_client_id" in r.json()["detail"]


@pytest.mark.parametrize(
    "mutate",
    [
        lambda b: b["members"][2].update(parent_ids=["s2"]),
        lambda b: b["members"][0].update(spouse_id="nobody"),
        lambda b: b["members"][0].update(generation=9),
        lambda b: b["members"][0].update(birth_date="1945/04/01"),
        lambda b: b["members"][0].update(id="../x"),
        lambda b: b.update(decedent_id="ghost"),
    ],
)
def test_family_tree_validation(family_db, mutate) -> None:
    body = _tree()
    mutate(body)
    assert _put(body).status_code == 400


def test_family_tree_cross_firm_denied(family_db) -> None:
    assert _put(_tree()).status_code == 200
    beta = {
        "X-Docugrid-Role": "admin",
        "X-Docugrid-User": "beta-admin@example.com",
        "X-Docugrid-Stakeholder": "actor-beta-admin",
        "X-Docugrid-Client": "c1",
        "X-Docugrid-Firm": FIRM_BETA_ID,
    }
    assert client.get("/api/clients/c1/family-tree", headers=beta).status_code == 403
    assert _put(_tree(), headers=beta).status_code == 403


def test_family_tree_viewer_cannot_save(family_db) -> None:
    viewer = {
        "X-Docugrid-Role": "viewer",
        "X-Docugrid-User": "viewer@example.com",
        "X-Docugrid-Stakeholder": "actor-c-ceo",
        "X-Docugrid-Client": "c1",
        "X-Docugrid-Firm": DEFAULT_FIRM_ID,
    }
    assert _put(_tree(), headers=viewer).status_code == 403
