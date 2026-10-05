"""消費税の課税事業者判定（簡易）。

日本の消費税法における納税義務の免除（2年前基準期間・特定期間・新設法人等）を
OR 条件で簡易判定する。テナントデータには触れない（顧問先紐付けは
consumption_taxable_client.py）。

判定ロジックの SSOT は flowchart テンプレート（CONSUMPTION_TAXABLE_DEFINITION）。
本モジュールは入力型・定数・手動上書きのマージのみを提供する。
"""

from __future__ import annotations

from dataclasses import dataclass, fields, replace
from typing import Any, Literal, Mapping, Sequence

EntityType = Literal["individual", "corporate"]
ResultOverride = Literal["auto", "taxable", "exempt"]

CONDITION_INVOICE_REGISTERED = "invoice_registered"
CONDITION_VOLUNTARY_ELECTION = "voluntary_election"
CONDITION_BASE_PERIOD_SALES = "base_period_sales_exceeded"
CONDITION_SPECIFIED_PERIOD = "specified_period_sales_and_salaries_exceeded"
CONDITION_NEW_CORPORATE_CAPITAL = "new_corporate_capital"
CONDITION_SPECIAL_NEW_CORPORATE = "special_new_corporate"
CONDITION_HIGH_VALUE_ASSET = "high_value_asset_restriction"
CONDITION_TAXABLE_INHERITANCE = "taxable_inheritance"

MESSAGE_TAXABLE = "消費税課税事業者に該当します。"
MESSAGE_EXEMPT = "消費税課税事業者に該当しません。"

INPUT_OVERRIDE_KEYS = (
    "entity_type",
    "base_period_sales",
    "specified_period_sales",
    "specified_period_salaries",
    "is_invoice_registered",
    "has_voluntary_election",
    "initial_capital",
    "is_special_new_corporate",
    "has_high_value_asset_restriction",
    "has_taxable_inheritance",
)


@dataclass(frozen=True)
class TaxableStatusInput:
    entity_type: EntityType | None = None
    base_period_sales: int = 0
    specified_period_sales: int = 0
    specified_period_salaries: int = 0
    is_invoice_registered: bool = False
    has_voluntary_election: bool = False
    initial_capital: int = 0
    is_special_new_corporate: bool = False
    has_high_value_asset_restriction: bool = False
    has_taxable_inheritance: bool = False


def merge_input_overrides(
    auto: TaxableStatusInput,
    overrides: Mapping[str, Any] | None,
) -> TaxableStatusInput:
    """手動で渡したキーだけ上書きする（未指定キーは自動値のまま）。"""
    if not overrides:
        return auto
    patch: dict[str, Any] = {}
    allowed = {f.name for f in fields(TaxableStatusInput)}
    for key, raw in overrides.items():
        if key not in allowed or raw is None:
            continue
        if key == "entity_type":
            if raw in ("individual", "corporate"):
                patch[key] = raw
            continue
        if key in (
            "base_period_sales",
            "specified_period_sales",
            "specified_period_salaries",
            "initial_capital",
        ):
            try:
                n = int(raw)
            except (TypeError, ValueError):
                continue
            if n >= 0:
                patch[key] = n
            continue
        patch[key] = bool(raw)
    return replace(auto, **patch) if patch else auto


def explain_taxable_status(
    inp: TaxableStatusInput,
    *,
    result_override: ResultOverride = "auto",
    input_override_keys: Sequence[str] | None = None,
) -> dict[str, Any]:
    from services.consumption_taxable_flowchart import explain_via_flowchart

    return explain_via_flowchart(
        inp,
        result_override=result_override,
        input_override_keys=list(input_override_keys or ()),
    )
