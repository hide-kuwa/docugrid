"""源泉徴収簿 SSOT — 従業員マスタと月次台帳行（P-W1）。"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, List, Optional

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
PAYROLL_LEDGER_DB_PATH = STORAGE_DIR / "payroll_ledger.db"

VALID_TAX_COLUMNS = {"甲", "乙"}


def _now() -> str:
    return datetime.utcnow().isoformat()


def init_payroll_ledger_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(PAYROLL_LEDGER_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS payroll_employees (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                employee_code TEXT,
                name TEXT NOT NULL,
                hire_date TEXT,
                tax_column TEXT NOT NULL DEFAULT '甲',
                dependent_count INTEGER NOT NULL DEFAULT 0,
                spouse_deduction INTEGER NOT NULL DEFAULT 0,
                social_insurance_grade INTEGER,
                notes TEXT,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_payroll_employees_client
            ON payroll_employees (firm_id, client_id, active, name)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS withholding_ledger_rows (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                employee_id TEXT NOT NULL,
                year_month TEXT NOT NULL,
                gross_pay_yen INTEGER NOT NULL DEFAULT 0,
                bonus_yen INTEGER NOT NULL DEFAULT 0,
                health_insurance_yen INTEGER NOT NULL DEFAULT 0,
                pension_yen INTEGER NOT NULL DEFAULT 0,
                employment_insurance_yen INTEGER NOT NULL DEFAULT 0,
                income_tax_yen INTEGER NOT NULL DEFAULT 0,
                resident_tax_yen INTEGER NOT NULL DEFAULT 0,
                net_pay_yen INTEGER NOT NULL DEFAULT 0,
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE (firm_id, client_id, employee_id, year_month)
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_withholding_ledger_month
            ON withholding_ledger_rows (firm_id, client_id, year_month)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS social_insurance_grades (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                employee_id TEXT NOT NULL,
                effective_from TEXT NOT NULL,
                grade INTEGER NOT NULL,
                standard_monthly_yen INTEGER NOT NULL,
                source TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS marufu_submissions (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                employee_id TEXT,
                capture_item_id TEXT,
                doc_type TEXT,
                parsed_json TEXT NOT NULL,
                applied_at TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_marufu_submissions_client
            ON marufu_submissions (firm_id, client_id, created_at DESC)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS year_end_adjustment_runs (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                tax_year INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                settlement_month TEXT,
                result_json TEXT NOT NULL,
                applied_at TEXT,
                created_at TEXT NOT NULL,
                created_by TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_year_end_runs_client
            ON year_end_adjustment_runs (firm_id, client_id, tax_year DESC, created_at DESC)
            """
        )


def _row_year_end_run(row: sqlite3.Row) -> dict:
    result = None
    if row["result_json"]:
        try:
            result = json.loads(row["result_json"])
        except json.JSONDecodeError:
            result = None
    return {
        "id": row["id"],
        "client_id": row["client_id"],
        "tax_year": row["tax_year"],
        "status": row["status"],
        "settlement_month": row["settlement_month"],
        "result": result,
        "applied_at": row["applied_at"],
        "created_at": row["created_at"],
        "created_by": row["created_by"],
    }


def _row_marufu(row: sqlite3.Row) -> dict:
    parsed = None
    if row["parsed_json"]:
        try:
            parsed = json.loads(row["parsed_json"])
        except json.JSONDecodeError:
            parsed = None
    return {
        "id": row["id"],
        "client_id": row["client_id"],
        "employee_id": row["employee_id"],
        "capture_item_id": row["capture_item_id"],
        "doc_type": row["doc_type"],
        "parsed": parsed,
        "applied_at": row["applied_at"],
        "created_at": row["created_at"],
    }


def _row_employee(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "client_id": row["client_id"],
        "employee_code": row["employee_code"],
        "name": row["name"],
        "hire_date": row["hire_date"],
        "tax_column": row["tax_column"],
        "dependent_count": row["dependent_count"],
        "spouse_deduction": bool(row["spouse_deduction"]),
        "social_insurance_grade": row["social_insurance_grade"],
        "notes": row["notes"],
        "active": bool(row["active"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _row_ledger(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "client_id": row["client_id"],
        "employee_id": row["employee_id"],
        "year_month": row["year_month"],
        "gross_pay_yen": row["gross_pay_yen"],
        "bonus_yen": row["bonus_yen"],
        "health_insurance_yen": row["health_insurance_yen"],
        "pension_yen": row["pension_yen"],
        "employment_insurance_yen": row["employment_insurance_yen"],
        "income_tax_yen": row["income_tax_yen"],
        "resident_tax_yen": row["resident_tax_yen"],
        "net_pay_yen": row["net_pay_yen"],
        "notes": row["notes"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _sanitize_yen(value: Any, field: str) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field} must be an integer yen amount")
    if n < 0:
        raise ValueError(f"{field} must be >= 0")
    return n


def list_employees(firm_id: str, client_id: str, *, include_inactive: bool = False) -> List[dict]:
    init_payroll_ledger_db()
    sql = """
        SELECT * FROM payroll_employees
        WHERE firm_id = ? AND client_id = ?
    """
    params: list[Any] = [firm_id, client_id]
    if not include_inactive:
        sql += " AND active = 1"
    sql += " ORDER BY name COLLATE NOCASE"
    with sqlite3.connect(PAYROLL_LEDGER_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()
    return [_row_employee(r) for r in rows]


def replace_employees(firm_id: str, client_id: str, employees: List[dict]) -> List[dict]:
    init_payroll_ledger_db()
    now = _now()
    normalized: list[dict] = []
    for raw in employees:
        emp_id = str(raw.get("id") or uuid.uuid4().hex)
        tax_column = str(raw.get("tax_column") or "甲")
        if tax_column not in VALID_TAX_COLUMNS:
            raise ValueError(f"tax_column must be one of {sorted(VALID_TAX_COLUMNS)}")
        normalized.append(
            {
                "id": emp_id,
                "firm_id": firm_id,
                "client_id": client_id,
                "employee_code": raw.get("employee_code"),
                "name": str(raw.get("name") or "").strip() or "（名称未設定）",
                "hire_date": raw.get("hire_date"),
                "tax_column": tax_column,
                "dependent_count": max(0, int(raw.get("dependent_count") or 0)),
                "spouse_deduction": 1 if raw.get("spouse_deduction") else 0,
                "social_insurance_grade": raw.get("social_insurance_grade"),
                "notes": raw.get("notes"),
                "active": 0 if raw.get("active") is False else 1,
                "created_at": raw.get("created_at") or now,
                "updated_at": now,
            }
        )

    with sqlite3.connect(PAYROLL_LEDGER_DB_PATH) as conn:
        conn.execute(
            "DELETE FROM payroll_employees WHERE firm_id = ? AND client_id = ?",
            (firm_id, client_id),
        )
        for emp in normalized:
            conn.execute(
                """
                INSERT INTO payroll_employees (
                    id, firm_id, client_id, employee_code, name, hire_date,
                    tax_column, dependent_count, spouse_deduction, social_insurance_grade,
                    notes, active, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    emp["id"],
                    emp["firm_id"],
                    emp["client_id"],
                    emp["employee_code"],
                    emp["name"],
                    emp["hire_date"],
                    emp["tax_column"],
                    emp["dependent_count"],
                    emp["spouse_deduction"],
                    emp["social_insurance_grade"],
                    emp["notes"],
                    emp["active"],
                    emp["created_at"],
                    emp["updated_at"],
                ),
            )
    return list_employees(firm_id, client_id, include_inactive=True)


def list_ledger_rows(
    firm_id: str,
    client_id: str,
    *,
    year_month: Optional[str] = None,
) -> List[dict]:
    init_payroll_ledger_db()
    sql = """
        SELECT * FROM withholding_ledger_rows
        WHERE firm_id = ? AND client_id = ?
    """
    params: list[Any] = [firm_id, client_id]
    if year_month:
        sql += " AND year_month = ?"
        params.append(year_month)
    sql += " ORDER BY year_month DESC, employee_id"
    with sqlite3.connect(PAYROLL_LEDGER_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()
    return [_row_ledger(r) for r in rows]


def upsert_ledger_row(firm_id: str, client_id: str, payload: dict) -> dict:
    init_payroll_ledger_db()
    row_id = str(payload.get("id") or uuid.uuid4().hex)
    employee_id = str(payload.get("employee_id") or "").strip()
    year_month = str(payload.get("year_month") or "").strip()
    if not employee_id:
        raise ValueError("employee_id is required")
    if not year_month or len(year_month) != 7 or year_month[4] != "-":
        raise ValueError("year_month must be YYYY-MM")

    gross = _sanitize_yen(payload.get("gross_pay_yen", 0), "gross_pay_yen")
    bonus = _sanitize_yen(payload.get("bonus_yen", 0), "bonus_yen")
    health = _sanitize_yen(payload.get("health_insurance_yen", 0), "health_insurance_yen")
    pension = _sanitize_yen(payload.get("pension_yen", 0), "pension_yen")
    employment = _sanitize_yen(
        payload.get("employment_insurance_yen", 0),
        "employment_insurance_yen",
    )
    income_tax = _sanitize_yen(payload.get("income_tax_yen", 0), "income_tax_yen")
    resident_tax = _sanitize_yen(payload.get("resident_tax_yen", 0), "resident_tax_yen")
    net_pay = payload.get("net_pay_yen")
    if net_pay is None:
        net_pay_yen = gross + bonus - health - pension - employment - income_tax - resident_tax
    else:
        net_pay_yen = _sanitize_yen(net_pay, "net_pay_yen")

    now = _now()
    with sqlite3.connect(PAYROLL_LEDGER_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO withholding_ledger_rows (
                id, firm_id, client_id, employee_id, year_month,
                gross_pay_yen, bonus_yen, health_insurance_yen, pension_yen,
                employment_insurance_yen, income_tax_yen, resident_tax_yen, net_pay_yen,
                notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(firm_id, client_id, employee_id, year_month) DO UPDATE SET
                gross_pay_yen = excluded.gross_pay_yen,
                bonus_yen = excluded.bonus_yen,
                health_insurance_yen = excluded.health_insurance_yen,
                pension_yen = excluded.pension_yen,
                employment_insurance_yen = excluded.employment_insurance_yen,
                income_tax_yen = excluded.income_tax_yen,
                resident_tax_yen = excluded.resident_tax_yen,
                net_pay_yen = excluded.net_pay_yen,
                notes = excluded.notes,
                updated_at = excluded.updated_at
            """,
            (
                row_id,
                firm_id,
                client_id,
                employee_id,
                year_month,
                gross,
                bonus,
                health,
                pension,
                employment,
                income_tax,
                resident_tax,
                net_pay_yen,
                payload.get("notes"),
                now,
                now,
            ),
        )
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM withholding_ledger_rows WHERE id = ?",
            (row_id,),
        ).fetchone()
    if not row:
        raise RuntimeError("Failed to upsert ledger row")
    return _row_ledger(row)


def delete_ledger_row(firm_id: str, client_id: str, row_id: str) -> bool:
    init_payroll_ledger_db()
    with sqlite3.connect(PAYROLL_LEDGER_DB_PATH) as conn:
        cur = conn.execute(
            """
            DELETE FROM withholding_ledger_rows
            WHERE id = ? AND firm_id = ? AND client_id = ?
            """,
            (row_id, firm_id, client_id),
        )
    return cur.rowcount > 0


def ledger_summary(firm_id: str, client_id: str, year_month: str) -> dict:
    rows = list_ledger_rows(firm_id, client_id, year_month=year_month)
    totals = {
        "gross_pay_yen": 0,
        "bonus_yen": 0,
        "health_insurance_yen": 0,
        "pension_yen": 0,
        "employment_insurance_yen": 0,
        "income_tax_yen": 0,
        "resident_tax_yen": 0,
        "net_pay_yen": 0,
    }
    for row in rows:
        for key in totals:
            totals[key] += int(row[key])
    return {
        "year_month": year_month,
        "row_count": len(rows),
        "totals": totals,
    }


def list_marufu_submissions(firm_id: str, client_id: str) -> List[dict]:
    init_payroll_ledger_db()
    with sqlite3.connect(PAYROLL_LEDGER_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT * FROM marufu_submissions
            WHERE firm_id = ? AND client_id = ?
            ORDER BY created_at DESC
            """,
            (firm_id, client_id),
        ).fetchall()
    return [_row_marufu(r) for r in rows]


def apply_marufu_to_payroll(
    firm_id: str,
    client_id: str,
    parsed: dict,
    *,
    employee_id: Optional[str] = None,
    capture_item_id: Optional[str] = None,
) -> dict:
    """まるふ OCR 結果を従業員マスタへ反映。"""
    from services.marufu_parser import payroll_patch_from_marufu

    init_payroll_ledger_db()
    patch = payroll_patch_from_marufu(parsed)
    employees = list_employees(firm_id, client_id, include_inactive=True)
    target: Optional[dict] = None

    if employee_id:
        target = next((e for e in employees if e["id"] == employee_id), None)
    if not target and patch.get("name"):
        target = next(
            (e for e in employees if patch["name"] in e["name"] or e["name"] in patch["name"]),
            None,
        )
    if not target and len(employees) == 1:
        target = employees[0]

    now = _now()
    if target:
        updated = {
            **target,
            **{k: v for k, v in patch.items() if k != "name" or not target.get("name")},
            "updated_at": now,
        }
        if patch.get("name") and (not target.get("name") or target["name"].startswith("（")):
            updated["name"] = patch["name"]
        replace_employees(
            firm_id,
            client_id,
            [
                updated if e["id"] == target["id"] else e
                for e in employees
            ],
        )
        applied_employee_id = target["id"]
    else:
        new_emp = {
            "id": uuid.uuid4().hex,
            "name": patch.get("name") or "（OCR 従業員）",
            "tax_column": "甲",
            "dependent_count": patch.get("dependent_count", 0),
            "spouse_deduction": patch.get("spouse_deduction", False),
            "notes": patch.get("notes"),
            "active": True,
            "created_at": now,
        }
        employees.append(new_emp)
        replace_employees(firm_id, client_id, employees)
        applied_employee_id = new_emp["id"]

    submission_id = uuid.uuid4().hex
    with sqlite3.connect(PAYROLL_LEDGER_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO marufu_submissions (
                id, firm_id, client_id, employee_id, capture_item_id,
                doc_type, parsed_json, applied_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                submission_id,
                firm_id,
                client_id,
                applied_employee_id,
                capture_item_id,
                parsed.get("doc_type"),
                json.dumps(parsed, ensure_ascii=False),
                now,
                now,
            ),
        )

    employee = next(
        (e for e in list_employees(firm_id, client_id, include_inactive=True) if e["id"] == applied_employee_id),
        None,
    )
    return {
        "submission_id": submission_id,
        "employee": employee,
        "parsed": parsed,
    }


def _marufu_by_employee(firm_id: str, client_id: str) -> dict:
    """従業員ごとの最新まるふ parsed を返す。"""
    out: dict = {}
    for sub in list_marufu_submissions(firm_id, client_id):
        emp_id = sub.get("employee_id")
        if emp_id and sub.get("parsed"):
            out[emp_id] = sub["parsed"]
    return out


def run_year_end_adjustment(
    firm_id: str,
    client_id: str,
    *,
    tax_year: int,
    settlement_month: Optional[str] = None,
    created_by: Optional[str] = None,
) -> dict:
    from services.year_end_engine import compute_client_year_end

    init_payroll_ledger_db()
    employees = list_employees(firm_id, client_id)
    if not employees:
        raise ValueError("従業員が登録されていません")

    all_rows = list_ledger_rows(firm_id, client_id)
    marufu_map = _marufu_by_employee(firm_id, client_id)
    result = compute_client_year_end(
        employees,
        all_rows,
        marufu_map,
        tax_year=tax_year,
    )

    if not settlement_month:
        settlement_month = f"{tax_year}-12"

    run_id = uuid.uuid4().hex
    now = _now()
    with sqlite3.connect(PAYROLL_LEDGER_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO year_end_adjustment_runs (
                id, firm_id, client_id, tax_year, status, settlement_month,
                result_json, applied_at, created_at, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                firm_id,
                client_id,
                tax_year,
                "computed",
                settlement_month,
                json.dumps(result, ensure_ascii=False),
                None,
                now,
                created_by,
            ),
        )
    return get_year_end_run(firm_id, run_id)


def get_year_end_run(firm_id: str, run_id: str) -> Optional[dict]:
    init_payroll_ledger_db()
    with sqlite3.connect(PAYROLL_LEDGER_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM year_end_adjustment_runs WHERE firm_id = ? AND id = ?",
            (firm_id, run_id),
        ).fetchone()
    return _row_year_end_run(row) if row else None


def list_year_end_runs(firm_id: str, client_id: str) -> List[dict]:
    init_payroll_ledger_db()
    with sqlite3.connect(PAYROLL_LEDGER_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT * FROM year_end_adjustment_runs
            WHERE firm_id = ? AND client_id = ?
            ORDER BY tax_year DESC, created_at DESC
            """,
            (firm_id, client_id),
        ).fetchall()
    return [_row_year_end_run(r) for r in rows]


def apply_year_end_settlement(firm_id: str, client_id: str, run_id: str) -> dict:
    """過不足額を精算月の源泉台帳行に反映。"""
    run = get_year_end_run(firm_id, run_id)
    if not run:
        raise ValueError("年末調整実行が見つかりません")
    if run["client_id"] != client_id:
        raise ValueError("client_id mismatch")
    if run["status"] == "applied":
        raise ValueError("既に適用済みです")

    result = run.get("result") or {}
    settlement_month = run.get("settlement_month") or f"{run['tax_year']}-12"
    applied_rows: List[dict] = []

    for emp_result in result.get("employees") or []:
        diff = int(emp_result.get("settlement_yen") or 0)
        if diff == 0:
            continue
        employee_id = emp_result["employee_id"]
        existing = next(
            (
                r
                for r in list_ledger_rows(firm_id, client_id)
                if r["employee_id"] == employee_id and r["year_month"] == settlement_month
            ),
            None,
        )
        if existing:
            new_tax = int(existing["income_tax_yen"]) + diff
            row = upsert_ledger_row(
                firm_id,
                client_id,
                {
                    **existing,
                    "income_tax_yen": new_tax,
                    "notes": f"年末調整{'徴収' if diff > 0 else '還付'} {abs(diff):,}円",
                },
            )
        else:
            row = upsert_ledger_row(
                firm_id,
                client_id,
                {
                    "employee_id": employee_id,
                    "year_month": settlement_month,
                    "gross_pay_yen": 0,
                    "bonus_yen": 0,
                    "income_tax_yen": diff,
                    "notes": f"年末調整{'徴収' if diff > 0 else '還付'} {abs(diff):,}円",
                },
            )
        applied_rows.append(row)

    now = _now()
    with sqlite3.connect(PAYROLL_LEDGER_DB_PATH) as conn:
        conn.execute(
            """
            UPDATE year_end_adjustment_runs
            SET status = ?, applied_at = ?
            WHERE firm_id = ? AND id = ?
            """,
            ("applied", now, firm_id, run_id),
        )
    return {
        "run": get_year_end_run(firm_id, run_id),
        "applied_ledger_rows": applied_rows,
    }


def compute_and_apply_santei_grades(
    firm_id: str,
    client_id: str,
    *,
    tax_year: int,
) -> dict:
    """算定基礎届に基づく社保等級を従業員マスタへ反映。"""
    from services.social_insurance_santei import compute_client_santei

    employees = list_employees(firm_id, client_id, include_inactive=True)
    all_rows = list_ledger_rows(firm_id, client_id)
    santei = compute_client_santei(employees, all_rows, tax_year=tax_year)

    now = _now()
    updated: List[dict] = []
    emp_by_id = {e["id"]: e for e in employees}
    for item in santei.get("employees") or []:
        if item.get("status") != "ok":
            continue
        emp = emp_by_id.get(item["employee_id"])
        if not emp:
            continue
        emp["social_insurance_grade"] = item["suggested_grade"]
        emp["notes"] = (
            (emp.get("notes") or "")
            + f" 算定基礎届 {tax_year}: 等級{item['suggested_grade']}"
        ).strip()
        emp["updated_at"] = now
        updated.append(emp)

    if updated:
        patch_by_id = {u["id"]: u for u in updated}
        replace_employees(
            firm_id,
            client_id,
            [patch_by_id.get(e["id"], e) for e in employees],
        )

    return santei
