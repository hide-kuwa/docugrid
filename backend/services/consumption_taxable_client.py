"""顧問先の消費税課税事業者判定 — 自動取込 + 手動上書き（手動優先）。"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

from services.consumption_taxable_status import (
    INPUT_OVERRIDE_KEYS,
    ResultOverride,
    TaxableStatusInput,
    explain_taxable_status,
    merge_input_overrides,
)
from services.tenancy import DEFAULT_FIRM_ID

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"

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
_CLIENT_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,80}$")
_FIRM_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,80}$")


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


def _store_path(firm_id: str, client_id: str) -> Path:
    return (
        STORAGE_DIR
        / "firms"
        / _firm_id(firm_id)
        / "consumption_taxable"
        / f"{_safe_client_id(client_id)}.json"
    )


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
    path = _store_path(firm_id, client_id)
    if not path.is_file():
        return {"result_override": "auto", "input_overrides": {}}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"result_override": "auto", "input_overrides": {}}
    if not isinstance(raw, dict):
        return {"result_override": "auto", "input_overrides": {}}
    override = raw.get("result_override") or "auto"
    if override not in ("auto", "taxable", "exempt"):
        override = "auto"
    inputs = raw.get("input_overrides") if isinstance(raw.get("input_overrides"), dict) else {}
    cleaned = {k: inputs[k] for k in INPUT_OVERRIDE_KEYS if k in inputs}
    return {
        "result_override": override,
        "input_overrides": cleaned,
        "updated_at": raw.get("updated_at"),
        "updated_by": raw.get("updated_by"),
    }


def save_manual_state(
    firm_id: str,
    client_id: str,
    *,
    result_override: ResultOverride,
    input_overrides: Mapping[str, Any] | None,
    updated_by: str | None = None,
) -> dict[str, Any]:
    cleaned = {k: input_overrides[k] for k in INPUT_OVERRIDE_KEYS if input_overrides and k in input_overrides}
    payload = {
        "result_override": result_override,
        "input_overrides": cleaned,
        "updated_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        "updated_by": updated_by,
    }
    path = _store_path(firm_id, client_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def gather_auto_input(
    firm_id: str,
    client_id: str,
    profile: Mapping[str, Any] | None,
) -> tuple[TaxableStatusInput, dict[str, Any]]:
    """カルテ・指標から自動入力を組み立てる。出典メモは sources。"""
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
        # ラベル昇順の最古（R5, R6, R7 なら R5）を基準期間の近似とする
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
    auto_input, sources = gather_auto_input(firm_id, client_id, profile)
    stored = load_manual_state(firm_id, client_id)
    overrides = stored.get("input_overrides") or {}
    effective_input = merge_input_overrides(auto_input, overrides)
    payload = explain_taxable_status(
        effective_input,
        result_override=stored.get("result_override") or "auto",
        input_override_keys=list(overrides.keys()),
    )
    payload["auto_inputs"] = {
        "entity_type": auto_input.entity_type,
        "base_period_sales": auto_input.base_period_sales,
        "specified_period_sales": auto_input.specified_period_sales,
        "specified_period_salaries": auto_input.specified_period_salaries,
        "is_invoice_registered": auto_input.is_invoice_registered,
        "has_voluntary_election": auto_input.has_voluntary_election,
        "initial_capital": auto_input.initial_capital,
        "is_special_new_corporate": auto_input.is_special_new_corporate,
        "has_high_value_asset_restriction": auto_input.has_high_value_asset_restriction,
        "has_taxable_inheritance": auto_input.has_taxable_inheritance,
    }
    payload["auto_sources"] = sources
    payload["updated_at"] = stored.get("updated_at")
    payload["updated_by"] = stored.get("updated_by")
    payload["client_id"] = client_id
    return payload
