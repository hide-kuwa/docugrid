"""Client handoff transfer code — create, public view, claim across firms."""

from __future__ import annotations

import json
from pathlib import Path

import fitz
import pytest
from fastapi.testclient import TestClient

import main as main_module
from main import app
from services.tenancy import DEFAULT_FIRM_ID, FIRM_BETA_ID, invalidate_client_firm_cache
from services.login_rate_limit import reset_transfer_public_rate_limits

client = TestClient(app)


def _minimal_pdf_bytes() -> bytes:
    doc = fitz.open()
    doc.new_page()
    return doc.write()


def _admin_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "firm_admin",
        "X-Docugrid-User": "firm-a@example.com",
        "X-Docugrid-Stakeholder": "actor-admin",
        "X-Docugrid-Client": "c1",
        "X-Docugrid-Firm": DEFAULT_FIRM_ID,
    }


def _beta_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "firm_admin",
        "X-Docugrid-User": "beta-admin@example.com",
        "X-Docugrid-Stakeholder": "actor-beta-admin",
        "X-Docugrid-Client": "c_beta_1",
        "X-Docugrid-Firm": FIRM_BETA_ID,
    }


@pytest.fixture()
def transfer_env(tmp_path, monkeypatch):
    reset_transfer_public_rate_limits()
    storage = tmp_path / "storage"
    storage.mkdir()
    master_path = storage / "client_master.json"
    payload = {
        "clients": [
            {
                "id": "c1",
                "name": "移管テスト商事",
                "fiscalMonth": 3,
                "category": "corporate",
                "tags": [],
                "firmId": DEFAULT_FIRM_ID,
                "profile": {
                    "etax_user_id": "2520000000000001",
                    "etax_pin": "secret-pin",
                },
            },
            {
                "id": "c_beta_1",
                "name": "Beta既存",
                "fiscalMonth": 12,
                "category": "corporate",
                "tags": [],
                "firmId": FIRM_BETA_ID,
            },
        ],
        "groups": [],
        "relations": [],
        "relationLayouts": {},
        "updated_at": None,
    }
    master_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    monkeypatch.setattr(main_module, "CLIENT_MASTER_PATH", master_path)
    monkeypatch.setattr("api.master_store.CLIENT_MASTER_PATH", master_path)
    monkeypatch.setattr("api.constants.CLIENT_MASTER_PATH", master_path)
    monkeypatch.setattr("services.tenancy.CLIENT_MASTER_PATH", master_path)
    monkeypatch.setattr("services.client_transfer_service.STORAGE_DIR", storage)
    monkeypatch.setattr(
        "services.client_transfer_service.TRANSFERS_DB_PATH",
        storage / "client_transfers.db",
    )
    monkeypatch.setattr(
        "services.client_transfer_service.TRANSFERS_DIR",
        storage / "transfers",
    )
    monkeypatch.setattr("services.storage_paths.STORAGE_DIR", storage)

    slot_db = storage / "slot_documents.db"
    monkeypatch.setattr("api.constants.SLOT_DOCS_DB_PATH", slot_db)
    monkeypatch.setattr("api.persistence.SLOT_DOCS_DB_PATH", slot_db)
    monkeypatch.setattr("services.client_transfer_service.SLOT_DOCS_DB_PATH", slot_db)
    monkeypatch.setattr("services.tenancy.SLOT_DOCS_DB_PATH", slot_db)
    monkeypatch.setattr("services.migration_persist.SLOT_DOCS_DB_PATH", slot_db)

    versions_db = storage / "document_versions.db"
    monkeypatch.setattr("services.document_version_service.VERSIONS_DB_PATH", versions_db)

    monkeypatch.setenv("DOCUGRID_FRONTEND_URL", "http://localhost:3000")
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")

    invalidate_client_firm_cache()
    yield {"storage": storage, "master_path": master_path}


def test_create_public_claim_transfer(transfer_env):
    created = client.post(
        "/api/client-transfers",
        headers=_admin_headers(),
        json={"clientId": "c1"},
    )
    assert created.status_code == 200, created.text
    body = created.json()
    code = body["code"]
    assert len(code) == 8
    assert body["shareUrl"].endswith(f"/handoff/{code}")
    assert body["documentCount"] == 0
    assert "secret" not in json.dumps(body)

    public = client.get(f"/api/client-transfers/public/{code}")
    assert public.status_code == 200
    pub = public.json()
    assert pub["code"] == code
    assert pub["clientDisplayName"] == "移管テスト商事"
    assert pub["status"] == "pending"
    assert "etax" not in json.dumps(pub).lower()
    assert "secret" not in json.dumps(pub)

    preview = client.post(
        "/api/client-transfers/claim",
        headers=_beta_headers(),
        json={"code": code, "confirm": False},
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["mode"] == "preview"
    assert preview.json()["clientDisplayName"] == "移管テスト商事"

    claimed = client.post(
        "/api/client-transfers/claim",
        headers=_beta_headers(),
        json={"code": code, "confirm": True},
    )
    assert claimed.status_code == 200, claimed.text
    result = claimed.json()
    assert result["mode"] == "claimed"
    new_id = result["newClientId"]
    assert new_id.startswith("xfer-")

    master = json.loads(transfer_env["master_path"].read_text(encoding="utf-8"))
    new_client = next(c for c in master["clients"] if c["id"] == new_id)
    assert new_client["firmId"] == FIRM_BETA_ID
    assert new_client["name"] == "移管テスト商事"
    assert new_client["profile"]["etax_user_id"] == "2520000000000001"
    assert new_client["profile"]["etax_pin"] == "secret-pin"

    again = client.post(
        "/api/client-transfers/claim",
        headers=_beta_headers(),
        json={"code": code, "confirm": True},
    )
    assert again.status_code == 400


def test_revoke_and_same_firm_rejected(transfer_env):
    created = client.post(
        "/api/client-transfers",
        headers=_admin_headers(),
        json={"clientId": "c1"},
    )
    assert created.status_code == 200
    transfer_id = created.json()["id"]
    code = created.json()["code"]

    same = client.post(
        "/api/client-transfers/claim",
        headers=_admin_headers(),
        json={"code": code, "confirm": True},
    )
    assert same.status_code == 400

    revoked = client.post(
        f"/api/client-transfers/{transfer_id}/revoke",
        headers=_admin_headers(),
    )
    assert revoked.status_code == 200
    assert revoked.json()["status"] == "revoked"

    public = client.get(f"/api/client-transfers/public/{code}")
    assert public.status_code == 200
    assert public.json()["status"] == "revoked"


def test_create_with_pdf_document(transfer_env, monkeypatch):
    storage: Path = transfer_env["storage"]
    pdf_rel = f"{DEFAULT_FIRM_ID}/versions/handoff-sample.pdf"
    pdf_path = storage / pdf_rel
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    pdf_path.write_bytes(_minimal_pdf_bytes())

    import sqlite3
    from api.persistence import _init_slot_documents_db

    _init_slot_documents_db()
    with sqlite3.connect(transfer_env["storage"] / "slot_documents.db") as conn:
        conn.execute(
            """
            INSERT INTO slot_documents (
                id, client_id, period_key, slot_id, slot_label, original_name,
                storage_key, page_count, content_sha256, byte_size, uploaded_at, firm_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "sd-handoff-1",
                "c1",
                "year:1",
                "0",
                "決算書",
                "kessan.pdf",
                pdf_rel,
                1,
                "abc",
                pdf_path.stat().st_size,
                "2026-01-01T00:00:00",
                DEFAULT_FIRM_ID,
            ),
        )

    created = client.post(
        "/api/client-transfers",
        headers=_admin_headers(),
        json={"clientId": "c1"},
    )
    assert created.status_code == 200, created.text
    assert created.json()["documentCount"] == 1
    code = created.json()["code"]

    claimed = client.post(
        "/api/client-transfers/claim",
        headers=_beta_headers(),
        json={"code": code, "confirm": True},
    )
    assert claimed.status_code == 200, claimed.text
    assert claimed.json()["documentsImported"] >= 1
