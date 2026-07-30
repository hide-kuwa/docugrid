"""協会けんぽ料率・等級・保険料計算のテスト（東京・令和8年）。"""

from __future__ import annotations

from services import legal_calc_service, ref_table_service


def test_tokyo_r8_rates_loaded():
    ref_table_service.reload_ref_tables()
    row = legal_calc_service.lookup_association_health_rate("13", as_of="2026-04-01")
    assert row["prefecture"] == "東京都"
    assert abs(float(row["health_rate"]) - 0.0985) < 1e-9
    assert abs(float(row["care_rate"]) - 0.0162) < 1e-9
    assert abs(float(row["health_care_rate"]) - 0.1147) < 1e-9
    assert abs(float(row["child_support_rate"]) - 0.0023) < 1e-9
    assert abs(float(row["pension_rate"]) - 0.183) < 1e-9
    assert abs(float(row["childcare_contrib_rate"]) - 0.0036) < 1e-9


def test_grade_lookup_300k_matches_pdf():
    """東京R8 PDF 等級22: 標準報酬300,000 / 健保全額29,550 / 折半14,775。"""
    grade = legal_calc_service.lookup_standard_grade(300000, as_of="2026-04-01")
    assert grade["grade_health"] == 22
    assert grade["grade_pension"] == 19
    assert grade["standard_monthly"] == 300000

    result = legal_calc_service.calc_association_health_premium(
        300000, prefecture_code="13", care_applicable=False, as_of="2026-04-01"
    )
    assert result["health_full"] == 29550.0
    assert result["health_employee"] == 14775.0
    assert result["child_support_full"] == 690.0
    assert result["child_support_employee"] == 345.0
    assert result["pension_full"] == 54900.0
    assert result["pension_employee"] == 27450.0


def test_grade_lookup_with_care_matches_pdf():
    result = legal_calc_service.calc_association_health_premium(
        300000, prefecture_code="13", care_applicable=True, as_of="2026-04-01"
    )
    assert result["health_full"] == 34410.0
    assert result["health_employee"] == 17205.0


def test_pension_cap_on_high_grade():
    """健保36級以上は厚年上限650,000円。"""
    result = legal_calc_service.calc_association_health_premium(
        700000, prefecture_code="13", care_applicable=False, as_of="2026-04-01"
    )
    assert result["grade_health"] == 37
    assert result["grade_pension"] is None
    assert result["standard_monthly_pension"] == 650000
    assert result["pension_full"] == 118950.0


def test_amount_table_matches_pdf_grade_22():
    table = legal_calc_service.build_association_health_amount_table("13", as_of="2026-04-01")
    assert table["prefecture"] == "東京都"
    row = next(r for r in table["rows"] if r["grade_health"] == 22)
    assert row["standard_monthly"] == 300000
    assert row["health_full"] == 29550.0
    assert row["health_half"] == 14775.0
    assert row["health_care_full"] == 34410.0
    assert row["health_care_half"] == 17205.0
    assert row["child_support_full"] == 690.0
    assert row["child_support_half"] == 345.0
    assert row["pension_full"] == 54900.0
    assert row["pension_half"] == 27450.0
    assert len(table["rows"]) == 50


def test_upsert_prefecture_row():
    """ノーコード追加: 都道府県行を upsert できる。"""
    # 作業コピーは既存JSONを直接触る（開発用）。テスト後に東京のみに戻す想定で
    # 別コードを一時追加→削除する。
    table = ref_table_service.get_ref_table("association_health_rates")
    assert table
    version = table["versions"][0]
    valid_from = version["valid_from"]

    updated = ref_table_service.upsert_ref_table_row(
        "association_health_rates",
        valid_from=valid_from,
        match_key="prefecture_code",
        row={
            "prefecture_code": "99",
            "prefecture": "テスト県",
            "health_rate": 0.1,
            "care_rate": 0.0162,
            "health_care_rate": 0.1162,
            "child_support_rate": 0.0023,
            "pension_rate": 0.183,
            "childcare_contrib_rate": 0.0036,
            "source_url": None,
        },
    )
    codes = [str(r.get("prefecture_code")) for r in updated["versions"][0]["rows"]]
    assert "99" in codes

    # クリーンアップ: テスト行を除去して保存し直す
    on_disk = ref_table_service.get_ref_table("association_health_rates")
    assert on_disk
    for v in on_disk["versions"]:
        if v["valid_from"] == valid_from:
            v["rows"] = [r for r in v["rows"] if str(r.get("prefecture_code")) != "99"]
    ref_table_service.save_ref_table("association_health_rates", on_disk)
    cleaned = legal_calc_service.list_association_health_prefectures(as_of="2026-04-01")
    assert all(p["prefecture_code"] != "99" for p in cleaned)
