"""書類カテゴリ（中分類 document_categories.yaml）のテスト。"""

from __future__ import annotations

from services.document_categories import (
    categorize_form,
    config_summary,
    list_categories,
    list_categories_with_forms,
    load_document_categories_config,
)


def test_load_document_categories_config() -> None:
    cfg = load_document_categories_config()
    assert cfg["version"] >= 1
    ids = {c["id"] for c in cfg["categories"]}
    assert {"corp_tax", "consumption_tax", "account_breakdown", "ledger"} <= ids


def test_summary_matches_config() -> None:
    summary = config_summary()
    assert summary["category_count"] == len(list_categories())


def test_categorize_form_by_tax_type() -> None:
    assert categorize_form({"tax_type": "CORP_TAX_RETURN"}) == "corp_tax"
    assert categorize_form({"tax_type": "CONSUMPTION_TAX"}) == "consumption_tax"
    assert categorize_form({"tax_type": "ACCOUNT_DETAILS"}) == "account_breakdown"


def test_categorize_form_by_type_id() -> None:
    assert categorize_form({"type_id": "articles_of_incorporation"}) == "articles_registry"


def test_categorize_form_explicit_category_wins() -> None:
    assert categorize_form({"category": "corp_tax"}) == "corp_tax"


def test_categorize_form_none_for_empty() -> None:
    assert categorize_form(None) is None
    assert categorize_form({"tax_type": None, "slot_label": None}) is None


def test_list_categories_with_forms_buckets_and_unmatched() -> None:
    forms = [
        {"form_id": "cover", "label_ja": "表紙", "maps_to": {"tax_type": None}},
        {"form_id": "b1", "label_ja": "別表一", "maps_to": {"tax_type": "CORP_TAX_RETURN"}},
        {"form_id": "cons", "label_ja": "消費税", "maps_to": {"slot_label": "消費税申告書"}},
    ]
    data = list_categories_with_forms(forms)
    by_id = {c["id"]: c for c in data["categories"]}
    assert by_id["corp_tax"]["form_count"] == 1
    assert by_id["consumption_tax"]["form_count"] == 1
    assert data["unmatched_count"] == 1
    assert data["unmatched"][0]["form_id"] == "cover"
