"""書類種別マスタ — YAML 正本の読み込み・検証・永続化。

大分類（定款・法人税申告書…）の単一 SSOT。
organization.ts DOCUMENT_CATEGORIES と document_catalog_service CATALOG_SPECS を統合。
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, TypedDict

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "document_types.yaml"

_HEADER = (
    "# 書類種別マスタ — 大分類の単一正本（SSOT）\n"
    "# 編集: 開発コンソール /dev/form-catalog → 書類種別タブ\n"
)

TYPE_ID_RE = re.compile(r"^[a-z][a-z0-9_]*$")

_TYPE_FIELD_ORDER = (
    "id",
    "label",
    "flags",
    "catalog",
)


class DocumentTypeFlags(TypedDict, total=False):
    ocr: bool
    dashboard: bool
    alert: bool


class DocumentTypeCatalog(TypedDict, total=False):
    enabled: bool
    default_period_key: str
    sort_fields: list[dict[str, str]]
    metrics: dict[str, str]


class DocumentTypeEntry(TypedDict, total=False):
    id: str
    label: str
    flags: DocumentTypeFlags
    catalog: DocumentTypeCatalog


class DocumentTypesConfig(TypedDict):
    version: int
    types: list[DocumentTypeEntry]


def config_path() -> Path:
    return _CONFIG_PATH


def _parse_yaml(text: str) -> dict[str, Any]:
    try:
        import yaml
    except ImportError as exc:
        raise RuntimeError("PyYAML is required for document_types") from exc
    data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise ValueError("document_types root must be a mapping")
    return data


def _dump_yaml(data: dict[str, Any]) -> str:
    try:
        import yaml
    except ImportError as exc:
        raise RuntimeError("PyYAML is required for document_types") from exc
    body = yaml.dump(
        data,
        allow_unicode=True,
        default_flow_style=False,
        sort_keys=False,
    )
    return _HEADER + body


def _validate_type_id(type_id: str, *, prefix: str = "") -> list[str]:
    errors: list[str] = []
    if not type_id:
        errors.append(f"{prefix}id is required")
    elif not TYPE_ID_RE.match(type_id):
        errors.append(f"{prefix}id '{type_id}' must match {TYPE_ID_RE.pattern}")
    return errors


def _validate_type_fields(item: dict[str, Any], *, index: int | None = None) -> list[str]:
    prefix = f"types[{index}] " if index is not None else ""
    errors: list[str] = []
    type_id = str(item.get("id") or "").strip()
    errors.extend(_validate_type_id(type_id, prefix=prefix))
    if not str(item.get("label") or "").strip():
        errors.append(f"{prefix}label is required")
    flags = item.get("flags")
    if flags is not None and not isinstance(flags, dict):
        errors.append(f"{prefix}flags must be a mapping")
    catalog = item.get("catalog")
    if catalog is not None and not isinstance(catalog, dict):
        errors.append(f"{prefix}catalog must be a mapping")
    return errors


def validate_config_data(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    types_raw = data.get("types")
    if not isinstance(types_raw, list):
        return ["types must be a list"]
    seen: set[str] = set()
    for i, item in enumerate(types_raw):
        if not isinstance(item, dict):
            errors.append(f"types[{i}] must be a mapping")
            continue
        errors.extend(_validate_type_fields(item, index=i))
        tid = str(item.get("id") or "").strip()
        if tid in seen:
            errors.append(f"duplicate type id: {tid}")
        seen.add(tid)
    return errors


def _normalize_type(item: dict[str, Any]) -> DocumentTypeEntry:
    flags_raw = item.get("flags") if isinstance(item.get("flags"), dict) else {}
    catalog_raw = item.get("catalog") if isinstance(item.get("catalog"), dict) else {}
    flags: DocumentTypeFlags = {
        "ocr": bool(flags_raw.get("ocr", False)),
        "dashboard": bool(flags_raw.get("dashboard", False)),
        "alert": bool(flags_raw.get("alert", False)),
    }
    catalog: DocumentTypeCatalog = {
        "enabled": bool(catalog_raw.get("enabled", False)),
    }
    if catalog_raw.get("default_period_key"):
        catalog["default_period_key"] = str(catalog_raw["default_period_key"])
    if isinstance(catalog_raw.get("sort_fields"), list):
        catalog["sort_fields"] = [
            {"id": str(f.get("id", "")), "label": str(f.get("label", ""))}
            for f in catalog_raw["sort_fields"]
            if isinstance(f, dict)
        ]
    if isinstance(catalog_raw.get("metrics"), dict):
        catalog["metrics"] = {str(k): str(v) for k, v in catalog_raw["metrics"].items()}
    return DocumentTypeEntry(
        id=str(item["id"]).strip(),
        label=str(item.get("label") or "").strip(),
        flags=flags,
        catalog=catalog,
    )


def _parse_config_data(data: dict[str, Any]) -> DocumentTypesConfig:
    errors = validate_config_data(data)
    if errors:
        raise ValueError("; ".join(errors))
    types_raw = data.get("types") or []
    return DocumentTypesConfig(
        version=int(data.get("version") or 1),
        types=[_normalize_type(t) for t in types_raw if isinstance(t, dict)],
    )


@lru_cache(maxsize=1)
def load_document_types_config() -> DocumentTypesConfig:
    path = config_path()
    if not path.is_file():
        raise FileNotFoundError(f"document_types config not found: {path}")
    return _parse_config_data(_parse_yaml(path.read_text(encoding="utf-8")))


def reload_document_types_config() -> DocumentTypesConfig:
    load_document_types_config.cache_clear()
    return load_document_types_config()


def config_summary() -> dict[str, Any]:
    cfg = load_document_types_config()
    return {
        "version": cfg["version"],
        "type_count": len(cfg["types"]),
        "config_path": str(config_path()),
    }


def list_types() -> list[dict[str, Any]]:
    cfg = load_document_types_config()
    return [_type_to_dict(t) for t in cfg["types"]]


def list_catalog_enabled_types() -> list[dict[str, Any]]:
    return [t for t in list_types() if t.get("catalog", {}).get("enabled")]


def get_type(type_id: str) -> DocumentTypeEntry | None:
    cfg = load_document_types_config()
    for t in cfg["types"]:
        if t["id"] == type_id:
            return t
    return None


def resolve_type_id_from_maps_to(maps_to: dict[str, Any] | None) -> str | None:
    """form_catalog maps_to から書類種別 ID を解決（後方互換エイリアス付き）。"""
    if not maps_to:
        return None
    if maps_to.get("type_id"):
        tid = str(maps_to["type_id"]).strip()
        if get_type(tid):
            return tid
    category = str(maps_to.get("category") or "").strip()
    _CATEGORY_ALIASES: dict[str, str] = {
        "corp_tax": "tax_return_corporate",
        "consumption_tax": "tax_return_consumption",
    }
    if category in _CATEGORY_ALIASES:
        return _CATEGORY_ALIASES[category]
    slot_label = str(maps_to.get("slot_label") or "").strip()
    _LABEL_ALIASES: dict[str, str] = {
        "法人税申告書": "tax_return_corporate",
        "消費税申告書": "tax_return_consumption",
        "履歴事項全部証明書": "corporate_registry",
        "定款": "articles_of_incorporation",
        "総勘定元帳": "ledger",
        "通帳コピー": "bank_statement",
    }
    if slot_label in _LABEL_ALIASES:
        return _LABEL_ALIASES[slot_label]
    return None


def catalog_spec_for_type(type_id: str) -> dict[str, Any] | None:
    """document_catalog_service 互換の spec dict を返す。"""
    entry = get_type(type_id)
    if not entry:
        return None
    catalog = entry.get("catalog") or {}
    if not catalog.get("enabled"):
        return None
    return {
        "label": entry["label"],
        "default_period_key": catalog.get("default_period_key", "year:2"),
        "sort_fields": catalog.get("sort_fields") or [],
        "metrics": catalog.get("metrics") or {},
    }


def _type_to_dict(entry: DocumentTypeEntry) -> dict[str, Any]:
    return {
        "id": entry["id"],
        "label": entry["label"],
        "flags": dict(entry.get("flags") or {}),
        "catalog": dict(entry.get("catalog") or {}),
    }


def _type_to_raw_dict(entry: DocumentTypeEntry) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key in _TYPE_FIELD_ORDER:
        if key in entry and entry[key] is not None:
            out[key] = entry[key]
    return out


def _config_to_raw_dict(cfg: DocumentTypesConfig) -> dict[str, Any]:
    return {
        "version": cfg["version"],
        "types": [_type_to_raw_dict(t) for t in cfg["types"]],
    }


def save_document_types_config(cfg: DocumentTypesConfig) -> DocumentTypesConfig:
    errors = validate_config_data(_config_to_raw_dict(cfg))
    if errors:
        raise ValueError("; ".join(errors))
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_dump_yaml(_config_to_raw_dict(cfg)), encoding="utf-8")
    reload_document_types_config()
    return cfg
