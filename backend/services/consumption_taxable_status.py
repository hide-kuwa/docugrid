"""消費税の課税事業者判定（簡易）。

日本の消費税法における納税義務の免除（2年前基準期間・特定期間・新設法人等）を
OR 条件で簡易判定する。テナントデータには触れない（顧問先紐付けは
consumption_taxable_client.py）。

これは製品仕様どおりの簡易チェッカーであり、2割特例・調整対象固定資産の
個別期間・基準期間の厳密な暦年/事業年度対応などは扱わない。
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, fields, replace
from typing import Any, Literal, Mapping, Sequence

# 基準期間・特定期間は「1,000万円を超える」（超過）。設立資本金は「1,000万円以上」。
SALES_THRESHOLD_EXCLUSIVE = 10_000_000
CAPITAL_THRESHOLD_INCLUSIVE = 10_000_000

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
MESSAGE_MANUAL_TAXABLE = "手動設定により消費税課税事業者として扱います。"
MESSAGE_MANUAL_EXEMPT = "手動設定により免税事業者として扱います。"

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


@dataclass(frozen=True)
class TaxableStatusResult:
    is_taxable: bool
    matched_conditions: tuple[str, ...]
    message: str

    def as_dict(self) -> dict[str, object]:
        return {
            "is_taxable": self.is_taxable,
            "matched_conditions": list(self.matched_conditions),
            "message": self.message,
        }


def _yen(value: int) -> str:
    return f"{int(value):,}円"


def _bool_ja(value: bool) -> str:
    return "該当" if value else "非該当"


def evaluate_taxable_status(inp: TaxableStatusInput) -> TaxableStatusResult:
    """いずれか1条件でも満たせば課税事業者。該当理由はすべて返す。"""
    matched: list[str] = []

    # 1. 適格請求書発行事業者の登録がある
    if inp.is_invoice_registered:
        matched.append(CONDITION_INVOICE_REGISTERED)

    # 2. 課税事業者選択届出書を提出している
    if inp.has_voluntary_election:
        matched.append(CONDITION_VOLUNTARY_ELECTION)

    # 3. 基準期間の課税売上高が 1,000 万円を超える
    if inp.base_period_sales > SALES_THRESHOLD_EXCLUSIVE:
        matched.append(CONDITION_BASE_PERIOD_SALES)

    # 4. 特定期間の課税売上高と給与等支払額がともに 1,000 万円を超える
    #    （いずれか一方が 1,000 万円以下なら、この要件では免税を維持できる）
    if (
        inp.specified_period_sales > SALES_THRESHOLD_EXCLUSIVE
        and inp.specified_period_salaries > SALES_THRESHOLD_EXCLUSIVE
    ):
        matched.append(CONDITION_SPECIFIED_PERIOD)

    # 5. 新設法人: 設立時資本金が 1,000 万円以上（法人のみ）
    if inp.entity_type == "corporate" and inp.initial_capital >= CAPITAL_THRESHOLD_INCLUSIVE:
        matched.append(CONDITION_NEW_CORPORATE_CAPITAL)

    # 6. 特定新規設立法人（親会社の基準期間売上 5 億円超など）
    if inp.is_special_new_corporate:
        matched.append(CONDITION_SPECIAL_NEW_CORPORATE)

    # 7. 高額特定資産の取得による免税事業者への移行制限期間中
    if inp.has_high_value_asset_restriction:
        matched.append(CONDITION_HIGH_VALUE_ASSET)

    # 8. 課税事業者からの事業承継・合併等
    if inp.has_taxable_inheritance:
        matched.append(CONDITION_TAXABLE_INHERITANCE)

    is_taxable = bool(matched)
    return TaxableStatusResult(
        is_taxable=is_taxable,
        matched_conditions=tuple(matched),
        message=MESSAGE_TAXABLE if is_taxable else MESSAGE_EXEMPT,
    )


def evaluate_taxable_status_from_fields(
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
) -> TaxableStatusResult:
    return evaluate_taxable_status(
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


def known_condition_ids() -> Sequence[str]:
    return tuple(spec["id"] for spec in CONDITION_SPECS)


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


def apply_result_override(
    auto_result: TaxableStatusResult,
    result_override: ResultOverride = "auto",
) -> tuple[TaxableStatusResult, Literal["auto", "manual"]]:
    """最終結果は手動優先。auto のときは自動判定をそのまま採用。"""
    if result_override == "taxable":
        return (
            TaxableStatusResult(
                is_taxable=True,
                matched_conditions=auto_result.matched_conditions,
                message=MESSAGE_MANUAL_TAXABLE,
            ),
            "manual",
        )
    if result_override == "exempt":
        return (
            TaxableStatusResult(
                is_taxable=False,
                matched_conditions=(),
                message=MESSAGE_MANUAL_EXEMPT,
            ),
            "manual",
        )
    return auto_result, "auto"


def _doc(period_key: str, slot_id: str, label: str) -> dict[str, str]:
    return {"period_key": period_key, "slot_id": slot_id, "label": label}


CONDITION_SPECS: tuple[dict[str, Any], ...] = (
    {
        "id": CONDITION_INVOICE_REGISTERED,
        "label": "インボイス登録",
        "rule": "適格請求書発行事業者として登録している",
        "kind": "flag",
        "documents": (_doc("year:1", "tax_return_consumption", "消費税申告書"),),
    },
    {
        "id": CONDITION_VOLUNTARY_ELECTION,
        "label": "課税事業者選択届出",
        "rule": "課税事業者選択届出書を提出している",
        "kind": "flag",
        "documents": (_doc("year:1", "tax_return_consumption", "消費税申告書"),),
    },
    {
        "id": CONDITION_BASE_PERIOD_SALES,
        "label": "基準期間の課税売上高",
        "rule": "基準期間の課税売上高が 1,000 万円を超える",
        "kind": "threshold",
        "documents": (_doc("year:2", "tax_return_consumption", "基準期間の消費税申告書"),),
    },
    {
        "id": CONDITION_SPECIFIED_PERIOD,
        "label": "特定期間（売上かつ給与）",
        "rule": "特定期間の課税売上高と給与等支払額がともに 1,000 万円を超える",
        "kind": "threshold",
        "documents": (
            _doc("year:1", "financial_report", "決算報告書"),
            _doc("month:1", "payroll_ledger", "給与台帳"),
        ),
    },
    {
        "id": CONDITION_NEW_CORPORATE_CAPITAL,
        "label": "新設法人の資本金",
        "rule": "法人かつ設立時資本金が 1,000 万円以上",
        "kind": "threshold",
        "documents": (
            _doc("perm", "articles_of_incorporation", "定款"),
            _doc("perm", "corporate_registry", "履歴事項全部証明書"),
        ),
    },
    {
        "id": CONDITION_SPECIAL_NEW_CORPORATE,
        "label": "特定新規設立法人",
        "rule": "特定新規設立法人（親会社の基準期間売上 5 億円超など）に該当する",
        "kind": "flag",
        "documents": (_doc("perm", "articles_of_incorporation", "定款"),),
    },
    {
        "id": CONDITION_HIGH_VALUE_ASSET,
        "label": "高額特定資産の制限",
        "rule": "高額特定資産の取得による免税移行制限期間中",
        "kind": "flag",
        "documents": (_doc("year:1", "financial_report", "決算報告書"),),
    },
    {
        "id": CONDITION_TAXABLE_INHERITANCE,
        "label": "事業承継・合併等",
        "rule": "課税事業者からの事業承継・合併等に該当する",
        "kind": "flag",
        "documents": (_doc("perm", "articles_of_incorporation", "定款"),),
    },
)


def explain_conditions(inp: TaxableStatusInput) -> list[dict[str, Any]]:
    """フローチャート用: 各条件の成否と数値のもとを返す。"""
    auto = evaluate_taxable_status(inp)
    matched = set(auto.matched_conditions)
    rows: list[dict[str, Any]] = []
    for spec in CONDITION_SPECS:
        cid = spec["id"]
        facts: list[dict[str, Any]]
        if cid == CONDITION_INVOICE_REGISTERED:
            facts = [
                {
                    "id": "is_invoice_registered",
                    "label": "インボイス登録",
                    "value": inp.is_invoice_registered,
                    "display": _bool_ja(inp.is_invoice_registered),
                    "kind": "flag",
                }
            ]
        elif cid == CONDITION_VOLUNTARY_ELECTION:
            facts = [
                {
                    "id": "has_voluntary_election",
                    "label": "選択届出",
                    "value": inp.has_voluntary_election,
                    "display": _bool_ja(inp.has_voluntary_election),
                    "kind": "flag",
                }
            ]
        elif cid == CONDITION_BASE_PERIOD_SALES:
            facts = [
                {
                    "id": "base_period_sales",
                    "label": "基準期間の課税売上高",
                    "value": inp.base_period_sales,
                    "display": _yen(inp.base_period_sales),
                    "kind": "yen",
                    "threshold": SALES_THRESHOLD_EXCLUSIVE,
                    "comparison": ">",
                }
            ]
        elif cid == CONDITION_SPECIFIED_PERIOD:
            facts = [
                {
                    "id": "specified_period_sales",
                    "label": "特定期間の課税売上高",
                    "value": inp.specified_period_sales,
                    "display": _yen(inp.specified_period_sales),
                    "kind": "yen",
                    "threshold": SALES_THRESHOLD_EXCLUSIVE,
                    "comparison": ">",
                },
                {
                    "id": "specified_period_salaries",
                    "label": "特定期間の給与等支払額",
                    "value": inp.specified_period_salaries,
                    "display": _yen(inp.specified_period_salaries),
                    "kind": "yen",
                    "threshold": SALES_THRESHOLD_EXCLUSIVE,
                    "comparison": ">",
                },
            ]
        elif cid == CONDITION_NEW_CORPORATE_CAPITAL:
            facts = [
                {
                    "id": "entity_type",
                    "label": "事業者区分",
                    "value": inp.entity_type or "",
                    "display": (
                        "法人"
                        if inp.entity_type == "corporate"
                        else "個人"
                        if inp.entity_type == "individual"
                        else "未指定"
                    ),
                    "kind": "text",
                },
                {
                    "id": "initial_capital",
                    "label": "設立時資本金",
                    "value": inp.initial_capital,
                    "display": _yen(inp.initial_capital),
                    "kind": "yen",
                    "threshold": CAPITAL_THRESHOLD_INCLUSIVE,
                    "comparison": ">=",
                },
            ]
        elif cid == CONDITION_SPECIAL_NEW_CORPORATE:
            facts = [
                {
                    "id": "is_special_new_corporate",
                    "label": "特定新規設立法人",
                    "value": inp.is_special_new_corporate,
                    "display": _bool_ja(inp.is_special_new_corporate),
                    "kind": "flag",
                }
            ]
        elif cid == CONDITION_HIGH_VALUE_ASSET:
            facts = [
                {
                    "id": "has_high_value_asset_restriction",
                    "label": "高額特定資産の制限期間",
                    "value": inp.has_high_value_asset_restriction,
                    "display": _bool_ja(inp.has_high_value_asset_restriction),
                    "kind": "flag",
                }
            ]
        else:
            facts = [
                {
                    "id": "has_taxable_inheritance",
                    "label": "事業承継・合併等",
                    "value": inp.has_taxable_inheritance,
                    "display": _bool_ja(inp.has_taxable_inheritance),
                    "kind": "flag",
                }
            ]
        rows.append(
            {
                "id": cid,
                "label": spec["label"],
                "rule": spec["rule"],
                "kind": spec["kind"],
                "matched": cid in matched,
                "facts": facts,
                "documents": [dict(d) for d in spec["documents"]],
            }
        )
    return rows


def explain_taxable_status(
    inp: TaxableStatusInput,
    *,
    result_override: ResultOverride = "auto",
    input_override_keys: Sequence[str] | None = None,
) -> dict[str, Any]:
    auto = evaluate_taxable_status(inp)
    effective, source = apply_result_override(auto, result_override)
    payload = effective.as_dict()
    payload.update(
        {
            "auto_is_taxable": auto.is_taxable,
            "auto_matched_conditions": list(auto.matched_conditions),
            "result_override": result_override,
            "result_source": source,
            "conditions": explain_conditions(inp),
            "inputs": asdict(inp),
            "input_override_keys": list(input_override_keys or ()),
        }
    )
    return payload
