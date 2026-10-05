"""migration 確定後のスロット永続化。"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from api.constants import SLOT_DOCS_DB_PATH
from services.document_version_service import (
    create_document_version,
    ensure_logical_document,
    set_logical_status,
)
from services.extracted_document_meta import enrich_classify_metadata
from services.firm_settings import load_system_config_raw
from services.slot_drive_sync import maybe_upload_slot_to_drive
from services.tenancy import get_client_firm_id


def _init_slot_documents_db() -> None:
    from api.persistence import _init_slot_documents_db

    _init_slot_documents_db()


def persist_pdf_to_slot(
    *,
    client_id: str,
    period_key: str,
    slot_id: str,
    slot_label: str,
    content: bytes,
    filename: str,
    uploaded_by: str = "migration",
    classify_metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Persist allowlisted file (PDF or other) into a matrix slot."""
    if not content:
        raise ValueError("empty content")
    from services.upload_file_kinds import UploadKindError, is_pdf_name, validate_upload_bytes

    safe_name = filename or "document.pdf"
    try:
        page_count, _ext = validate_upload_bytes(content, safe_name)
    except UploadKindError as exc:
        raise ValueError(str(exc)) from exc
    sha = hashlib.sha256(content).hexdigest()
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    title = slot_label or f"slot-{slot_id}"
    metadata_json: Optional[str] = None
    if classify_metadata and is_pdf_name(safe_name):
        meta_obj = enrich_classify_metadata(
            dict(classify_metadata),
            client_id=client_id,
            period_key=period_key,
            slot_id=slot_id,
        )
        metadata_json = json.dumps(meta_obj, ensure_ascii=False)

    logical = ensure_logical_document(
        client_id=client_id,
        period_key=period_key,
        slot_id=slot_id,
        title=title,
    )
    if logical.current_version_id:
        set_logical_status(logical.id, "processing")
    parent_id = logical.current_version_id
    version = create_document_version(
        logical_id=logical.id,
        content=content,
        original_name=safe_name,
        content_sha256=sha,
        source="migration_import",
        bump="upload",
        parent_version_id=parent_id,
        created_by_stakeholder_id=None,
        created_by_email=uploaded_by,
        page_count=page_count,
        metadata_json=metadata_json,
    )

    client_firm = get_client_firm_id(client_id)
    cfg = load_system_config_raw(client_firm)
    drive_connected = bool(cfg.get("google_drive_connected"))
    drive_root = cfg.get("drive_root_folder_id")

    _init_slot_documents_db()
    existing_drive_file_id: Optional[str] = None
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        prev_row = conn.execute(
            "SELECT id, google_drive_file_id FROM slot_documents WHERE client_id=? AND period_key=? AND slot_id=?",
            (client_id, period_key, slot_id),
        ).fetchone()
        if prev_row:
            existing_drive_file_id = prev_row["google_drive_file_id"]

    drive_file_id = maybe_upload_slot_to_drive(
        firm_id=client_firm,
        drive_connected=drive_connected,
        drive_root_folder_id=str(drive_root or "") or None,
        client_id=client_id,
        period_key=period_key,
        slot_label=slot_label or title,
        content=content,
        filename=safe_name,
        existing_file_id=existing_drive_file_id,
    )

    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        prev = conn.execute(
            "SELECT id FROM slot_documents WHERE client_id=? AND period_key=? AND slot_id=?",
            (client_id, period_key, slot_id),
        ).fetchone()
        if prev:
            doc_id = prev["id"]
            conn.execute(
                """
                UPDATE slot_documents SET
                    slot_label=?, original_name=?, storage_key=?,
                    page_count=?, content_sha256=?, byte_size=?, uploaded_by=?, uploaded_at=?,
                    logical_document_id=?, current_version_id=?, firm_id=?, google_drive_file_id=?
                WHERE id=?
                """,
                (
                    slot_label or title,
                    safe_name,
                    version.storage_key,
                    page_count,
                    sha,
                    len(content),
                    uploaded_by,
                    now,
                    logical.id,
                    version.id,
                    client_firm,
                    drive_file_id,
                    doc_id,
                ),
            )
        else:
            doc_id = uuid.uuid4().hex
            conn.execute(
                """
                INSERT INTO slot_documents (
                    id, client_id, period_key, slot_id, slot_label, original_name,
                    storage_key, page_count, content_sha256, byte_size,
                    uploaded_by, uploaded_at, logical_document_id, current_version_id,
                    firm_id, google_drive_file_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    doc_id,
                    client_id,
                    period_key,
                    slot_id,
                    slot_label or title,
                    safe_name,
                    version.storage_key,
                    page_count,
                    sha,
                    len(content),
                    uploaded_by,
                    now,
                    logical.id,
                    version.id,
                    client_firm,
                    drive_file_id,
                ),
            )
        conn.commit()

    if logical.current_version_id:
        set_logical_status(logical.id, "uploaded")

    return {
        "slotDocumentId": doc_id,
        "logicalDocumentId": logical.id,
        "documentVersionId": version.id,
        "googleDriveFileId": drive_file_id,
    }
