import io
import logging
from pathlib import Path
from typing import List, Optional

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload

logger = logging.getLogger(__name__)

DRIVE_SCOPE = ["https://www.googleapis.com/auth/drive.file"]
FOLDER_MIME = "application/vnd.google-apps.folder"


class DriveConfigurationError(RuntimeError):
    """Drive クレデンシャル未設定または接続不可。"""


class DriveService:
    def __init__(self, credentials_path: str):
        path = Path(credentials_path)
        if not path.exists():
            raise DriveConfigurationError(
                f"Drive credentials not found: {credentials_path}. "
                "Upload a service account JSON in Settings → Integrations."
            )
        try:
            self._credentials = self._load_credentials(str(path))
            self._service = build(
                "drive",
                "v3",
                credentials=self._credentials,
                cache_discovery=False,
            )
            logger.info("Connected to Google Drive API (%s).", credentials_path)
        except DriveConfigurationError:
            raise
        except Exception as exc:
            raise DriveConfigurationError(f"Drive connection failed: {exc}") from exc

    @property
    def mode(self) -> str:
        return "live"

    def _load_credentials(self, path: str):
        return service_account.Credentials.from_service_account_file(path, scopes=DRIVE_SCOPE)

    def _escape_query_value(self, value: str) -> str:
        return (value or "").replace("'", "\\'")

    def find_child_folder(self, parent_id: str, name: str) -> Optional[str]:
        safe_name = self._escape_query_value(name)
        query = (
            f"'{parent_id}' in parents and name='{safe_name}' "
            f"and mimeType='{FOLDER_MIME}' and trashed=false"
        )
        result = (
            self._service.files()
            .list(
                q=query,
                fields="files(id,name)",
                pageSize=1,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            )
            .execute()
        )
        files = result.get("files") or []
        return files[0]["id"] if files else None

    def ensure_folder(self, parent_id: str, name: str) -> str:
        existing = self.find_child_folder(parent_id, name)
        if existing:
            return existing
        metadata = {
            "name": name,
            "mimeType": FOLDER_MIME,
            "parents": [parent_id],
        }
        created = (
            self._service.files()
            .create(body=metadata, fields="id", supportsAllDrives=True)
            .execute()
        )
        return created["id"]

    def ensure_folder_path(self, segments: List[str], root_folder_id: Optional[str]) -> str:
        if not segments:
            raise ValueError("segments required")
        if not root_folder_id:
            raise DriveConfigurationError("drive_root_folder_id is required")
        parent = root_folder_id
        for segment in segments:
            parent = self.ensure_folder(parent, segment)
        return parent

    def upload_stream(
        self,
        file_obj,
        filename: str,
        mime_type: str,
        *,
        parent_folder_id: Optional[str] = None,
        existing_file_id: Optional[str] = None,
    ) -> str:
        if hasattr(file_obj, "seek"):
            file_obj.seek(0)
        media = MediaIoBaseUpload(file_obj, mimetype=mime_type, resumable=True)

        if existing_file_id:
            self._service.files().update(
                fileId=existing_file_id,
                media_body=media,
                supportsAllDrives=True,
            ).execute()
            return existing_file_id

        metadata = {"name": filename}
        if parent_folder_id:
            metadata["parents"] = [parent_folder_id]
        created = (
            self._service.files()
            .create(body=metadata, media_body=media, fields="id", supportsAllDrives=True)
            .execute()
        )
        file_id = created.get("id")
        if not file_id:
            raise RuntimeError("Drive upload returned no file id")
        return file_id

    def get_file_stream(self, file_id: str):
        request = self._service.files().get_media(fileId=file_id, supportsAllDrives=True)
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        fh.seek(0)
        return fh

    def ping_root_folder(self, root_folder_id: str) -> dict:
        if not root_folder_id:
            return {"ok": False, "mode": "live", "error": "drive_root_folder_id_missing"}
        meta = (
            self._service.files()
            .get(fileId=root_folder_id, fields="id,name,mimeType", supportsAllDrives=True)
            .execute()
        )
        return {
            "ok": True,
            "mode": "live",
            "folder_id": meta.get("id"),
            "folder_name": meta.get("name"),
        }
