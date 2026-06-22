"""ExtractedDocumentMeta と書類カタログのテスト。"""

from __future__ import annotations

import sqlite3

import pytest

from services.document_catalog_service import build_catalog_rows, list_catalog_field_defs
from services.extracted_document_meta import enrich_classify_metadata


def test_enrich_classify_metadata_linked() -> None:
    out = enrich_classify_metadata(
        {
            "confidence": 0.92,
            "engine": "pymupdf",
            "text_excerpt": "x" * 500,
            "classified_at": "2026-01-01T00:00:00Z",
            "extracted_profile": {"corporate_number": "123"},
        },
        client_id="c1",
        period_key="year:2",
        slot_id="tax_return_corporate",
    )
    assert out["schema_version"] == 1
    assert out["status"] == "linked"
    assert out["category_id"] == "tax_return_corporate"
    assert len(out["text_excerpt"]) == 400
    assert out["extracted_profile"]["corporate_number"] == "123"


def test_enrich_classify_metadata_needs_review() -> None:
    out = enrich_classify_metadata(
        {"confidence": 0.4, "engine": "none"},
        client_id="c1",
        period_key="perm",
        slot_id="corporate_registry",
    )
    assert out["status"] == "needs_review"


def test_catalog_fields_corporate() -> None:
    spec = list_catalog_field_defs("tax_return_corporate")
    assert spec is not None
    assert spec["default_period_key"] == "year:2"
    ids = {f["id"] for f in spec["sort_fields"]}
    assert "taxable_revenue" in ids


def test_catalog_rows_missing_and_submitted(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(
        "services.document_catalog_service.find_client",
        lambda cid: {"id": cid, "name": f"会社{cid[-1]}"},
    )
    monkeypatch.setattr(
        "services.document_catalog_service.SLOT_DOCS_DB_PATH",
        tmp_path / "slot_documents.db",
    )
    monkeypatch.setattr(
        "services.document_catalog_service.STORAGE_DIR",
        tmp_path,
    )
    import sqlite3

    db = tmp_path / "slot_documents.db"
    with sqlite3.connect(db) as conn:
        conn.execute(
            """
            CREATE TABLE slot_documents (
                id TEXT PRIMARY KEY,
                client_id TEXT,
                period_key TEXT,
                slot_id TEXT,
                slot_label TEXT,
                original_name TEXT,
                storage_key TEXT,
                page_count INTEGER,
                content_sha256 TEXT,
                byte_size INTEGER,
                uploaded_by TEXT,
                uploaded_at TEXT,
                logical_document_id TEXT,
                current_version_id TEXT,
                firm_id TEXT
            )
            """
        )
        conn.execute(
            """
            INSERT INTO slot_documents
            (id, client_id, period_key, slot_id, slot_label, original_name, storage_key,
             page_count, content_sha256, byte_size, uploaded_by, uploaded_at,
             logical_document_id, current_version_id, firm_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "doc1",
                "c1",
                "year:2",
                "tax_return_corporate",
                "法人税申告書",
                "corp.pdf",
                "k",
                1,
                "sha",
                100,
                "u",
                "2026-06-01T00:00:00",
                None,
                None,
                "default",
            ),
        )

    payload = build_catalog_rows(
        "default",
        ["c1", "c2"],
        "tax_return_corporate",
        "year:2",
        sort="client_name",
    )
    assert payload["client_count"] == 2
    assert payload["submitted_count"] == 1
    by_client = {r["client_id"]: r for r in payload["rows"]}
    assert by_client["c1"]["submitted"] is True
def test_catalog_rows_metadata_status_filter(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(
        "services.document_catalog_service.find_client",
        lambda cid: {"id": cid, "name": cid},
    )
    monkeypatch.setattr(
        "services.document_catalog_service.SLOT_DOCS_DB_PATH",
        tmp_path / "slot_documents.db",
    )
    monkeypatch.setattr(
        "services.document_catalog_service.get_version",
        lambda vid: None,
    )
    monkeypatch.setattr(
        "services.document_catalog_service.slot_status_map",
        lambda client_id, period_key: {},
    )
    db = tmp_path / "slot_documents.db"
    with sqlite3.connect(db) as conn:
        conn.execute(
            """
            CREATE TABLE slot_documents (
                id TEXT PRIMARY KEY,
                client_id TEXT,
                period_key TEXT,
                slot_id TEXT,
                slot_label TEXT,
                original_name TEXT,
                storage_key TEXT,
                page_count INTEGER,
                content_sha256 TEXT,
                byte_size INTEGER,
                uploaded_by TEXT,
                uploaded_at TEXT,
                logical_document_id TEXT,
                current_version_id TEXT,
                firm_id TEXT
            )
            """
        )

    payload = build_catalog_rows(
        "default",
        ["c1", "c2"],
        "tax_return_corporate",
        "year:2",
        metadata_status="needs_review",
    )
    assert payload["rows"] == []
