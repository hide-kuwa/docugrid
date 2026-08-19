import io
import logging
from pathlib import Path
from typing import List, Optional, Union

from google.auth.credentials import Credentials as GoogleCredentials
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload

logger = logging.getLogger(__name__)

DRIVE_SCOPE = ["https://www.googleapis.com/auth/drive.file"]
# Firm OAuth connector: list shared drives + manage folder permissions for office visibility.
DRIVE_FULL_SCOPE = ["https://www.googleapis.com/auth/drive"]
FOLDER_MIME = "application/vnd.google-apps.folder"


class DriveConfigurationError(RuntimeError):
    """Drive クレデンシャル未設定または接続不可。"""


class DriveService:
    def __init__(
        self,
        credentials_path: Optional[str] = None,
        *,
        credentials: Optional[GoogleCredentials] = None,
        auth_method: str = "service_account",
    ):
        try:
            if credentials is not None:
                self._credentials = credentials
                self._auth_method = auth_method or "oauth"
            else:
                if not credentials_path:
                    raise DriveConfigurationError("Drive credentials path missing")
                path = Path(credentials_path)
                if not path.exists():
                    raise DriveConfigurationError(
                        f"Drive credentials not found: {credentials_path}. "
                        "Connect Google Drive in Settings, or upload a service account JSON."
                    )
                self._credentials = self._load_credentials(str(path))
                self._auth_method = "service_account"
            self._service = build(
                "drive",
                "v3",
                credentials=self._credentials,
                cache_discovery=False,
            )
            logger.info("Connected to Google Drive API (%s).", self._auth_method)
        except DriveConfigurationError:
            raise
        except Exception as exc:
            raise DriveConfigurationError(f"Drive connection failed: {exc}") from exc

    @property
    def mode(self) -> str:
        return "live"

    @property
    def auth_method(self) -> str:
        return self._auth_method

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
            .get(
                fileId=root_folder_id,
                fields="id,name,mimeType,driveId,shared",
                supportsAllDrives=True,
            )
            .execute()
        )
        return {
            "ok": True,
            "mode": "live",
            "folder_id": meta.get("id"),
            "folder_name": meta.get("name"),
            "drive_id": meta.get("driveId") or None,
            "shared": bool(meta.get("shared")),
            "auth_method": self._auth_method,
        }

    def list_shared_drives(self, *, page_size: int = 50) -> list[dict]:
        """Shared drives the connected account can write into."""
        drives: list[dict] = []
        page_token: Optional[str] = None
        while True:
            kwargs: dict = {"pageSize": min(100, max(1, page_size))}
            if page_token:
                kwargs["pageToken"] = page_token
            result = self._service.drives().list(**kwargs).execute()
            for item in result.get("drives") or []:
                drives.append(
                    {
                        "id": item.get("id") or "",
                        "name": item.get("name") or "",
                    }
                )
            page_token = result.get("nextPageToken")
            if not page_token or len(drives) >= page_size:
                break
        return [d for d in drives if d.get("id")]

    def ensure_folder_in_shared_drive(self, shared_drive_id: str, name: str) -> str:
        """Create or reuse a named folder at the root of a shared drive."""
        if not shared_drive_id:
            raise DriveConfigurationError("shared_drive_id required")
        return self.ensure_folder(shared_drive_id, name)

    def list_user_permission_emails(self, file_id: str) -> list[str]:
        emails: list[str] = []
        page_token: Optional[str] = None
        while True:
            kwargs: dict = {
                "fileId": file_id,
                "fields": "nextPageToken,permissions(id,type,emailAddress,role,domain)",
                "supportsAllDrives": True,
            }
            if page_token:
                kwargs["pageToken"] = page_token
            result = self._service.permissions().list(**kwargs).execute()
            for perm in result.get("permissions") or []:
                if perm.get("type") == "user":
                    email = (perm.get("emailAddress") or "").strip().lower()
                    if email:
                        emails.append(email)
            page_token = result.get("nextPageToken")
            if not page_token:
                break
        return emails

    def share_with_user(
        self,
        file_id: str,
        email: str,
        *,
        role: str = "writer",
    ) -> str:
        """Grant a Google user access. Idempotent when already shared."""
        target = (email or "").strip().lower()
        if not target or "@" not in target:
            raise ValueError("invalid email")
        existing = set(self.list_user_permission_emails(file_id))
        if target in existing:
            return "already"
        try:
            self._service.permissions().create(
                fileId=file_id,
                body={"type": "user", "role": role, "emailAddress": target},
                sendNotificationEmail=False,
                supportsAllDrives=True,
                fields="id",
            ).execute()
            return "shared"
        except Exception as exc:
            message = str(exc).lower()
            if "already exists" in message or "duplicate" in message:
                return "already"
            raise

    def share_with_domain(
        self,
        file_id: str,
        domain: str,
        *,
        role: str = "writer",
    ) -> str:
        """Workspace domain share (not for consumer gmail.com)."""
        dom = (domain or "").strip().lower().lstrip("@")
        if not dom or dom in {"gmail.com", "googlemail.com"}:
            raise ValueError("invalid workspace domain")
        try:
            self._service.permissions().create(
                fileId=file_id,
                body={"type": "domain", "role": role, "domain": dom},
                sendNotificationEmail=False,
                supportsAllDrives=True,
                fields="id",
            ).execute()
            return "shared"
        except Exception as exc:
            message = str(exc).lower()
            if "already exists" in message or "duplicate" in message:
                return "already"
            raise
