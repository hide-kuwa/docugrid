"""法人税率マスタ — 読み込みと普通法人の税額計算。

正本は backend/config/corporate_tax_rate.json（国税庁 No.5759 をもとに整備）。
法人区分 × 所得区分 × 適用開始事業年度の行列を保持し、事業年度開始日で
適用税率を解決する。
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "corporate_tax_rate.json"

# 標準税率（上記以外の普通法人／年800万円超の部分）の行の探索キー。
_STANDARD_ROW_PREFIX = "上記以外の普通法人"


def _floor_yen(value: float) -> int:
    return max(0, int(math.floor(value)))


@lru_cache(maxsize=1)
def _load() -> Optional[dict[str, Any]]:
    try:
        return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def reload_table() -> None:
    _load.cache_clear()


def get_table() -> Optional[dict[str, Any]]:
    return _load()


def list_tables() -> list[dict[str, Any]]:
    t = _load()
    if not t:
        return []
    return [
        {
            "master": t.get("master", "corporate_tax_rate"),
            "label_ja": t.get("label_ja", ""),
            "law_asof": t.get("law_asof", ""),
            "valid_from": t.get("valid_from"),
            "valid_to": t.get("valid_to"),
            "source_law": t.get("source_law"),
            "source_url": t.get("source_url"),
            "row_count": len(t.get("rows", [])),
        }
    ]


def _period_index(table: dict[str, Any], fiscal_year_start: str) -> int:
    """事業年度開始日が属する適用期間のインデックス（該当がなければ最古=0）。"""
    periods = table.get("periods", [])
    idx = 0
    for i, p in enumerate(periods):
        start = str(p.get("start") or "")
        if start and start <= fiscal_year_start:
            idx = i
    return idx


def resolve_standard_rate(fiscal_year_start: str) -> Optional[float]:
    """上記以外の普通法人（標準税率）を事業年度開始日で解決する。"""
    table = _load()
    if not table:
        return None
    pidx = _period_index(table, fiscal_year_start)
    for row in table.get("rows", []):
        if str(row.get("corp_type")) == "普通法人" and str(row.get("segment", "")).startswith(
            _STANDARD_ROW_PREFIX
        ):
            rates = row.get("rates", [])
            if pidx < len(rates):
                return float(rates[pidx])
    return None


def compute_corporate_tax(
    taxable_income: int,
    fiscal_year_start: str,
    *,
    small_business: bool = True,
    excluded_business: bool = False,
) -> dict[str, Any]:
    """普通法人の法人税額を計算する（別表一の税額計算に相当）。

    small_business: 資本金1億円以下の中小法人など（軽減税率対象か）。
    excluded_business: 適用除外事業者（前3年平均所得15億円超）。軽減税率不可。
    課税所得は1,000円未満切捨後の金額を渡す想定。税額の100円未満切捨は最終申告側で行う。
    """
    table = _load()
    if not table:
        raise ValueError("法人税率マスタが登録されていません")

    income = max(0, int(taxable_income))
    threshold = int(table.get("small_business_threshold", 8000000))
    standard = resolve_standard_rate(fiscal_year_start)
    if standard is None:
        raise ValueError("標準税率を解決できませんでした")

    if not small_business:
        reduced_rate: Optional[float] = None
        reduced_portion = 0
        standard_portion = income
        tax = income * standard
    else:
        if excluded_business:
            reduced_rate = 0.19
        else:
            reduced_rate = 0.15
            special_from = str(table.get("special_10b_from") or "")
            special_threshold = int(table.get("special_10b_threshold", 0) or 0)
            special_rate = table.get("special_10b_reduced_rate")
            if (
                special_rate is not None
                and special_from
                and fiscal_year_start >= special_from
                and special_threshold
                and income > special_threshold
            ):
                reduced_rate = float(special_rate)
        reduced_portion = min(income, threshold)
        standard_portion = max(0, income - threshold)
        tax = reduced_portion * reduced_rate + standard_portion * standard

    return {
        "taxable_income": income,
        "fiscal_year_start": fiscal_year_start,
        "small_business": small_business,
        "excluded_business": excluded_business,
        "reduced_rate": reduced_rate,
        "standard_rate": standard,
        "threshold": threshold,
        "reduced_portion": reduced_portion,
        "standard_portion": standard_portion,
        "tax": _floor_yen(tax),
        "valid_from": table.get("valid_from"),
    }
