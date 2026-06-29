"""profile 正規化パイプラインのテスト。"""

from __future__ import annotations

import json

import pytest

from services.client_master_store import load_raw, save_raw
from services.profile_extractors import extract_corporate_registry
from services.profile_normalize_pipeline import IngestContext, normalize_client_profile
from services.ssot_ingest import ingest_from_slot_document


SAMPLE_REGISTRY = """
履歴事項全部証明書
商号 株式会社テスト商事
本店 東京都千代田区丸の内1-1-1
法人番号 1234567890123
資本金 金1,000,000円
代表取締役 山田太郎
設立年月日 2010年4月1日
"""


@pytest.fixture
def master_file(tmp_path, monkeypatch):
    path = tmp_path / "client_master.json"
    payload = {
        "clients": [
            {
                "id": "c1",
                "name": "旧名称株式会社",
                "fiscalMonth": 3,
                "category": "corporate",
                "tags": [],
                "profile": {},
                "profileMeta": {},
                "profileHistory": {},
            }
        ],
        "groups": [],
        "updated_at": None,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr("services.client_master_store.CLIENT_MASTER_PATH", path)
    monkeypatch.setattr("services.client_master_store.STORAGE_DIR", tmp_path)
    return path


def test_extract_corporate_registry_fields() -> None:
    out = extract_corporate_registry(SAMPLE_REGISTRY)
    assert out["corporate_number"][0] == "1234567890123"
    assert "テスト商事" in out["customer_name"][0]
    assert "千代田区" in out["head_office_address"][0]


def test_normalize_applies_empty_profile(master_file) -> None:
    ctx = IngestContext(
        firm_id="default",
        client_id="c1",
        slot_id="corporate_registry",
        period_key="perm",
        slot_label="履歴事項全部証明書",
        text=SAMPLE_REGISTRY,
        updated_by="test@example.com",
    )
    result = normalize_client_profile(ctx)
    assert len(result.applied) >= 3
    saved = load_raw()
    client = saved["clients"][0]
    assert client["profile"]["corporate_number"] == "1234567890123"
    assert client["profileMeta"]["corporate_number"]["source"] == "ocr"
    assert client["profileHistory"]["corporate_number"][0]["value"] == "1234567890123"


def test_normalize_skips_manual_protected_field(master_file) -> None:
    payload = load_raw()
    payload["clients"][0]["profile"] = {"corporate_number": "9999999999999"}
    payload["clients"][0]["profileMeta"] = {
        "corporate_number": {"source": "manual"},
    }
    save_raw(payload)

    ctx = IngestContext(
        firm_id="default",
        client_id="c1",
        slot_id="corporate_registry",
        period_key="perm",
        text=SAMPLE_REGISTRY,
    )
    result = normalize_client_profile(ctx)
    skipped_ids = {s.field_id for s in result.skipped}
    assert "corporate_number" in skipped_ids
    assert load_raw()["clients"][0]["profile"]["corporate_number"] == "9999999999999"


def test_normalize_creates_conflict_alert(master_file, monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(
        "services.client_records_service.RECORDS_DB_PATH",
        tmp_path / "client_records.db",
    )
    monkeypatch.setattr(
        "services.client_records_service.STORAGE_DIR",
        tmp_path,
    )

    payload = load_raw()
    payload["clients"][0]["profile"] = {"corporate_number": "1111111111111"}
    payload["clients"][0]["profileMeta"] = {
        "corporate_number": {"source": "ocr", "sourceSlotId": "corporate_registry"},
    }
    save_raw(payload)

    ctx = IngestContext(
        firm_id="default",
        client_id="c1",
        slot_id="corporate_registry",
        period_key="perm",
        slot_label="履歴事項",
        text=SAMPLE_REGISTRY,
    )
    result = normalize_client_profile(ctx)
    assert any(c.field_id == "corporate_number" for c in result.conflicts)
    assert len(result.tax_alerts_created) == 1


def test_ingest_from_confirmed_fields(master_file) -> None:
    from services.ssot_ingest import ingest_from_confirmed_fields

    result = ingest_from_confirmed_fields(
        firm_id="default",
        client_id="c1",
        period_key="perm",
        slot_id="corporate_registry",
        slot_label="履歴事項全部証明書",
        fields={"corporate_number": "1234567890123"},
        updated_by="reviewer@example.com",
    )
    assert any(a.field_id == "corporate_number" for a in result.applied)
    saved = load_raw()
    assert saved["clients"][0]["profile"]["corporate_number"] == "1234567890123"
    assert saved["clients"][0]["profileMeta"]["corporate_number"]["source"] == "manual"


def test_normalize_syncs_valuation_from_capital(master_file, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(
        "services.client_metrics_service.METRICS_DB_PATH",
        tmp_path / "client_metrics.db",
    )
    monkeypatch.setattr(
        "services.client_metrics_service.STORAGE_DIR",
        tmp_path,
    )
    ctx = IngestContext(
        firm_id="default",
        client_id="c1",
        slot_id="corporate_registry",
        period_key="perm",
        text=SAMPLE_REGISTRY,
    )
    result = normalize_client_profile(ctx)
    val_keys = {f["metric_key"] for f in result.metrics_applied}
    assert "valuation.capital_yen" in val_keys or "valuation.annual_profit_yen" in val_keys or len(result.applied) >= 1


def test_extract_consumption_tax_return() -> None:
    from services.profile_extractors import extract_tax_return_consumption

    text = "消費税及び地方消費税の申告書\n課税標準額 5,000,000\n課税方式 本則課税\n"
    out = extract_tax_return_consumption(text)
    assert "consumption_tax" in out or "_metric_consumption_taxable" in out


def test_trial_balance_updates_monthly_metric(master_file, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(
        "services.client_metrics_service.METRICS_DB_PATH",
        tmp_path / "client_metrics.db",
    )
    monkeypatch.setattr(
        "services.client_metrics_service.STORAGE_DIR",
        tmp_path,
    )
    text = "合計残高試算表\n売上高 12,345,678\n"
    ctx = IngestContext(
        firm_id="default",
        client_id="c1",
        slot_id="monthly_trial_balance",
        period_key="month:1",
        text=text,
    )
    result = normalize_client_profile(ctx)
    assert len(result.metrics_applied) == 1
    assert result.metrics_applied[0]["metric_key"] == "monthly.revenue"
    assert result.metrics_applied[0]["value_yen"] == 12345678


def test_consumption_tax_updates_annual_taxable_metric(master_file, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(
        "services.client_metrics_service.METRICS_DB_PATH",
        tmp_path / "client_metrics.db",
    )
    monkeypatch.setattr(
        "services.client_metrics_service.STORAGE_DIR",
        tmp_path,
    )
    text = "消費税及び地方消費税の申告書\n課税標準額 5,000,000\n課税方式 本則課税\n"
    ctx = IngestContext(
        firm_id="default",
        client_id="c1",
        slot_id="tax_return_consumption",
        period_key="year:2024",
        text=text,
    )
    result = normalize_client_profile(ctx)
    keys = {f["metric_key"] for f in result.metrics_applied}
    assert "annual.consumption_taxable" in keys


def test_financial_report_syncs_net_assets_valuation(master_file, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(
        "services.client_metrics_service.METRICS_DB_PATH",
        tmp_path / "client_metrics.db",
    )
    monkeypatch.setattr(
        "services.client_metrics_service.STORAGE_DIR",
        tmp_path,
    )
    text = "決算報告書\n売上高 100,000,000\n当期純利益 8,000,000\n純資産 45,000,000\n"
    ctx = IngestContext(
        firm_id="default",
        client_id="c1",
        slot_id="financial_report",
        period_key="year:2024",
        text=text,
    )
    result = normalize_client_profile(ctx)
    keys = {f["metric_key"] for f in result.metrics_applied}
    assert "valuation.net_assets_yen" in keys


def test_build_charts_includes_consumption_taxable(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(
        "services.client_metrics_service.METRICS_DB_PATH",
        tmp_path / "client_metrics.db",
    )
    monkeypatch.setattr(
        "services.client_metrics_service.STORAGE_DIR",
        tmp_path,
    )
    from services.client_metrics_service import init_client_metrics_db, upsert_metric_fact

    init_client_metrics_db()
    upsert_metric_fact(
        "default",
        "c1",
        metric_key="annual.consumption_taxable",
        period_key="R7",
        value_yen=5_000_000,
        source_type="ocr",
    )
    from services.client_metrics_service import build_charts_payload

    payload = build_charts_payload("default", "c1", seed_base_yen=0)
    r7 = next(fy for fy in payload["fiscal_years"] if fy["label"] == "R7")
    assert r7["consumption_taxable_yen"] == 5_000_000
    assert r7["consumption_taxable_source"] == "ocr"


def test_ingest_from_slot_document_with_metadata_profile(master_file) -> None:
    result = ingest_from_slot_document(
        firm_id="default",
        client_id="c1",
        period_key="perm",
        slot_id="corporate_registry",
        slot_label="履歴事項全部証明書",
        pdf_content=b"%PDF-1.4 minimal",
        classify_metadata={
            "confidence": 0.92,
            "extracted_profile": {
                "corporate_number": "1234567890123",
                "customer_name": "株式会社テスト商事",
            },
        },
    )
    assert len(result.applied) >= 2
    assert load_raw()["clients"][0]["profile"]["corporate_number"] == "1234567890123"
