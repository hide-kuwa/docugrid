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
        lambda content, name, candidates: {
            "confidence": 0.9,
            "engine": "pymupdf",
            "text_excerpt": "法人税申告書",
            "best": {"id": "tax_return_corporate", "label": "法人税", "score": 3},
            "ranked": [],
        },
    )
    monkeypatch.setattr(
        "services.ocr_job_service.extract_text_from_pdf",
        lambda content: ("課税所得 1,000,000", "pymupdf"),
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
