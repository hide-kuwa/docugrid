"""消費税課税事業者の簡易判定。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from services.consumption_taxable_flowchart import evaluate_from_fields
from services.consumption_taxable_status import (
    CONDITION_BASE_PERIOD_SALES,
    CONDITION_HIGH_VALUE_ASSET,
    CONDITION_INVOICE_REGISTERED,
    CONDITION_NEW_CORPORATE_CAPITAL,
    CONDITION_SPECIAL_NEW_CORPORATE,
    CONDITION_SPECIFIED_PERIOD,
    CONDITION_TAXABLE_INHERITANCE,
    CONDITION_VOLUNTARY_ELECTION,
    MESSAGE_EXEMPT,
    MESSAGE_TAXABLE,
)

client = TestClient(app)

PATH = "/api/check-taxable-status"


def test_defaults_are_not_taxable() -> None:
    result = evaluate_from_fields()
    assert result.is_taxable is False
    assert result.matched_conditions == ()
    assert result.message == MESSAGE_EXEMPT


def test_invoice_registered() -> None:
    result = evaluate_from_fields(is_invoice_registered=True)
    assert result.matched_conditions == (CONDITION_INVOICE_REGISTERED,)


def test_voluntary_election() -> None:
    result = evaluate_from_fields(has_voluntary_election=True)
    assert result.matched_conditions == (CONDITION_VOLUNTARY_ELECTION,)


def test_base_period_sales_must_exceed_10m() -> None:
    at_threshold = evaluate_from_fields(base_period_sales=10_000_000)
    over = evaluate_from_fields(base_period_sales=10_000_001)
    assert at_threshold.is_taxable is False
    assert over.matched_conditions == (CONDITION_BASE_PERIOD_SALES,)


def test_specified_period_requires_both_sales_and_salaries_over_10m() -> None:
    sales_only = evaluate_from_fields(
        specified_period_sales=10_000_001,
        specified_period_salaries=10_000_000,
    )
    salaries_only = evaluate_from_fields(
        specified_period_sales=10_000_000,
        specified_period_salaries=10_000_001,
    )
    both = evaluate_from_fields(
        specified_period_sales=10_000_001,
        specified_period_salaries=10_000_001,
    )
    assert sales_only.is_taxable is False
    assert salaries_only.is_taxable is False
    assert both.matched_conditions == (CONDITION_SPECIFIED_PERIOD,)


def test_new_corporate_capital_is_inclusive_and_corporate_only() -> None:
    individual = evaluate_from_fields(
        entity_type="individual",
        initial_capital=10_000_000,
    )
    under = evaluate_from_fields(
        entity_type="corporate",
        initial_capital=9_999_999,
    )
    at_threshold = evaluate_from_fields(
        entity_type="corporate",
        initial_capital=10_000_000,
    )
    omitted_type = evaluate_from_fields(initial_capital=10_000_000)
    assert individual.is_taxable is False
    assert under.is_taxable is False
    assert omitted_type.is_taxable is False
    assert at_threshold.matched_conditions == (CONDITION_NEW_CORPORATE_CAPITAL,)


def test_flag_conditions() -> None:
    assert evaluate_from_fields(
        is_special_new_corporate=True
    ).matched_conditions == (CONDITION_SPECIAL_NEW_CORPORATE,)
    assert evaluate_from_fields(
        has_high_value_asset_restriction=True
    ).matched_conditions == (CONDITION_HIGH_VALUE_ASSET,)
    assert evaluate_from_fields(
        has_taxable_inheritance=True
    ).matched_conditions == (CONDITION_TAXABLE_INHERITANCE,)


def test_multiple_conditions_are_all_returned() -> None:
    result = evaluate_from_fields(
        is_invoice_registered=True,
        base_period_sales=20_000_000,
    )
    assert result.is_taxable is True
    assert result.matched_conditions == (
        CONDITION_INVOICE_REGISTERED,
        CONDITION_BASE_PERIOD_SALES,
    )
    assert result.message == MESSAGE_TAXABLE


def test_http_empty_body_is_not_taxable() -> None:
    r = client.post(PATH, json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_taxable"] is False
    assert body["matched_conditions"] == []
    assert body["message"] == MESSAGE_EXEMPT
    assert body["result_source"] == "auto"
    assert len(body["conditions"]) == 8
    yen_facts = [
        f
        for c in body["conditions"]
        for f in c["facts"]
        if f["kind"] == "yen"
    ]
    assert yen_facts
    assert all("円" in f["display"] for f in yen_facts)


def test_http_manual_override_wins() -> None:
    r = client.post(
        PATH,
        json={"is_invoice_registered": True, "result_override": "exempt"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["auto_is_taxable"] is True
    assert body["is_taxable"] is False
    assert body["result_source"] == "manual"
    assert body["matched_conditions"] == []


def test_http_matches_example_payload() -> None:
    r = client.post(
        PATH,
        json={
            "is_invoice_registered": True,
            "base_period_sales": 12_000_000,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_taxable"] is True
    assert body["matched_conditions"] == [
        CONDITION_INVOICE_REGISTERED,
        CONDITION_BASE_PERIOD_SALES,
    ]
    assert body["message"] == MESSAGE_TAXABLE


def test_http_rejects_invalid_entity_type() -> None:
    r = client.post(PATH, json={"entity_type": "partnership"})
    assert r.status_code == 422


def test_http_rejects_negative_sales() -> None:
    r = client.post(PATH, json={"base_period_sales": -1})
    assert r.status_code == 422


def test_http_does_not_require_csrf() -> None:
    r = client.post(PATH, json={"has_voluntary_election": True})
    assert r.status_code == 200, r.text
    assert r.json()["matched_conditions"] == [CONDITION_VOLUNTARY_ELECTION]


def test_merge_overrides_only_provided_keys() -> None:
    from services.consumption_taxable_status import TaxableStatusInput, merge_input_overrides

    auto = TaxableStatusInput(base_period_sales=1_000_000, is_invoice_registered=False)
    merged = merge_input_overrides(auto, {"is_invoice_registered": True})
    assert merged.base_period_sales == 1_000_000
    assert merged.is_invoice_registered is True


@pytest.fixture(autouse=True)
def enable_header_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")


@pytest.fixture
def taxable_store(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("services.flowchart_instances.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("services.flowchart_templates.STORAGE_DIR", tmp_path)
    yield tmp_path


def test_client_status_auto_then_manual_wins(taxable_store) -> None:
    from tests.test_smoke import _admin_headers

    got = client.get(
        "/api/clients/c1/consumption-taxable-status",
        headers=_admin_headers(),
    )
    assert got.status_code == 200, got.text
    body = got.json()
    assert "conditions" in body
    assert body["result_override"] == "auto"

    saved = client.put(
        "/api/clients/c1/consumption-taxable-status",
        headers=_admin_headers(),
        json={
            "result_override": "taxable",
            "input_overrides": {"is_invoice_registered": True},
        },
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["is_taxable"] is True
    assert saved.json()["result_source"] == "manual"
    assert "is_invoice_registered" in saved.json()["input_override_keys"]

    again = client.get(
        "/api/clients/c1/consumption-taxable-status",
        headers=_admin_headers(),
    )
    assert again.json()["result_override"] == "taxable"


def test_client_status_rejects_unknown_client() -> None:
    from tests.test_smoke import _admin_headers

    r = client.get(
        "/api/clients/not-a-real-client/consumption-taxable-status",
        headers=_admin_headers(),
    )
    assert r.status_code in (403, 404)

