"""法定基準値マスタ — 国税庁ページ/貼付テキストからの取り込み（ノーコード補助）。

税理士が国税庁サイト（例: 所得税の速算表）の表をそのまま貼り付ける、
または nta.go.jp の URL を指定すると、legal_master のエントリ草案（ドラフト）へ変換する。
草案は既存の CSV インポート経路（version 重複排除つき）で保存する。

対応テンプレート:
- income_tax_speed_table: 所得税の速算表 → domain=income_tax_bracket の区分エントリ

セキュリティ: URL 取得は https かつ nta.go.jp ドメインのみ（SSRF 対策）。
"""

from __future__ import annotations

import csv
import io
import json
import re
from html.parser import HTMLParser
from typing import Any, Literal, Optional
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from services.legal_master_service import CSV_COLUMNS

Template = Literal["income_tax_speed_table"]

_ALLOWED_HOSTS = {"nta.go.jp", "www.nta.go.jp"}
_ALLOWED_HOST_SUFFIX = ".nta.go.jp"
_FETCH_TIMEOUT_SEC = 10
_MAX_FETCH_BYTES = 3_000_000
_PERCENT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(?:％|%|パーセント)")


def _validate_nta_url(url: str) -> None:
    parsed = urlparse(url.strip())
    if parsed.scheme != "https":
        raise ValueError("https の国税庁URLのみ取り込めます")
    host = (parsed.hostname or "").lower()
    if host in _ALLOWED_HOSTS or host.endswith(_ALLOWED_HOST_SUFFIX):
        return
    raise ValueError("国税庁（nta.go.jp）のURLのみ取り込めます")


def fetch_nta_html(url: str) -> str:
    """nta.go.jp の HTML を取得（SSRF 対策つき）。"""
    _validate_nta_url(url)
    req = Request(url, headers={"User-Agent": "DocuGrid-LegalMaster/1.0"})
    with urlopen(req, timeout=_FETCH_TIMEOUT_SEC) as resp:  # noqa: S310 (host allow-listed)
        raw = resp.read(_MAX_FETCH_BYTES + 1)
    if len(raw) > _MAX_FETCH_BYTES:
        raise ValueError("取得したページが大きすぎます")
    for enc in ("utf-8", "cp932", "shift_jis"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


class _TableParser(HTMLParser):
    """HTML から <table> の行・セルを取り出す最小パーサ。"""

    def __init__(self) -> None:
        super().__init__()
        self.tables: list[list[list[str]]] = []
        self._in_table = 0
        self._row: Optional[list[str]] = None
        self._cell: Optional[list[str]] = None

    def handle_starttag(self, tag: str, attrs: Any) -> None:
        if tag == "table":
            self._in_table += 1
            self.tables.append([])
        elif tag == "tr" and self._in_table:
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._cell = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "table" and self._in_table:
            self._in_table -= 1
        elif tag == "tr" and self._row is not None:
            if self._row:
                self.tables[-1].append(self._row)
            self._row = None
        elif tag in ("td", "th") and self._cell is not None:
            text = " ".join("".join(self._cell).split())
            self._row.append(text)  # type: ignore[union-attr]
            self._cell = None

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)


def rows_from_html(html: str) -> list[list[str]]:
    """HTML 中の全テーブルの行を連結して返す（税率・控除を含む表を優先）。"""
    parser = _TableParser()
    parser.feed(html)
    best: list[list[str]] = []
    for table in parser.tables:
        flat = " ".join(" ".join(r) for r in table)
        if "税率" in flat and "控除" in flat:
            return table
        if len(table) > len(best):
            best = table
    return best


def rows_from_text(text: str) -> list[list[str]]:
    """貼付テキストを行・セルへ分解（タブ / 全角｜ / 連続空白 区切り）。"""
    rows: list[list[str]] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if "\t" in stripped:
            cells = stripped.split("\t")
        elif "｜" in stripped or "|" in stripped:
            cells = re.split(r"[｜|]", stripped)
        else:
            cells = re.split(r"\s{2,}", stripped)
        rows.append([c.strip() for c in cells if c.strip()])
    return rows


def _first_int(text: str) -> Optional[int]:
    match = re.search(r"\d[\d,]*", text)
    if not match:
        return None
    digits = match.group(0).replace(",", "")
    return int(digits) if digits else None


def _all_ints(text: str) -> list[int]:
    return [int(m.replace(",", "")) for m in re.findall(r"\d[\d,]*", text)]


def _find_percent(text: str) -> Optional[float]:
    match = _PERCENT_RE.search(text)
    return float(match.group(1)) if match else None


def _fmt_rate_label(rate_pct: float) -> str:
    if rate_pct == int(rate_pct):
        return f"{int(rate_pct)}%"
    return f"{rate_pct}%"


def parse_income_tax_speed_table(rows: list[list[str]]) -> tuple[list[dict[str, Any]], list[str]]:
    """速算表の行から (課税所得下限, 税率%, 控除額) を抽出する。

    区分境界は「各行の下限」を採用し、上限は次行の下限（最終行は上限なし）とする。
    これにより端数表記（1,949,000円まで 等）でも丸めた境界値になる。
    """
    warnings: list[str] = []
    parsed: list[dict[str, Any]] = []
    for row in rows:
        cells = [c.strip() for c in row if c.strip()]
        if not cells:
            continue
        joined = " ".join(cells)
        rate_pct = _find_percent(joined)
        if rate_pct is None:
            continue
        rate_idx = next(
            (i for i, c in enumerate(cells) if _PERCENT_RE.search(c)),
            None,
        )
        if rate_idx is not None:
            range_text = " ".join(cells[:rate_idx]) or cells[0]
            deduction_text = " ".join(cells[rate_idx + 1 :])
        else:
            range_text = cells[0]
            deduction_text = cells[-1]
        lower = _first_int(range_text)
        if lower is None:
            warnings.append(f"下限を判定できない行をスキップ: {joined}")
            continue
        deduction = _first_int(deduction_text)
        if deduction is None:
            # 控除額列が「0円」でなく空だった場合は 0 とみなす。
            deduction = 0
        parsed.append({"lower": lower, "rate_pct": rate_pct, "deduction": deduction})

    parsed.sort(key=lambda d: d["lower"])
    return parsed, warnings


def build_income_tax_bracket_drafts(
    rows: list[list[str]],
    *,
    valid_from: str,
    valid_to: Optional[str] = None,
    source_law: str = "所得税法",
    jurisdiction: Optional[str] = None,
) -> tuple[list[dict[str, Any]], list[str]]:
    """速算表の行から income_tax_bracket のエントリ草案を生成する。"""
    parsed, warnings = parse_income_tax_speed_table(rows)
    if not parsed:
        raise ValueError("速算表として解析できませんでした（税率(%)の行が見つかりません）")
    year = (valid_from or "")[:4] or "0000"
    drafts: list[dict[str, Any]] = []
    for i, item in enumerate(parsed):
        bracket_min = 0 if i == 0 else int(item["lower"])
        bracket_max = int(parsed[i + 1]["lower"]) if i + 1 < len(parsed) else None
        rate_pct = float(item["rate_pct"])
        drafts.append(
            {
                "domain": "income_tax_bracket",
                "master_key": f"income_tax.bracket.{i + 1}",
                "label_ja": f"所得税{_fmt_rate_label(rate_pct)}区分",
                "value_numeric": round(rate_pct / 100, 6),
                "value_text": None,
                "jurisdiction": jurisdiction or None,
                "valid_from": valid_from,
                "valid_to": valid_to or None,
                "source_law": source_law or None,
                "attributes": {
                    "bracket_min": bracket_min,
                    "bracket_max": bracket_max,
                    "base_deduction": int(item["deduction"]),
                },
                "master_version_id": f"itb-{i + 1}-{year}",
            }
        )
    return drafts, warnings


def drafts_to_csv(drafts: list[dict[str, Any]]) -> str:
    """草案を既存 CSV インポート経路で使える CSV テキストへ変換する。"""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_COLUMNS, lineterminator="\n")
    writer.writeheader()
    for d in drafts:
        attrs = d.get("attributes")
        writer.writerow(
            {
                "domain": d.get("domain") or "",
                "master_key": d.get("master_key") or "",
                "label_ja": d.get("label_ja") or "",
                "value_numeric": d.get("value_numeric") if d.get("value_numeric") is not None else "",
                "value_text": d.get("value_text") or "",
                "jurisdiction": d.get("jurisdiction") or "",
                "valid_from": d.get("valid_from") or "",
                "valid_to": d.get("valid_to") or "",
                "source_law": d.get("source_law") or "",
                "attributes_json": json.dumps(attrs, ensure_ascii=False) if isinstance(attrs, dict) else "",
                "master_version_id": d.get("master_version_id") or "",
            }
        )
    return buf.getvalue()


def preview_nta_import(
    *,
    template: Template,
    url: Optional[str] = None,
    text: Optional[str] = None,
    valid_from: str,
    valid_to: Optional[str] = None,
    source_law: Optional[str] = None,
    jurisdiction: Optional[str] = None,
) -> dict[str, Any]:
    """URL または貼付テキストから草案を生成して返す（保存はしない）。"""
    if not valid_from:
        raise ValueError("適用開始日（valid_from）を指定してください")
    if not url and not text:
        raise ValueError("国税庁のURL または 表の貼り付けテキストを指定してください")

    source = "text"
    if url:
        rows = rows_from_html(fetch_nta_html(url))
        source = "url"
    else:
        rows = rows_from_text(text or "")

    if template == "income_tax_speed_table":
        drafts, warnings = build_income_tax_bracket_drafts(
            rows,
            valid_from=valid_from,
            valid_to=valid_to,
            source_law=source_law or "所得税法",
            jurisdiction=jurisdiction,
        )
    else:  # pragma: no cover - guarded by schema
        raise ValueError(f"未対応のテンプレートです: {template}")

    return {
        "template": template,
        "source": source,
        "entries": drafts,
        "csv_text": drafts_to_csv(drafts),
        "warnings": warnings,
    }
