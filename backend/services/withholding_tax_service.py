"""源泉徴収税額表（給与所得の月額表）マスタ — 読み込みと税額計算。

正本は backend/config/withholding_monthly_*.json（scripts/parse_withholding_monthly.py が
国税庁 PDF から生成）。年分ごとに valid_from を持ち、時点指定で有効な表を選べる。

税額計算:
  - 甲欄（扶養控除等申告書の提出あり）: 扶養親族等の数 0〜7人。7人超は7人の額から
    超過1人ごとに 1,610円 控除。
  - 乙欄（提出なし）: 扶養数に依存しない単一列。
  - 105,000円未満: 甲=0、乙=給与×3.063%。
  - 740,000円以上: ブレークポイントごとの基準額＋限界税率（円未満切捨）。
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, Optional

_CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"
_GLOB = "withholding_monthly_*.json"

Kind = Literal["kou", "otsu"]


def _floor_yen(value: float) -> int:
    """円未満切捨（負値は0でクランプ）。"""
    return max(0, int(math.floor(value)))


@lru_cache(maxsize=1)
def _load_tables() -> list[dict[str, Any]]:
    tables: list[dict[str, Any]] = []
    for path in sorted(_CONFIG_DIR.glob(_GLOB)):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        data["_path"] = str(path)
        tables.append(data)
    # valid_from の新しい順（最新を先頭に）。
    tables.sort(key=lambda t: str(t.get("valid_from") or ""), reverse=True)
    return tables


def reload_tables() -> None:
    _load_tables.cache_clear()


def list_tables() -> list[dict[str, Any]]:
    """一覧表示用の要約（行データは含めない）。"""
    out: list[dict[str, Any]] = []
    for t in _load_tables():
        out.append(
            {
                "table_type": t.get("table_type", "monthly"),
                "label_ja": t.get("label_ja", ""),
                "year_label": t.get("year_label", ""),
                "valid_from": t.get("valid_from"),
                "valid_to": t.get("valid_to"),
                "source_law": t.get("source_law"),
                "source_url": t.get("source_url"),
                "row_count": len(t.get("rows", [])),
            }
        )
    return out


def get_table(as_of: Optional[str] = None) -> Optional[dict[str, Any]]:
    """時点で有効な月額表を返す（as_of 未指定なら最新）。"""
    tables = _load_tables()
    if not tables:
        return None
    if as_of is None:
        table = tables[0]
    else:
        table = None
        for t in tables:  # 新しい順
            vf = str(t.get("valid_from") or "")
            vt = t.get("valid_to")
            if vf and vf > as_of:
                continue
            if vt and str(vt) < as_of:
                continue
            table = t
            break
        if table is None:
            return None
    return {k: v for k, v in table.items() if k != "_path"}


def _dependent_index(dependents: int) -> int:
    return min(max(dependents, 0), 7)


def _dense_row(table: dict[str, Any], salary: int) -> Optional[dict[str, Any]]:
    for row in table.get("rows", []):
        rmin = row.get("min")
        rmax = row.get("max")
        if rmin is None or rmax is None:
            continue
        if rmin <= salary < rmax:
            return row
    return None


def _high_kou(table: dict[str, Any], salary: int, dependents: int) -> Optional[int]:
    bands = table.get("high_income_kou") or []
    chosen = None
    for band in bands:
        if band.get("min") is not None and band["min"] <= salary:
            if chosen is None or band["min"] > chosen["min"]:
                chosen = band
    if chosen is None:
        return None
    idx = _dependent_index(dependents)
    base = chosen["kou"][idx]
    tax = base + (salary - chosen["min"]) * float(chosen.get("rate", 0))
    result = _floor_yen(tax)
    if dependents > 7:
        result = max(0, result - int(table.get("over_7_deduction", 0)) * (dependents - 7))
    return result


def _high_otsu(table: dict[str, Any], salary: int) -> Optional[int]:
    bands = table.get("high_income_otsu") or []
    chosen = None
    for band in bands:
        if band.get("min") is not None and band["min"] <= salary:
            if chosen is None or band["min"] > chosen["min"]:
                chosen = band
    if chosen is None:
        return None
    tax = float(chosen["base"]) + (salary - float(chosen.get("over", chosen["min"]))) * float(
        chosen.get("rate", 0)
    )
    return _floor_yen(tax)


def lookup_monthly(
    salary: int,
    dependents: int = 0,
    kind: Kind = "kou",
    as_of: Optional[str] = None,
) -> dict[str, Any]:
    """月額表の税額を計算して返す。

    salary: その月の社会保険料等控除後の給与等の金額（円）。
    dependents: 扶養親族等の数（甲欄のみ有効）。
    kind: 'kou'（甲）or 'otsu'（乙）。
    """
    table = get_table(as_of)
    if table is None:
        raise ValueError("源泉徴収税額表（月額表）が登録されていません")

    salary = max(0, int(salary))
    dependents = max(0, int(dependents))
    low = table.get("low_band") or {}
    low_max = int(low.get("max", 0))

    tax: int
    method: str
    if salary < low_max:
        if kind == "otsu":
            tax = _floor_yen(salary * float(low.get("otsu_rate", 0)))
            method = "low_band_formula"
        else:
            tax = 0
            method = "low_band"
    else:
        dense = _dense_row(table, salary)
        if dense is not None:
            if kind == "otsu":
                tax = int(dense.get("otsu") or 0)
            else:
                idx = _dependent_index(dependents)
                base = int(dense["kou"][idx])
                if dependents > 7:
                    base = max(0, base - int(table.get("over_7_deduction", 0)) * (dependents - 7))
                tax = base
            method = "table"
        else:
            high = _high_otsu(table, salary) if kind == "otsu" else _high_kou(table, salary, dependents)
            if high is None:
                raise ValueError(f"税額を特定できませんでした（salary={salary}, kind={kind}）")
            tax = high
            method = "high_income_formula"

    return {
        "salary": salary,
        "dependents": dependents,
        "kind": kind,
        "tax": tax,
        "method": method,
        "valid_from": table.get("valid_from"),
        "year_label": table.get("year_label"),
    }
