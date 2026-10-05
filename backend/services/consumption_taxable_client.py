"""顧問先の消費税課税事業者判定 — flowchart テンプレート経由（手動上書きは flowchart_drafts に保存）。"""

from __future__ import annotations

import re
from typing import Any, Mapping

from services.consumption_taxable_flowchart import (
    load_manual_state as _load_draft_state,
    run_for_client,
    save_manual_state as _save_draft_state,
)
from services.consumption_taxable_status import (
    INPUT_OVERRIDE_KEYS,
    ResultOverride,
    TaxableStatusInput,
    merge_input_overrides,
)
from services.tenancy import DEFAULT_FIRM_ID

_CLIENT_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,80}$")
_FIRM_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,80}$")

_FALSEY = frozenset(
    {
        "",
        "0",
        "false",
        "no",
        "なし",
        "無",
        "未",
        "未提出",
        "未登録",
        "未該当",
        "免税",
    }
)


def _firm_id(raw: str) -> str:
    fid = (raw or "").strip() or DEFAULT_FIRM_ID
    if not _FIRM_ID_RE.match(fid):
        return DEFAULT_FIRM_ID
    return fid


def _safe_client_id(client_id: str) -> str:
    cid = (client_id or "").strip()
    if not _CLIENT_ID_RE.match(cid):
        raise ValueError("client_id is invalid")
    return cid


def parse_yen(raw: Any) -> int:
    if raw is None:
        return 0
    if isinstance(raw, bool):
        return 0
    if isinstance(raw, (int, float)):
        n = int(raw)
        return n if n >= 0 else 0
    digits = "".join(ch for ch in str(raw) if ch.isdigit())
    return int(digits) if digits else 0


def profile_truthy(raw: Any) -> bool:
    text = str(raw or "").strip().lower()
    if not text:
        return False
    compact = text.replace(" ", "")
    if compact in _FALSEY:
        return False
    return True


def infer_entity_type(profile: Mapping[str, Any] | None) -> str | None:
    profile = profile or {}
    blob = " ".join(
        str(profile.get(k) or "")
        for k in ("entity_major", "entity_minor", "customer_name")
    )
    if "個人" in blob:
        return "individual"
    if "法人" in blob or "会社" in blob:
        return "corporate"
    return None


def load_manual_state(firm_id: str, client_id: str) -> dict[str, Any]:
    return _load_draft_state(_firm_id(firm_id), _safe_client_id(client_id))


def save_manual_state(
    firm_id: str,
    client_id: str,
    *,
    result_override: ResultOverride,
    input_overrides: Mapping[str, Any] | None,
    updated_by: str | None = None,
) -> dict[str, Any]:
    return _save_draft_state(
        _firm_id(firm_id),
        _safe_client_id(client_id),
        result_override=result_override,
        input_overrides=input_overrides,
        updated_by=updated_by,
    )


def gather_auto_input(
    firm_id: str,
    client_id: str,
    profile: Mapping[str, Any] | None,
) -> tuple[TaxableStatusInput, dict[str, Any]]:
    """カルテ・指標から自動入力を組み立てる（レガシー互換・テスト用）。"""
    profile = profile or {}
    sources: dict[str, Any] = {}

    entity_type = infer_entity_type(profile)
    if entity_type:
        sources["entity_type"] = {"origin": "profile", "field_id": "entity_major"}

    capital = parse_yen(profile.get("capital"))
    if capital:
        sources["initial_capital"] = {"origin": "profile", "field_id": "capital"}

    invoice = profile_truthy(profile.get("invoice_registration_application"))
    consumption_blob = str(profile.get("consumption_tax") or "")
    if not invoice and ("インボイス" in consumption_blob or "適格請求書" in consumption_blob):
        invoice = True
        sources["is_invoice_registered"] = {"origin": "profile", "field_id": "consumption_tax"}
    elif invoice:
        sources["is_invoice_registered"] = {
            "origin": "profile",
            "field_id": "invoice_registration_application",
        }

    election = profile_truthy(profile.get("consumption_tax_election_notice"))
    if election:
        sources["has_voluntary_election"] = {
            "origin": "profile",
            "field_id": "consumption_tax_election_notice",
        }

    base_sales = 0
    specified_sales = 0
    try:
        from services.client_metrics_service import list_metric_facts

        facts = list_metric_facts(firm_id, client_id)
    except Exception:
        facts = []

    consumption_rows = [
        f
        for f in facts
        if f.get("metric_key") == "annual.consumption_taxable" and isinstance(f.get("value_yen"), int)
    ]
    if consumption_rows:
        oldest = sorted(consumption_rows, key=lambda r: str(r.get("period_key") or ""))[0]
        base_sales = int(oldest.get("value_yen") or 0)
        sources["base_period_sales"] = {
            "origin": "metric",
            "metric_key": "annual.consumption_taxable",
            "period_key": oldest.get("period_key"),
            "source_type": oldest.get("source_type"),
        }

    month_rev = [
        f
        for f in facts
        if f.get("metric_key") == "monthly.revenue" and isinstance(f.get("value_yen"), int)
    ]
    if month_rev:
        first_half = 0
        for row in month_rev:
            key = str(row.get("period_key") or "")
            try:
                month = int(key.lstrip("M"))
            except ValueError:
                continue
            if 1 <= month <= 6:
                first_half += int(row.get("value_yen") or 0)
        specified_sales = first_half
        sources["specified_period_sales"] = {
            "origin": "metric",
            "metric_key": "monthly.revenue",
            "period_key": "M01-M06",
        }

    return (
        TaxableStatusInput(
            entity_type=entity_type,  # type: ignore[arg-type]
            base_period_sales=base_sales,
            specified_period_sales=specified_sales,
            specified_period_salaries=0,
            is_invoice_registered=invoice,
            has_voluntary_election=election,
            initial_capital=capital,
        ),
        sources,
    )


def build_client_status(
    firm_id: str,
    client_id: str,
    profile: Mapping[str, Any] | None,
) -> dict[str, Any]:
    cid = _safe_client_id(client_id)
    fid = _firm_id(firm_id)
    client = {
        "id": cid,
        "name": "",
        "profile": profile or {},
    }
    return run_for_client(fid, client)
