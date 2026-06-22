"""事務所別 Google Drive クレデンシャル解決とフォルダパス構築。"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import List, Optional

from services.drive import DriveConfigurationError, DriveService
from services.firm_settings import drive_credentials_path

_BACKEND_ROOT = Path(__file__).resolve().parent.parent

_drive_cache: dict[str, DriveService] = {}


def resolve_drive_credentials_path(firm_id: str) -> Path:
    firm_path = drive_credentials_path(firm_id)
    if firm_path.exists():
        return firm_path
    env_path = (os.environ.get("GOOGLE_DRIVE_CREDENTIALS_PATH") or "").strip()
    if env_path:
        return Path(env_path)
    return firm_path


def drive_credentials_configured(firm_id: str) -> bool:
    return resolve_drive_credentials_path(firm_id).exists()


def resolve_drive_mode(firm_id: str) -> str:
    return "live" if drive_credentials_configured(firm_id) else "unconfigured"


def get_drive_service(firm_id: str) -> DriveService:
    fid = (firm_id or "").strip() or "firm_default"
    if fid not in _drive_cache:
        cred_path = resolve_drive_credentials_path(fid)
        _drive_cache[fid] = DriveService(credentials_path=str(cred_path))
    return _drive_cache[fid]


def invalidate_drive_service_cache(firm_id: Optional[str] = None) -> None:
    if firm_id:
        _drive_cache.pop((firm_id or "").strip() or "firm_default", None)
    else:
        _drive_cache.clear()


def sanitize_drive_segment(value: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]+', "_", (value or "").strip())
    return cleaned or "unknown"


def build_drive_slot_filename(client_id: str, period_key: str, slot_label: str) -> str:
    """設定 UI 記載: [クライアントID]_[期間]_[書類名].pdf"""
    label = sanitize_drive_segment(slot_label or "document")
    cid = sanitize_drive_segment(client_id)
    period = sanitize_drive_segment(period_key)
    return f"{cid}_{period}_{label}.pdf"


def build_drive_folder_segments(client_id: str, period_key: str) -> List[str]:
    return [
        "TAXX",
        sanitize_drive_segment(client_id),
        sanitize_drive_segment(period_key),
    ]
