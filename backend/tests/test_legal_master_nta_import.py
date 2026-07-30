"""国税庁ページ/貼付テキストからの法定基準値取り込みのテスト."""

from __future__ import annotations

import pytest

from services.legal_master_nta_import import (
    build_income_tax_bracket_drafts,
    rows_from_html,
    rows_from_text,
    _validate_nta_url,
)

# 国税庁 No.2260 所得税の速算表（令和7年）と同じ内容。
SPEED_TABLE_TEXT = """課税される所得金額\t税率\t控除額
1,000円 から 1,949,000円まで\t5％\t0円
1,950,000円 から 3,299,000円まで\t10％\t97,500円
3,300,000円 から 6,949,000円まで\t20％\t427,500円
6,950,000円 から 8,999,000円まで\t23％\t636,000円
9,000,000円 から 17,999,000円まで\t33％\t1,536,000円
18,000,000円 から 39,999,000円まで\t40％\t2,796,000円
40,000,000円 以上\t45％\t4,796,000円
"""


def test_build_income_tax_brackets_matches_seed() -> None:
    rows = rows_from_text(SPEED_TABLE_TEXT)
    drafts, warnings = build_income_tax_bracket_drafts(rows, valid_from="2025-01-01")
    assert warnings == []
    assert len(drafts) == 7

    first = drafts[0]
    assert first["master_key"] == "income_tax.bracket.1"
    assert first["label_ja"] == "所得税5%区分"
    assert first["value_numeric"] == 0.05
    assert first["attributes"] == {
        "bracket_min": 0,
        "bracket_max": 1950000,
        "base_deduction": 0,
    }
    assert first["master_version_id"] == "itb-1-2025"

    # 中間区分の境界は「次行の下限」を採用（丸めた境界になる）。
    third = drafts[2]
    assert third["value_numeric"] == 0.20
    assert third["attributes"] == {
        "bracket_min": 3300000,
        "bracket_max": 6950000,
        "base_deduction": 427500,
    }

    # 最終区分は上限なし。
    last = drafts[-1]
    assert last["value_numeric"] == 0.45
    assert last["attributes"]["bracket_min"] == 40000000
    assert last["attributes"]["bracket_max"] is None
    assert last["attributes"]["base_deduction"] == 4796000


def test_rows_from_html_prefers_rate_deduction_table() -> None:
    html = """
    <html><body>
    <table><tr><td>無関係</td><td>表</td></tr></table>
    <table>
      <tr><th>課税される所得金額</th><th>税率</th><th>控除額</th></tr>
      <tr><td>1,000円 から 1,949,000円まで</td><td>5％</td><td>0円</td></tr>
      <tr><td>40,000,000円 以上</td><td>45％</td><td>4,796,000円</td></tr>
    </table>
    </body></html>
    """
    rows = rows_from_html(html)
    joined = " ".join(" ".join(r) for r in rows)
    assert "税率" in joined and "控除" in joined
    drafts, _ = build_income_tax_bracket_drafts(rows, valid_from="2025-01-01")
    assert len(drafts) == 2
    assert drafts[0]["value_numeric"] == 0.05
    assert drafts[-1]["value_numeric"] == 0.45


def test_validate_nta_url_rejects_non_nta() -> None:
    _validate_nta_url("https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm")
    with pytest.raises(ValueError):
        _validate_nta_url("https://evil.example.com/x")
    with pytest.raises(ValueError):
        _validate_nta_url("http://www.nta.go.jp/x")  # http は不可
    with pytest.raises(ValueError):
        _validate_nta_url("https://evilnta.go.jp/x")  # サフィックス偽装


def test_build_income_tax_brackets_empty_raises() -> None:
    with pytest.raises(ValueError):
        build_income_tax_bracket_drafts([["名前", "住所"]], valid_from="2025-01-01")
