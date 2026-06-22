"""Google Drive 本番連携（フォルダパス・API）。"""

import io
import json
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from main import app
from services.drive_context import build_drive_folder_segments, build_drive_slot_filename

client = TestClient(app)


def _admin_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "admin",
        "X-Docugrid-User": "smoke-test@example.com",
        "X-Docugrid-Stakeholder": "actor-admin",
        "X-Docugrid-Client": "c1",
    }


def _platform_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "platform_admin",
        "X-Docugrid-User": "admin@tax.co.jp",
        "X-Docugrid-Stakeholder": "actor-admin",
        "X-Docugrid-Client": "c1",
    }


def test_build_drive_slot_filename_pattern() -> None:
    name = build_drive_slot_filename("c1", "year:8", "決算報告書")
    assert name == "c1_year_8_決算報告書.pdf"


def test_build_drive_folder_segments() -> None:
    segs = build_drive_folder_segments("c1", "year:8")
    assert segs == ["TAXX", "c1", "year_8"]


def test_drive_status_unconfigured_by_default() -> None:
    r = client.get("/api/drive/status", headers=_admin_headers())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["drive_mode"] == "unconfigured"
    assert body["drive_credentials_configured"] is False


def test_drive_test_requires_credentials() -> None:
    client.delete("/api/drive/credentials", headers=_platform_headers())
    r = client.post("/api/drive/test", headers=_platform_headers())
    assert r.status_code == 400, r.text
    detail = r.json().get("detail", "")
    assert "サービスアカウント" in detail or "drive_root_folder_id" in detail


def test_drive_credentials_rejects_invalid_json() -> None:
    r = client.post(
        "/api/drive/credentials",
        files={"file": ("bad.json", io.BytesIO(b"not-json"), "application/json")},
        headers=_platform_headers(),
    )
    assert r.status_code == 400


def test_drive_credentials_accepts_service_account_shape() -> None:
    creds = {
        "type": "service_account",
        "project_id": "taxx-test",
        "private_key_id": "key-id",
        "private_key": "-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----\\n",
        "client_email": "taxx-drive@test.iam.gserviceaccount.com",
        "client_id": "123",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
    r = client.post(
        "/api/drive/credentials",
        files={
            "file": (
                "sa.json",
                io.BytesIO(json.dumps(creds).encode("utf-8")),
                "application/json",
            )
        },
        headers=_platform_headers(),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["service_account_email"] == "taxx-drive@test.iam.gserviceaccount.com"

    status = client.get("/api/drive/status", headers=_platform_headers()).json()
    assert status["drive_credentials_configured"] is True
    assert status["drive_mode"] == "live"
    assert status["service_account_email"] == "taxx-drive@test.iam.gserviceaccount.com"

    deleted = client.delete("/api/drive/credentials", headers=_platform_headers())
    assert deleted.status_code == 200


@patch("services.slot_drive_sync.get_drive_service")
def test_slot_upload_uses_live_drive_when_configured(mock_get_drive) -> None:
    mock_drive = MagicMock()
    mock_drive.ensure_folder_path.return_value = "folder-abc"
    mock_drive.upload_stream.return_value = "drive-file-xyz12345"
    mock_get_drive.return_value = mock_drive

    creds = {
        "type": "service_account",
        "project_id": "taxx-test",
        "private_key_id": "key-id",
        "private_key": "-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----\\n",
        "client_email": "taxx-drive@test.iam.gserviceaccount.com",
        "client_id": "123",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
    client.post(
        "/api/drive/credentials",
        files={
            "file": (
                "sa.json",
                io.BytesIO(json.dumps(creds).encode("utf-8")),
                "application/json",
            )
        },
        headers=_platform_headers(),
    )
    client.put(
        "/api/system-config",
        headers=_platform_headers(),
        json={
            "google_drive_connected": True,
            "drive_root_folder_id": "root-folder-id",
        },
    )

    import fitz
    import uuid

    doc = fitz.open()
    doc.new_page()
    pdf = doc.write()
    period = f"year:drive-{uuid.uuid4().hex[:8]}"
    r = client.post(
        "/api/slots",
        data={
            "client_id": "c1",
            "period_key": period,
            "slot_id": "financial_report",
            "slot_label": "決算報告書",
        },
        files={"file": ("report.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("google_drive_file_id") == "drive-file-xyz12345"

    client.put(
        "/api/system-config",
        headers=_platform_headers(),
        json={"google_drive_connected": False},
    )
    client.delete("/api/drive/credentials", headers=_platform_headers())
