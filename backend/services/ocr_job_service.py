"""非同期 OCR / 分類ジョブ（ExtractedDocumentMeta 更新）。"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

import fitz

from services.doc_classifier import classify_pdf, extract_text_from_pdf
from services.document_version_service import get_version, version_file_path
from services.extracted_document_meta import enrich_classify_metadata
from services.profile_extractors import profile_fields_from_text

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
OCR_JOBS_DB_PATH = STORAGE_DIR / "ocr_jobs.db"


def init_ocr_jobs_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(OCR_JOBS_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ocr_jobs (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                document_version_id TEXT NOT NULL,
                period_key TEXT,
                slot_id TEXT,
                slot_label TEXT,
                status TEXT NOT NULL,
                result_json TEXT,
                error_message TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )


def _now() -> str:
    return datetime.utcnow().isoformat()


def _row_to_dict(row: sqlite3.Row) -> dict:
    result = None
    if row["result_json"]:
        try:
            result = json.loads(row["result_json"])
        except Exception:
            result = None
    return {
        "id": row["id"],
        "firm_id": row["firm_id"],
        "client_id": row["client_id"],
        "document_version_id": row["document_version_id"],
        "period_key": row["period_key"],
        "slot_id": row["slot_id"],
        "slot_label": row["slot_label"],
        "status": row["status"],
        "result": result,
        "error_message": row["error_message"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def create_ocr_job(
    *,
    firm_id: str,
    client_id: str,
    document_version_id: str,
    period_key: Optional[str] = None,
    slot_id: Optional[str] = None,
    slot_label: Optional[str] = None,
) -> dict:
    init_ocr_jobs_db()
    job_id = uuid.uuid4().hex
    now = _now()
    with sqlite3.connect(OCR_JOBS_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO ocr_jobs
                (id, firm_id, client_id, document_version_id, period_key, slot_id, slot_label,
                 status, result_json, error_message, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', NULL, NULL, ?, ?)
            """,
            (
                job_id,
                firm_id,
                client_id,
                document_version_id,
                period_key,
                slot_id,
                slot_label,
                now,
                now,
            ),
        )
    return get_ocr_job(job_id)  # type: ignore[return-value]


def get_ocr_job(job_id: str) -> Optional[dict]:
    init_ocr_jobs_db()
    with sqlite3.connect(OCR_JOBS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM ocr_jobs WHERE id=?", (job_id,)).fetchone()
    return _row_to_dict(row) if row else None


def _update_job(job_id: str, *, status: str, result: Optional[dict] = None, error: Optional[str] = None) -> None:
    with sqlite3.connect(OCR_JOBS_DB_PATH) as conn:
        conn.execute(
            """
            UPDATE ocr_jobs
            SET status=?, result_json=?, error_message=?, updated_at=?
            WHERE id=?
            """,
            (
                status,
                json.dumps(result, ensure_ascii=False) if result else None,
                error,
                _now(),
                job_id,
            ),
        )


def update_version_metadata(document_version_id: str, metadata: dict) -> bool:
    from services.document_version_service import VERSIONS_DB_PATH, init_document_versions_db

    init_document_versions_db()
    payload = json.dumps(metadata, ensure_ascii=False)
    with sqlite3.connect(VERSIONS_DB_PATH) as conn:
        cur = conn.execute(
            "UPDATE document_versions SET metadata_json=? WHERE id=?",
            (payload, document_version_id),
        )
        return cur.rowcount > 0


def run_ocr_job(job_id: str) -> dict:
    """ジョブを同期的に実行（BackgroundTasks から呼ぶ）。"""
    job = get_ocr_job(job_id)
    if not job:
        raise ValueError("job not found")

    version = get_version(job["document_version_id"])
    if not version:
        _update_job(job_id, status="failed", error="document version not found")
        return get_ocr_job(job_id)  # type: ignore[return-value]

    path = version_file_path(version)
    if not path.exists():
        _update_job(job_id, status="failed", error="pdf file missing")
        return get_ocr_job(job_id)  # type: ignore[return-value]

    content = path.read_bytes()
    slot_id = job.get("slot_id") or ""
    slot_label = job.get("slot_label") or version.original_name or "document"
    candidates = [{"id": slot_id, "label": slot_label}] if slot_id else [{"id": "unknown", "label": slot_label}]

    try:
        doc = fitz.open("pdf", content)
        page_count = len(doc)
        ocr_page_texts: list[dict[str, object]] = []
        for i in range(page_count):
            try:
                page_text = doc[i].get_text().strip()
            except Exception:
                page_text = ""
            ocr_page_texts.append({"page": i + 1, "text": page_text})
        doc.close()
    except Exception:
        page_count = 5
        ocr_page_texts = []

    try:
        result = classify_pdf(content, version.original_name, candidates, max_pages=page_count)
        full_text, text_engine = extract_text_from_pdf(content, max_pages=page_count)
        if text_engine == "tesseract" and full_text:
            chunk_size = max(1, len(full_text) // max(page_count, 1))
            for i in range(page_count):
                if i < len(ocr_page_texts):
                    ocr_page_texts[i]["text"] = full_text[i * chunk_size : (i + 1) * chunk_size]
        if slot_id and full_text and len(full_text.strip()) >= 8:
            from services.document_extraction_schema import extract_from_schema, has_extraction_schema

            if has_extraction_schema(slot_id):
                schema_result = extract_from_schema(slot_id, full_text)
                result["extracted_profile"] = schema_result.extracted_profile
                result["field_extractions"] = [f.to_dict() for f in schema_result.fields]
                result["extraction_review_status"] = schema_result.review_status
                result["schema_version"] = schema_result.schema_version
            else:
                extracted = profile_fields_from_text(slot_id, full_text)
                if extracted:
                    result["extracted_profile"] = extracted

        classify_meta = {
            "confidence": result.get("confidence"),
            "engine": result.get("engine"),
            "best": result.get("best"),
            "ranked": result.get("ranked"),
            "text_excerpt": result.get("text_excerpt"),
            "ai_reason": result.get("ai_reason"),
            "classified_at": _now(),
            "extracted_profile": result.get("extracted_profile"),
            "field_extractions": result.get("field_extractions"),
            "extraction_review_status": result.get("extraction_review_status"),
            "schema_version": result.get("schema_version"),
            "ocr_full_text": (full_text or "")[:50000],
            "ocr_text_engine": text_engine,
            "ocr_page_texts": ocr_page_texts,
        }
        enriched = enrich_classify_metadata(
            classify_meta,
            client_id=job["client_id"],
            period_key=job.get("period_key") or "",
            slot_id=slot_id or "unknown",
        )
        update_version_metadata(job["document_version_id"], enriched)

        normalize_payload = None
        period_key = job.get("period_key") or ""
        if slot_id and period_key and job.get("firm_id"):
            try:
                from services.ssot_ingest import (
                    ingest_from_slot_document,
                    ingest_result_for_response,
                )

                norm = ingest_from_slot_document(
                    firm_id=job["firm_id"],
                    client_id=job["client_id"],
                    period_key=period_key,
                    slot_id=slot_id,
                    slot_label=slot_label,
                    pdf_content=content,
                    classify_metadata=enriched,
                )
                normalize_payload = ingest_result_for_response(norm)
            except Exception:
                normalize_payload = None

        job_result = {**enriched, "normalize_result": normalize_payload}
        _update_job(job_id, status="done", result=job_result)
        try:
            from services.auto_vouching import process_auto_vouch_queue_for_version

            process_auto_vouch_queue_for_version(job["document_version_id"])
        except Exception:
            pass
    except Exception as exc:
        _update_job(job_id, status="failed", error=str(exc)[:500])
        processing_meta = enrich_classify_metadata(
            {"confidence": 0, "engine": "none", "status": "failed"},
            client_id=job["client_id"],
            period_key=job.get("period_key") or "",
            slot_id=slot_id or "unknown",
        )
        processing_meta["status"] = "failed"
        update_version_metadata(job["document_version_id"], processing_meta)

    return get_ocr_job(job_id)  # type: ignore[return-value]
