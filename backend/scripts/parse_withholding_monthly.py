"""国税庁「給与所得の源泉徴収税額表（月額表）」PDF を構造化 JSON へ変換する。

座標ベースで 11 列（以上 / 未満 / 甲0〜7人 / 乙）に割り当ててグリッドを抽出する。
低額帯（<105,000: 甲0・乙は 3.063% 式）と高額帯（>=3,500,000: 45.945% 式）は
数値行として取れない部分を式メタデータとして別に持つ。

使い方:
  python scripts/parse_withholding_monthly.py tmp_gensen.pdf config/withholding_monthly_2026.json
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from typing import Any, Optional

import fitz

_NUM_RE = re.compile(r"^\d[\d,]*$")


def _to_int(token: str) -> Optional[int]:
    t = token.strip().replace(",", "")
    return int(t) if t.isdigit() else None


def _column_anchors(words: list[tuple]) -> Optional[list[float]]:
    """『円』が並ぶ単位行から 11 列の中心 x を得る。"""
    rows: dict[int, list[tuple[float, str]]] = defaultdict(list)
    for x0, y0, x1, y1, txt, *_ in words:
        rows[round(y0)].append(((x0 + x1) / 2, txt.strip()))
    best: Optional[list[float]] = None
    for _y, toks in rows.items():
        yen = [cx for cx, t in toks if t == "円"]
        if len(yen) >= 11 and (best is None or len(yen) > len(best)):
            best = sorted(yen)[:11]
    return best


def _yen_row_y(words: list[tuple]) -> Optional[int]:
    rows: dict[int, int] = defaultdict(int)
    for x0, y0, x1, y1, txt, *_ in words:
        if txt.strip() == "円":
            rows[round(y0)] += 1
    if not rows:
        return None
    return max(rows, key=lambda k: rows[k])


def _cluster_rows(words: list[tuple], min_y: float, tol: float = 4.0) -> list[list[tuple[float, str]]]:
    items = []
    for x0, y0, x1, y1, txt, *_ in words:
        if y0 <= min_y:
            continue
        items.append((y0, (x0 + x1) / 2, txt.strip()))
    items.sort(key=lambda t: (t[0], t[1]))
    rows: list[list[tuple[float, str]]] = []
    cur_y: Optional[float] = None
    cur: list[tuple[float, str]] = []
    for y0, cx, txt in items:
        if not txt:
            continue
        if cur_y is None or abs(y0 - cur_y) <= tol:
            cur.append((cx, txt))
            cur_y = y0 if cur_y is None else cur_y
        else:
            rows.append(cur)
            cur = [(cx, txt)]
            cur_y = y0
    if cur:
        rows.append(cur)
    return rows


def _assign(row: list[tuple[float, str]], anchors: list[float]) -> list[list[str]]:
    cols: list[list[str]] = [[] for _ in anchors]
    for cx, txt in sorted(row):
        idx = min(range(len(anchors)), key=lambda i: abs(anchors[i] - cx))
        cols[idx].append(txt)
    return cols


def parse_pdf(path: str) -> dict[str, Any]:
    doc = fitz.open(path)
    grid_rows: list[dict[str, Any]] = []
    for pno in range(len(doc)):
        words = doc[pno].get_text("words")
        anchors = _column_anchors(words)
        yrow = _yen_row_y(words)
        if not anchors or yrow is None:
            continue
        for row in _cluster_rows(words, yrow):
            cols = _assign(row, anchors)
            joined = ["".join(c) for c in cols]
            c_min = _to_int(joined[0])
            c_max = _to_int(joined[1])
            kou = [_to_int(joined[i]) for i in range(2, 10)]
            otsu = _to_int(joined[10]) if len(joined) > 10 else None
            # 密グリッド行のみ採用（以上・未満がともに数値、甲8列すべて数値）。
            # 高額帯のブレークポイント（未満なし・式）や低額帯は config 側で持つ。
            if c_min is None or c_max is None or any(k is None for k in kou):
                continue
            grid_rows.append(
                {
                    "min": c_min,
                    "max": c_max,
                    "kou": kou,
                    "otsu": otsu,
                }
            )
    # min で重複排除 & 昇順。
    dedup: dict[int, dict[str, Any]] = {}
    for r in grid_rows:
        key = r["min"] if r["min"] is not None else -1
        dedup[key] = r
    rows = [dedup[k] for k in sorted(dedup)]
    return {"rows": rows}


# 高額帯（>=740,000円）のブレークポイントと限界税率（PDF 5〜7ページより検証済み）。
# 甲: 対象月給 s が属する帯 b について tax = b.kou[扶養数] + (s - b.min) * b.rate（円未満切捨）。
_HIGH_INCOME_KOU = [
    {"min": 740000, "rate": 0.2042, "kou": [71680, 65210, 58750, 52290, 45810, 39350, 32890, 26410]},
    {"min": 790000, "rate": 0.23483, "kou": [81890, 75420, 68960, 62500, 56020, 49560, 43100, 36620]},
    {"min": 960000, "rate": 0.33693, "kou": [121820, 115340, 108880, 102420, 95940, 89480, 83020, 76540]},
    {"min": 1710000, "rate": 0.4084, "kou": [374520, 368040, 361580, 355120, 348640, 342180, 335720, 329240]},
    {"min": 2130000, "rate": 0.4084, "kou": [549440, 542970, 536500, 530040, 523570, 517110, 510640, 504170]},
    {"min": 2170000, "rate": 0.4084, "kou": [571220, 564750, 558280, 551820, 545350, 538880, 532420, 525950]},
    {"min": 2210000, "rate": 0.4084, "kou": [593000, 586520, 580060, 573600, 567120, 560660, 554200, 547730]},
    {"min": 2250000, "rate": 0.4084, "kou": [614770, 608300, 601840, 595380, 588900, 582440, 575980, 569500]},
    {"min": 3500000, "rate": 0.45945, "kou": [1125270, 1118800, 1112340, 1105880, 1099400, 1092940, 1086480, 1080000]},
]

# 乙: 対象月給 s が属する帯 b について tax = b.base + (s - b.over) * b.rate。
_HIGH_INCOME_OTSU = [
    {"min": 740000, "base": 259200, "over": 740000, "rate": 0.4084},
    {"min": 1710000, "base": 655400, "over": 1710000, "rate": 0.45945},
]


def build_config(pdf_path: str) -> dict[str, Any]:
    parsed = parse_pdf(pdf_path)
    rows = parsed["rows"]
    low_min = min((r["min"] for r in rows if r["min"] is not None), default=105000)
    return {
        "table_type": "monthly",
        "label_ja": "給与所得の源泉徴収税額表（月額表）",
        "year_label": "令和8年分",
        "valid_from": "2026-01-01",
        "valid_to": None,
        "source_law": "所得税法（平成24年3月31日財務省告示第115号別表第一）",
        "source_url": "https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2026/data/01-07.pdf",
        "columns": ["0人", "1人", "2人", "3人", "4人", "5人", "6人", "7人以上"],
        "low_band": {
            "max": low_min,
            "kou": [0, 0, 0, 0, 0, 0, 0, 0],
            "otsu_rate": 0.03063,
            "note": "105,000円未満は甲欄0円、乙欄は給与等の金額の3.063％",
        },
        "high_income_kou": _HIGH_INCOME_KOU,
        "high_income_otsu": _HIGH_INCOME_OTSU,
        "over_7_deduction": 1610,
        "rounding": "floor_yen",
        "note_over_7": "扶養親族等が7人を超える場合、7人の税額から超過1人ごとに1,610円を控除",
        "rows": rows,
    }


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "tmp_gensen.pdf"
    dst = sys.argv[2] if len(sys.argv) > 2 else "config/withholding_monthly_2026.json"
    cfg = build_config(src)
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    rows = cfg["rows"]
    print(f"rows={len(rows)} first={rows[0]} last={rows[-1]}")
    print(f"wrote {dst}")
