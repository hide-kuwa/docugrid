"""Feature surface modes — live / preview / planned (no-code overrides).

Catalog: backend/config/feature_surfaces.yaml
Overrides: storage/platform/feature_surfaces.json
           storage/firms/{firm_id}/feature_surfaces.json
Resolve: catalog default ← platform ← firm
"""

from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import yaml

from services.tenancy import DEFAULT_FIRM_ID

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
CATALOG_PATH = Path(__file__).resolve().parent.parent / "config" / "feature_surfaces.yaml"
PLATFORM_OVERRIDE_PATH = STORAGE_DIR / "platform" / "feature_surfaces.json"

FeatureMode = Literal["live", "preview", "planned", "partial"]
ALLOWED_MODES = frozenset({"live", "preview", "planned", "partial"})

# UI badge mapping (partial ≈ preview with softer copy)
MODE_META: dict[str, dict[str, str]] = {
    "live": {"badge": "本番", "title": "利用可能", "wip_kind": ""},
    "preview": {"badge": "見本", "title": "見本・デモのみ", "wip_kind": "mock"},
    "planned": {"badge": "工事中", "title": "準備中", "wip_kind": "planned"},
    "partial": {"badge": "一部未完成", "title": "開発中の機能", "wip_kind": "partial"},
}


def _firm_override_path(firm_id: str) -> Path:
    fid = (firm_id or "").strip() or DEFAULT_FIRM_ID
    return STORAGE_DIR / "firms" / fid / "feature_surfaces.json"


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


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def load_catalog() -> list[dict[str, Any]]:
    if not CATALOG_PATH.exists():
        return []
    raw = yaml.safe_load(CATALOG_PATH.read_text(encoding="utf-8")) or {}
    surfaces = raw.get("surfaces") or []
    out: list[dict[str, Any]] = []
    for item in surfaces:
        if not isinstance(item, dict) or not item.get("id"):
            continue
        mode = str(item.get("default_mode") or "planned")
        if mode not in ALLOWED_MODES:
            mode = "planned"
        out.append(
            {
                "id": str(item["id"]),
                "label": str(item.get("label") or item["id"]),
                "description": str(item.get("description") or ""),
                "default_mode": mode,
                "group": str(item.get("group") or "other"),
            }
        )
    return out


def _modes_map(payload: dict[str, Any]) -> dict[str, str]:
    modes = payload.get("modes")
    if not isinstance(modes, dict):
        return {}
    cleaned: dict[str, str] = {}
    for k, v in modes.items():
        key = str(k).strip()
        val = str(v).strip()
        if key and val in ALLOWED_MODES:
            cleaned[key] = val
    return cleaned


def load_platform_overrides() -> dict[str, Any]:
    return _load_json(PLATFORM_OVERRIDE_PATH)


def load_firm_overrides(firm_id: str) -> dict[str, Any]:
    return _load_json(_firm_override_path(firm_id))


def save_platform_overrides(modes: dict[str, str], *, updated_by: str | None = None) -> dict[str, Any]:
    cleaned = {k: v for k, v in modes.items() if v in ALLOWED_MODES}
    data = {
        "modes": cleaned,
        "updated_at": _utc_now(),
        "updated_by": updated_by,
        "layer": "platform",
    }
    _write_json(PLATFORM_OVERRIDE_PATH, data)
    return data


def save_firm_overrides(
    firm_id: str,
    modes: dict[str, str],
    *,
    updated_by: str | None = None,
) -> dict[str, Any]:
    cleaned = {k: v for k, v in modes.items() if v in ALLOWED_MODES}
    data = {
        "modes": cleaned,
        "firm_id": firm_id,
        "updated_at": _utc_now(),
        "updated_by": updated_by,
        "layer": "firm",
    }
    _write_json(_firm_override_path(firm_id), data)
    return data


def resolve_feature_surfaces(firm_id: str | None = None) -> dict[str, Any]:
    """Return catalog with resolved mode per surface (catalog ← platform ← firm)."""
    catalog = load_catalog()
    platform = _modes_map(load_platform_overrides())
    firm = _modes_map(load_firm_overrides(firm_id or DEFAULT_FIRM_ID))

    surfaces: list[dict[str, Any]] = []
    by_id: dict[str, str] = {}
    for item in catalog:
        sid = item["id"]
        mode = firm.get(sid) or platform.get(sid) or item["default_mode"]
        source = (
            "firm"
            if sid in firm
            else "platform"
            if sid in platform
            else "catalog"
        )
        meta = MODE_META.get(mode, MODE_META["planned"])
        entry = {
            **item,
            "mode": mode,
            "source": source,
            "badge": meta["badge"],
            "title": meta["title"],
            "wip_kind": meta["wip_kind"] or None,
            "writes_allowed": mode == "live",
            "show_sample": mode in ("preview", "partial", "live"),
        }
        surfaces.append(entry)
        by_id[sid] = mode

    return {
        "version": 1,
        "firm_id": (firm_id or "").strip() or DEFAULT_FIRM_ID,
        "surfaces": surfaces,
        "modes_by_id": by_id,
        "platform_modes": platform,
        "firm_modes": firm,
    }


def get_surface_mode(feature_id: str, firm_id: str | None = None) -> str:
    resolved = resolve_feature_surfaces(firm_id)
    return str(resolved["modes_by_id"].get(feature_id) or "planned")


def writes_allowed(feature_id: str, firm_id: str | None = None) -> bool:
    return get_surface_mode(feature_id, firm_id) == "live"


def surface_gate_payload(feature_id: str, firm_id: str | None = None) -> dict[str, Any]:
    """Detail blob for HTTP 403 when writes are blocked."""
    mode = get_surface_mode(feature_id, firm_id)
    meta = MODE_META.get(mode, MODE_META["planned"])
    messages = {
        "preview": "この機能は見本表示のみです。本番利用はまだできません。",
        "planned": "この機能は工事中です。しばらくお待ちください。",
        "partial": "この機能は一部未完成のため、変更は保存できません。",
        "live": "",
    }
    return {
        "code": "feature_surface_restricted",
        "featureId": feature_id,
        "mode": mode,
        "badge": meta["badge"],
        "title": meta["title"],
        "message": messages.get(mode) or messages["planned"],
    }
