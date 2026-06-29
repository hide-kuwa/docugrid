"""SSOT 取り込みエントリポイント — スロット保存・キャプチャ振分から呼ぶ。"""

from __future__ import annotations

from typing import Any, Optional

from services.doc_classifier import extract_text_from_pdf
from services.document_extraction_schema import extract_from_schema, has_extraction_schema
from services.profile_normalize_pipeline import IngestContext, NormalizeResult, normalize_client_profile


def ingest_from_slot_document(
    *,
    firm_id: str,
    client_id: str,
    period_key: str,
    slot_id: str,
    slot_label: Optional[str],
    pdf_content: bytes,
    classify_metadata: Optional[dict] = None,
    updated_by: Optional[str] = None,
    updated_by_id: Optional[str] = None,
) -> NormalizeResult:
    text, engine = extract_text_from_pdf(pdf_content)
    doc_confidence: Optional[float] = None
    extracted: Optional[dict[str, str]] = None
    extraction_review: Optional[dict] = None

    if has_extraction_schema(slot_id) and text:
        schema_result = extract_from_schema(slot_id, text)
        extraction_review = schema_result.to_dict()
        if not extracted:
            extracted = schema_result.extracted_profile

    if classify_metadata and isinstance(classify_metadata, dict):
        doc_confidence = classify_metadata.get("confidence")
        if isinstance(doc_confidence, (int, float)):
            doc_confidence = float(doc_confidence)
        else:
            doc_confidence = None
        pre = classify_metadata.get("extracted_profile")
        if isinstance(pre, dict):
            extracted = {str(k): str(v) for k, v in pre.items() if v is not None}
        if extraction_review is None:
            fe = classify_metadata.get("field_extractions")
            if isinstance(fe, list):
                extraction_review = {
                    "slot_id": slot_id,
                    "document_label": slot_label or slot_id,
                    "schema_version": classify_metadata.get("schema_version", 1),
                    "review_status": classify_metadata.get("extraction_review_status", "complete"),
                    "fields": fe,
                    "extracted_profile": extracted or {},
                }

    ctx = IngestContext(
        firm_id=firm_id,
        client_id=client_id,
        source_type="ocr",
        slot_id=slot_id,
        period_key=period_key,
        slot_label=slot_label,
        text=text,
        text_engine=engine,
        document_confidence=doc_confidence,
        extracted_fields=extracted,
        updated_by=updated_by,
        updated_by_id=updated_by_id,
    )
    result = normalize_client_profile(ctx)
    if extraction_review:
        result.extraction_review = extraction_review
    return result


def ingest_from_confirmed_fields(
    *,
    firm_id: str,
    client_id: str,
    period_key: str,
    slot_id: str,
    slot_label: Optional[str],
    fields: dict[str, str],
    updated_by: Optional[str] = None,
    updated_by_id: Optional[str] = None,
) -> NormalizeResult:
    """人が確認・補完した抽出フィールドをマスタへ反映（手動確定扱い）。"""
    cleaned = {str(k): str(v).strip() for k, v in fields.items() if v and str(v).strip()}
    ctx = IngestContext(
        firm_id=firm_id,
        client_id=client_id,
        source_type="manual",
        slot_id=slot_id,
        period_key=period_key,
        slot_label=slot_label,
        extracted_fields=cleaned,
        updated_by=updated_by,
        updated_by_id=updated_by_id,
    )
    return normalize_client_profile(ctx)


def ingest_result_for_response(result: NormalizeResult) -> dict[str, Any]:
    payload = result.to_dict()
    payload["propagate"] = bool(result.applied or result.metrics_applied)
    if result.extraction_review:
        payload["extraction_review"] = result.extraction_review
    return payload
