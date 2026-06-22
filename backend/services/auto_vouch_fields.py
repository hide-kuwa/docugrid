"""Auto-Vouching 用フィールド定義（勘定科目・監査項目 → 検索ヒント）。"""

from __future__ import annotations

from typing import Any

# field_id → label, context_hint（PDF 上の近傍ラベル候補）
AUTO_VOUCH_FIELD_DEFS: list[dict[str, Any]] = [
    {
        "field_id": "acct.revenue",
        "label": "売上高",
        "context_hints": ["売上", "売上高", "収入", "Revenue"],
        "default_context_hint": "売上",
        "metric_keys": ["annual.revenue", "monthly.revenue"],
        "document_ref": {"period_key": "month:1", "slot_id": "monthly_trial_balance", "label": "月次試算表"},
    },
    {
        "field_id": "acct.cost_of_sales",
        "label": "売上原価",
        "context_hints": ["売上原価", "原価", "仕入"],
        "default_context_hint": "売上原価",
        "metric_keys": [],
        "document_ref": {"period_key": "year:1", "slot_id": "ledger", "label": "総勘定元帳"},
    },
    {
        "field_id": "acct.travel_expense",
        "label": "旅費交通費",
        "context_hints": ["旅費", "交通費", "旅費交通費"],
        "default_context_hint": "旅費",
    },
    {
        "field_id": "acct.payable",
        "label": "買掛金・請求",
        "context_hints": ["請求", "御請求", "買掛", "支払"],
        "default_context_hint": "請求",
    },
    {
        "field_id": "acct.receivable",
        "label": "売掛金",
        "context_hints": ["売掛", "未収", "売上計上"],
        "default_context_hint": "売掛",
    },
    {
        "field_id": "tax.taxable_profit",
        "label": "課税所得",
        "context_hints": ["課税所得", "所得金額", "課税標準"],
        "default_context_hint": "課税所得",
        "metric_keys": ["annual.profit"],
        "document_ref": {"period_key": "year:1", "slot_id": "tax_return_corporate", "label": "法人税申告書"},
    },
    {
        "field_id": "tax.consumption_taxable",
        "label": "課税売上",
        "context_hints": ["課税売上", "課税標準額", "消費税"],
        "default_context_hint": "課税売上",
        "metric_keys": ["annual.consumption_taxable"],
        "document_ref": {"period_key": "year:1", "slot_id": "tax_return_consumption", "label": "消費税申告書"},
    },
    {
        "field_id": "payroll.total",
        "label": "給与合計",
        "context_hints": ["給与", "支給", "合計", "総支給"],
        "default_context_hint": "合計",
        "metric_keys": [],
        "document_ref": {"period_key": "month:1", "slot_id": "payroll_ledger", "label": "給与台帳"},
    },
    {
        "field_id": "acct.misc",
        "label": "雑費・その他",
        "context_hints": ["合計", "計", "金額", "小計"],
        "default_context_hint": "合計",
    },
]

_FIELD_BY_ID = {item["field_id"]: item for item in AUTO_VOUCH_FIELD_DEFS}

# metric_key → field spec（metric_mappings.yaml で上書き）
_METRIC_TO_FIELD: dict[str, dict[str, Any]] = {}
METRIC_DOCUMENT_REFS: dict[str, dict[str, str]] = {}


def _fallback_metric_index() -> None:
    global _METRIC_TO_FIELD, METRIC_DOCUMENT_REFS
    metric_to_field: dict[str, dict[str, Any]] = {}
    for spec in AUTO_VOUCH_FIELD_DEFS:
        for mk in spec.get("metric_keys") or []:
            metric_to_field[str(mk)] = spec
    _METRIC_TO_FIELD = metric_to_field
    METRIC_DOCUMENT_REFS = {
        "annual.revenue": {
            "period_key": "year:1",
            "slot_id": "financial_report",
            "label": "決算報告書",
        },
        "annual.profit": {
            "period_key": "year:1",
            "slot_id": "tax_return_corporate",
            "label": "法人税申告書",
        },
        "annual.consumption_taxable": {
            "period_key": "year:1",
            "slot_id": "tax_return_consumption",
            "label": "消費税申告書",
        },
        "monthly.revenue": {
            "period_key": "month:1",
            "slot_id": "monthly_trial_balance",
            "label": "月次試算表",
        },
    }


def refresh_metric_index() -> None:
    """metric_mappings.yaml を読み込み、指標 → field / 資料参照を再構築。"""
    global _METRIC_TO_FIELD, METRIC_DOCUMENT_REFS
    try:
        from services.metric_mapping_registry import document_ref_for_metric, list_mappings

        mappings = list_mappings()
        if not mappings:
            _fallback_metric_index()
            return
        metric_to_field: dict[str, dict[str, Any]] = {}
        doc_refs: dict[str, dict[str, str]] = {}
        for m in mappings:
            if m.get("status") == "deprecated":
                continue
            mk = str(m["metric_key"])
            fid = str(m.get("field_id") or "")
            base = _FIELD_BY_ID.get(fid)
            if base:
                metric_to_field[mk] = base
            else:
                metric_to_field[mk] = {
                    "field_id": fid,
                    "label": m.get("label_ja") or mk,
                    "default_context_hint": "",
                }
            ref = document_ref_for_metric(mk)
            if ref:
                doc_refs[mk] = ref
        _METRIC_TO_FIELD = metric_to_field
        METRIC_DOCUMENT_REFS = doc_refs
    except (FileNotFoundError, ValueError, RuntimeError):
        _fallback_metric_index()


refresh_metric_index()


def suggest_from_metric(
    *,
    metric_key: str,
    value_yen: int | None = None,
    value_num: float | None = None,
) -> dict[str, Any] | None:
    """client_metrics の metric_key から Auto-Vouch パラメータを提案する。"""
    spec = _METRIC_TO_FIELD.get(metric_key)
    if not spec:
        return None
    if value_yen is not None:
        target_value = f"{value_yen:,}"
    elif value_num is not None:
        target_value = str(value_num)
    else:
        return None
    doc_ref = METRIC_DOCUMENT_REFS.get(metric_key) or spec.get("document_ref") or {}
    label = spec.get("label") or spec.get("label_ja") or metric_key
    return {
        "field_id": spec["field_id"],
        "field_label": label,
        "context_hint": spec.get("default_context_hint") or resolve_context_hint(spec["field_id"]),
        "target_value": target_value,
        "metric_key": metric_key,
        "document_ref": doc_ref,
    }


def get_field_def(field_id: str) -> dict[str, Any] | None:
    return _FIELD_BY_ID.get(field_id)


def list_auto_vouch_fields() -> list[dict[str, Any]]:
    """UI / API 向けフィールド一覧。"""
    return list(AUTO_VOUCH_FIELD_DEFS)


def resolve_context_hint(field_id: str, explicit_hint: str | None = None) -> str | None:
    """field_id から既定 context_hint を補完する。"""
    if explicit_hint and explicit_hint.strip():
        return explicit_hint.strip()
    spec = _FIELD_BY_ID.get(field_id)
    if spec:
        return str(spec.get("default_context_hint") or "")
    return None
