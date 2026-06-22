"""SSOT 取り込みエントリポイント — スロット保存・キャプチャ振分から呼ぶ。"""

from __future__ import annotations

from typing import Any, Optional

from services.doc_classifier import extract_text_from_pdf
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

    if classify_metadata and isinstance(classify_metadata, dict):
        doc_confidence = classify_metadata.get("confidence")
        if isinstance(doc_confidence, (int, float)):
            doc_confidence = float(doc_confidence)
        else:
            doc_confidence = None
        pre = classify_metadata.get("extracted_profile")
        if isinstance(pre, dict):
            extracted = {str(k): str(v) for k, v in pre.items() if v is not None}

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
    return normalize_client_profile(ctx)


def ingest_result_for_response(result: NormalizeResult) -> dict[str, Any]:
    payload = result.to_dict()
    payload["propagate"] = bool(result.applied or result.metrics_applied)
    return payload
