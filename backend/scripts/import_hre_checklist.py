"""HRE 形式 Excel チェックリストを DocuGrid テンプレート JSON に変換する。"""

from __future__ import annotations

import json
import re
import uuid
from pathlib import Path
from typing import Any

SAMPLE_PATH = Path(__file__).resolve().parent.parent / "storage" / "platform" / "hre_checklist_sample.json"
OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "hre_review_checklist_template.json"

SHEET_ORDER = [
    "決算要調事項",
    "消費税申告書①",
    "決算書②",
    "決算書③",
    "申告書④",
    "申告書⑤",
]


def _slug(text: str) -> str:
    s = re.sub(r"[^\w\u3040-\u30ff\u4e00-\u9fff]+", "-", text.strip())
    return s[:40].strip("-") or uuid.uuid4().hex[:8]


def _parse_adjustment_sheet(rows: list[dict]) -> dict[str, Any]:
    points: list[dict] = []
    for row in rows:
        cells = row["cells"]
        if cells.get("1") == "No.":
            continue
        no = cells.get("1")
        if no and str(no).isdigit():
            points.append(
                {
                    "id": f"adj-{no}",
                    "number": str(no),
                    "label": cells.get("2", ""),
                    "indent": 0,
                    "kind": "adjustment_point",
                }
            )
    return {
        "id": "section-adjustments",
        "title": "決算要調事項",
        "kind": "adjustments",
        "items": points,
    }


def _parse_checklist_rows(rows: list[dict], section_id: str) -> list[dict]:
    items: list[dict] = []
    subgroup = ""
    for row in rows:
        cells = row["cells"]
        c1 = str(cells.get("1", "") or "").strip()
        c2 = str(cells.get("2", "") or "").strip()
        c3 = str(cells.get("3", "") or "").strip()
        c4 = str(cells.get("4", "") or "").strip()
        c5 = str(cells.get("5", "") or "").strip()
        c6 = str(cells.get("6", "") or "").strip()

        if c1.startswith("【") and not c2:
            subgroup = c1
            items.append(
                {
                    "id": f"{section_id}-hdr-{_slug(c1)}",
                    "number": "",
                    "label": c1,
                    "indent": 0,
                    "kind": "group_header",
                }
            )
            continue
        if c2 in ("確認事項", "Point．"):
            continue
        if not c2 and not c1:
            continue

        if c1.isdigit():
            item_id = f"{section_id}-{c1}"
            items.append(
                {
                    "id": item_id,
                    "number": c1,
                    "label": c2,
                    "indent": 0,
                    "kind": "question",
                    "subgroup": subgroup,
                    "sampleStatus": c3,
                    "sampleReference": c4,
                    "sampleComment": c5,
                    "sampleAnswer": c6,
                }
            )
        elif c2:
            parent_no = items[-1]["number"] if items and items[-1].get("number") else ""
            sub_id = f"{section_id}-{parent_no or 'sub'}-{_slug(c2)[:20]}"
            items.append(
                {
                    "id": sub_id,
                    "number": "",
                    "label": c2,
                    "indent": 1,
                    "kind": "question",
                    "subgroup": subgroup,
                    "sampleStatus": c3,
                    "sampleReference": c4,
                    "sampleComment": c5,
                    "sampleAnswer": c6,
                }
            )
    return items


def build_template(sample: dict) -> dict:
    sections: list[dict] = []
    for sheet_name in SHEET_ORDER:
        if sheet_name not in sample:
            continue
        sheet = sample[sheet_name]
        rows = sheet["rows"]
        sid = f"section-{_slug(sheet_name)}"
        if sheet_name == "決算要調事項":
            sections.append(_parse_adjustment_sheet(rows))
            continue
        title = sheet_name
        for row in rows[:3]:
            c1 = row["cells"].get("1", "")
            if str(c1).startswith("【"):
                title = str(c1).strip("【 】")
                break
        sections.append(
            {
                "id": sid,
                "title": title,
                "sheetLabel": sheet_name,
                "kind": "checklist",
                "items": _parse_checklist_rows(rows, sid),
            }
        )

    return {
        "schemaVersion": 2,
        "templateId": "hre-standard",
        "title": "決算・申告 監査チェックリスト（HRE標準）",
        "description": "HRE 様式をベースにした所内回覧用チェックリスト。顧問先マスタからヘッダを自動入力し、確認・コメント後に PDF 化できます。",
        "periodTypes": ["year"],
        "headerFields": [
            {
                "id": "client_name",
                "label": "顧客名",
                "autoKey": "client_name",
                "placeholder": "【　会社名　様】",
            },
            {
                "id": "fiscal_period",
                "label": "法人（事業年度）",
                "autoKey": "fiscal_period_label",
                "placeholder": "第 ２期 ４ 月 １ 日 ～ ３ 月 ３１ 日",
            },
            {
                "id": "consumption_tax",
                "label": "消費税申告",
                "autoKey": "consumption_tax_summary",
                "placeholder": "あり　還付申告",
            },
        ],
        "statusOptions": [
            {"value": "ok", "label": "〇", "symbol": "〇"},
            {"value": "ng", "label": "✖", "symbol": "✖"},
            {"value": "na", "label": "ー", "symbol": "ー"},
            {"value": "pending", "label": "未確認", "symbol": ""},
            {"value": "note", "label": "コメント", "symbol": ""},
        ],
        "sections": sections,
    }


def main() -> None:
    sample = json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))
    template = build_template(sample)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(template, ensure_ascii=False, indent=2), encoding="utf-8")
    total = sum(len(s.get("items") or []) for s in template["sections"])
    print(f"Wrote {OUT_PATH} sections={len(template['sections'])} items={total}")


if __name__ == "__main__":
    main()
