"""書類カテゴリ（中分類）マスタ — YAML 正本の読み込み・検証。

階層: 大分類（書類種別 document_types.yaml）→ 中分類（この service）→ 様式（form_catalog.yaml）。
様式(form_catalog) の maps_to を match 条件で中分類へ紐付ける。
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Any, TypedDict

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "document_categories.yaml"

CATEGORY_ID_RE = re.compile(r"^[a-z][a-z0-9_]*$")


class DocumentCategoryMatch(TypedDict, total=False):
    categories: list[str]
    tax_types: list[str]
    slot_labels: list[str]
    type_ids: list[str]


class DocumentCategoryEntry(TypedDict, total=False):
    id: str
    label: str
    group: str
    type_id: str
    match: DocumentCategoryMatch


class DocumentCategoriesConfig(TypedDict):
    version: int
    categories: list[DocumentCategoryEntry]


def config_path() -> Path:
    return _CONFIG_PATH


def _parse_yaml(text: str) -> dict[str, Any]:
    try:
        import yaml
    except ImportError as exc:
        raise RuntimeError("PyYAML is required for document_categories") from exc
    data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise ValueError("document_categories root must be a mapping")
    return data


def _str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(v).strip() for v in value if str(v).strip()]


def validate_config_data(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    raw = data.get("categories")
    if not isinstance(raw, list):
        return ["categories must be a list"]
    seen: set[str] = set()
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            errors.append(f"categories[{i}] must be a mapping")
            continue
        cid = str(item.get("id") or "").strip()
        if not cid:
            errors.append(f"categories[{i}] id is required")
        elif not CATEGORY_ID_RE.match(cid):
            errors.append(f"categories[{i}] id '{cid}' must match {CATEGORY_ID_RE.pattern}")
        if not str(item.get("label") or "").strip():
            errors.append(f"categories[{i}] label is required")
        if cid in seen:
            errors.append(f"duplicate category id: {cid}")
        seen.add(cid)
        match = item.get("match")
        if match is not None and not isinstance(match, dict):
            errors.append(f"categories[{i}] match must be a mapping")
    return errors


def _normalize_category(item: dict[str, Any]) -> DocumentCategoryEntry:
    match_raw = item.get("match") if isinstance(item.get("match"), dict) else {}
    match: DocumentCategoryMatch = {
        "categories": _str_list(match_raw.get("categories")),
        "tax_types": _str_list(match_raw.get("tax_types")),
        "slot_labels": _str_list(match_raw.get("slot_labels")),
        "type_ids": _str_list(match_raw.get("type_ids")),
    }
    entry: DocumentCategoryEntry = {
        "id": str(item["id"]).strip(),
        "label": str(item.get("label") or "").strip(),
        "group": str(item.get("group") or "").strip(),
        "match": match,
    }
    if item.get("type_id"):
        entry["type_id"] = str(item["type_id"]).strip()
    return entry


def _parse_config_data(data: dict[str, Any]) -> DocumentCategoriesConfig:
    errors = validate_config_data(data)
    if errors:
        raise ValueError("; ".join(errors))
    raw = data.get("categories") or []
    return DocumentCategoriesConfig(
        version=int(data.get("version") or 1),
        categories=[_normalize_category(c) for c in raw if isinstance(c, dict)],
    )


@lru_cache(maxsize=1)
def load_document_categories_config() -> DocumentCategoriesConfig:
    path = config_path()
    if not path.is_file():
        raise FileNotFoundError(f"document_categories config not found: {path}")
    return _parse_config_data(_parse_yaml(path.read_text(encoding="utf-8")))


def reload_document_categories_config() -> DocumentCategoriesConfig:
    load_document_categories_config.cache_clear()
    return load_document_categories_config()


def config_summary() -> dict[str, Any]:
    cfg = load_document_categories_config()
    return {
        "version": cfg["version"],
        "category_count": len(cfg["categories"]),
        "config_path": str(config_path()),
    }


def list_categories() -> list[dict[str, Any]]:
    cfg = load_document_categories_config()
    return [_category_to_dict(c) for c in cfg["categories"]]


def _category_to_dict(entry: DocumentCategoryEntry) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": entry["id"],
        "label": entry["label"],
        "group": entry.get("group") or "",
        "match": dict(entry.get("match") or {}),
    }
    if entry.get("type_id"):
        out["type_id"] = entry["type_id"]
    return out


def _match_category(entry: DocumentCategoryEntry, maps_to: dict[str, Any]) -> bool:
    match = entry.get("match") or {}
    category = str(maps_to.get("category") or "").strip()
    tax_type = str(maps_to.get("tax_type") or "").strip()
    slot_label = str(maps_to.get("slot_label") or "").strip()
    type_id = str(maps_to.get("type_id") or "").strip()
    if category and category in (match.get("categories") or []):
        return True
    if tax_type and tax_type in (match.get("tax_types") or []):
        return True
    if slot_label and slot_label in (match.get("slot_labels") or []):
        return True
    if type_id and type_id in (match.get("type_ids") or []):
        return True
    return False


def categorize_form(maps_to: dict[str, Any] | None) -> str | None:
    """様式の maps_to から所属中分類 ID を解決（上から最初に一致）。"""
    if not maps_to:
        return None
    for entry in load_document_categories_config()["categories"]:
        if _match_category(entry, maps_to):
            return entry["id"]
    return None


def list_categories_with_forms(forms: list[dict[str, Any]]) -> dict[str, Any]:
    """中分類ごとに所属様式をまとめ、未分類も返す（開発コンソール表示用）。"""
    cfg = load_document_categories_config()
    buckets: dict[str, list[dict[str, str]]] = {c["id"]: [] for c in cfg["categories"]}
    unmatched: list[dict[str, str]] = []
    for form in forms:
        maps_to = form.get("maps_to") if isinstance(form.get("maps_to"), dict) else {}
        ref = {
            "form_id": str(form.get("form_id") or ""),
            "label_ja": str(form.get("label_ja") or form.get("form_id") or ""),
        }
        cid = categorize_form(maps_to)
        if cid and cid in buckets:
            buckets[cid].append(ref)
        else:
            unmatched.append(ref)
    categories = []
    for c in cfg["categories"]:
        d = _category_to_dict(c)
        d["forms"] = buckets[c["id"]]
        d["form_count"] = len(buckets[c["id"]])
        categories.append(d)
    return {
        "version": cfg["version"],
        "category_count": len(cfg["categories"]),
        "config_path": str(config_path()),
        "categories": categories,
        "unmatched": unmatched,
        "unmatched_count": len(unmatched),
    }
