"""Multi-tenant authorization (firm boundary + IDOR)."""

import json
import uuid

import fitz
import pytest
from fastapi.testclient import TestClient

import main as main_module
from main import app
from services.tenancy import FIRM_BETA_ID, DEFAULT_FIRM_ID, invalidate_client_firm_cache

client = TestClient(app)


def _minimal_pdf_bytes() -> bytes:
    doc = fitz.open()
    doc.new_page()
    return doc.write()


def _admin_headers(client_id: str = "c1") -> dict[str, str]:
    return {
        "X-Docugrid-Role": "admin",
        "X-Docugrid-User": "smoke-test@example.com",
        "X-Docugrid-Stakeholder": "actor-admin",
        "X-Docugrid-Client": client_id,
        "X-Docugrid-Firm": DEFAULT_FIRM_ID,
    }


def _beta_admin_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "admin",
        "X-Docugrid-User": "beta-admin@example.com",
        "X-Docugrid-Stakeholder": "actor-beta-admin",
        "X-Docugrid-Client": "c_beta_1",
        "X-Docugrid-Firm": FIRM_BETA_ID,
    }


@pytest.fixture()
def beta_client_master(tmp_path, monkeypatch):
    master_path = tmp_path / "client_master.json"
    payload = {
        "clients": [
            {
                "id": "c1",
                "name": "Firm A Client",
                "fiscalMonth": 3,
                "category": "corporate",
                "tags": [],
                "firmId": DEFAULT_FIRM_ID,
            },
            {
                "id": "c_beta_1",
                "name": "Firm Beta Client",
                "fiscalMonth": 3,
                "category": "corporate",
                "tags": [],
                "firmId": FIRM_BETA_ID,
            },
        ],
        "groups": [],
        "updated_at": None,
    }
    master_path.write_text(json.dumps(payload), encoding="utf-8")
    monkeypatch.setattr(main_module, "CLIENT_MASTER_PATH", master_path)
    monkeypatch.setattr(
        "services.tenancy.CLIENT_MASTER_PATH",
        master_path,
    )
    monkeypatch.setitem(
        main_module.DEFAULT_STAKEHOLDER_CLIENT_SCOPES,
        "actor-beta-admin",
        {"c_beta_1"},
    )
    monkeypatch.setitem(
        main_module.DEFAULT_STAKEHOLDER_CLIENT_SCOPES,
        "actor-beta-staff",
        {"c_beta_1"},
    )
    main_module._invalidate_stakeholder_maps_cache()
    invalidate_client_firm_cache()
    yield
    main_module._invalidate_stakeholder_maps_cache()
    invalidate_client_firm_cache()


def test_cross_firm_slot_access_denied(beta_client_master) -> None:
    period = f"year:tenancy-{uuid.uuid4().hex[:8]}"
    upload = client.post(
        "/api/slots",
        headers=_beta_admin_headers(),
        data={
            "client_id": "c_beta_1",
            "period_key": period,
            "slot_id": "0",
            "slot_label": "beta doc",
        },
        files={"file": ("beta.pdf", _minimal_pdf_bytes(), "application/pdf")},
    )
    assert upload.status_code == 200, upload.text

    denied = client.get(
        "/api/slots",
        params={"client_id": "c_beta_1", "period_key": period},
        headers=_admin_headers("c1"),
    )
    assert denied.status_code == 403


def test_client_master_lists_only_visible_firm_clients(beta_client_master) -> None:
    r = client.get("/api/client-master", headers=_admin_headers("c1"))
    assert r.status_code == 200
    ids = {c["id"] for c in r.json()["clients"]}
    assert "c1" in ids
    assert "c_beta_1" not in ids

    r_beta = client.get("/api/client-master", headers=_beta_admin_headers())
    assert r_beta.status_code == 200
    beta_ids = {c["id"] for c in r_beta.json()["clients"]}
    assert beta_ids == {"c_beta_1"}


def test_auth_me_includes_firm_id() -> None:
    r = client.get("/api/auth/me", headers=_admin_headers())
    assert r.status_code == 200
    body = r.json()
    assert body.get("firm_id") == DEFAULT_FIRM_ID
    assert body.get("firm_label") == "デフォルト事務所"


def test_storage_path_legacy_fallback(tmp_path, monkeypatch) -> None:
    import services.storage_paths as sp

    legacy_dir = tmp_path / "versions"
    legacy_dir.mkdir()
    pdf = legacy_dir / "old-version.pdf"
    pdf.write_bytes(_minimal_pdf_bytes())
    monkeypatch.setattr(sp, "STORAGE_DIR", tmp_path)

    resolved = sp.resolve_storage_path("firm_default/versions/old-version.pdf")
    assert resolved == pdf


def test_docugrid_load_cross_firm_denied(beta_client_master) -> None:
    period = f"year:dg-{uuid.uuid4().hex[:8]}"
    upload = client.post(
        "/api/slots",
        headers=_beta_admin_headers(),
        data={
            "client_id": "c_beta_1",
            "period_key": period,
            "slot_id": "1",
            "slot_label": "beta",
        },
        files={"file": ("beta.pdf", _minimal_pdf_bytes(), "application/pdf")},
    )
    assert upload.status_code == 200, upload.text
    save_body = {
        "documentId": None,
        "client_id": "c_beta_1",
        "period_key": period,
        "slot_id": "1",
        "slot_label": "beta",
        "fileOrder": ["f1"],
        "pageOrder": ["p1"],
        "filesById": {"f1": {"name": "a.pdf", "size": 1}},
        "pagesById": {
            "p1": {"id": "p1", "fileId": "f1", "originalIndex": 0, "displayKey": "p1"},
        },
        "highlightsById": {},
        "highlightIdsByPageId": {"p1": []},
    }
    save = client.post("/api/docugrid/save", headers=_beta_admin_headers(), json=save_body)
    assert save.status_code == 200, save.text
    doc_id = save.json()["documentId"]

    load = client.get(f"/api/docugrid/load/{doc_id}", headers=_admin_headers("c1"))
    assert load.status_code == 403


def test_files_list_scoped_to_firm(tmp_path, monkeypatch) -> None:
    firm_a_dir = tmp_path / "storage" / DEFAULT_FIRM_ID
    firm_b_dir = tmp_path / "storage" / FIRM_BETA_ID
    firm_a_dir.mkdir(parents=True)
    firm_b_dir.mkdir(parents=True)
    (firm_a_dir / "a-only.pdf").write_bytes(_minimal_pdf_bytes())
    (firm_b_dir / "b-only.pdf").write_bytes(_minimal_pdf_bytes())

    monkeypatch.setattr(main_module, "STORAGE_DIR", tmp_path / "storage")
    r = client.get("/files", headers=_admin_headers())
    assert r.status_code == 200
    names = {f["name"] for f in r.json()}
    assert names == {"a-only.pdf"}
    assert "b-only.pdf" not in names


def test_version_pdf_stored_under_firm_path(beta_client_master, tmp_path, monkeypatch) -> None:
    from services.document_version_service import STORAGE_DIR, get_version, version_file_path

    storage_root = tmp_path / "storage"
    monkeypatch.setattr("services.document_version_service.STORAGE_DIR", storage_root)
    monkeypatch.setattr("services.storage_paths.STORAGE_DIR", storage_root)
    monkeypatch.setattr(main_module, "STORAGE_DIR", storage_root)

    period = f"year:ver-{uuid.uuid4().hex[:8]}"
    upload = client.post(
        "/api/slots",
        headers=_beta_admin_headers(),
        data={
            "client_id": "c_beta_1",
            "period_key": period,
            "slot_id": "2",
            "slot_label": "version path",
        },
        files={"file": ("beta.pdf", _minimal_pdf_bytes(), "application/pdf")},
    )
    assert upload.status_code == 200, upload.text
    slot_doc = upload.json()
    version_id = slot_doc.get("current_version_id") or slot_doc.get("currentVersionId")
    assert version_id
    ver = get_version(version_id)
    assert ver is not None
    assert ver.storage_key.startswith(f"{FIRM_BETA_ID}/versions/")
    path = version_file_path(ver)
    assert path.exists()
    assert FIRM_BETA_ID in str(path)


def test_stakeholder_master_rejects_cross_firm_assignment(beta_client_master) -> None:
    payload = {
        "roleByStakeholderId": {"actor-admin": "admin"},
        "clientScopesByStakeholderId": {"actor-admin": ["c_beta_1"]},
    }
    r = client.put("/api/stakeholder-master", headers=_admin_headers(), json=payload)
    assert r.status_code == 400
    assert "another firm" in r.json()["detail"].lower()


def test_approver_pdf_thumbnails_without_client_header() -> None:
    """所長（approver）は顧問先ヘッダーなしでも PDF プレビュー API を呼べる。"""
    headers = {
        "X-Docugrid-Role": "approver",
        "X-Docugrid-User": "yamamoto@tax.co.jp",
        "X-Docugrid-Stakeholder": "actor-s3",
    }
    pdf = _minimal_pdf_bytes()
    r = client.post(
        "/api/pdf/thumbnails",
        headers=headers,
        files={"file": ("t.pdf", pdf, "application/pdf")},
    )
    assert r.status_code == 200, r.text
    assert len(r.json().get("thumbnails") or []) == 1
