"""事務所（テナント）ごとの申告書類並び順テンプレート。"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from services.firm_settings import STORAGE_DIR, _load_json, _write_json
from services.tax_document_types import DEFAULT_SORT_ORDER, TAX_DOCUMENT_TYPES, normalize_type

DEFAULT_TEMPLATE_NAME = "標準顧客納品用パッケージ"


def document_templates_path(firm_id: str) -> Path:
    from services.firm_settings import _firm_dir

    return _firm_dir(firm_id) / "document_templates.json"


def _sanitize_sort_order(raw: Optional[List[str]]) -> List[str]:
    if not raw:
        return list(DEFAULT_SORT_ORDER)
    out: List[str] = []
    for item in raw:
        t = normalize_type(item)
        if t != "UNKNOWN" and t not in out:
            out.append(t)
    return out or list(DEFAULT_SORT_ORDER)


def load_document_template(firm_id: str) -> dict:
    path = document_templates_path(firm_id)
    raw = _load_json(path)
    sort_order = _sanitize_sort_order(raw.get("sortOrder") if isinstance(raw.get("sortOrder"), list) else None)
    return {
        "firmId": firm_id,
        "templateName": str(raw.get("templateName") or DEFAULT_TEMPLATE_NAME),
        "sortOrder": sort_order,
        "updatedAt": raw.get("updatedAt"),
    }


def save_document_template(
    firm_id: str,
    *,
    template_name: Optional[str] = None,
    sort_order: Optional[List[str]] = None,
) -> dict:
    existing = load_document_template(firm_id)
    payload = {
        "firmId": firm_id,
        "templateName": (template_name or existing["templateName"]).strip() or DEFAULT_TEMPLATE_NAME,
        "sortOrder": _sanitize_sort_order(sort_order or existing["sortOrder"]),
        "updatedAt": datetime.utcnow().isoformat(),
    }
    _write_json(document_templates_path(firm_id), payload)
    return payload


def sort_key_for_type(doc_type: str, sort_order: List[str]) -> int:
    t = normalize_type(doc_type)
    if t in sort_order:
        return sort_order.index(t)
    if t == "UNKNOWN":
        return len(sort_order) + 1
    return len(sort_order)
