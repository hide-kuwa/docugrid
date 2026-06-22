"""書類カタログ横断一覧（Phase A + 数値ソート lite）。"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

from services.client_master_store import find_client
from services.client_metrics_service import get_metric_fact, init_client_metrics_db
from services.document_version_service import get_version, slot_status_map
from services.extracted_document_meta import fiscal_label_from_period_key

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
SLOT_DOCS_DB_PATH = STORAGE_DIR / "slot_documents.db"

SortField = Dict[str, str]

CATALOG_SPECS: Dict[str, Dict[str, Any]] = {
    "tax_return_corporate": {
        "label": "法人税申告書",
        "default_period_key": "year:2",
        "sort_fields": [
            {"id": "client_name", "label": "顧問先"},
            {"id": "submission", "label": "提出"},
            {"id": "taxable_revenue", "label": "売上（指標）"},
            {"id": "taxable_profit", "label": "利益（指標）"},
            {"id": "uploaded_at", "label": "提出日"},
        ],
        "metrics": {
            "taxable_revenue": "annual.revenue",
            "taxable_profit": "annual.profit",
        },
    },
    "tax_return_consumption": {
        "label": "消費税申告書",
        "default_period_key": "year:2",
        "sort_fields": [
            {"id": "client_name", "label": "顧問先"},
            {"id": "submission", "label": "提出"},
            {"id": "consumption_taxable", "label": "課税標準額"},
            {"id": "uploaded_at", "label": "提出日"},
        ],
        "metrics": {
            "consumption_taxable": "annual.consumption_taxable",
        },
    },
    "corporate_registry": {
        "label": "履歴事項全部証明書",
        "default_period_key": "perm",
        "sort_fields": [
            {"id": "client_name", "label": "顧問先"},
            {"id": "submission", "label": "提出"},
            {"id": "uploaded_at", "label": "提出日"},
        ],
        "metrics": {},
    },
    "articles_of_incorporation": {
        "label": "定款",
        "default_period_key": "perm",
        "sort_fields": [
            {"id": "client_name", "label": "顧問先"},
            {"id": "submission", "label": "提出"},
            {"id": "uploaded_at", "label": "提出日"},
        ],
        "metrics": {},
    },
}


def list_catalog_field_defs(category_id: str) -> Optional[dict]:
    spec = CATALOG_SPECS.get(category_id)
    if not spec:
        return None
    return {
        "category_id": category_id,
        "label": spec["label"],
        "default_period_key": spec["default_period_key"],
        "sort_fields": spec["sort_fields"],
    }


def list_all_catalog_field_defs() -> List[dict]:
    return [spec for cid in CATALOG_SPECS if (spec := list_catalog_field_defs(cid))]


def _client_name(client_id: str) -> str:
    row = find_client(client_id)
    if row:
        return str(row.get("name") or client_id)
    return client_id


def _slot_row(
    client_id: str,
    period_key: str,
    slot_id: str,
) -> Optional[sqlite3.Row]:
    if not SLOT_DOCS_DB_PATH.exists():
        return None
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            """
            SELECT * FROM slot_documents
            WHERE client_id=? AND period_key=? AND slot_id=?
            """,
            (client_id, period_key, slot_id),
        ).fetchone()


def _metric_yen(firm_id: str, client_id: str, metric_key: str, fiscal: str) -> Optional[int]:
    init_client_metrics_db()
    fact = get_metric_fact(firm_id, client_id, metric_key, fiscal)
    if fact and fact.get("value_yen") is not None:
        return int(fact["value_yen"])
    return None


def _submission_rank(submitted: bool, logical_status: Optional[str]) -> int:
    if not submitted:
        return 0
    if logical_status == "approved":
        return 3
    if logical_status in ("uploaded", "processing"):
        return 2
    return 1


def build_catalog_rows(
    firm_id: str,
    client_ids: List[str],
    category_id: str,
    period_key: str,
    *,
    sort: str = "client_name",
    order: str = "asc",
    metadata_status: Optional[str] = None,
) -> dict:
    spec = CATALOG_SPECS.get(category_id)
    if not spec:
        raise ValueError(f"unknown category: {category_id}")

    fiscal = fiscal_label_from_period_key(period_key)
    rows: List[dict] = []

    for client_id in client_ids:
        slot = _slot_row(client_id, period_key, category_id)
        logical_map = slot_status_map(client_id, period_key)
        logical_status = logical_map.get(period_key, {}).get(category_id)

        fields: Dict[str, Any] = {}
        for field_id, metric_key in (spec.get("metrics") or {}).items():
            fields[field_id] = _metric_yen(firm_id, client_id, metric_key, fiscal)

        meta_status: Optional[str] = None
        if slot and slot["current_version_id"]:
            version = get_version(slot["current_version_id"])
            if version and version.metadata_json:
                try:
                    import json

                    meta = json.loads(version.metadata_json)
                    meta_status = meta.get("status")
                except Exception:
                    pass

        submitted = slot is not None
        rows.append(
            {
                "client_id": client_id,
                "client_name": _client_name(client_id),
                "period_key": period_key,
                "category_id": category_id,
                "submitted": submitted,
                "logical_status": logical_status,
                "workflow_status": None,
                "metadata_status": meta_status,
                "slot_document_id": slot["id"] if slot else None,
                "slot_label": slot["slot_label"] if slot else spec["label"],
                "original_name": slot["original_name"] if slot else None,
                "page_count": slot["page_count"] if slot else None,
                "uploaded_at": slot["uploaded_at"] if slot else None,
                "version_label": None,
                "current_version_id": slot["current_version_id"] if slot else None,
                "fields": fields,
            }
        )
        if slot and slot["current_version_id"]:
            version = get_version(slot["current_version_id"])
            if version:
                rows[-1]["version_label"] = version.version_label

    reverse = order.lower() == "desc"

    def sort_key(row: dict) -> tuple:
        if sort == "client_name":
            return (row["client_name"] or "",)
        if sort == "submission":
            return (
                _submission_rank(row["submitted"], row.get("logical_status")),
                row.get("uploaded_at") or "",
            )
        if sort == "uploaded_at":
            return (row.get("uploaded_at") or "",)
        if sort in (spec.get("metrics") or {}):
            val = row.get("fields", {}).get(sort)
            missing = 1 if val is None else 0
            return (missing, val or 0)
        return (row["client_name"] or "",)

    rows.sort(key=sort_key, reverse=reverse)

    if metadata_status:
        rows = [r for r in rows if r.get("metadata_status") == metadata_status]

    return {
        "category_id": category_id,
        "category_label": spec["label"],
        "period_key": period_key,
        "fiscal_label": fiscal,
        "sort": sort,
        "order": order,
        "rows": rows,
        "submitted_count": sum(1 for r in rows if r["submitted"]),
        "client_count": len(rows),
    }
