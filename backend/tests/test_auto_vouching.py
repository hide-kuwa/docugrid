"""Auto-Vouching サービスと API のテスト。"""

from __future__ import annotations

import sqlite3

import fitz
import pytest
from fastapi.testclient import TestClient

from main import app
from services.auto_vouching import (
    MatchStrategy,
    build_search_variants,
    find_value_coordinates,
    get_vouch_stamp,
    init_auto_vouch_db,
    list_vouch_stamps,
    normalize_numeric_text,
    pdf_has_text_layer,
    resolve_vouching_pdf_path,
    run_auto_vouch,
    select_matches,
)

client = TestClient(app)


def _admin_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "admin",
        "X-Docugrid-User": "auto-vouch@test.local",
        "X-Docugrid-Stakeholder": "actor-admin",
        "X-Docugrid-Client": "c1",
    }


def _pdf_with_text(text: str, *, page_width: float = 400, page_height: float = 200) -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=page_width, height=page_height)
    page.insert_text((72, 100), text, fontsize=14)
    data = doc.tobytes()
    doc.close()
    return data


def _pdf_with_two_amounts() -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=500, height=300)
    page.insert_text((72, 80), "小計 10,000", fontsize=12)
    page.insert_text((72, 120), "合計 50,000", fontsize=12)
    data = doc.tobytes()
    doc.close()
    return data


def _blank_pdf_bytes() -> bytes:
    doc = fitz.open()
    doc.new_page()
    return doc.write()


@pytest.fixture()
def storage_tmp(monkeypatch: pytest.MonkeyPatch, tmp_path):
    vouch_dir = tmp_path / "storage"
    vouch_dir.mkdir()
    monkeypatch.setattr("services.auto_vouching.STORAGE_DIR", vouch_dir)
    monkeypatch.setattr("services.auto_vouching.AUTO_VOUCH_DB_PATH", vouch_dir / "auto_vouch_stamps.db")
    return vouch_dir


def test_normalize_numeric_text_accepts_comma_and_yen() -> None:
    assert normalize_numeric_text("50,000") == "50000"
    assert normalize_numeric_text("¥50,000") == "50000"
    assert normalize_numeric_text(50000) == "50000"
    assert normalize_numeric_text("５０，０００") == "50000"


def test_build_search_variants_includes_formats() -> None:
    variants = build_search_variants("50000")
    assert "50000" in variants
    assert "50,000" in variants
    assert any("¥" in v for v in variants)


def test_find_value_coordinates_matches_comma_variant() -> None:
    doc = fitz.open(stream=_pdf_with_text("合計金額: 50,000 円"), filetype="pdf")
    try:
        hits = find_value_coordinates(doc, "50000")
        assert len(hits) >= 1
        assert hits[0].matched_text
        assert hits[0].page == 1
        assert hits[0].width > 0
    finally:
        doc.close()


def test_select_matches_prefers_context_hint() -> None:
    doc = fitz.open(stream=_pdf_with_two_amounts(), filetype="pdf")
    try:
        all_hits = find_value_coordinates(doc, "50000")
        assert len(all_hits) >= 1
        best = select_matches(doc, all_hits, strategy=MatchStrategy.BEST, context_hint="合計")
        assert len(best) == 1
        assert "50" in best[0].matched_text
    finally:
        doc.close()


def test_pdf_has_text_layer_false_for_blank() -> None:
    doc = fitz.open(stream=_blank_pdf_bytes(), filetype="pdf")
    try:
        assert pdf_has_text_layer(doc) is False
    finally:
        doc.close()


def test_run_auto_vouch_success(storage_tmp) -> None:
    pdf_path = storage_tmp / "sample.pdf"
    pdf_path.write_bytes(_pdf_with_text("請求金額 50,000"))

    result = run_auto_vouch(
        pdf_file_path="sample.pdf",
        target_value="50000",
        user_id="auditor-1",
        field_id="acct.travel_expense",
    )
    assert result.status == "success"
    assert result.output_pdf_path
    assert len(result.matched_coordinates) >= 1
    assert result.stamp_id
    assert (storage_tmp / result.output_pdf_path).exists()

    row = get_vouch_stamp(result.stamp_id)
    assert row is not None
    assert row["dry_run"] is False


def test_run_auto_vouch_dry_run(storage_tmp) -> None:
    pdf_path = storage_tmp / "preview.pdf"
    pdf_path.write_bytes(_pdf_with_text("請求金額 50,000"))

    result = run_auto_vouch(
        pdf_file_path="preview.pdf",
        target_value="50000",
        user_id="auditor-1",
        field_id="acct.preview",
        dry_run=True,
    )
    assert result.status == "success"
    assert result.dry_run is True
    assert result.output_pdf_path == ""
    assert not (storage_tmp / "vouched").exists()


def test_run_auto_vouch_ocr_recommended(storage_tmp) -> None:
    pdf_path = storage_tmp / "scan.pdf"
    pdf_path.write_bytes(_blank_pdf_bytes())

    result = run_auto_vouch(
        pdf_file_path="scan.pdf",
        target_value="1000",
        user_id="auditor-1",
        field_id="acct.misc",
    )
    assert result.status == "error"
    assert result.ocr_recommended is True
    assert result.error_code == "no_text_layer"
    assert result.http_status() == 422


def test_run_auto_vouch_not_found(storage_tmp) -> None:
    pdf_path = storage_tmp / "other.pdf"
    pdf_path.write_bytes(_pdf_with_text(" unrelated text only "))

    result = run_auto_vouch(
        pdf_file_path="other.pdf",
        target_value="999999",
        user_id="auditor-1",
        field_id="acct.revenue",
    )
    assert result.status == "error"
    assert result.error_code == "no_match"
    assert "見つかりません" in result.message


def test_resolve_vouching_pdf_path_rejects_outside_storage(storage_tmp) -> None:
    with pytest.raises(ValueError, match="storage"):
        resolve_vouching_pdf_path("/etc/passwd")


def test_list_vouch_stamps(storage_tmp) -> None:
    pdf_path = storage_tmp / "listed.pdf"
    pdf_path.write_bytes(_pdf_with_text("金額 1,000"))
    result = run_auto_vouch(
        pdf_file_path="listed.pdf",
        target_value="1000",
        user_id="auditor-1",
        field_id="acct.test",
        dry_run=True,
    )
    rows = list_vouch_stamps(source_pdf_path=result.source_pdf_path)
    assert len(rows) == 1
    assert rows[0]["field_id"] == "acct.test"


def test_audit_auto_link_http(storage_tmp, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("main.run_auto_vouch", run_auto_vouch)

    pdf_path = storage_tmp / "invoice.pdf"
    pdf_path.write_bytes(_pdf_with_text("御請求金額 50,000"))

    r = client.post(
        "/api/audit/auto-link",
        headers=_admin_headers(),
        json={
            "pdf_file_path": "invoice.pdf",
            "target_value": "50,000",
            "user_id": "auditor-1",
            "field_id": "acct.payable",
            "dry_run": True,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "success"
    assert body["matched_coordinates"]
    assert body["dry_run"] is True


def test_audit_auto_link_http_not_found(storage_tmp, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("main.run_auto_vouch", run_auto_vouch)

    pdf_path = storage_tmp / "empty.pdf"
    pdf_path.write_bytes(_pdf_with_text("no numbers"))

    r = client.post(
        "/api/audit/auto-link",
        headers=_admin_headers(),
        json={
            "pdf_file_path": "empty.pdf",
            "target_value": "12345",
            "user_id": "auditor-1",
            "field_id": "acct.payable",
        },
    )
    assert r.status_code == 422
    assert r.json()["error_code"] == "no_match"


def test_find_value_in_ocr_metadata(storage_tmp) -> None:
    from services.auto_vouching import find_value_in_ocr_metadata
    from services.document_version_service import create_document_version, ensure_logical_document, init_document_versions_db

    init_document_versions_db()
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr("services.auto_vouching.STORAGE_DIR", storage_tmp)
    monkeypatch.setattr("services.document_version_service.STORAGE_DIR", storage_tmp)

    logical = ensure_logical_document(
        client_id="c1",
        period_key="2024",
        slot_id="s1",
        title="scan",
    )
    blank = _blank_pdf_bytes()
    import hashlib

    version = create_document_version(
        logical_id=logical.id,
        content=blank,
        original_name="scan.pdf",
        content_sha256=hashlib.sha256(blank).hexdigest(),
        source="upload",
        bump="upload",
        metadata_json='{"ocr_page_texts":[{"page":1,"text":"合計 50,000 円"}]}',
    )
    doc = fitz.open(stream=blank, filetype="pdf")
    try:
        hits = find_value_in_ocr_metadata(doc, "50000", version.id)
        assert len(hits) == 1
        assert hits[0].page == 1
    finally:
        doc.close()
    monkeypatch.undo()


def test_list_auto_vouch_fields_http() -> None:
    r = client.get("/api/audit/auto-link/fields", headers=_admin_headers())
    assert r.status_code == 200
    body = r.json()
    assert len(body["fields"]) >= 5


def test_suggest_auto_vouch_http() -> None:
    r = client.get(
        "/api/audit/auto-link/suggest",
        params={"metric_key": "monthly.revenue", "value_yen": 500000},
        headers=_admin_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["field_id"] == "acct.revenue"
    assert body["target_value"] == "500,000"
    assert body["document_ref"]["slot_id"] == "monthly_trial_balance"


def test_stamp_file_http(storage_tmp) -> None:
    pdf_path = storage_tmp / "filedl.pdf"
    pdf_path.write_bytes(_pdf_with_text("請求 50,000"))
    result = run_auto_vouch(
        pdf_file_path="filedl.pdf",
        target_value="50000",
        user_id="auditor-1",
        field_id="acct.payable",
    )
    assert result.stamp_id
    r = client.get(
        f"/api/audit/auto-link/stamps/{result.stamp_id}/file",
        headers=_admin_headers(),
    )
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert len(r.content) > 100

