"""
API のスモークテスト（ローカル・CI 用）。
認証はヘッダーフォールバック（DOCUGRID_ALLOW_HEADER_AUTH）を利用。
"""

import io
import json
import uuid

import fitz
import pytest
from fastapi.testclient import TestClient

from main import app
from services.doc_classifier import classify_text

client = TestClient(app)


def _admin_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "admin",
        "X-Docugrid-User": "smoke-test@example.com",
        "X-Docugrid-Stakeholder": "actor-admin",
        "X-Docugrid-Client": "c1",
    }


def _platform_admin_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "platform_admin",
        "X-Docugrid-User": "admin@tax.co.jp",
        "X-Docugrid-Stakeholder": "actor-admin",
        "X-Docugrid-Client": "c1",
    }


def _minimal_pdf_bytes() -> bytes:
    doc = fitz.open()
    doc.new_page()
    return doc.write()


def test_root_returns_ok_json() -> None:
    r = client.get("/")
    assert r.status_code == 200
    body = r.json()
    assert body.get("ok") is True
    assert "docs" in body


def test_health() -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_auth_login_success() -> None:
    r = client.post(
        "/api/auth/login",
        json={
            "email": "admin@tax.co.jp",
            "password": "password",
            "stakeholder_id": "actor-admin",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("access_token")
    assert data.get("token_type") == "bearer"
    assert data.get("expires_in") == 24 * 3600


def test_auth_login_rejects_wrong_password() -> None:
    r = client.post(
        "/api/auth/login",
        json={
            "email": "admin@tax.co.jp",
            "password": "wrong-password-xyz",
            "stakeholder_id": "actor-admin",
        },
    )
    assert r.status_code == 401


def test_bearer_auth_without_legacy_headers(monkeypatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "false")
    login = client.post(
        "/api/auth/login",
        json={
            "email": "admin@tax.co.jp",
            "password": "password",
            "stakeholder_id": "actor-admin",
        },
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]

    denied_client = TestClient(app)
    denied = denied_client.get(
        "/api/slots",
        params={"client_id": "c1"},
        headers={"X-Docugrid-Client": "c1"},
    )
    assert denied.status_code == 401

    ok = client.get(
        "/api/slots",
        params={"client_id": "c1"},
        headers={
            "Authorization": f"Bearer {token}",
            "X-Docugrid-Client": "c1",
        },
    )
    assert ok.status_code == 200, ok.text


def test_validate_auth_config_rejects_production_defaults(monkeypatch) -> None:
    from docugrid_auth import validate_auth_config

    monkeypatch.setenv("DOCUGRID_ENV", "production")
    monkeypatch.delenv("DOCUGRID_JWT_SECRET", raising=False)
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "false")
    with pytest.raises(RuntimeError, match="DOCUGRID_JWT_SECRET"):
        validate_auth_config()


def test_stakeholder_master_get() -> None:
    r = client.get("/api/stakeholder-master", headers=_admin_headers())
    assert r.status_code == 200
    data = r.json()
    assert data["roleByStakeholderId"]["actor-admin"] == "platform_admin"
    assert "c1" in data["clientScopesByStakeholderId"]["actor-s1"]


def test_stakeholder_master_put_updates_scope() -> None:
    get_r = client.get("/api/stakeholder-master", headers=_admin_headers())
    assert get_r.status_code == 200
    payload = get_r.json()
    payload["clientScopesByStakeholderId"]["actor-s1"] = ["c1", "c2", "c3"]
    put_r = client.put("/api/stakeholder-master", headers=_admin_headers(), json=payload)
    assert put_r.status_code == 200, put_r.text
    verify = client.get("/api/stakeholder-master", headers=_admin_headers())
    assert set(verify.json()["clientScopesByStakeholderId"]["actor-s1"]) == {"c1", "c2", "c3"}


def test_client_master_put_persists_profile_fields() -> None:
    get_r = client.get("/api/client-master", headers=_admin_headers())
    payload = get_r.json()
    payload["clients"][0]["profile"] = {
        "customer_name": "プロフィール名",
        "corporate_number": "1234567890123",
        "bogus": "ignored",
    }
    put_r = client.put("/api/client-master", headers=_admin_headers(), json=payload)
    assert put_r.status_code == 200
    saved = client.get("/api/client-master", headers=_admin_headers()).json()
    profile = saved["clients"][0]["profile"]
    assert profile["customer_name"] == "プロフィール名"
    assert profile["corporate_number"] == "1234567890123"
    assert "bogus" not in profile


def test_client_master_put_rejects_invalid_fiscal_month() -> None:
    get_r = client.get("/api/client-master", headers=_admin_headers())
    payload = get_r.json()
    payload["clients"][0]["fiscalMonth"] = 13
    put_r = client.put("/api/client-master", headers=_admin_headers(), json=payload)
    assert put_r.status_code == 400


def test_client_master_get_allowed_for_viewer() -> None:
    # 顧客マスタの参照は viewer(client.view) でも許可される（メイン画面のため）
    headers = {
        "X-Docugrid-Role": "viewer",
        "X-Docugrid-User": "viewer@example.com",
        "X-Docugrid-Stakeholder": "actor-c1",
        "X-Docugrid-Client": "c1",
    }
    r = client.get("/api/client-master", headers=headers)
    assert r.status_code == 200
    assert isinstance(r.json().get("clients"), list)


def test_client_master_put_denied_for_viewer() -> None:
    # 編集は settings.manage のみ（viewer は 403）
    headers = {
        "X-Docugrid-Role": "viewer",
        "X-Docugrid-User": "viewer@example.com",
        "X-Docugrid-Stakeholder": "actor-c1",
        "X-Docugrid-Client": "c1",
    }
    base = client.get("/api/client-master", headers=headers).json()
    r = client.put("/api/client-master", headers=headers, json=base)
    assert r.status_code == 403


def test_client_master_put_rejects_duplicate_client_ids() -> None:
    base = client.get("/api/client-master", headers=_admin_headers())
    assert base.status_code == 200
    body = base.json()
    body["clients"] = body["clients"] + [body["clients"][0]]
    r = client.put("/api/client-master", headers=_admin_headers(), json=body)
    assert r.status_code == 400


def test_audit_events_http_status_filter() -> None:
    r = client.get(
        "/api/audit-events",
        headers=_admin_headers(),
        params={"http_status": 401, "limit": 5},
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_pdf_info_returns_page_count() -> None:
    pdf = _minimal_pdf_bytes()
    r = client.post(
        "/api/pdf/info",
        files={"file": ("test.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("page_count") == 1 or data.get("pageCount") == 1


def test_slot_document_persist_list_fetch_and_delete() -> None:
    pdf = _minimal_pdf_bytes()
    # Upload to a client × period × slot
    up = client.post(
        "/api/slots",
        data={
            "client_id": "c1",
            "period_key": "year:1",
            "slot_id": "2",
            "slot_label": "法人税申告書",
        },
        files={"file": ("houjin.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert up.status_code == 200, up.text
    item = up.json()
    assert item["client_id"] == "c1"
    assert item["slot_id"] == "2"
    assert item["page_count"] == 1
    doc_id = item["id"]

    # List for the period and find it
    listed = client.get(
        "/api/slots",
        params={"client_id": "c1", "period_key": "year:1"},
        headers=_admin_headers(),
    )
    assert listed.status_code == 200
    ids = [d["id"] for d in listed.json()]
    assert doc_id in ids

    # Re-upload to the same slot replaces (still one entry for that slot)
    up2 = client.post(
        "/api/slots",
        data={
            "client_id": "c1",
            "period_key": "year:1",
            "slot_id": "2",
            "slot_label": "法人税申告書",
        },
        files={"file": ("houjin_v2.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert up2.status_code == 200
    slot2 = [
        d
        for d in client.get(
            "/api/slots",
            params={"client_id": "c1", "period_key": "year:1"},
            headers=_admin_headers(),
        ).json()
        if d["slot_id"] == "2"
    ]
    assert len(slot2) == 1
    new_doc_id = slot2[0]["id"]

    # Fetch the stored PDF bytes back
    f = client.get(f"/api/slots/{new_doc_id}/file", headers=_admin_headers())
    assert f.status_code == 200
    assert f.headers["content-type"] == "application/pdf"
    assert f.content.startswith(b"%PDF")

    # Cleanup
    d = client.delete(f"/api/slots/{new_doc_id}", headers=_admin_headers())
    assert d.status_code == 200


def test_slot_document_detach_and_move() -> None:
    pdf = _minimal_pdf_bytes()
    up = client.post(
        "/api/slots",
        data={
            "client_id": "c1",
            "period_key": "year:9",
            "slot_id": "tax_proxy",
            "slot_label": "税務代理権限証書",
        },
        files={"file": ("proxy.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert up.status_code == 200, up.text
    doc_id = up.json()["id"]

    detached = client.delete(
        f"/api/slots/{doc_id}",
        params={"mode": "detach"},
        headers=_admin_headers(),
    )
    assert detached.status_code == 200, detached.text
    body = detached.json()
    assert body.get("mode") == "detach"
    unassigned_id = body.get("slot_id")
    assert unassigned_id and str(unassigned_id).startswith("unassigned_")

    listed = client.get(
        "/api/slots",
        params={"client_id": "c1", "period_key": "year:9"},
        headers=_admin_headers(),
    ).json()
    row = next(d for d in listed if d["id"] == doc_id)
    assert row["slot_id"] == unassigned_id

    f = client.get(f"/api/slots/{doc_id}/file", headers=_admin_headers())
    assert f.status_code == 200
    assert f.content.startswith(b"%PDF")

    moved = client.patch(
        f"/api/slots/{doc_id}",
        json={"slot_id": "ledger", "slot_label": "総勘定元帳"},
        headers=_admin_headers(),
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["slot_id"] == "ledger"

    client.delete(f"/api/slots/{doc_id}", headers=_admin_headers())


def _firm_admin_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "firm_admin",
        "X-Docugrid-User": "yamamoto@tax.co.jp",
        "X-Docugrid-Stakeholder": "actor-s3",
        "X-Docugrid-Client": "c1",
    }


def test_client_share_requires_explicit_firm_action() -> None:
    pdf = _minimal_pdf_bytes()
    up = client.post(
        "/api/slots",
        data={
            "client_id": "c1",
            "period_key": "year:9",
            "slot_id": "client_share_gate",
            "slot_label": "共有ゲート",
        },
        files={"file": ("firm-only.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert up.status_code == 200, up.text
    doc_id = up.json()["id"]
    assert not up.json().get("client_shared_at")

    client_headers = {
        "X-Docugrid-Role": "client_uploader",
        "X-Docugrid-User": "c1@client.example",
        "X-Docugrid-Stakeholder": "actor-c1",
        "X-Docugrid-Client": "c1",
    }
    listed = client.get(
        "/api/slots",
        params={"client_id": "c1", "period_key": "year:9"},
        headers=client_headers,
    )
    assert listed.status_code == 200
    assert not any(d["id"] == doc_id for d in listed.json())

    shared = client.post(f"/api/slots/{doc_id}/share-with-client", headers=_admin_headers())
    assert shared.status_code == 200, shared.text
    assert shared.json()["item"].get("client_shared_at")

    listed2 = client.get(
        "/api/slots",
        params={"client_id": "c1", "period_key": "year:9"},
        headers=client_headers,
    )
    assert any(d["id"] == doc_id for d in listed2.json())

    file_res = client.get(f"/api/slots/{doc_id}/file", headers=client_headers)
    assert file_res.status_code == 200

    client.delete(f"/api/slots/{doc_id}", headers=_admin_headers())


def test_client_unshare_hides_from_client_portal() -> None:
    pdf = _minimal_pdf_bytes()
    up = client.post(
        "/api/slots",
        data={
            "client_id": "c1",
            "period_key": "year:9",
            "slot_id": "client_unshare_gate",
            "slot_label": "共有解除テスト",
        },
        files={"file": ("firm-unshare.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert up.status_code == 200, up.text
    doc_id = up.json()["id"]

    client_headers = {
        "X-Docugrid-Role": "client_uploader",
        "X-Docugrid-User": "c1@client.example",
        "X-Docugrid-Stakeholder": "actor-c1",
        "X-Docugrid-Client": "c1",
    }

    shared = client.post(f"/api/slots/{doc_id}/share-with-client", headers=_admin_headers())
    assert shared.status_code == 200, shared.text
    assert shared.json()["item"].get("client_shared_at")

    file_res = client.get(f"/api/slots/{doc_id}/file", headers=client_headers)
    assert file_res.status_code == 200

    unshared = client.post(f"/api/slots/{doc_id}/unshare-with-client", headers=_admin_headers())
    assert unshared.status_code == 200, unshared.text
    assert not unshared.json()["item"].get("client_shared_at")

    listed = client.get(
        "/api/slots",
        params={"client_id": "c1", "period_key": "year:9"},
        headers=client_headers,
    )
    assert listed.status_code == 200
    assert not any(d["id"] == doc_id for d in listed.json())

    file_after = client.get(f"/api/slots/{doc_id}/file", headers=client_headers)
    assert file_after.status_code == 404

    events = client.get(
        "/api/review-events",
        params={"client_id": "c1", "period_key": "year:9", "slot_id": "client_unshare_gate"},
        headers=_admin_headers(),
    )
    assert events.status_code == 200
    event_types = [e["event_type"] for e in events.json()]
    assert "client_share" in event_types
    assert "client_unshare" in event_types

    client.delete(f"/api/slots/{doc_id}", headers=_admin_headers())


def test_client_upload_auto_shared_with_client_portal() -> None:
    pdf = _minimal_pdf_bytes()
    client_headers = {
        "X-Docugrid-Role": "client_uploader",
        "X-Docugrid-User": "c1@client.example",
        "X-Docugrid-Stakeholder": "actor-c1",
        "X-Docugrid-Client": "c1",
    }
    up = client.post(
        "/api/slots",
        data={
            "client_id": "c1",
            "period_key": "year:9",
            "slot_id": "client_self_share",
            "slot_label": "クライアント提出",
        },
        files={"file": ("client.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=client_headers,
    )
    assert up.status_code == 200, up.text
    doc_id = up.json()["id"]
    assert up.json().get("client_shared_at")

    listed = client.get(
        "/api/slots",
        params={"client_id": "c1", "period_key": "year:9"},
        headers=client_headers,
    )
    assert any(d["id"] == doc_id for d in listed.json())

    events = client.get(
        "/api/review-events",
        params={"client_id": "c1", "period_key": "year:9", "slot_id": "client_self_share"},
        headers=client_headers,
    )
    assert events.status_code == 200
    event_types = [e["event_type"] for e in events.json()]
    assert "client_share" in event_types

    client.delete(f"/api/slots/{doc_id}", headers=_admin_headers())


def test_slot_document_soft_delete_hidden_from_operator() -> None:
    pdf = _minimal_pdf_bytes()
    up = client.post(
        "/api/slots",
        data={
            "client_id": "c1",
            "period_key": "year:9",
            "slot_id": "soft_del_op",
            "slot_label": "担当削除テスト",
        },
        files={"file": ("visible.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert up.status_code == 200, up.text
    doc_id = up.json()["id"]

    soft = client.delete(f"/api/slots/{doc_id}", headers=_operator_headers())
    assert soft.status_code == 200
    assert soft.json().get("mode") == "delete"

    listed = client.get(
        "/api/slots",
        params={"client_id": "c1", "period_key": "year:9", "include_deleted": "true"},
        headers=_operator_headers(),
    )
    assert listed.status_code == 403

    listed_normal = client.get(
        "/api/slots",
        params={"client_id": "c1", "period_key": "year:9"},
        headers=_operator_headers(),
    )
    assert listed_normal.status_code == 200
    assert not any(d["id"] == doc_id for d in listed_normal.json())

    file_res = client.get(f"/api/slots/{doc_id}/file", headers=_operator_headers())
    assert file_res.status_code == 404

    restore = client.post(f"/api/slots/{doc_id}/restore", headers=_operator_headers())
    assert restore.status_code == 403

    purge_denied = client.delete(
        f"/api/slots/{doc_id}?mode=purge",
        headers=_operator_headers(),
    )
    assert purge_denied.status_code == 403

    listed_director = client.get(
        "/api/slots",
        params={"client_id": "c1", "period_key": "year:9", "include_deleted": "true"},
        headers=_firm_admin_headers(),
    )
    assert listed_director.status_code == 200
    assert any(d["id"] == doc_id for d in listed_director.json())

    restored = client.post(f"/api/slots/{doc_id}/restore", headers=_firm_admin_headers())
    assert restored.status_code == 200, restored.text

    client.delete(f"/api/slots/{doc_id}", headers=_admin_headers())


def test_slot_document_permanent_delete_leaves_tombstone() -> None:
    pdf = _minimal_pdf_bytes()
    up = client.post(
        "/api/slots",
        data={
            "client_id": "c1",
            "period_key": "year:9",
            "slot_id": "delete_tomb",
            "slot_label": "削除テスト枠",
        },
        files={"file": ("secret-co.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert up.status_code == 200, up.text
    doc_id = up.json()["id"]

    deleted = client.delete(
        f"/api/slots/{doc_id}?mode=purge",
        headers=_admin_headers(),
    )
    assert deleted.status_code == 200
    assert deleted.json().get("mode") == "purge"

    listed = client.get(
        "/api/slots",
        params={"client_id": "c1", "period_key": "year:9"},
        headers=_admin_headers(),
    )
    assert listed.status_code == 200
    assert not any(d["id"] == doc_id for d in listed.json())

    events = client.get(
        "/api/review-events",
        params={"client_id": "c1", "period_key": "year:9", "slot_id": "delete_tomb"},
        headers=_admin_headers(),
    )
    assert events.status_code == 200
    tombstones = [e for e in events.json() if e.get("event_type") == "document_delete"]
    assert len(tombstones) >= 1
    assert tombstones[0].get("action_title") == "資料を完全削除"
    assert "secret-co" not in json.dumps(tombstones[0])
    assert tombstones[0].get("actor_email")

    file_res = client.get(f"/api/slots/{doc_id}/file", headers=_admin_headers())
    assert file_res.status_code == 404


def test_delete_single_document_version() -> None:
    pdf = _minimal_pdf_bytes()
    slot = {
        "client_id": "c1",
        "period_key": "year:9",
        "slot_id": "ver_delete_one",
        "slot_label": "版削除テスト",
    }
    up1 = client.post(
        "/api/slots",
        data=slot,
        files={"file": ("first.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert up1.status_code == 200, up1.text
    up2 = client.post(
        "/api/slots",
        data=slot,
        files={"file": ("second.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert up2.status_code == 200, up2.text

    listed = client.get(
        "/api/logical-documents/versions",
        params={"client_id": slot["client_id"], "period_key": slot["period_key"], "slot_id": slot["slot_id"]},
        headers=_admin_headers(),
    )
    assert listed.status_code == 200
    versions = sorted(listed.json(), key=lambda v: v["created_at"])
    assert len(versions) >= 2
    older, newer = versions[0], versions[-1]

    deleted = client.delete(f"/api/document-versions/{older['id']}", headers=_admin_headers())
    assert deleted.status_code == 200, deleted.text
    body = deleted.json()
    assert body.get("deleted_version_id") == older["id"]
    assert body.get("current_version_id") == newer["id"]

    listed2 = client.get(
        "/api/logical-documents/versions",
        params={"client_id": slot["client_id"], "period_key": slot["period_key"], "slot_id": slot["slot_id"]},
        headers=_admin_headers(),
    )
    assert listed2.status_code == 200
    remaining = listed2.json()
    assert len(remaining) == 1
    assert remaining[0]["id"] == newer["id"]

    old_file = client.get(f"/api/document-versions/{older['id']}/file", headers=_admin_headers())
    assert old_file.status_code == 404

    events = client.get(
        "/api/review-events",
        params={
            "client_id": slot["client_id"],
            "period_key": slot["period_key"],
            "slot_id": slot["slot_id"],
        },
        headers=_admin_headers(),
    )
    assert events.status_code == 200
    tombstones = [e for e in events.json() if e.get("event_type") == "version_delete"]
    assert len(tombstones) >= 1
    assert older["version_label"] in (tombstones[0].get("action_title") or "")
    assert "first.pdf" not in json.dumps(tombstones[0])
    assert "second.pdf" not in json.dumps(tombstones[0])

    client.delete(f"/api/slots/{up2.json()['id']}", headers=_admin_headers())


def test_slot_upload_persists_classify_metadata() -> None:
    meta = json.dumps(
        {
            "confidence": 0.82,
            "engine": "openai",
            "best": {"id": "tax_return_corporate", "label": "法人税申告書", "score": 5},
            "ranked": [],
            "classified_at": "2026-06-10T00:00:00Z",
        }
    )
    period = f"year:meta-{uuid.uuid4().hex[:8]}"
    r = client.post(
        "/api/slots",
        data={
            "client_id": "c1",
            "period_key": period,
            "slot_id": "tax_return_corporate",
            "slot_label": "法人税申告書",
            "classify_metadata": meta,
        },
        files={"file": ("corp.pdf", _minimal_pdf_bytes(), "application/pdf")},
        headers=_admin_headers(),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("classify_metadata") is not None
    assert body["classify_metadata"]["engine"] == "openai"
    assert body["classify_metadata"]["confidence"] == 0.82


def test_slot_upload_skips_drive_without_credentials() -> None:
    cfg_r = client.put(
        "/api/system-config",
        headers=_admin_headers(),
        json={"google_drive_connected": True},
    )
    assert cfg_r.status_code == 200, cfg_r.text

    period = f"year:drive-{uuid.uuid4().hex[:8]}"
    r = client.post(
        "/api/slots",
        data={
            "client_id": "c1",
            "period_key": period,
            "slot_id": "financial_report",
            "slot_label": "決算報告書",
        },
        files={"file": ("report.pdf", _minimal_pdf_bytes(), "application/pdf")},
        headers=_admin_headers(),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert not body.get("google_drive_file_id")

    client.put(
        "/api/system-config",
        headers=_admin_headers(),
        json={"google_drive_connected": False},
    )


def test_slot_upload_creates_upload_review_event() -> None:
    pdf = _minimal_pdf_bytes()
    client.post(
        "/api/slots",
        data={
            "client_id": "c2",
            "period_key": "year:2",
            "slot_id": "1",
            "slot_label": "定款",
        },
        files={"file": ("teikan.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    listed = client.get(
        "/api/review-events",
        params={"client_id": "c2", "period_key": "year:2", "slot_id": "1"},
        headers=_admin_headers(),
    )
    assert listed.status_code == 200
    events = listed.json()
    assert any(e["event_type"] == "upload" for e in events)


def test_review_event_approve_and_list() -> None:
    body = {
        "client_id": "c1",
        "period_key": "year:3",
        "slot_id": "2",
        "event_type": "approve",
        "status": "done",
        "action_title": "承認完了",
        "version_label": "v2.0.0",
        "is_major": True,
    }
    r = client.post("/api/review-events", headers=_admin_headers(), json=body)
    assert r.status_code == 200, r.text
    item = r.json()
    assert item["event_type"] == "approve"
    assert item["actor_role"] in ("admin", "platform_admin")

    listed = client.get(
        "/api/review-events",
        params={"client_id": "c1", "period_key": "year:3", "slot_id": "2"},
        headers=_admin_headers(),
    )
    assert listed.status_code == 200
    assert any(e["id"] == item["id"] for e in listed.json())


def test_review_event_remand_requires_reason() -> None:
    body = {
        "client_id": "c1",
        "period_key": "year:3",
        "slot_id": "3",
        "event_type": "remand",
        "status": "rejected",
        "action_title": "差戻",
    }
    r = client.post("/api/review-events", headers=_admin_headers(), json=body)
    assert r.status_code == 400


def test_review_event_rejects_out_of_scope_client() -> None:
    headers = {
        "X-Docugrid-Role": "operator",
        "X-Docugrid-User": "s1@example.com",
        "X-Docugrid-Stakeholder": "actor-s1",
        "X-Docugrid-Client": "c1",
    }
    body = {
        "client_id": "c5",
        "period_key": "year:1",
        "slot_id": "0",
        "event_type": "work_save",
        "status": "fix",
    }
    r = client.post("/api/review-events", headers=headers, json=body)
    assert r.status_code == 403


def test_document_version_immutable_on_reupload() -> None:
    pdf = _minimal_pdf_bytes()
    isolated_period = f"year:test-{uuid.uuid4().hex[:8]}"
    data_base = {
        "client_id": "c2",
        "period_key": isolated_period,
        "slot_id": "3",
        "slot_label": "法人税申告書",
    }
    r1 = client.post(
        "/api/slots",
        data=data_base,
        files={"file": ("v1.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert r1.status_code == 200, r1.text
    body1 = r1.json()
    assert body1["current_version_label"] == "v1.0.0"
    ver1_id = body1["current_version_id"]
    logical_id = body1["logical_document_id"]

    r2 = client.post(
        "/api/slots",
        data=data_base,
        files={"file": ("v2.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert r2.status_code == 200
    body2 = r2.json()
    assert body2["current_version_label"] == "v1.1.0"
    ver2_id = body2["current_version_id"]
    assert ver1_id != ver2_id

    listed = client.get(
        "/api/logical-documents/versions",
        params={"client_id": "c2", "period_key": isolated_period, "slot_id": "3"},
        headers=_admin_headers(),
    )
    assert listed.status_code == 200
    versions = listed.json()
    assert len(versions) == 2
    labels = {v["version_label"] for v in versions}
    assert labels == {"v1.0.0", "v1.1.0"}

    f1 = client.get(f"/api/document-versions/{ver1_id}/file", headers=_admin_headers())
    assert f1.status_code == 200
    f2 = client.get(f"/api/document-versions/{ver2_id}/file", headers=_admin_headers())
    assert f2.status_code == 200


def test_document_status_single_period_reports_missing() -> None:
    # 未アップロード期間でも必須一覧から不足を算出できる
    r = client.get(
        "/api/document-status",
        params={"client_id": "c1", "period_key": "year:9"},
        headers=_admin_headers(),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["required_count"] == 7
    assert body["filled_count"] == 0
    assert body["complete"] is False
    assert "決算報告書" in body["missing"]


def test_document_status_reflects_uploads() -> None:
    pdf = _minimal_pdf_bytes()
    period_key = f"year:status-{uuid.uuid4().hex[:6]}"
    # 決算報告書・総勘定元帳スロットをアップロード
    for slot_id, label in [("4", "決算報告書"), ("5", "総勘定元帳")]:
        client.post(
            "/api/slots",
            data={"client_id": "c1", "period_key": period_key, "slot_id": slot_id, "slot_label": label},
            files={"file": (f"{label}.pdf", io.BytesIO(pdf), "application/pdf")},
            headers=_admin_headers(),
        )
    single = client.get(
        "/api/document-status",
        params={"client_id": "c1", "period_key": period_key},
        headers=_admin_headers(),
    ).json()
    assert single["filled_count"] == 2
    assert sorted(single["missing"]) == sorted(
        [
            "税務代理権限証書",
            "法人税申告書",
            "勘定科目内訳明細書",
            "法人事業概況説明書",
            "消費税申告書",
        ]
    )

    summary = client.get(
        "/api/document-status",
        params={"client_id": "c1"},
        headers=_admin_headers(),
    ).json()
    assert summary["missing_total"] >= 2
    assert any(p["period_key"] == period_key for p in summary["periods"])


def test_classify_text_picks_best_label() -> None:
    candidates = [
        {"id": "0", "label": "総勘定元帳"},
        {"id": "1", "label": "法人税申告書"},
        {"id": "2", "label": "消費税申告書"},
    ]
    text = "総勘定元帳\n前期繰越\n相手科目\n次期繰越"
    result = classify_text(text, "ledger.pdf", candidates)
    assert result["best"]["label"] == "総勘定元帳"
    assert result["confidence"] > 0.6


def test_classify_text_no_match_is_zero_confidence() -> None:
    candidates = [{"id": "0", "label": "総勘定元帳"}, {"id": "1", "label": "法人税申告書"}]
    result = classify_text("無関係なテキストです", "random.pdf", candidates)
    assert result["confidence"] == 0.0
    assert result["best"]["score"] == 0


def test_classify_endpoint_uses_filename_signal() -> None:
    pdf = _minimal_pdf_bytes()
    candidates = [
        {"id": "0", "label": "決算報告書"},
        {"id": "1", "label": "法人税申告書"},
        {"id": "2", "label": "消費税申告書"},
    ]
    r = client.post(
        "/api/classify",
        data={"candidates": json.dumps(candidates, ensure_ascii=False), "client_id": "c1"},
        files={"file": ("法人税申告書_2024.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["best"]["label"] == "法人税申告書"
    assert "engine" in body


def test_classify_endpoint_rejects_bad_candidates() -> None:
    pdf = _minimal_pdf_bytes()
    r = client.post(
        "/api/classify",
        data={"candidates": "not-json", "client_id": "c1"},
        files={"file": ("x.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert r.status_code == 400


def test_slot_document_rejects_out_of_scope_client() -> None:
    pdf = _minimal_pdf_bytes()
    # actor-s1 is scoped to c1/c2/c3 only — c5 must be denied
    headers = {
        "X-Docugrid-Role": "operator",
        "X-Docugrid-User": "s1@example.com",
        "X-Docugrid-Stakeholder": "actor-s1",
        "X-Docugrid-Client": "c1",
    }
    r = client.post(
        "/api/slots",
        data={
            "client_id": "c5",
            "period_key": "year:1",
            "slot_id": "0",
            "slot_label": "定款",
        },
        files={"file": ("x.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=headers,
    )
    assert r.status_code == 403


def test_review_events_batch_page_view() -> None:
    body = {
        "events": [
            {
                "client_id": "c1",
                "period_key": "year:1",
                "slot_id": "0",
                "event_type": "page_view",
                "status": "draft",
                "action_title": "ページ 1 を閲覧",
                "detail": json.dumps({"page": 0, "dwell_ms": 1500}),
            },
            {
                "client_id": "c1",
                "period_key": "year:1",
                "slot_id": "0",
                "event_type": "page_view",
                "status": "draft",
                "action_title": "ページ 2 を閲覧",
                "detail": json.dumps({"page": 1, "dwell_ms": 800}),
            },
        ]
    }
    r = client.post("/api/review-events/batch", headers=_admin_headers(), json=body)
    assert r.status_code == 200, r.text
    items = r.json()
    assert len(items) == 2
    assert items[0]["event_type"] == "page_view"
    assert items[0]["detail"] is not None


def test_review_events_export_csv() -> None:
    r = client.get(
        "/api/review-events/export",
        params={"client_id": "c1", "period_key": "year:1", "format": "csv"},
        headers=_admin_headers(),
    )
    assert r.status_code == 200, r.text
    assert "text/csv" in r.headers.get("content-type", "")
    assert "event_type" in r.text


def test_review_events_timeline() -> None:
    body = {
        "client_id": "c2",
        "period_key": "year:2",
        "slot_id": "1",
        "event_type": "work_save",
        "status": "fix",
        "action_title": "作業保存",
        "version_label": "v2.1.0",
    }
    created = client.post("/api/review-events", headers=_admin_headers(), json=body)
    assert created.status_code == 200, created.text

    r = client.get(
        "/api/review-events/timeline",
        params={"client_id": "c2", "period_key": "year:2", "limit": 10},
        headers=_admin_headers(),
    )
    assert r.status_code == 200, r.text
    items = r.json()
    assert len(items) >= 1
    assert items[0]["event_type"] in {"work_save", "upload"}
    assert "slot_label" in items[0]


def test_system_config_masks_ai_keys() -> None:
    r = client.put(
        "/api/system-config",
        headers=_admin_headers(),
        json={
            "google_drive_connected": False,
            "notification_email_enabled": True,
            "ocr_auto_extract_enabled": True,
            "alert_consumption_tax_months_before_due": 2,
            "alert_corporate_tax_months_before_due": 2,
            "ai_openai_enabled": True,
            "ai_openai_model": "gpt-4o-mini",
            "ai_openai_api_key": "sk-test-secret-key",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ai_openai_key_configured"] is True
    assert "sk-test" not in json.dumps(body)
    get_r = client.get("/api/system-config", headers=_admin_headers())
    assert get_r.status_code == 200
    get_body = get_r.json()
    assert get_body["ai_openai_key_configured"] is True
    assert "sk-test" not in json.dumps(get_body)


def test_docugrid_save_links_slot_workspace() -> None:
    pdf = _minimal_pdf_bytes()
    slot_data = {
        "client_id": "c1",
        "period_key": f"year:sync-{uuid.uuid4().hex[:6]}",
        "slot_id": "1",
        "slot_label": "総勘定元帳",
    }
    up = client.post(
        "/api/slots",
        data=slot_data,
        files={"file": ("ledger.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert up.status_code == 200, up.text

    save_body = {
        "clientId": "c1",
        "periodKey": slot_data["period_key"],
        "slotId": "1",
        "filesById": {
            "f1": {
                "id": "f1",
                "name": "ledger.pdf",
                "source": {"kind": "blob", "blobKey": "f1"},
                "pageCount": 1,
                "mimeType": "application/pdf",
                "createdAt": "2026-01-01T00:00:00Z",
                "syncStatus": "dirty",
            }
        },
        "pagesById": {
            "p1": {
                "id": "p1",
                "fileId": "f1",
                "originalIndex": 0,
                "displayKey": "p1",
            }
        },
        "highlightsById": {},
        "pageOrder": ["p1"],
        "fileOrder": ["f1"],
        "highlightIdsByPageId": {"p1": []},
    }
    save = client.post("/api/docugrid/save", headers=_admin_headers(), json=save_body)
    assert save.status_code == 200, save.text
    doc_id = save.json()["documentId"]
    assert doc_id

    listed = client.get(
        "/api/slots",
        params={"client_id": "c1", "period_key": slot_data["period_key"]},
        headers=_admin_headers(),
    )
    assert listed.status_code == 200
    row = next(item for item in listed.json() if item["slot_id"] == "1")
    assert row["docugrid_document_id"] == doc_id

    loaded = client.get(f"/api/docugrid/load/{doc_id}", headers=_admin_headers())
    assert loaded.status_code == 200
    assert loaded.json()["pageOrder"] == ["p1"]


def _viewer_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "viewer",
        "X-Docugrid-User": "viewer@example.com",
        "X-Docugrid-Stakeholder": "actor-c1",
        "X-Docugrid-Client": "c1",
    }


def _operator_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "operator",
        "X-Docugrid-User": "s1@example.com",
        "X-Docugrid-Stakeholder": "actor-s1",
        "X-Docugrid-Client": "c1",
    }


def test_role_permissions_get_as_platform_admin() -> None:
    r = client.get("/api/role-permissions", headers=_platform_admin_headers())
    assert r.status_code == 200
    data = r.json()
    assert "permissionsByRole" in data
    assert "settings.platform" in data["permissionsByRole"]["platform_admin"]


def test_role_permissions_get_denied_for_legacy_admin_without_platform() -> None:
    """Legacy admin role has settings.manage only; platform matrix is settings.platform."""
    import main as main_module

    perms = dict(main_module._get_role_permissions())
    perms["admin"] = {p for p in perms["admin"] if p != "settings.platform"}
    main_module._role_permissions_cache = perms
    try:
        r = client.get("/api/role-permissions", headers=_admin_headers())
        assert r.status_code == 403
    finally:
        main_module._invalidate_role_permissions_cache()


def test_role_permissions_denied_for_viewer() -> None:
    r = client.get("/api/role-permissions", headers=_viewer_headers())
    assert r.status_code == 403


def test_role_permissions_update_affects_enforcement(monkeypatch, tmp_path) -> None:
    import main as main_module

    rp_path = tmp_path / "role_permissions.json"
    monkeypatch.setattr(main_module, "ROLE_PERMISSIONS_PATH", rp_path)
    main_module._invalidate_role_permissions_cache()

    get_r = client.get("/api/role-permissions", headers=_platform_admin_headers())
    assert get_r.status_code == 200
    payload = get_r.json()
    perms = dict(payload["permissionsByRole"])
    perms["operator"] = [p for p in perms["operator"] if p != "document.upload"]

    put_r = client.put(
        "/api/role-permissions",
        headers=_platform_admin_headers(),
        json={"permissionsByRole": perms},
    )
    assert put_r.status_code == 200

    slot_r = client.post(
        "/api/slots",
        headers=_operator_headers(),
        data={
            "client_id": "c1",
            "period_key": f"year:perm-{uuid.uuid4().hex[:8]}",
            "slot_id": "0",
            "slot_label": "test",
        },
        files={"file": ("t.pdf", _minimal_pdf_bytes(), "application/pdf")},
    )
    assert slot_r.status_code == 403

    me_r = client.get("/api/auth/me", headers=_operator_headers())
    assert me_r.status_code == 200
    assert "document.upload" not in me_r.json().get("permissions", [])


def test_role_permissions_admin_must_keep_settings_manage() -> None:
    get_r = client.get("/api/role-permissions", headers=_platform_admin_headers())
    perms = dict(get_r.json()["permissionsByRole"])
    perms["admin"] = [p for p in perms["admin"] if p != "settings.manage"]
    put_r = client.put(
        "/api/role-permissions",
        headers=_platform_admin_headers(),
        json={"permissionsByRole": perms},
    )
    assert put_r.status_code == 400


def test_document_templates_default() -> None:
    r = client.get("/api/document-templates", headers=_admin_headers())
    assert r.status_code == 200, r.text
    body = r.json()
    assert "sortOrder" in body
    assert "CORP_TAX_RETURN" in body["sortOrder"]


def test_document_templates_put_platform_admin() -> None:
    r = client.put(
        "/api/document-templates",
        headers=_platform_admin_headers(),
        json={
            "templateName": "テスト用パッケージ",
            "sortOrder": ["TAX_PROXY", "CORP_TAX_RETURN", "CONSUMPTION_TAX"],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["templateName"] == "テスト用パッケージ"
    assert body["sortOrder"][0] == "TAX_PROXY"


def test_classify_batch_endpoint() -> None:
    pdf = _minimal_pdf_bytes()
    r = client.post(
        "/api/classify/batch",
        data={"client_id": "c1"},
        files=[
            ("files", ("法人税申告書_2024.pdf", io.BytesIO(pdf), "application/pdf")),
            ("files", ("消費税申告書.pdf", io.BytesIO(pdf), "application/pdf")),
        ],
        headers=_admin_headers(),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["documents"]) == 2
    assert "capabilities" in body
    types = {d["identifiedType"] for d in body["documents"]}
    assert "CORP_TAX_RETURN" in types or "CONSUMPTION_TAX" in types
    for doc in body["documents"]:
        assert "fileName" in doc
        assert "confidence" in doc
        assert "engine" in doc


def _sample_page_pixel(pdf_bytes: bytes, page: int, nx: float, ny: float) -> tuple[int, int, int]:
    doc = fitz.open("pdf", pdf_bytes)
    try:
        p = doc[page]
        pix = p.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        px = int(nx * p.rect.width * 2)
        py = int(ny * p.rect.height * 2)
        px = min(max(px, 0), pix.width - 1)
        py = min(max(py, 0), pix.height - 1)
        offset = (py * pix.width + px) * 3
        return tuple(pix.samples[offset : offset + 3])
    finally:
        doc.close()


def _annot_test_pdf_bytes() -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=400, height=400)
    page.draw_rect(page.rect, color=(0.85, 0.85, 0.85), fill=(0.85, 0.85, 0.85))
    return doc.write()


def test_highlight_eraser_removes_freehand_marker() -> None:
    pdf = _annot_test_pdf_bytes()
    path = json.dumps(
        [{"x": 0.2, "y": 0.2}, {"x": 0.5, "y": 0.5}, {"x": 0.8, "y": 0.8}],
        ensure_ascii=False,
    )
    common = {
        "page": "0",
        "x": "0.15",
        "y": "0.15",
        "w": "0.7",
        "h": "0.7",
        "path_json": path,
    }
    marker_r = client.post(
        "/api/highlight",
        data={**common, "type": "marker"},
        files={"file": ("doc.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert marker_r.status_code == 200, marker_r.text
    marked_pdf = marker_r.content
    baseline = _sample_page_pixel(pdf, 0, 0.5, 0.5)
    before_erase = _sample_page_pixel(marked_pdf, 0, 0.5, 0.5)
    assert before_erase != baseline

    eraser_r = client.post(
        "/api/highlight",
        data={**common, "type": "eraser"},
        files={"file": ("marked.pdf", io.BytesIO(marked_pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert eraser_r.status_code == 200, eraser_r.text
    erased_pdf = eraser_r.content
    after_erase = _sample_page_pixel(erased_pdf, 0, 0.5, 0.5)
    assert after_erase[0] >= 240 and after_erase[1] >= 240 and after_erase[2] >= 240
    assert after_erase != before_erase


def test_docugrid_save_restores_reordered_pages() -> None:
    pdf = _minimal_pdf_bytes()
    period_key = f"year:reorder-{uuid.uuid4().hex[:6]}"
    up = client.post(
        "/api/slots",
        data={
            "client_id": "c1",
            "period_key": period_key,
            "slot_id": "ledger",
            "slot_label": "総勘定元帳",
        },
        files={"file": ("ledger.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert up.status_code == 200, up.text

    save_body = {
        "clientId": "c1",
        "periodKey": period_key,
        "slotId": "ledger",
        "filesById": {
            "f1": {
                "id": "f1",
                "name": "ledger.pdf",
                "source": {"kind": "blob", "blobKey": "f1"},
                "pageCount": 1,
                "mimeType": "application/pdf",
                "createdAt": "2026-01-01T00:00:00Z",
                "syncStatus": "dirty",
            }
        },
        "pagesById": {
            "p1": {"id": "p1", "fileId": "f1", "originalIndex": 0, "displayKey": "p1"},
        },
        "highlightsById": {
            "h1": {
                "id": "h1",
                "pageId": "p1",
                "tool": "marker",
                "rect": {"x": 0.1, "y": 0.2, "w": 0.3, "h": 0.05},
            }
        },
        "pageOrder": ["p1"],
        "fileOrder": ["f1"],
        "highlightIdsByPageId": {"p1": ["h1"]},
    }
    save = client.post("/api/docugrid/save", headers=_admin_headers(), json=save_body)
    assert save.status_code == 200, save.text
    doc_id = save.json()["documentId"]

    loaded = client.get(f"/api/docugrid/load/{doc_id}", headers=_admin_headers())
    assert loaded.status_code == 200
    payload = loaded.json()
    assert payload["pageOrder"] == ["p1"]
    assert "h1" in payload["highlightsById"]


def test_classify_pending_crud() -> None:
    pdf = _minimal_pdf_bytes()
    period_key = f"year:pending-{uuid.uuid4().hex[:6]}"
    create_r = client.post(
        "/api/classify/pending",
        data={
            "client_id": "c1",
            "period_key": period_key,
            "confidence": "0.42",
            "engine": "rules",
            "suggested_slot_id": "tax_return_corporate",
            "ranked": json.dumps(
                [{"id": "tax_return_corporate", "label": "法人税申告書", "score": 2, "matched": ["法人税"]}],
                ensure_ascii=False,
            ),
        },
        files={"file": ("不明.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert create_r.status_code == 200, create_r.text
    item = create_r.json()
    item_id = item["id"]
    assert item["file_name"] == "不明.pdf"

    list_r = client.get(
        "/api/classify/pending",
        params={"client_id": "c1", "period_key": period_key},
        headers=_admin_headers(),
    )
    assert list_r.status_code == 200
    assert any(row["id"] == item_id for row in list_r.json())

    file_r = client.get(f"/api/classify/pending/{item_id}/file", headers=_admin_headers())
    assert file_r.status_code == 200
    assert file_r.headers.get("content-type", "").startswith("application/pdf")

    del_r = client.delete(f"/api/classify/pending/{item_id}", headers=_admin_headers())
    assert del_r.status_code == 200


def test_authoring_export_pdf_japanese_title() -> None:
    r = client.post(
        "/api/authoring-templates/export-pdf",
        json={
            "client_id": "c1",
            "title": "役員報酬改定議事録",
            "body": "株式会社鈴木商店 臨時株主総会議事録\n\n1. 日時: 2026年6月17日",
        },
        headers=_admin_headers(),
    )
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:4] == b"%PDF"
    disposition = r.headers.get("content-disposition", "")
    assert "filename*=" in disposition
    assert "UTF-8" in disposition
