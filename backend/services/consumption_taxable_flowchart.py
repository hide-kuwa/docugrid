"""消費税課税事業者判定 — flowchart テンプレートへのブリッジ（SSOT: CONSUMPTION_TAXABLE_DEFINITION）。"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Mapping

from services.consumption_taxable_status import (
    EntityType,
    INPUT_OVERRIDE_KEYS,
    ResultOverride,
    TaxableStatusInput,
)
from services.flowchart_instances import load_draft, save_draft
from services.flowchart_templates import CONSUMPTION_TAXABLE_DEFINITION

CONSUMPTION_TAXABLE_TEMPLATE_ID = "global-consumption-taxable"


@dataclass(frozen=True)
class TaxableEvalResult:
    is_taxable: bool
    matched_conditions: tuple[str, ...]
    message: str


def evaluate_from_fields(
    *,
    entity_type: EntityType | None = None,
    base_period_sales: int = 0,
    specified_period_sales: int = 0,
    specified_period_salaries: int = 0,
    is_invoice_registered: bool = False,
    has_voluntary_election: bool = False,
    initial_capital: int = 0,
    is_special_new_corporate: bool = False,
    has_high_value_asset_restriction: bool = False,
    has_taxable_inheritance: bool = False,
) -> TaxableEvalResult:
    """Flowchart SSOT 経由の自動判定（ユニットテスト用）。"""
    payload = explain_via_flowchart(
        TaxableStatusInput(
            entity_type=entity_type,
            base_period_sales=base_period_sales,
            specified_period_sales=specified_period_sales,
            specified_period_salaries=specified_period_salaries,
            is_invoice_registered=is_invoice_registered,
            has_voluntary_election=has_voluntary_election,
            initial_capital=initial_capital,
            is_special_new_corporate=is_special_new_corporate,
            has_high_value_asset_restriction=has_high_value_asset_restriction,
            has_taxable_inheritance=has_taxable_inheritance,
        )
    )
    return TaxableEvalResult(
        is_taxable=bool(payload["is_taxable"]),
        matched_conditions=tuple(payload["matched_conditions"]),
        message=str(payload["message"]),
    )


def _consumption_template(firm_id: str = "") -> dict[str, Any]:
    from services.flowchart_templates import get_template_by_id

    cached = get_template_by_id(CONSUMPTION_TAXABLE_TEMPLATE_ID, firm_id)
    if cached:
        return cached
    return {
        "id": CONSUMPTION_TAXABLE_TEMPLATE_ID,
        "title": "消費税 課税事業者判定",
        "definition": CONSUMPTION_TAXABLE_DEFINITION,
    }


def override_to_flowchart(result_override: str) -> str:
    if result_override == "taxable":
        return "yes"
    if result_override == "exempt":
        return "no"
    return "auto"


def override_from_flowchart(result_override: str) -> ResultOverride:
    if result_override == "yes":
        return "taxable"
    if result_override == "no":
        return "exempt"
    return "auto"


def _pick_inputs(raw: Mapping[str, Any]) -> dict[str, Any]:
    return {k: raw[k] for k in INPUT_OVERRIDE_KEYS if k in raw}


def _bindings_to_sources(bindings: list[dict[str, Any]] | None) -> dict[str, Any]:
    sources: dict[str, Any] = {}
    for row in bindings or []:
        input_id = str(row.get("input_id") or "")
        if not input_id:
            continue
        origin = str(row.get("origin") or "")
        if origin == "profile":
            sources[input_id] = {"origin": "profile", "field_id": row.get("field")}
        elif origin == "metric":
            sources[input_id] = {
                "origin": "metric",
                "metric_key": row.get("metric_key"),
                "period_key": row.get("period_key"),
            }
        elif origin == "master":
            sources[input_id] = {"origin": "master", "field_id": row.get("field")}
    return sources


def map_flowchart_run_to_taxable(
    run: Mapping[str, Any],
    *,
    result_override: ResultOverride | None = None,
) -> dict[str, Any]:
    ro = result_override if result_override is not None else override_from_flowchart(str(run.get("result_override") or "auto"))
    inputs = _pick_inputs(run.get("inputs") or {})
    auto_inputs = _pick_inputs(run.get("auto_inputs") or {})
    return {
        "is_taxable": bool(run.get("passed")),
        "matched_conditions": list(run.get("matched_conditions") or []),
        "message": str(run.get("message") or ""),
        "auto_is_taxable": bool(run.get("auto_passed", run.get("auto_is_taxable"))),
        "auto_matched_conditions": list(run.get("auto_matched_conditions") or []),
        "result_override": ro,
        "result_source": run.get("result_source") or "auto",
        "conditions": list(run.get("conditions") or []),
        "inputs": inputs,
        "input_override_keys": list(run.get("input_override_keys") or []),
        "auto_inputs": auto_inputs,
        "auto_sources": _bindings_to_sources(list(run.get("bindings") or [])),
    }


def explain_via_flowchart(
    inp: TaxableStatusInput,
    *,
    result_override: ResultOverride = "auto",
    input_override_keys: list[str] | None = None,
) -> dict[str, Any]:
    from services.flowchart_engine import run_definition

    template = _consumption_template()
    auto_inputs = asdict(inp)
    keys = list(input_override_keys or [])
    overrides = {k: auto_inputs[k] for k in keys if k in auto_inputs} if keys else None
    run = run_definition(
        template,
        auto_inputs=auto_inputs,
        resolved_bindings=[],
        input_overrides=overrides,
        result_override=override_to_flowchart(result_override),
    )
    payload = map_flowchart_run_to_taxable(run, result_override=result_override)
    payload["input_override_keys"] = keys
    return payload


def run_for_client(
    firm_id: str,
    client: Mapping[str, Any],
    *,
    as_of: str | None = None,
) -> dict[str, Any]:
    from services.flowchart_engine import run_template_for_client

    template = _consumption_template(firm_id)
    draft = load_draft(firm_id, str(client.get("id") or ""), CONSUMPTION_TAXABLE_TEMPLATE_ID)
    run = run_template_for_client(
        template,
        firm_id=firm_id,
        client=client,
        input_overrides=draft.get("input_overrides"),
        result_override=str(draft.get("result_override") or "auto"),
        as_of=as_of,
    )
    payload = map_flowchart_run_to_taxable(run)
    payload["updated_at"] = draft.get("updated_at")
    payload["updated_by"] = draft.get("updated_by")
    payload["client_id"] = client.get("id")
    return payload


def load_manual_state(firm_id: str, client_id: str) -> dict[str, Any]:
    draft = load_draft(firm_id, client_id, CONSUMPTION_TAXABLE_TEMPLATE_ID)
    override = override_from_flowchart(str(draft.get("result_override") or "auto"))
    inputs = draft.get("input_overrides") if isinstance(draft.get("input_overrides"), dict) else {}
    cleaned = {k: inputs[k] for k in INPUT_OVERRIDE_KEYS if k in inputs}
    return {
        "result_override": override,
        "input_overrides": cleaned,
        "updated_at": draft.get("updated_at"),
        "updated_by": draft.get("updated_by"),
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
    draft = save_draft(
        firm_id,
        client_id,
        CONSUMPTION_TAXABLE_TEMPLATE_ID,
        result_override=override_to_flowchart(result_override),
        input_overrides=cleaned,
        updated_by=updated_by,
    )
    return {
        "result_override": result_override,
        "input_overrides": cleaned,
        "updated_at": draft.get("updated_at"),
        "updated_by": draft.get("updated_by"),
    }
