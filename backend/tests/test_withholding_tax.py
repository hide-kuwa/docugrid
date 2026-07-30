"""源泉徴収税額表（月額表）サービスのテスト。"""

from __future__ import annotations

import math

import pytest

from services import withholding_tax_service as wt


def test_list_and_get_table() -> None:
    wt.reload_tables()
    tables = wt.list_tables()
    assert tables, "月額表が1件以上ロードされること"
    t = wt.get_table()
    assert t is not None
    assert t["table_type"] == "monthly"
    assert len(t["rows"]) >= 200


def test_kou_dense_known_cells() -> None:
    # PDF 実値: 106,000円・扶養0人 → 170円、扶養1人 → 0円。
    assert wt.lookup_monthly(106000, 0, "kou")["tax"] == 170
    assert wt.lookup_monthly(106000, 1, "kou")["tax"] == 0
    # 195,000〜197,000: 0人=4,200 / 2人=960。
    assert wt.lookup_monthly(196000, 0, "kou")["tax"] == 4200
    assert wt.lookup_monthly(196000, 2, "kou")["tax"] == 960


def test_otsu_dense_and_low_band() -> None:
    # 106,000円 乙欄 = 3,800円。
    assert wt.lookup_monthly(106000, 0, "otsu")["tax"] == 3800
    # 105,000円未満 甲=0、乙=給与×3.063%（円未満切捨）。
    assert wt.lookup_monthly(100000, 3, "kou")["tax"] == 0
    assert wt.lookup_monthly(100000, 0, "otsu")["tax"] == math.floor(100000 * 0.03063)


def test_over_seven_dependents_deducts_1610() -> None:
    # 196,000円・7人 = 0円。9人なら 7人額 - 1,610×2 → 0 でクランプ。
    base7 = wt.lookup_monthly(196000, 7, "kou")["tax"]
    assert wt.lookup_monthly(196000, 9, "kou")["tax"] == max(0, base7 - 1610 * 2)


def test_high_income_breakpoints() -> None:
    # 740,000円・0人 → ブレークポイント基準額 71,680円。
    r = wt.lookup_monthly(740000, 0, "kou")
    assert r["method"] == "high_income_formula"
    assert r["tax"] == 71680
    # 790,000円・0人 → 81,890円。
    assert wt.lookup_monthly(790000, 0, "kou")["tax"] == 81890
    # 800,000円・0人 → 81,890 + (800,000-790,000)*0.23483 = 84,238（円未満切捨）。
    assert wt.lookup_monthly(800000, 0, "kou")["tax"] == math.floor(81890 + 10000 * 0.23483)


def test_high_income_otsu() -> None:
    # 740,000円 乙 = 259,200円。
    assert wt.lookup_monthly(740000, 0, "otsu")["tax"] == 259200
    # 1,710,000円 乙 = 655,400円。
    assert wt.lookup_monthly(1710000, 0, "otsu")["tax"] == 655400


def test_as_of_selects_effective_table() -> None:
    # 2026 表は 2026-06-01 時点で有効、2020 時点では無効。
    assert wt.get_table("2026-06-01") is not None
    assert wt.get_table("2020-01-01") is None
