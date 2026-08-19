"""Firm-wide Drive visibility — shared drives + share DocuGrid root with members."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from services.drive import DriveConfigurationError
from services.drive_context import get_drive_connected_email, get_drive_service, invalidate_drive_service_cache
from services.firm_members import MEMBER_STATUS_ACTIVE, list_members_for_firm
from services.firm_settings import _firm_dir, _load_json, _write_json
from services.tenancy import DEFAULT_FIRM_ID

logger = logging.getLogger(__name__)

ROOT_FOLDER_NAME = "DocuGrid"
CONSUMER_DOMAINS = frozenset({"gmail.com", "googlemail.com"})


def _share_state_path(firm_id: str):
    return _firm_dir(firm_id) / "drive_share.json"


def load_share_state(firm_id: str) -> dict[str, Any]:
    return _load_json(_share_state_path(firm_id))


def save_share_state(firm_id: str, payload: dict[str, Any]) -> None:
    _write_json(_share_state_path(firm_id), payload)


def _workspace_domain_from_email(email: str) -> Optional[str]:
    raw = (email or "").strip().lower()
    if "@" not in raw:
        return None
    domain = raw.split("@", 1)[1]
    if not domain or domain in CONSUMER_DOMAINS:
        return None
    return domain


def describe_root_location(firm_id: str, root_folder_id: Optional[str]) -> dict[str, Any]:
    """Return whether root lives in My Drive or a shared drive."""
    empty: dict[str, Any] = {
        "location": "none",
        "folder_id": None,
        "folder_name": None,
        "shared_drive_id": None,
        "shared_drive_name": None,
        "office_visible": False,
        "shared_member_emails": [],
        "needs_office_share": False,
    }
    if not (root_folder_id or "").strip():
        return empty
    try:
        svc = get_drive_service(firm_id)
        ping = svc.ping_root_folder(root_folder_id)
        if not ping.get("ok"):
            return {**empty, "error": ping.get("error")}
        drive_id = ping.get("drive_id")
        if drive_id:
            shared_drive_name = None
            for d in svc.list_shared_drives():
                if d.get("id") == drive_id:
                    shared_drive_name = d.get("name")
                    break
            return {
                "location": "shared_drive",
                "folder_id": ping.get("folder_id"),
                "folder_name": ping.get("folder_name"),
                "shared_drive_id": drive_id,
                "shared_drive_name": shared_drive_name,
                "office_visible": True,
                "shared_member_emails": [],
                "needs_office_share": False,
            }
        emails = svc.list_user_permission_emails(root_folder_id)
        state = load_share_state(firm_id)
        synced = [str(e).lower() for e in (state.get("shared_emails") or []) if e]
        visible_emails = sorted(set(emails) | set(synced))
        office_visible = len(visible_emails) >= 2 or bool(state.get("domain_shared"))
        return {
            "location": "my_drive",
            "folder_id": ping.get("folder_id"),
            "folder_name": ping.get("folder_name"),
            "shared_drive_id": None,
            "shared_drive_name": None,
            "office_visible": office_visible,
            "shared_member_emails": visible_emails,
            "needs_office_share": not office_visible,
        }
    except Exception as exc:
        logger.warning("describe_root_location failed firm=%s: %s", firm_id, exc)
        return {**empty, "error": str(exc)[:160]}


def list_accessible_shared_drives(firm_id: str) -> list[dict[str, str]]:
    svc = get_drive_service(firm_id)
    return svc.list_shared_drives()


def use_shared_drive_root(firm_id: str, shared_drive_id: str) -> dict[str, Any]:
    """Create/reuse DocuGrid folder inside a shared drive and return new root id."""
    fid = (firm_id or "").strip() or DEFAULT_FIRM_ID
    drive_id = (shared_drive_id or "").strip()
    if not drive_id:
        raise DriveConfigurationError("shared_drive_id required")
    svc = get_drive_service(fid)
    folder_id = svc.ensure_folder_in_shared_drive(drive_id, ROOT_FOLDER_NAME)
    label = ROOT_FOLDER_NAME
    for d in svc.list_shared_drives():
        if d.get("id") == drive_id:
            label = f"{d.get('name') or 'Shared'}/{ROOT_FOLDER_NAME}"
            break
    save_share_state(
        fid,
        {
            "mode": "shared_drive",
            "shared_drive_id": drive_id,
            "root_folder_id": folder_id,
            "updated_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        },
    )
    invalidate_drive_service_cache(fid)
    return {
        "root_folder_id": folder_id,
        "folder_name": ROOT_FOLDER_NAME,
        "shared_drive_id": drive_id,
        "label": label,
    }


def share_root_with_firm_members(
    firm_id: str,
    *,
    root_folder_id: Optional[str] = None,
    connected_email: Optional[str] = None,
) -> dict[str, Any]:
    """
    Share DocuGrid root with active firm member Google emails (and Workspace domain when possible).
    Shared-drive roots are already office-visible — no-op with ok reason.
    """
    fid = (firm_id or "").strip() or DEFAULT_FIRM_ID
    from services.firm_settings import load_system_config_raw

    cfg = load_system_config_raw(fid)
    folder_id = (root_folder_id or cfg.get("drive_root_folder_id") or "").strip()
    if not folder_id:
        raise DriveConfigurationError("drive_root_folder_id が未設定です")

    svc = get_drive_service(fid)
    ping = svc.ping_root_folder(folder_id)
    if not ping.get("ok"):
        raise DriveConfigurationError(ping.get("error") or "root folder unreachable")

    if ping.get("drive_id"):
        save_share_state(
            fid,
            {
                "mode": "shared_drive",
                "shared_drive_id": ping.get("drive_id"),
                "root_folder_id": folder_id,
                "updated_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            },
        )
        return {
            "ok": True,
            "mode": "shared_drive",
            "shared": [],
            "already": [],
            "failed": [],
            "domain": None,
            "message": "共有ドライブ内のため、ドライブのメンバーはすでに閲覧できます。",
        }

    owner = (connected_email or get_drive_connected_email(fid) or "").strip().lower()
    targets: list[str] = []
    for member in list_members_for_firm(fid):
        if member.status != MEMBER_STATUS_ACTIVE:
            continue
        email = (member.email or "").strip().lower()
        if not email or "@" not in email:
            continue
        if owner and email == owner:
            continue
        targets.append(email)
    targets = sorted(set(targets))

    shared: list[str] = []
    already: list[str] = []
    failed: list[dict[str, str]] = []
    for email in targets:
        try:
            result = svc.share_with_user(folder_id, email, role="writer")
            if result == "already":
                already.append(email)
            else:
                shared.append(email)
        except Exception as exc:
            logger.warning("share failed firm=%s email=%s: %s", fid, email, exc)
            failed.append({"email": email, "error": str(exc)[:120]})

    domain = _workspace_domain_from_email(owner)
    domain_result = None
    if domain:
        try:
            domain_result = svc.share_with_domain(folder_id, domain, role="writer")
        except Exception as exc:
            logger.info("domain share skipped firm=%s domain=%s: %s", fid, domain, exc)
            domain_result = f"failed:{exc}"[:80]

    domain_shared = domain_result in {"shared", "already"}
    state = {
        "mode": "member_emails",
        "root_folder_id": folder_id,
        "shared_emails": sorted(set(shared) | set(already)),
        "domain": domain if domain_shared else None,
        "domain_shared": domain_shared,
        "updated_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        "last_failed": failed,
    }
    save_share_state(fid, state)

    if not targets and not domain_shared:
        message = "共有対象のメンバーメールがありません。メンバー招待後に再実行してください。"
    else:
        parts = [f"メンバー {len(shared)} 名に共有しました"]
        if already:
            parts.append(f"（既存 {len(already)}）")
        if domain_shared:
            parts.append(f"。ドメイン {domain} にも共有。")
        elif failed:
            parts.append(f"。失敗 {len(failed)} 件。")
        else:
            parts.append("。")
        message = "".join(parts)

    return {
        "ok": True,
        "mode": "member_emails",
        "shared": shared,
        "already": already,
        "failed": failed,
        "domain": domain if domain_shared else None,
        "message": message,
    }


def eligible_member_emails_for_share(
    firm_id: str,
    *,
    connected_email: Optional[str] = None,
) -> list[str]:
    """Active firm member emails that would receive My Drive folder share (excludes connector)."""
    owner = (connected_email or get_drive_connected_email(firm_id) or "").strip().lower()
    out: list[str] = []
    for member in list_members_for_firm(firm_id):
        if member.status != MEMBER_STATUS_ACTIVE:
            continue
        email = (member.email or "").strip().lower()
        if not email or "@" not in email:
            continue
        if owner and email == owner:
            continue
        out.append(email)
    return sorted(set(out))


def build_office_visibility_hints(
    firm_id: str,
    *,
    connected_email: Optional[str] = None,
    root_location: str = "none",
    shared_drive_count: Optional[int] = None,
) -> dict[str, Any]:
    """Actionable copy for empty shared-drive list / member-email mismatch."""
    owner = (connected_email or get_drive_connected_email(firm_id) or "").strip().lower()
    eligible = eligible_member_emails_for_share(firm_id, connected_email=owner)
    hints: list[str] = []

    if root_location != "shared_drive":
        hints.append(
            "おすすめは共有ドライブです。接続アカウントを共有ドライブのメンバー（コンテンツ管理者など）に追加してから「一覧を更新」してください。"
        )
        if shared_drive_count == 0:
            hints.append(
                f"一覧が空です。Google Drive で共有ドライブを開き、"
                f"{owner or '接続アカウント'} をメンバーに追加 → DocuGrid に戻って一覧を更新。"
            )

    if root_location == "my_drive" or root_location == "none":
        hints.append(
            "メンバー共有は、DocuGrid のメンバーメール＝その人の Google アカウントである必要があります。"
            "招待・ログインは Google と同じメールにしてください（例: admin@taxx.jp だけの開発用は Drive に届きません）。"
        )
        if not eligible:
            hints.append(
                "いま共有できるアクティブメンバーがいません。設定のメンバー招待で、実際の Google メールを追加してください。"
            )
        else:
            hints.append(
                f"メンバー共有の対象は {len(eligible)} 名です（失敗したメールは結果に表示されます）。"
            )

    if root_location == "shared_drive":
        hints.append(
            "共有ドライブ運用中です。スタッフを見えるようにするには、Google 側でその共有ドライブにメンバー追加してください（DocuGrid のメンバー共有ボタンは不要）。"
        )

    return {
        "eligible_member_emails": eligible,
        "eligible_member_count": len(eligible),
        "office_hints": hints,
        "connected_email": owner or None,
    }


def maybe_share_root_with_email(firm_id: str, email: str) -> None:
    """Best-effort share when a new firm member is invited."""
    try:
        from services.firm_settings import load_system_config_raw

        cfg = load_system_config_raw(firm_id)
        folder_id = (cfg.get("drive_root_folder_id") or "").strip()
        if not folder_id or not cfg.get("google_drive_connected"):
            return
        svc = get_drive_service(firm_id)
        ping = svc.ping_root_folder(folder_id)
        if not ping.get("ok") or ping.get("drive_id"):
            return
        svc.share_with_user(folder_id, email, role="writer")
        state = load_share_state(firm_id)
        emails = {str(e).lower() for e in (state.get("shared_emails") or []) if e}
        emails.add(email.strip().lower())
        state["shared_emails"] = sorted(emails)
        state["updated_at"] = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        save_share_state(firm_id, state)
    except Exception as exc:
        logger.info("maybe_share_root_with_email skipped: %s", exc)
