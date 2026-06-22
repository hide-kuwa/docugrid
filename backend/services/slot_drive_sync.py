"""スロット PDF を Google Drive に同期（本番のみ）。"""

from __future__ import annotations

import io
import logging
from typing import Optional

from services.drive import DriveConfigurationError
from services.drive_context import (
    build_drive_folder_segments,
    build_drive_slot_filename,
    drive_credentials_configured,
    get_drive_service,
)

logger = logging.getLogger(__name__)


def maybe_upload_slot_to_drive(
    *,
    firm_id: str,
    drive_connected: bool,
    drive_root_folder_id: Optional[str],
    client_id: str,
    period_key: str,
    slot_label: str,
    content: bytes,
    filename: str,
    existing_file_id: Optional[str] = None,
) -> Optional[str]:
    """Drive 連携 ON のとき PDF をアップロードし fileId を返す。失敗時は None。"""
    if not drive_connected or not content:
        return None

    if not drive_credentials_configured(firm_id):
        logger.warning("Drive sync skipped: credentials not configured (firm=%s)", firm_id)
        return None

    root_id = (drive_root_folder_id or "").strip()
    if not root_id:
        logger.warning("Drive sync skipped: drive_root_folder_id missing (firm=%s)", firm_id)
        return None

    drive_name = build_drive_slot_filename(client_id, period_key, slot_label or filename)
    fallback_name = (filename or "document.pdf").replace("\\", "_").replace("/", "_")

    try:
        drive = get_drive_service(firm_id)
        parent_folder_id = drive.ensure_folder_path(
            build_drive_folder_segments(client_id, period_key),
            root_id,
        )
        file_id = drive.upload_stream(
            io.BytesIO(content),
            drive_name or fallback_name,
            "application/pdf",
            parent_folder_id=parent_folder_id,
            existing_file_id=existing_file_id,
        )
        return file_id or None
    except DriveConfigurationError:
        logger.warning("Drive sync skipped: configuration error (firm=%s)", firm_id)
        return None
    except Exception:
        logger.exception(
            "Drive upload failed client=%s period=%s slot=%s",
            client_id,
            period_key,
            slot_label,
        )
        return None


def fetch_slot_from_drive(firm_id: str, file_id: str) -> Optional[bytes]:
    if not file_id or not drive_credentials_configured(firm_id):
        return None
    try:
        stream = get_drive_service(firm_id).get_file_stream(file_id)
        return stream.read()
    except Exception:
        logger.exception("Drive download failed file_id=%s", file_id)
        return None
