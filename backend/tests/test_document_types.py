"""書類種別マスタ (document_types.yaml) のテスト。"""

from __future__ import annotations

import pytest

from services.document_types import (
    catalog_spec_for_type,
    list_catalog_enabled_types,
    list_types,
    load_document_types_config,
    reload_document_types_config,
    resolve_type_id_from_maps_to,
)


def test_load_document_types_config() -> None:
    cfg = load_document_types_config()
    assert cfg["version"] >= 1
    assert len(cfg["types"]) >= 6


def test_list_types_has_expected_ids() -> None:
    ids = {t["id"] for t in list_types()}
    assert "tax_return_corporate" in ids
    assert "ledger" in ids
    assert "bank_statement" in ids


def test_catalog_enabled_subset() -> None:
    enabled = {t["id"] for t in list_catalog_enabled_types()}
    assert "tax_return_corporate" in enabled
    assert "ledger" not in enabled
    assert "bank_statement" not in enabled


def test_catalog_spec_for_corporate_tax() -> None:
    spec = catalog_spec_for_type("tax_return_corporate")
    assert spec is not None
    assert spec["label"] == "法人税申告書"
    assert "taxable_revenue" in spec["metrics"]


def test_resolve_type_id_from_maps_to_type_id() -> None:
    assert resolve_type_id_from_maps_to({"type_id": "tax_return_corporate"}) == "tax_return_corporate"


def test_resolve_type_id_from_maps_to_category_alias() -> None:
    assert resolve_type_id_from_maps_to({"category": "corp_tax"}) == "tax_return_corporate"


def test_resolve_type_id_from_maps_to_slot_label_alias() -> None:
    assert resolve_type_id_from_maps_to({"slot_label": "法人税申告書"}) == "tax_return_corporate"


def test_reload_document_types_config() -> None:
    reload_document_types_config()
    assert len(list_types()) >= 6


def test_document_catalog_service_uses_document_types() -> None:
    from services.document_catalog_service import list_all_catalog_field_defs, list_catalog_field_defs

    all_defs = list_all_catalog_field_defs()
    assert len(all_defs) >= 4
    corp = list_catalog_field_defs("tax_return_corporate")
    assert corp is not None
    assert corp["category_id"] == "tax_return_corporate"
