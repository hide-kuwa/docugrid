"""Firm-wide tax progress boards (My Common–style) — manual cells + auto due dates."""

from __future__ import annotations

import json
import sqlite3
from calendar import monthrange
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Optional

from services.tenancy import DEFAULT_FIRM_ID

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
TAX_PROGRESS_DB_PATH = STORAGE_DIR / "tax_progress.db"

# pack → ordered stages (id, label, days_after_fiscal_month_end for auto due)
# fiscal month end = last day of fiscalMonth; filing often +2 months — offsets are approximate ops targets
PACK_STAGES: dict[str, list[dict[str, Any]]] = {
    "closing": [
        {"id": "docs_received", "label": "資料受領", "due_offset_days": 12},
        {"id": "outsource_store", "label": "外注資料送付・格納", "due_offset_days": 14},
        {"id": "accounting_entry", "label": "会計入力", "due_offset_days": 28},
        {"id": "accounting_review", "label": "会計レビュー", "due_offset_days": 28},
        {"id": "corp_tax_prep", "label": "法人税申告書作成", "due_offset_days": 42},
        {"id": "consumption_tax_prep", "label": "消費税申告書作成", "due_offset_days": 42},
        {"id": "return_review", "label": "申告書レビュー", "due_offset_days": 43},
        {"id": "payment_slip_prep", "label": "納付書作成", "due_offset_days": 46},
        {"id": "payment_slip_sent", "label": "納付書送付", "due_offset_days": 46},
        {"id": "corp_efiling", "label": "法人税・地方法人税電子申告", "due_offset_days": 46},
        {"id": "consumption_efiling", "label": "消費税電子申告", "due_offset_days": 46},
        {"id": "payment_confirm", "label": "納付確認", "due_offset_days": 62},
        {"id": "return_sent", "label": "申告書送付", "due_offset_days": 50},
        {"id": "docs_returned", "label": "資料返却", "due_offset_days": 55},
        {"id": "invoice_sent", "label": "請求書送付", "due_offset_days": 55},
        {"id": "interim_guidance", "label": "翌期中間納付額案内", "due_offset_days": 70},
    ],
    "interim": [
        {"id": "interim_calc", "label": "中間税額算定", "due_offset_days": 150},
        {"id": "interim_slip", "label": "中間納付書作成", "due_offset_days": 160},
        {"id": "interim_sent", "label": "中間納付案内送付", "due_offset_days": 165},
        {"id": "interim_efiling", "label": "中間電子申告・納付確認", "due_offset_days": 180},
    ],
    "withholding": [
        {"id": "payroll_received", "label": "給与データ受領", "due_offset_days": 5},
        {"id": "withholding_calc", "label": "源泉計算", "due_offset_days": 8},
        {"id": "withholding_slip", "label": "納付書作成", "due_offset_days": 9},
        {"id": "withholding_pay", "label": "源泉納付", "due_offset_days": 10},
        {"id": "withholding_report", "label": "徴収高計算書", "due_offset_days": 12},
    ],
}

PACK_LABELS = {
    "closing": "決算・申告",
    "interim": "中間納税",
    "withholding": "源泉",
}

STATUSES = frozenset({"pending", "done", "na"})


def _now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def init_tax_progress_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(TAX_PROGRESS_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS tax_progress_cells (
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                pack TEXT NOT NULL,
                stage_id TEXT NOT NULL,
                cycle_key TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending',
                completed_on TEXT,
                due_on TEXT,
                note TEXT NOT NULL DEFAULT '',
                source TEXT NOT NULL DEFAULT 'manual',
                updated_at TEXT NOT NULL,
                PRIMARY KEY (firm_id, client_id, pack, stage_id, cycle_key)
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_tax_progress_firm_pack
                ON tax_progress_cells (firm_id, pack, cycle_key)
            """
        )


def packs_public() -> list[dict[str, Any]]:
    out = []
    for pack_id, stages in PACK_STAGES.items():
        out.append(
            {
                "id": pack_id,
                "label": PACK_LABELS.get(pack_id, pack_id),
                "stages": [
                    {"id": s["id"], "label": s["label"], "due_offset_days": s["due_offset_days"]}
                    for s in stages
                ],
            }
        )
    return out


def fiscal_month_end(year: int, fiscal_month: int) -> date:
    fm = max(1, min(12, int(fiscal_month or 3)))
    last = monthrange(year, fm)[1]
    return date(year, fm, last)


def due_on_for_stage(fiscal_month: int, offset_days: int, *, ref: Optional[date] = None) -> str:
    """Due date = fiscal month-end (latest closed or current cycle) + offset."""
    today = ref or date.today()
    y = today.year
    end = fiscal_month_end(y, fiscal_month)
    if end > today:
        # still in this fiscal year before month-end — use previous year close
        end = fiscal_month_end(y - 1, fiscal_month)
    from datetime import timedelta

    return (end + timedelta(days=int(offset_days))).isoformat()


def default_cycle_key(pack: str, *, ref: Optional[date] = None) -> str:
    today = ref or date.today()
    if pack == "withholding":
        return f"{today.year}-{today.month:02d}"
    return f"FY{today.year}"


def upsert_cell(
    firm_id: str,
    *,
    client_id: str,
    pack: str,
    stage_id: str,
    status: str,
    note: Optional[str] = None,
    due_on: Optional[str] = None,
    completed_on: Optional[str] = None,
    source: str = "manual",
    cycle_key: Optional[str] = None,
) -> dict[str, Any]:
    if pack not in PACK_STAGES:
        raise ValueError("invalid_pack")
    stage_ids = {s["id"] for s in PACK_STAGES[pack]}
    if stage_id not in stage_ids:
        raise ValueError("invalid_stage")
    if status not in STATUSES:
        raise ValueError("invalid_status")
    init_tax_progress_db()
    fid = (firm_id or "").strip() or DEFAULT_FIRM_ID
    ck = (cycle_key or "").strip() or default_cycle_key(pack)
    now = _now()
    done_on = completed_on
    if status == "done" and not done_on:
        done_on = date.today().isoformat()
    if status != "done":
        done_on = None
    with sqlite3.connect(TAX_PROGRESS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        existing = conn.execute(
            """
            SELECT * FROM tax_progress_cells
            WHERE firm_id=? AND client_id=? AND pack=? AND stage_id=? AND cycle_key=?
            """,
            (fid, client_id, pack, stage_id, ck),
        ).fetchone()
        note_val = note if note is not None else (existing["note"] if existing else "")
        due_val = due_on if due_on is not None else (existing["due_on"] if existing else None)
        conn.execute(
            """
            INSERT INTO tax_progress_cells (
                firm_id, client_id, pack, stage_id, cycle_key,
                status, completed_on, due_on, note, source, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(firm_id, client_id, pack, stage_id, cycle_key) DO UPDATE SET
                status=excluded.status,
                completed_on=excluded.completed_on,
                due_on=COALESCE(excluded.due_on, tax_progress_cells.due_on),
                note=excluded.note,
                source=excluded.source,
                updated_at=excluded.updated_at
            """,
            (
                fid,
                client_id,
                pack,
                stage_id,
                ck,
                status,
                done_on,
                due_val,
                note_val or "",
                source,
                now,
            ),
        )
        row = conn.execute(
            """
            SELECT * FROM tax_progress_cells
            WHERE firm_id=? AND client_id=? AND pack=? AND stage_id=? AND cycle_key=?
            """,
            (fid, client_id, pack, stage_id, ck),
        ).fetchone()
    return dict(row)


def list_cells(
    firm_id: str,
    *,
    pack: str,
    cycle_key: Optional[str] = None,
) -> list[dict[str, Any]]:
    if pack not in PACK_STAGES:
        raise ValueError("invalid_pack")
    init_tax_progress_db()
    fid = (firm_id or "").strip() or DEFAULT_FIRM_ID
    ck = (cycle_key or "").strip() or default_cycle_key(pack)
    with sqlite3.connect(TAX_PROGRESS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT * FROM tax_progress_cells
            WHERE firm_id=? AND pack=? AND cycle_key=?
            """,
            (fid, pack, ck),
        ).fetchall()
    return [dict(r) for r in rows]


def ensure_due_dates_for_clients(
    firm_id: str,
    *,
    pack: str,
    clients: list[dict[str, Any]],
    cycle_key: Optional[str] = None,
) -> int:
    """Create pending cells with auto due dates when missing."""
    if pack not in PACK_STAGES:
        raise ValueError("invalid_pack")
    init_tax_progress_db()
    fid = (firm_id or "").strip() or DEFAULT_FIRM_ID
    ck = (cycle_key or "").strip() or default_cycle_key(pack)
    created = 0
    with sqlite3.connect(TAX_PROGRESS_DB_PATH) as conn:
        for client in clients:
            cid = str(client.get("id") or "").strip()
            if not cid:
                continue
            fm = int(client.get("fiscalMonth") or client.get("fiscal_month") or 3)
            for stage in PACK_STAGES[pack]:
                due = due_on_for_stage(fm, int(stage["due_offset_days"]))
                cur = conn.execute(
                    """
                    SELECT 1 FROM tax_progress_cells
                    WHERE firm_id=? AND client_id=? AND pack=? AND stage_id=? AND cycle_key=?
                    """,
                    (fid, cid, pack, stage["id"], ck),
                ).fetchone()
                if cur:
                    # fill due_on if empty
                    conn.execute(
                        """
                        UPDATE tax_progress_cells SET due_on=COALESCE(due_on, ?)
                        WHERE firm_id=? AND client_id=? AND pack=? AND stage_id=? AND cycle_key=?
                          AND (due_on IS NULL OR due_on='')
                        """,
                        (due, fid, cid, pack, stage["id"], ck),
                    )
                    continue
                conn.execute(
                    """
                    INSERT INTO tax_progress_cells (
                        firm_id, client_id, pack, stage_id, cycle_key,
                        status, completed_on, due_on, note, source, updated_at
                    ) VALUES (?,?,?,?,?,'pending',NULL,?,'','auto',?)
                    """,
                    (fid, cid, pack, stage["id"], ck, due, _now()),
                )
                created += 1
        conn.commit()
    return created


def board_payload(
    firm_id: str,
    *,
    pack: str,
    clients: list[dict[str, Any]],
    cycle_key: Optional[str] = None,
    fiscal_month: Optional[int] = None,
    assignee_id: Optional[str] = None,
) -> dict[str, Any]:
    if pack not in PACK_STAGES:
        raise ValueError("invalid_pack")
    ck = (cycle_key or "").strip() or default_cycle_key(pack)
    filtered = list(clients)
    if fiscal_month is not None:
        fm = int(fiscal_month)
        filtered = [
            c
            for c in filtered
            if int(c.get("fiscalMonth") or c.get("fiscal_month") or 0) == fm
        ]
    if assignee_id:
        aid = assignee_id.strip()
        filtered = [
            c
            for c in filtered
            if aid
            in {
                str(a.get("id") or a.get("stakeholder_id") or "")
                for a in (c.get("assignees") or [])
            }
            or str(c.get("primary_assignee_id") or "") == aid
        ]

    ensure_due_dates_for_clients(firm_id, pack=pack, clients=filtered, cycle_key=ck)
    cells = list_cells(firm_id, pack=pack, cycle_key=ck)
    by_key = {(c["client_id"], c["stage_id"]): c for c in cells}

    rows = []
    done_cells = 0
    total_cells = 0
    for client in filtered:
        cid = str(client["id"])
        stages_out = []
        for stage in PACK_STAGES[pack]:
            cell = by_key.get((cid, stage["id"]))
            total_cells += 1
            status = (cell or {}).get("status") or "pending"
            if status == "done":
                done_cells += 1
            stages_out.append(
                {
                    "stage_id": stage["id"],
                    "label": stage["label"],
                    "status": status,
                    "completed_on": (cell or {}).get("completed_on"),
                    "due_on": (cell or {}).get("due_on"),
                    "note": (cell or {}).get("note") or "",
                    "source": (cell or {}).get("source") or "auto",
                }
            )
        rows.append(
            {
                "client_id": cid,
                "client_name": client.get("name") or cid,
                "client_code": client.get("code") or client.get("profile", {}).get("code") or "",
                "fiscal_month": int(client.get("fiscalMonth") or client.get("fiscal_month") or 0),
                "primary_assignee_id": client.get("primary_assignee_id"),
                "primary_assignee_name": client.get("primary_assignee_name") or "",
                "assignees": client.get("assignees") or [],
                "note": client.get("progress_note") or "",
                "stages": stages_out,
            }
        )

    return {
        "pack": pack,
        "pack_label": PACK_LABELS.get(pack, pack),
        "cycle_key": ck,
        "stages": [
            {"id": s["id"], "label": s["label"], "due_offset_days": s["due_offset_days"]}
            for s in PACK_STAGES[pack]
        ],
        "packs": packs_public(),
        "rows": rows,
        "summary": {
            "clients": len(rows),
            "done_cells": done_cells,
            "total_cells": total_cells,
        },
    }
