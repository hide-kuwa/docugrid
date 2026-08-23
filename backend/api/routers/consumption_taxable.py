"""消費税課税事業者の簡易判定 API（公開・テナントデータ非参照）。"""

from __future__ import annotations

from typing import Any, Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from services.consumption_taxable_status import (
    TaxableStatusInput,
    explain_taxable_status,
)

router = APIRouter(tags=["consumption-tax"])


class CheckTaxableStatusBody(BaseModel):
    entity_type: Optional[Literal["individual", "corporate"]] = Field(
        default=None,
        description="個人 (individual) または法人 (corporate)。未指定時は資本金要件を適用しない。",
    )
    base_period_sales: int = Field(default=0, ge=0, description="基準期間の課税売上高（円）")
    specified_period_sales: int = Field(default=0, ge=0, description="特定期間の課税売上高（円）")
    specified_period_salaries: int = Field(default=0, ge=0, description="特定期間の給与等支払額（円）")
    is_invoice_registered: bool = Field(default=False, description="インボイス発行事業者の登録有無")
    has_voluntary_election: bool = Field(default=False, description="課税事業者選択届出書の提出有無")
    initial_capital: int = Field(default=0, ge=0, description="設立時の資本金（円）。法人のみ参照")
    is_special_new_corporate: bool = Field(default=False, description="特定新規設立法人に該当するか")
    has_high_value_asset_restriction: bool = Field(
        default=False,
        description="高額特定資産の取得による免税移行制限期間中か",
    )
    has_taxable_inheritance: bool = Field(
        default=False,
        description="課税事業者からの事業承継・合併等に該当するか",
    )
    result_override: Literal["auto", "taxable", "exempt"] = Field(
        default="auto",
        description="最終判定の手動上書き。manual が auto より優先。",
    )


class CheckTaxableStatusPayload(BaseModel):
    is_taxable: bool
    matched_conditions: list[str]
    message: str
    auto_is_taxable: bool = False
    auto_matched_conditions: list[str] = Field(default_factory=list)
    result_override: Literal["auto", "taxable", "exempt"] = "auto"
    result_source: Literal["auto", "manual"] = "auto"
    conditions: list[dict[str, Any]] = Field(default_factory=list)
    inputs: dict[str, Any] = Field(default_factory=dict)
    input_override_keys: list[str] = Field(default_factory=list)


@router.post("/api/check-taxable-status", response_model=CheckTaxableStatusPayload)
def check_taxable_status(body: CheckTaxableStatusBody | None = None) -> CheckTaxableStatusPayload:
    """消費税課税事業者に該当するかを簡易判定する。未指定項目は false / 0。"""
    body = body or CheckTaxableStatusBody()
    payload = explain_taxable_status(
        TaxableStatusInput(
            entity_type=body.entity_type,
            base_period_sales=body.base_period_sales,
            specified_period_sales=body.specified_period_sales,
            specified_period_salaries=body.specified_period_salaries,
            is_invoice_registered=body.is_invoice_registered,
            has_voluntary_election=body.has_voluntary_election,
            initial_capital=body.initial_capital,
            is_special_new_corporate=body.is_special_new_corporate,
            has_high_value_asset_restriction=body.has_high_value_asset_restriction,
            has_taxable_inheritance=body.has_taxable_inheritance,
        ),
        result_override=body.result_override,
    )
    return CheckTaxableStatusPayload.model_validate(payload)
