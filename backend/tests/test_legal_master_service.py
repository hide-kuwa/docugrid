"""法定マスタサービス."""

from __future__ import annotations

import pytest

from services import legal_master_service as lms
from services.legal_master_service import (
    export_csv_text,
    import_csv_text,
    init_legal_master_db,
    list_entries,
    list_income_tax_brackets,
    lookup_rate,
    seed_from_file,
    validate_csv_text,
)

SAMPLE_CSV = """domain,master_key,label_ja,value_numeric,value_text,jurisdiction,valid_from,valid_to,source_law,attributes_json,master_version_id
consumption_tax,consumption_tax.standard_rate,標準税率,0.10,,,2020-01-01,,法,,test-rate-2020
deduction_amount,deduction.basic,基礎控除,480000,,,2020-01-01,,法,,test-ded-2020
"""


@pytest.fixture
def legal_db(tmp_path, monkeypatch):
    storage = tmp_path / "storage"
    db_path = storage / "legal_master.db"
    seed_path = tmp_path / "seed.csv"
    seed_path.write_text(SAMPLE_CSV, encoding="utf-8")
    monkeypatch.setattr(lms, "STORAGE_DIR", storage)
    monkeypatch.setattr(lms, "LEGAL_MASTER_DB_PATH", db_path)
    monkeypatch.setattr(lms, "SEED_CSV_PATH", seed_path)
    monkeypatch.setattr(lms, "_schema_ready", False)
    import_csv_text(SAMPLE_CSV, mode="replace")
    return db_path


def test_seed_and_lookup_consumption_tax(legal_db) -> None:
    row = lookup_rate("consumption_tax.standard_rate", "2024-06-01")
    assert row is not None
    assert row["value_numeric"] == 0.10


def test_lookup_historical_rate(legal_db) -> None:
    import_csv_text(
        "domain,master_key,label_ja,value_numeric,value_text,jurisdiction,valid_from,valid_to,source_law,attributes_json,master_version_id\n"
        "consumption_tax,consumption_tax.standard_rate,旧税率,0.08,,,2014-04-01,2019-09-30,法,,old-rate\n",
        mode="merge",
    )
    old = lookup_rate("consumption_tax.standard_rate", "2015-01-01")
    new = lookup_rate("consumption_tax.standard_rate", "2020-06-01")
    assert old is not None and old["value_numeric"] == 0.08
    assert new is not None and new["value_numeric"] == 0.10


def test_list_income_tax_brackets(legal_db) -> None:
    import_csv_text(
        "domain,master_key,label_ja,value_numeric,value_text,jurisdiction,valid_from,valid_to,source_law,attributes_json,master_version_id\n"
        'income_tax_bracket,income_tax.bracket.1,5%,0.05,,,2025-01-01,,法,"{""bracket_min"":0,""bracket_max"":1950000,""base_deduction"":0}",b1\n',
        mode="merge",
    )
    brackets = list_income_tax_brackets("2025-06-01")
    assert len(brackets) == 1
    assert brackets[0]["rate"] == 0.05


def test_validate_csv_errors(legal_db) -> None:
    errors, rows = validate_csv_text(
        "domain,master_key,label_ja,value_numeric,value_text,jurisdiction,valid_from,valid_to,source_law,attributes_json,master_version_id\n"
        ",bad,,,,,,,,,\n"
    )
    assert errors
    assert not rows


def test_import_replace(legal_db) -> None:
    import_csv_text(SAMPLE_CSV, mode="replace")
    assert len(list_entries()) == 2


def test_export_roundtrip(legal_db) -> None:
    import_csv_text(SAMPLE_CSV, mode="replace")
    text = export_csv_text()
    assert "consumption_tax.standard_rate" in text
    errors, rows = validate_csv_text(text)
    assert not errors
    assert len(rows) == 2
