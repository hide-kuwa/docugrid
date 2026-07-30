"""法人地方税（均等割・法人税割・事業税・特別法人事業税）マスタのテスト。"""

from __future__ import annotations

from services import legal_calc_service, legal_master_service, ref_table_service


def setup_module():
    ref_table_service.reload_ref_tables()
    legal_master_service.seed_from_file()


def test_masters_present():
    assert ref_table_service.get_ref_table("corporate_resident_percapita")
    assert ref_table_service.get_ref_table("corporate_resident_levy")
    assert ref_table_service.get_ref_table("corporate_enterprise_tax")
    assert legal_master_service.lookup_rate("corporate_tax.local_corporate_rate", "2026-04-01")
    assert legal_master_service.lookup_rate("corporate_tax.special_enterprise_rate", "2026-04-01")


def test_tokyo_23_levy_rates():
    row = ref_table_service.find_row(
        "corporate_resident_levy", {"jurisdiction": "tokyo_23"}, as_of="2026-04-01"
    )
    assert row is not None
    assert abs(float(row["standard_rate"]) - 0.07) < 1e-9
    assert abs(float(row["excess_rate"]) - 0.104) < 1e-9


def test_enterprise_tax_standard_brackets():
    r = legal_calc_service.calc_corporate_enterprise_tax(
        10_000_000, as_of="2026-04-01", use_excess_rate=False
    )
    # 400万×3.5% + 400万×5.3% + 200万×7.0% = 14万 + 21.2万 + 14万 = 492,000
    assert r["tax"] == 492_000
    assert len(r["bands"]) == 3


def test_enterprise_tax_excess_brackets():
    r = legal_calc_service.calc_corporate_enterprise_tax(
        10_000_000, as_of="2026-04-01", use_excess_rate=True
    )
    # 400万×3.75% + 400万×5.665% + 200万×7.48% = 150000 + 226600 + 149600 = 526200
    assert r["tax"] == 526_200


def test_local_bundle_includes_all_components():
    r = legal_calc_service.calc_corporate_local_taxes(
        10_000_000,
        "2026-04-01",
        small_business=True,
        capital=10_000_000,
        employees=30,
        jurisdiction="tokyo_23",
        use_excess_rate=False,
    )
    assert r["national"] > 0
    assert r["local_corporate"] > 0
    assert r["resident_levy"] > 0
    assert r["percapita"] == 70_000  # 1千万円以下・50人以下: 2万+5万
    assert r["enterprise"] == 492_000
    assert r["special_enterprise"] == int(492_000 * 0.37)
    assert r["office_tax"] is None
    assert r["total"] == (
        r["national"]
        + r["local_corporate"]
        + r["resident_levy"]
        + r["percapita"]
        + r["enterprise"]
        + r["special_enterprise"]
    )


def test_executive_comp_uses_master_local_taxes():
    from services.executive_comp_service import optimize_executive_comp

    out = optimize_executive_comp(
        20_000_000,
        "2026-04-01",
        executive_age=35,
        small_business=True,
        include_social=False,
    )
    bd = out["optimal"]["corporate_breakdown"]
    assert bd["percapita"] == 70_000
    assert bd["resident_levy"] > 0
    assert bd["enterprise"] > 0
    assert bd["special_enterprise"] > 0
    assert out["assumptions"]["corporate_resident_levy_rate"] == 0.07


def test_executive_comp_social_insurance_reflects_age():
    from services.executive_comp_service import optimize_executive_comp

    def current_for(age: int):
        out = optimize_executive_comp(
            20_000_000,
            "2026-04-01",
            executive_age=age,
            current_monthly=500_000,
        )
        return out, out["current"]

    age_39, current_39 = current_for(39)
    age_45, current_45 = current_for(45)
    age_70, current_70 = current_for(70)
    age_75, current_75 = current_for(75)

    assert age_39["assumptions"]["care_applicable"] is False
    assert age_45["assumptions"]["care_applicable"] is True
    assert current_45["total_social"] > current_39["total_social"]
    assert age_70["assumptions"]["pension_applicable"] is False
    assert current_70["total_social"] < current_39["total_social"]
    assert age_75["assumptions"]["health_applicable"] is False
    assert current_75["total_social"] == 0
