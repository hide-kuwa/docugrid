"""auto_vouch_fields マスタのテスト。"""

from services.auto_vouch_fields import (
    get_field_def,
    list_auto_vouch_fields,
    resolve_context_hint,
    suggest_from_metric,
)


def test_list_auto_vouch_fields_not_empty() -> None:
    fields = list_auto_vouch_fields()
    assert len(fields) >= 5
    assert fields[0]["field_id"]


def test_resolve_context_hint_from_field_id() -> None:
    hint = resolve_context_hint("acct.payable", None)
    assert hint == "請求"


def test_resolve_context_hint_explicit_wins() -> None:
    hint = resolve_context_hint("acct.payable", "御請求")
    assert hint == "御請求"


def test_get_field_def_unknown() -> None:
    assert get_field_def("unknown.field") is None


def test_suggest_from_metric_monthly_revenue() -> None:
    s = suggest_from_metric(metric_key="monthly.revenue", value_yen=1_250_000)
    assert s is not None
    assert s["field_id"] == "acct.revenue"
    assert s["target_value"] == "1,250,000"
    assert s["document_ref"]["slot_id"] == "monthly_trial_balance"


def test_suggest_from_metric_annual_profit() -> None:
    s = suggest_from_metric(metric_key="annual.profit", value_yen=500_000)
    assert s is not None
    assert s["field_id"] == "tax.taxable_profit"
    assert s["document_ref"]["slot_id"] == "tax_return_corporate"


def test_suggest_from_metric_unknown() -> None:
    assert suggest_from_metric(metric_key="unknown.metric", value_yen=100) is None
    assert suggest_from_metric(metric_key="monthly.revenue") is None
