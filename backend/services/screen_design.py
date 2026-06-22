"""3-layer screen design: platform default → firm → member (merged per persona)."""

from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Any

from services.tenancy import DEFAULT_FIRM_ID

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
PLATFORM_DESIGN_PATH = STORAGE_DIR / "platform" / "screen_design.json"
PLATFORM_DESIGN_EXAMPLE = STORAGE_DIR / "platform" / "screen_design.json.example"


def _firm_design_path(firm_id: str) -> Path:
    fid = (firm_id or "").strip() or DEFAULT_FIRM_ID
    return STORAGE_DIR / "firms" / fid / "screen_design.json"


def _member_design_path(firm_id: str, member_id: str) -> Path:
    fid = (firm_id or "").strip() or DEFAULT_FIRM_ID
    mid = (member_id or "").strip() or "unknown"
    return STORAGE_DIR / "firms" / fid / "members" / mid / "screen_design.json"


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


def bootstrap_screen_design_examples() -> None:
    """Copy platform example when missing (non-engineer editable template)."""
    if PLATFORM_DESIGN_PATH.exists() or not PLATFORM_DESIGN_EXAMPLE.exists():
        return
    PLATFORM_DESIGN_PATH.parent.mkdir(parents=True, exist_ok=True)
    PLATFORM_DESIGN_PATH.write_text(
        PLATFORM_DESIGN_EXAMPLE.read_text(encoding="utf-8"),
        encoding="utf-8",
    )


def load_platform_design() -> dict[str, Any]:
    bootstrap_screen_design_examples()
    return _load_json(PLATFORM_DESIGN_PATH)


def load_firm_design(firm_id: str) -> dict[str, Any]:
    return _load_json(_firm_design_path(firm_id))


def load_member_design(firm_id: str, member_id: str) -> dict[str, Any]:
    return _load_json(_member_design_path(firm_id, member_id))


def save_platform_design(payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    data["layer"] = "platform"
    data["updated_at"] = datetime.utcnow().isoformat()
    _write_json(PLATFORM_DESIGN_PATH, data)
    return data


def save_firm_design(firm_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    data["layer"] = "firm"
    data["firm_id"] = firm_id
    data["updated_at"] = datetime.utcnow().isoformat()
    _write_json(_firm_design_path(firm_id), data)
    return data


def save_member_design(firm_id: str, member_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    data["layer"] = "member"
    data["firm_id"] = firm_id
    data["member_id"] = member_id
    data["updated_at"] = datetime.utcnow().isoformat()
    _write_json(_member_design_path(firm_id, member_id), data)
    return data


def _merge_persona_dict(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    if not override:
        return deepcopy(base)
    out = deepcopy(base)
    for key, val in override.items():
        if key == "widgets" and isinstance(val, list) and isinstance(out.get("widgets"), list):
            by_id = {w.get("id"): w for w in out["widgets"] if isinstance(w, dict) and w.get("id")}
            for w in val:
                if not isinstance(w, dict) or not w.get("id"):
                    continue
                wid = str(w["id"])
                if wid in by_id:
                    by_id[wid] = {**by_id[wid], **w}
                else:
                    by_id[wid] = w
            out["widgets"] = sorted(by_id.values(), key=lambda x: int(x.get("order") or 0))
        elif key == "navItems" and isinstance(val, list):
            out["navItems"] = val
        elif val is not None and val != "":
            out[key] = val
    return out


def merge_persona_design(
    *,
    persona_id: str,
    code_defaults: dict[str, Any],
    platform: dict[str, Any],
    firm: dict[str, Any],
    member: dict[str, Any],
) -> dict[str, Any]:
    """member > firm > platform > code defaults."""
    merged = deepcopy(code_defaults)
    for layer in (
        (platform.get("personas") or {}).get(persona_id) or {},
        (firm.get("personas") or {}).get(persona_id) or {},
        (member.get("personas") or {}).get(persona_id) or {},
    ):
        if isinstance(layer, dict):
            merged = _merge_persona_dict(merged, layer)
    merged["personaId"] = persona_id
    return merged


def code_defaults_for_persona(persona_id: str) -> dict[str, Any]:
    """Built-in fallback when JSON layers are empty."""
    from services.personas import persona_label

    return {
        "pageTitle": persona_label(persona_id),
        "welcomeMessage": "",
        "accentColor": "#2563eb",
        "widgets": [],
        "navItems": [],
    }


def resolve_screen_design(
    *,
    persona_id: str,
    firm_id: str,
    member_id: str,
) -> dict[str, Any]:
    platform = load_platform_design()
    firm = load_firm_design(firm_id)
    member = load_member_design(firm_id, member_id)
    merged = merge_persona_design(
        persona_id=persona_id,
        code_defaults=code_defaults_for_persona(persona_id),
        platform=platform,
        firm=firm,
        member=member,
    )
    return {
        "persona_id": persona_id,
        "merged": merged,
        "layers": {
            "platform": {
                "path": str(PLATFORM_DESIGN_PATH),
                "persona": (platform.get("personas") or {}).get(persona_id) or {},
                "updated_at": platform.get("updated_at"),
            },
            "firm": {
                "path": str(_firm_design_path(firm_id)),
                "persona": (firm.get("personas") or {}).get(persona_id) or {},
                "updated_at": firm.get("updated_at"),
            },
            "member": {
                "path": str(_member_design_path(firm_id, member_id)),
                "persona": (member.get("personas") or {}).get(persona_id) or {},
                "updated_at": member.get("updated_at"),
            },
        },
    }
