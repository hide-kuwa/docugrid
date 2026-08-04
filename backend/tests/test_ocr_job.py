"""OCR ジョブサービスのテスト。"""

from __future__ import annotations

import json
import sqlite3

import pytest

from services.ocr_job_service import (
    create_ocr_job,
    get_ocr_job,
    init_ocr_jobs_db,
    run_ocr_job,
)
from services.document_version_service import (
    create_document_version,
    ensure_logical_document,
    init_document_versions_db,
)


@pytest.fixture
def ocr_env(tmp_path, monkeypatch):
    monkeypatch.setattr("services.ocr_job_service.OCR_JOBS_DB_PATH", tmp_path / "ocr_jobs.db")
    monkeypatch.setattr("services.ocr_job_service.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("services.document_version_service.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("services.document_version_service.VERSIONS_DB_PATH", tmp_path / "versions.db")
    monkeypatch.setattr("services.storage_paths.STORAGE_DIR", tmp_path)
    init_ocr_jobs_db()
    init_document_versions_db()
    return tmp_path


def test_create_and_get_ocr_job(ocr_env) -> None:
    job = create_ocr_job(
        firm_id="default",
        client_id="c1",
        document_version_id="ver1",
        period_key="year:2",
        slot_id="tax_return_corporate",
    )
    assert job["status"] == "processing"
    loaded = get_ocr_job(job["id"])
    assert loaded is not None
    assert loaded["client_id"] == "c1"


def test_run_ocr_job_updates_metadata(ocr_env, monkeypatch) -> None:
    logical = ensure_logical_document(
        client_id="c1",
        period_key="year:2",
        slot_id="tax_return_corporate",
        title="法人税申告書",
    )
    pdf = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
    version = create_document_version(
        logical_id=logical.id,
        content=pdf,
        original_name="corp.pdf",
        content_sha256="abc",
        source="test",
        bump="upload",
        metadata_json=json.dumps({"status": "processing", "schema_version": 1}),
    )

    monkeypatch.setattr(
        "services.ocr_job_service.classify_pdf",
        lambda content, name, candidates, max_pages=None: {
            "confidence": 0.9,
            "engine": "pymupdf",
            "text_excerpt": "法人税申告書",
            "best": {"id": "tax_return_corporate", "label": "法人税", "score": 3},
            "ranked": [],
        },
    )
    monkeypatch.setattr(
        "services.ocr_job_service.extract_text_from_pdf",
        lambda content, max_pages=None: ("課税所得 1,000,000", "pymupdf"),
    )
    monkeypatch.setattr(
        "services.ocr_job_service.profile_fields_from_text",
        lambda slot_id, text: {},
    )
    monkeypatch.setattr(
        "services.ssot_ingest.ingest_from_slot_document",
        lambda **kwargs: type("R", (), {})(),
    )
    monkeypatch.setattr(
        "services.ssot_ingest.ingest_result_for_response",
        lambda r: {"propagate": True, "applied": [], "metrics_applied": []},
    )

    job = create_ocr_job(
        firm_id="default",
        client_id="c1",
        document_version_id=version.id,
        period_key="year:2",
        slot_id="tax_return_corporate",
    )
    result = run_ocr_job(job["id"])
    assert result["status"] == "done"
    assert result["result"]["status"] in ("linked", "needs_review")
    assert "normalize_result" in result["result"]
    assert result["result"]["normalize_result"]["propagate"] is True

    with sqlite3.connect(
        __import__("services.document_version_service", fromlist=["VERSIONS_DB_PATH"]).VERSIONS_DB_PATH
    ) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT metadata_json FROM document_versions WHERE id=?",
            (version.id,),
        ).fetchone()
    meta = json.loads(row["metadata_json"])
    assert meta["schema_version"] == 1
    assert meta["category_id"] == "tax_return_corporate"

    from services.ocr_job_service import get_index_state

    state = get_index_state(version.id)
    assert state is not None
    assert state["ocr_status"] == "ready"
    assert state["content_sha256"] == "abc"


def test_create_ocr_job_reuses_ready_same_sha(ocr_env, monkeypatch) -> None:
    logical = ensure_logical_document(
        client_id="c1",
        period_key="year:2",
        slot_id="tax_return_corporate",
        title="法人税申告書",
    )
    pdf = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
    version = create_document_version(
        logical_id=logical.id,
        content=pdf,
        original_name="corp.pdf",
        content_sha256="same-sha",
        source="test",
        bump="upload",
        metadata_json=json.dumps({"status": "processing", "schema_version": 1}),
    )
    monkeypatch.setattr(
        "services.ocr_job_service.classify_pdf",
        lambda content, name, candidates, max_pages=None: {
            "confidence": 0.9,
            "engine": "pymupdf",
            "text_excerpt": "法人税",
            "best": {"id": "tax_return_corporate", "label": "法人税", "score": 3},
            "ranked": [],
        },
    )
    monkeypatch.setattr(
        "services.ocr_job_service.extract_text_from_pdf",
        lambda content, max_pages=None: ("text", "pymupdf"),
    )
    monkeypatch.setattr(
        "services.ocr_job_service.profile_fields_from_text",
        lambda slot_id, text: {},
    )
    monkeypatch.setattr(
        "services.ssot_ingest.ingest_from_slot_document",
        lambda **kwargs: type("R", (), {})(),
    )
    monkeypatch.setattr(
        "services.ssot_ingest.ingest_result_for_response",
        lambda r: {"propagate": True, "applied": [], "metrics_applied": []},
    )

    job1 = create_ocr_job(
        firm_id="default",
        client_id="c1",
        document_version_id=version.id,
        period_key="year:2",
        slot_id="tax_return_corporate",
    )
    run_ocr_job(job1["id"])

    job2 = create_ocr_job(
        firm_id="default",
        client_id="c1",
        document_version_id=version.id,
        period_key="year:2",
        slot_id="tax_return_corporate",
    )
    assert job2.get("reused") is True
    assert job2["status"] == "done"

    job3 = create_ocr_job(
        firm_id="default",
        client_id="c1",
        document_version_id=version.id,
        period_key="year:2",
        slot_id="tax_return_corporate",
        force=True,
    )
    assert job3.get("reused") is not True
    assert job3["status"] == "processing"


def test_search_index_excerpts(ocr_env) -> None:
    from services.ocr_job_service import search_index_excerpts, upsert_index_state

    upsert_index_state(
        document_version_id="v1",
        firm_id="default",
        client_id="c1",
        content_sha256="s1",
        ocr_status="ready",
        text_excerpt="源泉徴収票 太郎",
        indexed_at="2026-01-01T00:00:00",
    )
    upsert_index_state(
        document_version_id="v2",
        firm_id="default",
        client_id="c1",
        content_sha256="s2",
        ocr_status="ready",
        text_excerpt="法人税申告書",
        indexed_at="2026-01-02T00:00:00",
    )
    hits = search_index_excerpts("default", keyword="源泉", client_id="c1")
    assert len(hits) == 1
    assert hits[0]["document_version_id"] == "v1"
    assert search_index_excerpts("other-firm", keyword="源泉", client_id="c1") == []
