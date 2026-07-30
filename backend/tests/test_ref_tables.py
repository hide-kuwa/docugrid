"""参照テーブルマスタと法定計算サービスのテスト。"""

from __future__ import annotations

import pytest

from services import legal_calc_service, legal_master_service, ref_table_service


@pytest.fixture(autouse=True)
def _reload():
    ref_table_service.reload_ref_tables()
    legal_master_service.seed_from_file()
    yield
    ref_table_service.reload_ref_tables()


def test_list_ref_tables_includes_employment_insurance():
    tables = ref_table_service.list_ref_tables()
    ids = {t["id"] for t in tables}
    assert "employment_insurance_rate" in ids
    assert "social_insurance_standard_caps" in ids
    assert "basic_deduction" in ids
    assert "minimum_wage" in ids


def test_effective_version_employment_insurance_r7():
    v = ref_table_service.effective_version("employment_insurance_rate", "2025-06-01")
    assert v is not None
    assert v["label"] == "令和7年度"
    general = next(r for r in v["rows"] if r["business"] == "一般の事業")
    assert general["total"] == pytest.approx(0.0135)


def test_calc_employment_insurance():
    r = legal_calc_service.calc_employment_insurance(300_000, "一般の事業", as_of="2025-06-01")
    assert r["worker_amount"] == 1500  # 300000 * 0.005 = 1500
    assert r["total_amount"] == 4050  # floor(300000 * 0.0135)


def test_clip_social_insurance_basis_monthly_pension():
    r = legal_calc_service.clip_social_insurance_basis(
        800_000, "厚生年金", "標準報酬月額", as_of="2025-06-01"
    )
    assert r["cap_amount"] == 650_000
    assert r["clipped_amount"] == 650_000
    assert r["was_clipped"] is True


def test_clip_social_insurance_basis_bonus_health_under_cap():
    r = legal_calc_service.clip_social_insurance_basis(
        1_000_000, "健康保険", "標準賞与額", as_of="2025-06-01"
    )
    assert r["cap_amount"] == 5_730_000
    assert r["clipped_amount"] == 1_000_000
    assert r["was_clipped"] is False


def test_lookup_basic_deduction_r7_low_income():
    r = legal_calc_service.lookup_basic_deduction(1_000_000, as_of="2025-06-01")
    assert r["amount"] == 950_000


def test_lookup_basic_deduction_r6():
    r = legal_calc_service.lookup_basic_deduction(5_000_000, as_of="2024-06-01")
    assert r["amount"] == 480_000


def test_lookup_spouse_deduction_control():
    r = legal_calc_service.lookup_spouse_deduction(400_000, 6_000_000, spouse_elderly=False)
    assert r["kind"] == "配偶者控除"
    assert r["amount"] == 380_000


def test_lookup_spouse_deduction_special():
    r = legal_calc_service.lookup_spouse_deduction(1_000_000, 6_000_000)
    assert r["kind"] == "配偶者特別控除"
    assert r["amount"] == 360_000  # 95万円超100万円以下


def test_lookup_corporate_percapita():
    r = legal_calc_service.lookup_corporate_percapita(10_000_000, 30, as_of="2025-06-01")
    assert r["prefecture_amount"] == 20_000
    assert r["municipal_amount"] == 50_000
    assert r["total"] == 70_000


def test_calc_simplified_consumption():
    r = legal_calc_service.calc_simplified_consumption({1: 100_000}, as_of="2025-06-01")
    assert r["deduction"] == 90_000  # 100000 * 0.9


def test_calc_simplified_consumption_unclassified_penalty():
    r = legal_calc_service.calc_simplified_consumption(
        {1: 50_000},
        unclassified_tax=50_000,
        unclassified_types=[1, 6],
        as_of="2025-06-01",
    )
    # 未区分は第6種40%（1と6のうち低い方）
    assert r["deduction"] == 45_000 + 20_000


def test_calc_defense_surtax_not_applicable_before_2026():
    r = legal_calc_service.calc_defense_surtax(1_000_000, "2025-06-01")
    assert r["applicable"] is False
    assert r["amount"] == 0


def test_calc_defense_surtax_applicable_from_2026():
    r = legal_calc_service.calc_defense_surtax(1_000_000, "2026-06-01")
    assert r["applicable"] is True
    assert r["amount"] == 40_000


def test_calc_employment_income_flat_min():
    r = legal_calc_service.calc_employment_income(1_500_000, as_of="2025-06-01")
    assert r["deduction"] == 550_000
    assert r["employment_income"] == 950_000


def test_calc_employment_income_formula_band():
    r = legal_calc_service.calc_employment_income(5_000_000, as_of="2025-06-01")
    # 5,000,000 * 20% + 440,000 = 1,440,000
    assert r["deduction"] == 1_440_000
    assert r["employment_income"] == 3_560_000


def test_calc_employment_income_cap():
    r = legal_calc_service.calc_employment_income(10_000_000, as_of="2025-06-01")
    assert r["deduction"] == 1_950_000


def test_individual_resident_tax_standard():
    r = legal_calc_service.calc_individual_resident_tax(3_000_000, "2025-06-01")
    # 所得割 3,000,000 * 10% = 300,000、均等割 1,000+3,000+森林1,000 = 5,000
    assert r["income_levy"] == 300_000
    assert r["percapita_total"] == 5_000
    assert r["total"] == 305_000
    assert r["excess_applied"] is False


def test_individual_resident_tax_excess():
    r = legal_calc_service.calc_individual_resident_tax(
        3_000_000, "2025-06-01", jurisdiction_code="28000"
    )
    # 兵庫県 県民緑税 均等割+800円
    assert r["excess_applied"] is True
    assert r["excess_percapita"] == 800
    assert r["percapita_total"] == 5_800


def test_check_minimum_wage_shortfall():
    r = legal_calc_service.check_minimum_wage(160_000, 160, "東京都", as_of="2025-06-01")
    # 160000 / 160 = 1000円 < 東京都 1163円
    assert r["converted_hourly"] == 1000
    assert r["compliant"] is False
    assert r["shortfall"] == 163


def test_check_minimum_wage_compliant():
    r = legal_calc_service.check_minimum_wage(200_000, 160, "沖縄県", as_of="2025-06-01")
    # 200000 / 160 = 1250円 >= 沖縄県 952円
    assert r["compliant"] is True
