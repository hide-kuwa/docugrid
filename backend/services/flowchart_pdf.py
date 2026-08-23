"""保存済み判定を PDF にする。ひな形の現行版は見ない（保存時点のスナップショットのみ）。"""

from __future__ import annotations

from typing import Any

from services.text_to_pdf import text_to_pdf_bytes


def _flag(value: Any) -> str:
    if isinstance(value, bool):
        return "該当" if value else "非該当"
    return "" if value is None else str(value)


def snapshot_to_text(item: dict[str, Any]) -> str:
    snap = item.get("snapshot") if isinstance(item.get("snapshot"), dict) else {}
    law_label = item.get("law_label") or snap.get("law_label") or ""
    law_range = item.get("law_range") or snap.get("law_range") or ""
    as_of = item.get("as_of") or snap.get("as_of") or ""
    lines = [
        ">> 判定記録（保存時点の税法で固定）",
        "",
        f"保存名: {item.get('title') or snap.get('template_title') or '判定'}",
        f"顧問先: {snap.get('client_name') or ''}",
        f"ひな形: {snap.get('template_title') or ''}",
        f"税法: {law_label or '（ラベルなし）'}",
        f"適用期間: {law_range or '（未設定）'}",
        f"判定基準日: {as_of or '（未記録）'}",
        f"保存日時: {str(item.get('saved_at') or '')[:19].replace('T', ' ')}",
        f"結果: {snap.get('outcome_label') or ''}",
        "",
        snap.get("message") or "",
        "",
        "条件",
    ]
    for cond in snap.get("conditions") or []:
        if not isinstance(cond, dict):
            continue
        mark = "○" if cond.get("matched") else "×"
        lines.append(f"{mark} {cond.get('label') or cond.get('id')}")
        if cond.get("rule"):
            lines.append(f"　{cond.get('rule')}")
        for fact in cond.get("facts") or []:
            if not isinstance(fact, dict):
                continue
            display = fact.get("display")
            if not display:
                display = _flag(fact.get("value"))
            lines.append(f"　- {fact.get('label')}: {display}")
        lines.append("")
    lines.append("この PDF は保存時点の判定です。その後の法改正・ひな形更新では書き換えません。")
    return "\n".join(lines)


def instance_to_pdf_bytes(item: dict[str, Any]) -> bytes:
    title = str(item.get("title") or item.get("snapshot", {}).get("template_title") or "判定記録")
    return text_to_pdf_bytes(snapshot_to_text(item), title=title)
