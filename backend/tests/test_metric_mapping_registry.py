"""metric_mapping_registry と auto_vouch 連携."""

from __future__ import annotations

import pytest

from services import metric_mapping_registry as mmr
from services.auto_vouch_fields import refresh_metric_index, suggest_from_metric
from services.metric_mapping_registry import (
    create_mapping,
    delete_mapping,
    get_mapping,
    import_csv_text,
    list_mappings,
    load_metric_mappings_config,
    reload_metric_mappings_config,
)

SAMPLE_YAML = """version: 1
mappings:
  - metric_key: monthly.revenue
    label_ja: 月次売上
    field_id: acct.revenue
    account_code: "4110"
    account_name: 売上高
    slot_id: monthly_trial_balance
    period_key: month:1
    document_label: 月次試算表
    status: active
  - metric_key: annual.profit
    label_ja: 利益
    field_id: tax.taxable_profit
    slot_id: tax_return_corporate
    period_key: year:1
    status: active
"""


@pytest.fixture
def mappings_config(tmp_path, monkeypatch):
    path = tmp_path / "metric_mappings.yaml"
    path.write_text(SAMPLE_YAML, encoding="utf-8")
    monkeypatch.setattr(mmr, "_CONFIG_PATH", path)
    reload_metric_mappings_config()
    refresh_metric_index()
    return path


def test_load_mappings(mappings_config) -> None:
    cfg = load_metric_mappings_config()
    assert len(cfg["mappings"]) == 2


def test_get_mapping(mappings_config) -> None:
    row = get_mapping("monthly.revenue")
    assert row is not None
    assert row["account_code"] == "4110"


def test_create_mapping(mappings_config) -> None:
    create_mapping(
        {
            "metric_key": "monthly.sales_index",
            "label_ja": "売上指数",
            "field_id": "acct.revenue",
            "status": "planned",
        }
    )
    refresh_metric_index()
    assert get_mapping("monthly.sales_index") is not None


def test_delete_mapping(mappings_config) -> None:
    delete_mapping("annual.profit")
    refresh_metric_index()
    assert get_mapping("annual.profit") is None


def test_suggest_from_metric_uses_yaml(mappings_config) -> None:
    s = suggest_from_metric(metric_key="monthly.revenue", value_yen=100_000)
    assert s is not None
    assert s["field_id"] == "acct.revenue"
    assert s["document_ref"]["slot_id"] == "monthly_trial_balance"


def test_import_csv_merge(mappings_config) -> None:
    csv = (
        "metric_key,label_ja,field_id,account_code,account_name,slot_id,period_key,document_label,status,notes\n"
        "custom.metric,カスタム,acct.misc,,,,,,planned,\n"
    )
    import_csv_text(csv, mode="merge")
    refresh_metric_index()
    assert len(list_mappings()) == 3
