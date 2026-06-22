"""算定基礎届 — 4・5・6 月給与から標準報酬月額を試算（P-W4 原型）。

TODO: STANDARD_REMUNERATION_TABLE は暫定ハードコード。移行先は共通マスタ
`standard_remuneration_grades`（docs/temporal-master-pattern.md §6）。
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

# 2024年度 健康保険・厚生年金 標準報酬月額等級（抜粋・円）
STANDARD_REMUNERATION_TABLE: List[tuple[int, int, int]] = [
    (58_000, 63_000, 1),
    (63_000, 73_000, 2),
    (73_000, 83_000, 3),
    (83_000, 93_000, 4),
    (93_000, 101_000, 5),
    (101_000, 107_000, 6),
    (107_000, 114_000, 7),
    (114_000, 122_000, 8),
    (122_000, 130_000, 9),
    (130_000, 138_000, 10),
    (138_000, 146_000, 11),
    (146_000, 155_000, 12),
    (155_000, 165_000, 13),
    (165_000, 175_000, 14),
    (175_000, 185_000, 15),
    (185_000, 195_000, 16),
    (195_000, 210_000, 17),
    (210_000, 230_000, 18),
    (230_000, 250_000, 19),
    (250_000, 270_000, 20),
    (270_000, 300_000, 21),
    (300_000, 330_000, 22),
    (330_000, 360_000, 23),
    (360_000, 390_000, 24),
    (390_000, 420_000, 25),
    (420_000, 450_000, 26),
    (450_000, 480_000, 27),
    (480_000, 510_000, 28),
    (510_000, 540_000, 29),
    (540_000, 570_000, 30),
    (570_000, 600_000, 31),
    (600_000, 630_000, 32),
    (630_000, 680_000, 33),
    (680_000, 730_000, 34),
    (730_000, 780_000, 35),
    (780_000, 830_000, 36),
    (830_000, 880_000, 37),
    (880_000, 930_000, 38),
    (930_000, 980_000, 39),
    (980_000, 1_030_000, 40),
    (1_030_000, 1_090_000, 41),
    (1_090_000, 1_150_000, 42),
    (1_150_000, 1_210_000, 43),
    (1_210_000, 1_270_000, 44),
    (1_270_000, 1_330_000, 45),
    (1_330_000, 1_390_000, 46),
    (1_390_000, 1_500_000, 47),
    (1_500_000, 1_600_000, 48),
    (1_600_000, 1_700_000, 49),
    (1_700_000, 1_800_000, 50),
]


def grade_from_remuneration(monthly_yen: int) -> tuple[int, int]:
    """報酬月額 → (等級, 標準報酬月額)。"""
    y = max(0, monthly_yen)
    for lo, hi, grade in STANDARD_REMUNERATION_TABLE:
        if lo <= y < hi:
            standard = (lo + hi) // 2 if hi - lo > 1 else lo
            return grade, standard
    if y >= 1_800_000:
        return 50, 1_750_000
    return 1, 58_000


def compute_santei_base(
    employee: dict,
    ledger_rows: List[dict],
    *,
    tax_year: int,
) -> Dict[str, Any]:
    """4・5・6 月の給与から算定基礎届の平均報酬月額を算出。"""
    months = [f"{tax_year}-04", f"{tax_year}-05", f"{tax_year}-06"]
    amounts: List[int] = []
    for ym in months:
        row = next((r for r in ledger_rows if r.get("year_month") == ym), None)
        if row:
            amounts.append(
                int(row.get("gross_pay_yen") or 0) + int(row.get("bonus_yen") or 0),
            )
    if not amounts:
        return {
            "employee_id": employee["id"],
            "employee_name": employee.get("name"),
            "months_found": 0,
            "average_monthly_yen": 0,
            "suggested_grade": employee.get("social_insurance_grade"),
            "suggested_standard_monthly_yen": None,
            "status": "insufficient_data",
        }

    avg = sum(amounts) // len(amounts)
    grade, standard = grade_from_remuneration(avg)
    current = employee.get("social_insurance_grade")
    changed = current is not None and int(current) != grade

    return {
        "employee_id": employee["id"],
        "employee_name": employee.get("name"),
        "months_found": len(amounts),
        "monthly_amounts_yen": amounts,
        "average_monthly_yen": avg,
        "suggested_grade": grade,
        "suggested_standard_monthly_yen": standard,
        "current_grade": current,
        "grade_changed": changed,
        "effective_from": f"{tax_year}-09",
        "status": "ok",
    }


def compute_client_santei(
    employees: List[dict],
    all_ledger_rows: List[dict],
    *,
    tax_year: int,
) -> Dict[str, Any]:
    results = []
    for emp in employees:
        if not emp.get("active", True):
            continue
        emp_rows = [r for r in all_ledger_rows if r.get("employee_id") == emp["id"]]
        results.append(compute_santei_base(emp, emp_rows, tax_year=tax_year))
    changed = [r for r in results if r.get("grade_changed")]
    return {
        "tax_year": tax_year,
        "employee_count": len(results),
        "grade_change_count": len(changed),
        "employees": results,
    }
