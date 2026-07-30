"""法人税率マスタサービスのテスト。"""

from __future__ import annotations

import math

from services import corporate_tax_service as ct


def test_load_and_list() -> None:
    ct.reload_table()
    t = ct.get_table()
    assert t is not None
    assert t["master"] == "corporate_tax_rate"
    assert len(t["rows"]) >= 10
    assert ct.list_tables()[0]["label_ja"] == "法人税の税率"


def test_standard_rate_by_period() -> None:
    # 平28.4.1〜平30.3.31 は 23.4%、平30.4.1以後は 23.2%。
    assert ct.resolve_standard_rate("2016-04-01") == 0.234
    assert ct.resolve_standard_rate("2017-06-01") == 0.234
    assert ct.resolve_standard_rate("2018-04-01") == 0.232
    assert ct.resolve_standard_rate("2025-06-01") == 0.232


def test_small_business_reduced_and_standard_split() -> None:
    # 中小法人・所得1,000万円・令7期: 800万×15% + 200万×23.2%。
    r = ct.compute_corporate_tax(10_000_000, "2025-06-01", small_business=True)
    assert r["reduced_rate"] == 0.15
    assert r["standard_rate"] == 0.232
    expected = math.floor(8_000_000 * 0.15 + 2_000_000 * 0.232)
    assert r["tax"] == expected


def test_large_corporation_all_standard() -> None:
    # 大法人・所得1,000万円: 全額 23.2%。
    r = ct.compute_corporate_tax(10_000_000, "2025-06-01", small_business=False)
    assert r["reduced_rate"] is None
    assert r["tax"] == math.floor(10_000_000 * 0.232)


def test_excluded_business_uses_19pct() -> None:
    # 適用除外事業者は軽減税率が19%。
    r = ct.compute_corporate_tax(5_000_000, "2025-06-01", small_business=True, excluded_business=True)
    assert r["reduced_rate"] == 0.19
    assert r["tax"] == math.floor(5_000_000 * 0.19)


def test_special_10b_reduced_rate_17pct() -> None:
    # 令7.4.1以後・所得10億円超は軽減部分が17%。
    r = ct.compute_corporate_tax(1_500_000_000, "2025-06-01", small_business=True)
    assert r["reduced_rate"] == 0.17
    # 10億円以下なら15%のまま。
    r2 = ct.compute_corporate_tax(900_000_000, "2025-06-01", small_business=True)
    assert r2["reduced_rate"] == 0.15
    # 施行前（令4期）は10億円超でも15%。
    r3 = ct.compute_corporate_tax(1_500_000_000, "2023-06-01", small_business=True)
    assert r3["reduced_rate"] == 0.15
