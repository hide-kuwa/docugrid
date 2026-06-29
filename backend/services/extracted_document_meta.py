"""ExtractedDocumentMeta v1 — classify 結果を document_versions.metadata_json 用に正規化。"""

from __future__ import annotations

from typing import Any, Dict, Optional

SCHEMA_VERSION = 1
NEEDS_REVIEW_THRESHOLD = 0.6


def enrich_classify_metadata(
    classify_meta: Dict[str, Any],
    *,
    client_id: str,
    period_key: str,
    slot_id: str,
    category_id: Optional[str] = None,
) -> Dict[str, Any]:
    """ClassifyPersistMetadata 相当の dict を ExtractedDocumentMeta v1 へ拡張する。"""
    conf = float(classify_meta.get("confidence") or 0)
    status = classify_meta.get("status")
    if not status:
        status = "needs_review" if conf < NEEDS_REVIEW_THRESHOLD else "linked"

    excerpt = str(classify_meta.get("text_excerpt") or "")
    if len(excerpt) > 400:
        excerpt = excerpt[:400]

    out: Dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "client_id": client_id,
        "period_key": period_key,
        "suggested_slot_id": slot_id,
        "category_id": category_id or slot_id,
        "confidence": conf,
        "engine": classify_meta.get("engine"),
        "text_excerpt": excerpt,
        "status": status,
        "classified_at": classify_meta.get("classified_at"),
        "best": classify_meta.get("best"),
        "ranked": classify_meta.get("ranked"),
        "ai_reason": classify_meta.get("ai_reason"),
        "extracted_profile": classify_meta.get("extracted_profile"),
        "field_extractions": classify_meta.get("field_extractions"),
        "extraction_review_status": classify_meta.get("extraction_review_status"),
        "schema_version": classify_meta.get("schema_version"),
    }
    return {k: v for k, v in out.items() if v is not None}


def fiscal_label_from_period_key(period_key: Optional[str]) -> str:
    if period_key == "year:0":
        return "R5"
    if period_key == "year:1":
        return "R6"
    if period_key == "year:2":
        return "R7"
    return "R7"
