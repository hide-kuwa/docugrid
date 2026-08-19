"""Addon catalog + per-firm install state.

Resolve: built-in YAML ← custom (platform-created) ← firm installs.
Visibility: official (firm catalog) / draft|pilot (pilot firms) / internal (platform only).
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import yaml

from services.tenancy import DEFAULT_FIRM_ID

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
CATALOG_PATH = Path(__file__).resolve().parent.parent / "config" / "addons.yaml"
CUSTOM_CATALOG_PATH = STORAGE_DIR / "platform" / "addons_custom.json"
BUILTIN_PILOTS_PATH = STORAGE_DIR / "platform" / "addon_pilots.json"

AddonStatus = Literal["draft", "pilot", "official", "internal"]
InstallableBy = Literal["firm", "platform"]

ALLOWED_STATUSES = frozenset({"draft", "pilot", "official", "internal"})
ALLOWED_INSTALLERS = frozenset({"firm", "platform"})
ADDON_ID_RE = re.compile(r"^[a-z][a-z0-9_-]{1,62}$")
FIRM_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


class AddonError(ValueError):
    def __init__(self, message: str, *, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def _load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def sanitize_addon_id(raw: str) -> str:
    aid = (raw or "").strip().lower()
    if not ADDON_ID_RE.match(aid):
        raise AddonError("アドオン ID は英小文字・数字・ハイフンのみ（2〜63文字）です")
    return aid


def sanitize_firm_id(raw: str, *, fallback: str | None = None) -> str:
    fid = (raw or "").strip() or (fallback or "")
    if not FIRM_ID_RE.match(fid):
        raise AddonError("事務所 ID が不正です")
    return fid


def _firm_install_path(firm_id: str) -> Path:
    return STORAGE_DIR / "firms" / sanitize_firm_id(firm_id, fallback=DEFAULT_FIRM_ID) / "addons.json"


def _as_str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        text = str(item).strip()
        if text and text not in out:
            out.append(text)
    return out


def _normalize_addon(raw: dict[str, Any], *, source: str, builtin: bool) -> dict[str, Any] | None:
    aid = str(raw.get("id") or "").strip().lower()
    if not ADDON_ID_RE.match(aid):
        return None
    status = str(raw.get("status") or "draft").strip()
    if status not in ALLOWED_STATUSES:
        status = "draft"
    installer = str(raw.get("installable_by") or raw.get("installableBy") or "platform").strip()
    if installer not in ALLOWED_INSTALLERS:
        installer = "platform"
    return {
        "id": aid,
        "title": str(raw.get("title") or aid).strip() or aid,
        "summary": str(raw.get("summary") or "").strip(),
        "group": str(raw.get("group") or "other").strip() or "other",
        "status": status,
        "installable_by": installer,
        "provides": _as_str_list(raw.get("provides")),
        "pilot_firm_ids": _as_str_list(raw.get("pilot_firm_ids") or raw.get("pilotFirmIds")),
        "default_installed": bool(raw.get("default_installed") or raw.get("defaultInstalled")),
        "builtin": builtin,
        "source": source,
        "created_at": str(raw.get("created_at") or raw.get("createdAt") or ""),
        "updated_at": str(raw.get("updated_at") or raw.get("updatedAt") or ""),
        "created_by": str(raw.get("created_by") or raw.get("createdBy") or ""),
    }


def load_builtin_catalog() -> list[dict[str, Any]]:
    if not CATALOG_PATH.exists():
        return []
    raw = yaml.safe_load(CATALOG_PATH.read_text(encoding="utf-8")) or {}
    items = raw.get("addons") or []
    out: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        normalized = _normalize_addon(item, source="builtin", builtin=True)
        if normalized:
            out.append(normalized)
    return out


def load_custom_catalog() -> list[dict[str, Any]]:
    payload = _load_json(CUSTOM_CATALOG_PATH)
    items = payload.get("addons") or []
    out: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        normalized = _normalize_addon(item, source="custom", builtin=False)
        if normalized:
            out.append(normalized)
    return out


def save_custom_catalog(addons: list[dict[str, Any]]) -> None:
    _write_json(CUSTOM_CATALOG_PATH, {"addons": addons, "updated_at": _utc_now()})


def _builtin_pilot_map() -> dict[str, list[str]]:
    mapping = _load_json(BUILTIN_PILOTS_PATH).get("pilots")
    if not isinstance(mapping, dict):
        return {}
    return {str(k): _as_str_list(v) for k, v in mapping.items()}


def _add_builtin_pilot(addon_id: str, firm_id: str) -> None:
    mapping = _builtin_pilot_map()
    current = list(mapping.get(addon_id) or [])
    if firm_id not in current:
        current.append(firm_id)
    mapping[addon_id] = current
    _write_json(BUILTIN_PILOTS_PATH, {"pilots": mapping, "updated_at": _utc_now()})


def _apply_builtin_pilots(addon: dict[str, Any]) -> dict[str, Any]:
    if not addon.get("builtin"):
        return addon
    extra = _builtin_pilot_map().get(addon["id"]) or []
    if not extra:
        return addon
    merged = list(addon.get("pilot_firm_ids") or [])
    for fid in extra:
        if fid not in merged:
            merged.append(fid)
    return {**addon, "pilot_firm_ids": merged}


def merged_catalog() -> list[dict[str, Any]]:
    """Builtin first; custom with the same id is ignored (builtin wins)."""
    by_id = {item["id"]: _apply_builtin_pilots(item) for item in load_builtin_catalog()}
    for item in load_custom_catalog():
        if item["id"] in by_id:
            continue
        by_id[item["id"]] = item
    return list(by_id.values())


def get_addon(addon_id: str) -> dict[str, Any]:
    aid = sanitize_addon_id(addon_id)
    for item in merged_catalog():
        if item["id"] == aid:
            return item
    raise AddonError("アドオンが見つかりません", status_code=404)


def load_firm_installs(firm_id: str) -> dict[str, Any]:
    return _load_json(_firm_install_path(firm_id))


def save_firm_installs(firm_id: str, payload: dict[str, Any]) -> None:
    _write_json(_firm_install_path(firm_id), payload)


def _installed_map(firm_id: str) -> dict[str, dict[str, Any]]:
    raw = load_firm_installs(firm_id).get("installed")
    if not isinstance(raw, dict):
        return {}
    out: dict[str, dict[str, Any]] = {}
    for key, value in raw.items():
        if isinstance(value, dict):
            out[str(key)] = value
        elif value is True:
            out[str(key)] = {"status": "on"}
    return out


def is_addon_active(firm_id: str, addon_id: str) -> bool:
    try:
        addon = get_addon(addon_id)
    except AddonError:
        return False
    installed = _installed_map(firm_id)
    row = installed.get(addon["id"])
    if row is not None:
        return str(row.get("status") or "on") == "on"
    return bool(addon.get("default_installed"))


def _visible_to_firm(addon: dict[str, Any], firm_id: str, *, installed: bool) -> bool:
    status = addon["status"]
    if status == "official":
        return True
    if status == "internal":
        return installed
    if status in ("draft", "pilot"):
        return firm_id in (addon.get("pilot_firm_ids") or [])
    return False


def firm_can_toggle(addon: dict[str, Any], firm_id: str) -> bool:
    if addon["installable_by"] != "firm":
        return False
    status = addon["status"]
    if status == "official":
        return True
    if status in ("draft", "pilot"):
        return firm_id in (addon.get("pilot_firm_ids") or [])
    return False


def _locked_reason(addon: dict[str, Any], can_toggle: bool) -> str:
    if can_toggle:
        return ""
    if addon["installable_by"] == "platform":
        return "こちら側専用です。事務所では付け外しできません。"
    if addon["status"] in ("draft", "pilot"):
        return "パイロット中です。配布先の事務所のみ付けられます。"
    return "操作できません。"


def list_for_firm(firm_id: str) -> list[dict[str, Any]]:
    fid = sanitize_firm_id(firm_id, fallback=DEFAULT_FIRM_ID)
    rows: list[dict[str, Any]] = []
    for addon in merged_catalog():
        on = is_addon_active(fid, addon["id"])
        if not _visible_to_firm(addon, fid, installed=on):
            continue
        can_toggle = firm_can_toggle(addon, fid)
        rows.append(
            {
                **addon,
                "installed": on,
                "can_install": can_toggle and not on,
                "can_uninstall": can_toggle and on and not addon.get("default_installed"),
                "locked": not can_toggle,
                "locked_reason": _locked_reason(addon, can_toggle),
            }
        )
    return rows


def _scan_installations() -> dict[str, list[str]]:
    firms_dir = STORAGE_DIR / "firms"
    out: dict[str, list[str]] = {}
    if not firms_dir.is_dir():
        return out
    for child in firms_dir.iterdir():
        if not child.is_dir() or not FIRM_ID_RE.match(child.name):
            continue
        for addon_id, row in _installed_map(child.name).items():
            if str(row.get("status") or "on") != "on":
                continue
            out.setdefault(addon_id, []).append(child.name)
    return out


def list_for_platform() -> list[dict[str, Any]]:
    installs_by_addon = _scan_installations()
    return [
        {**addon, "installed_firm_ids": installs_by_addon.get(addon["id"], [])}
        for addon in merged_catalog()
    ]


def _ensure_pilot_target(addon: dict[str, Any], firm_id: str) -> dict[str, Any]:
    if addon["status"] not in ("draft", "pilot"):
        return addon
    if firm_id in (addon.get("pilot_firm_ids") or []):
        return addon
    if addon.get("builtin"):
        _add_builtin_pilot(addon["id"], firm_id)
        return get_addon(addon["id"])
    update_custom_addon(
        addon["id"],
        pilot_firm_ids=[*(addon.get("pilot_firm_ids") or []), firm_id],
        status="pilot" if addon["status"] == "draft" else addon["status"],
    )
    return get_addon(addon["id"])


def set_installed(
    firm_id: str,
    addon_id: str,
    *,
    on: bool,
    actor: str,
    allow_platform: bool,
) -> dict[str, Any]:
    fid = sanitize_firm_id(firm_id, fallback=DEFAULT_FIRM_ID)
    addon = get_addon(addon_id)
    if not allow_platform and not firm_can_toggle(addon, fid):
        raise AddonError("このアドオンは事務所では付け外しできません", status_code=403)
    if allow_platform:
        addon = _ensure_pilot_target(addon, fid)
    installed = _installed_map(fid)
    if on:
        installed[addon["id"]] = {
            "status": "on",
            "installed_at": _utc_now(),
            "installed_by": actor,
        }
    else:
        if addon.get("default_installed") and not allow_platform:
            raise AddonError("標準アドオンは外せません", status_code=400)
        installed.pop(addon["id"], None)
    save_firm_installs(
        fid,
        {
            "firm_id": fid,
            "installed": installed,
            "updated_at": _utc_now(),
            "updated_by": actor,
        },
    )
    return {"id": addon["id"], "firm_id": fid, "installed": on, "addon": get_addon(addon["id"])}


def create_custom_addon(
    *,
    addon_id: str | None,
    title: str,
    summary: str = "",
    group: str = "other",
    installable_by: str = "platform",
    provides: list[str] | None = None,
    pilot_firm_ids: list[str] | None = None,
    actor: str = "",
) -> dict[str, Any]:
    title = (title or "").strip()
    if not title:
        raise AddonError("タイトルは必須です")
    aid = sanitize_addon_id(addon_id or f"addon-{int(datetime.now(timezone.utc).timestamp())}")
    if aid in {item["id"] for item in merged_catalog()}:
        raise AddonError("同じ ID のアドオンが既にあります", status_code=409)
    if installable_by not in ALLOWED_INSTALLERS:
        raise AddonError("installable_by が不正です")
    now = _utc_now()
    addon = {
        "id": aid,
        "title": title,
        "summary": (summary or "").strip(),
        "group": (group or "other").strip() or "other",
        "status": "draft",
        "installable_by": installable_by,
        "provides": _as_str_list(provides),
        "pilot_firm_ids": [sanitize_firm_id(x) for x in (pilot_firm_ids or []) if str(x).strip()],
        "default_installed": False,
        "builtin": False,
        "source": "custom",
        "created_at": now,
        "updated_at": now,
        "created_by": actor,
    }
    custom = load_custom_catalog()
    custom.append(addon)
    save_custom_catalog(custom)
    return addon


def update_custom_addon(
    addon_id: str,
    *,
    title: str | None = None,
    summary: str | None = None,
    group: str | None = None,
    status: str | None = None,
    installable_by: str | None = None,
    provides: list[str] | None = None,
    pilot_firm_ids: list[str] | None = None,
    actor: str = "",
) -> dict[str, Any]:
    aid = sanitize_addon_id(addon_id)
    addon = get_addon(aid)
    if addon.get("builtin"):
        if pilot_firm_ids is None and status is None:
            raise AddonError("公式（built-in）アドオンの定義は YAML で管理します", status_code=400)
        if pilot_firm_ids is not None:
            for fid in [sanitize_firm_id(x) for x in pilot_firm_ids if str(x).strip()]:
                _add_builtin_pilot(aid, fid)
        return get_addon(aid)
    custom = load_custom_catalog()
    found = next((item for item in custom if item["id"] == aid), None)
    if found is None:
        raise AddonError("アドオンが見つかりません", status_code=404)
    if title is not None:
        title = title.strip()
        if not title:
            raise AddonError("タイトルは必須です")
        found["title"] = title
    if summary is not None:
        found["summary"] = summary.strip()
    if group is not None:
        found["group"] = group.strip() or "other"
    if status is not None:
        if status not in ALLOWED_STATUSES:
            raise AddonError("status が不正です")
        found["status"] = status
    if installable_by is not None:
        if installable_by not in ALLOWED_INSTALLERS:
            raise AddonError("installable_by が不正です")
        found["installable_by"] = installable_by
    if provides is not None:
        found["provides"] = _as_str_list(provides)
    if pilot_firm_ids is not None:
        found["pilot_firm_ids"] = [sanitize_firm_id(x) for x in pilot_firm_ids if str(x).strip()]
    found["updated_at"] = _utc_now()
    found["updated_by"] = actor
    save_custom_catalog(custom)
    return get_addon(aid)


def promote_addon(
    addon_id: str,
    *,
    installable_by: str = "firm",
    actor: str = "",
) -> dict[str, Any]:
    addon = get_addon(addon_id)
    if addon.get("builtin"):
        raise AddonError("built-in は既に公式カタログです", status_code=400)
    if addon["status"] == "internal":
        raise AddonError("こちら専用アドオンは公式カタログへ昇格できません", status_code=400)
    if installable_by not in ALLOWED_INSTALLERS:
        raise AddonError("installable_by が不正です")
    return update_custom_addon(
        addon["id"],
        status="official",
        installable_by=installable_by,
        actor=actor,
    )


def public_addon(addon: dict[str, Any], *, include_pilots: bool = False) -> dict[str, Any]:
    payload = {
        "id": addon["id"],
        "title": addon["title"],
        "summary": addon["summary"],
        "group": addon["group"],
        "status": addon["status"],
        "installableBy": addon["installable_by"],
        "provides": addon.get("provides") or [],
        "builtin": bool(addon.get("builtin")),
        "source": addon.get("source") or "builtin",
    }
    if include_pilots:
        payload["pilotFirmIds"] = addon.get("pilot_firm_ids") or []
        payload["createdAt"] = addon.get("created_at") or ""
        payload["updatedAt"] = addon.get("updated_at") or ""
        payload["createdBy"] = addon.get("created_by") or ""
        payload["installedFirmIds"] = addon.get("installed_firm_ids") or []
    if "installed" in addon:
        payload["installed"] = bool(addon.get("installed"))
        payload["canInstall"] = bool(addon.get("can_install"))
        payload["canUninstall"] = bool(addon.get("can_uninstall"))
        payload["locked"] = bool(addon.get("locked"))
        payload["lockedReason"] = addon.get("locked_reason") or ""
    return payload
