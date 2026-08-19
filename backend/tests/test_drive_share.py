"""Firm Drive visibility (shared drive + member share)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from main import app
from services.drive_share import share_root_with_firm_members, use_shared_drive_root

client = TestClient(app)


def _admin_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "admin",
        "X-Docugrid-User": "admin@taxx.jp",
        "X-Docugrid-Stakeholder": "actor-admin",
        "X-Docugrid-Client": "c1",
    }


def test_share_root_with_firm_members_shares_emails() -> None:
    mock_svc = MagicMock()
    mock_svc.ping_root_folder.return_value = {
        "ok": True,
        "folder_id": "root1",
        "folder_name": "DocuGrid",
        "drive_id": None,
    }
    mock_svc.share_with_user.side_effect = ["shared", "already"]
    mock_svc.share_with_domain.return_value = "shared"

    members = [
        MagicMock(status="active", email="a@firm.example"),
        MagicMock(status="active", email="b@firm.example"),
        MagicMock(status="invited", email="x@firm.example"),
    ]

    with (
        patch("services.firm_settings.load_system_config_raw", return_value={"drive_root_folder_id": "root1"}),
        patch("services.drive_share.get_drive_service", return_value=mock_svc),
        patch("services.drive_share.list_members_for_firm", return_value=members),
        patch("services.drive_share.get_drive_connected_email", return_value="owner@firm.example"),
        patch("services.drive_share.save_share_state"),
    ):
        result = share_root_with_firm_members("firm_default", root_folder_id="root1")

    assert result["ok"] is True
    assert "a@firm.example" in result["shared"]
    assert "b@firm.example" in result["already"]
    assert result["domain"] == "firm.example"


def test_use_shared_drive_root_creates_folder() -> None:
    mock_svc = MagicMock()
    mock_svc.ensure_folder_in_shared_drive.return_value = "folder-sd"
    mock_svc.list_shared_drives.return_value = [{"id": "sd1", "name": "事務所共有"}]

    with (
        patch("services.drive_share.get_drive_service", return_value=mock_svc),
        patch("services.drive_share.save_share_state"),
        patch("services.drive_share.invalidate_drive_service_cache"),
    ):
        result = use_shared_drive_root("firm_default", "sd1")

    assert result["root_folder_id"] == "folder-sd"
    assert result["shared_drive_id"] == "sd1"
    mock_svc.ensure_folder_in_shared_drive.assert_called_once_with("sd1", "DocuGrid")


def test_build_office_visibility_hints_my_drive() -> None:
    from services.drive_share import build_office_visibility_hints

    members = [
        MagicMock(status="active", email="staff@firm.example"),
    ]
    with (
        patch("services.drive_share.list_members_for_firm", return_value=members),
        patch("services.drive_share.get_drive_connected_email", return_value="owner@firm.example"),
    ):
        hints = build_office_visibility_hints(
            "firm_default",
            connected_email="owner@firm.example",
            root_location="my_drive",
            shared_drive_count=0,
        )
    assert hints["eligible_member_count"] == 1
    assert "staff@firm.example" in hints["eligible_member_emails"]
    assert any("共有ドライブ" in h for h in hints["office_hints"])
    assert any("Google" in h for h in hints["office_hints"])
    r = client.get("/api/drive/shared-drives", headers=_admin_headers())
    assert r.status_code == 400


def test_share_with_firm_endpoint_requires_credentials() -> None:
    r = client.post("/api/drive/share-with-firm", headers=_admin_headers())
    assert r.status_code == 400
