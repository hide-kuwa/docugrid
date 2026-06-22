"""経費レシートのカレンダー・商談コンテキスト突合（E3 原型）。"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
CALENDAR_EVENTS_PATH = STORAGE_DIR / "demo_calendar_events.json"

_DATE_PATTERNS = [
    re.compile(r"(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})"),
    re.compile(r"(\d{1,2})[月/.](\d{1,2})"),
]


def _load_events() -> Dict[str, List[dict]]:
    if CALENDAR_EVENTS_PATH.exists():
        try:
            raw = json.loads(CALENDAR_EVENTS_PATH.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                return {str(k): list(v) for k, v in raw.items() if isinstance(v, list)}
        except Exception:
            pass
    return _default_demo_events()


def _default_demo_events() -> Dict[str, List[dict]]:
    today = datetime.utcnow().date()
    d = today.isoformat()
    return {
        "c1": [
            {
                "date": d,
                "time": "18:30",
                "title": "〇〇商事 佐藤部長 商談後会食",
                "company": "〇〇商事",
                "contact": "佐藤部長",
                "attendees": 2,
                "type": "entertainment",
            },
            {
                "date": d,
                "time": "14:00",
                "title": "社内ミーティング",
                "company": "自社",
                "contact": "経理部",
                "attendees": 5,
                "type": "meeting",
            },
        ],
        "c2": [
            {
                "date": d,
                "time": "12:00",
                "title": "△△株式会社 打合せ",
                "company": "△△株式会社",
                "contact": "田中様",
                "attendees": 3,
                "type": "meeting",
            },
        ],
    }


def ensure_demo_calendar_seed() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    if not CALENDAR_EVENTS_PATH.exists():
        CALENDAR_EVENTS_PATH.write_text(
            json.dumps(_default_demo_events(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


def extract_receipt_date(text: str) -> Optional[str]:
    """OCR テキストから日付 YYYY-MM-DD を推定。"""
    now = datetime.utcnow()
    for pat in _DATE_PATTERNS:
        m = pat.search(text)
        if not m:
            continue
        groups = m.groups()
        try:
            if len(groups) == 3:
                y, mo, d = int(groups[0]), int(groups[1]), int(groups[2])
            else:
                y, mo, d = now.year, int(groups[0]), int(groups[1])
            return f"{y:04d}-{mo:02d}-{d:02d}"
        except ValueError:
            continue
    return now.date().isoformat()


def extract_store_name(text: str) -> Optional[str]:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for line in lines[:8]:
        if len(line) >= 2 and not re.match(r"^\d", line):
            if any(k in line for k in ("株式会社", "有限", "店", "食堂", "カフェ", "居酒屋")):
                return line[:80]
    return lines[0][:80] if lines else None


def extract_total_yen(text: str) -> Optional[int]:
    patterns = [
        re.compile(r"(?:合計|総計|お買上|ご利用額)[^\d]{0,10}([\d,]+)"),
        re.compile(r"¥\s*([\d,]+)"),
    ]
    for pat in patterns:
        m = pat.search(text)
        if m:
            try:
                return int(m.group(1).replace(",", ""))
            except ValueError:
                continue
    return None


def _load_events_for_client(client_id: str) -> List[dict]:
    try:
        from services.tenancy import DEFAULT_FIRM_ID, get_client_firm_id
        from services.client_calendar_service import events_for_expense_context

        firm_id = get_client_firm_id(client_id) or DEFAULT_FIRM_ID
        events = events_for_expense_context(firm_id, client_id)
        if events:
            return events
    except Exception:
        pass
    ensure_demo_calendar_seed()
    events_map = _load_events()
    return events_map.get(client_id) or events_map.get("c1", [])


def suggest_expense_context(client_id: str, text: str) -> Dict[str, Any]:
    """レシート日時とカレンダー SSOT を突合し、交際費サジェストを返す。"""
    events = _load_events_for_client(client_id)
    receipt_date = extract_receipt_date(text)
    store = extract_store_name(text)
    total = extract_total_yen(text)

    candidates: List[dict] = []
    for ev in events:
        ev_date = str(ev.get("date", ""))
        if receipt_date and ev_date != receipt_date:
            continue
        score = 0.5
        if receipt_date == ev_date:
            score += 0.3
        if store and ev.get("company") and str(ev["company"]) in (text or ""):
            score += 0.2
        candidates.append({**ev, "score": round(score, 2)})

    candidates.sort(key=lambda c: c.get("score", 0), reverse=True)
    best = candidates[0] if candidates else None

    expense_type = "unknown"
    if best:
        expense_type = "entertainment" if best.get("type") == "entertainment" else "meeting"
    elif total and total <= 10000:
        expense_type = "meeting_candidate"

    per_person: Optional[int] = None
    if total and best and best.get("attendees"):
        try:
            per_person = round(total / int(best["attendees"]))
        except (TypeError, ValueError, ZeroDivisionError):
            per_person = None

    issues: List[str] = []
    if total and per_person and per_person > 10000:
        issues.append(f"1人当たり {per_person:,}円 — 交際費の損金算入上限（1万円）を超える可能性があります。")

    suggestion_text = None
    if best:
        company = best.get("company", "")
        contact = best.get("contact", "")
        attendees = best.get("attendees", 1)
        others = max(0, int(attendees) - 1)
        suggestion_text = f"{company} {contact}ほか{others}名との会食・打合せですか？"

    return {
        "receipt_date": receipt_date,
        "store_name": store,
        "total_yen": total,
        "per_person_yen": per_person,
        "expense_type": expense_type,
        "calendar_match": best,
        "calendar_candidates": candidates[:3],
        "suggestion_text": suggestion_text,
        "issues": issues,
        "status": "needs_review" if issues else ("ok" if best else "needs_review"),
    }


def build_expense_context_from_manual(
    client_id: str,
    *,
    total_yen: Optional[int] = None,
    attendees: Optional[int] = None,
) -> Dict[str, Any]:
    """手入力の合計・人数から経費コンテキストを組み立てる。"""
    base = suggest_expense_context(client_id, "")
    if total_yen is not None:
        base["total_yen"] = total_yen
    per_person: Optional[int] = None
    if total_yen and attendees and attendees > 0:
        per_person = round(total_yen / attendees)
        base["per_person_yen"] = per_person
        if base.get("calendar_match"):
            match = dict(base["calendar_match"])
            match["attendees"] = attendees
            base["calendar_match"] = match
    issues: List[str] = list(base.get("issues") or [])
    if per_person and per_person > 10000:
        msg = f"1人当たり {per_person:,}円 — 交際費の損金算入上限（1万円）を超える可能性があります。"
        if msg not in issues:
            issues.append(msg)
    base["issues"] = issues
    base["status"] = "needs_review" if issues else ("ok" if base.get("calendar_match") else "needs_review")
    return base
