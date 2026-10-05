"""Lightweight PDF text → RAG ingest on slot upload (I2).

OCR jobs also ingest; this path indexes extractable text immediately so
search works before Vision/OCR completes. Idempotent via content_sha256.
SPI documents are never indexed.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger("docugrid.slot_rag_ingest")


def maybe_ingest_pdf_bytes_for_rag(
    *,
    firm_id: str,
    client_id: str,
    document_version_id: str,
    content_sha256: str,
    content: bytes,
    logical_document_id: Optional[str] = None,
    skip: bool = False,
) -> Optional[dict[str, Any]]:
    if skip or not content or not firm_id or not client_id or not document_version_id:
        return None
    try:
        from services.pdf_text_extract import extract_pdf_text
        from services.rag_index_service import ingest_ocr_document
        from services.ocr_job_service import update_rag_index_status

        text = extract_pdf_text(content)
        if not (text or "").strip():
            return None
        result = ingest_ocr_document(
            firm_id=firm_id,
            client_id=client_id,
            document_version_id=document_version_id,
            content_sha256=content_sha256 or "",
            text=text,
            logical_document_id=logical_document_id,
        )
        try:
            update_rag_index_status(
                document_version_id,
                rag_status="ready",
                rag_error=None,
            )
        except Exception:
            logger.exception("rag_status update failed ver=%s", document_version_id)
        return result
    except Exception:
        logger.exception(
            "slot pdf rag ingest failed ver=%s client=%s",
            document_version_id,
            client_id,
        )
        try:
            from services.ocr_job_service import update_rag_index_status

            update_rag_index_status(
                document_version_id,
                rag_status="failed",
                rag_error="slot_pdf_text_ingest_failed",
            )
        except Exception:
            pass
        return None
