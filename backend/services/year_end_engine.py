"""年末調整計算エンジン（P-W5 原型 — 簡易版）。

TODO: 控除額・累進税率・復興税は暫定ハードコード。移行先は共通マスタサービス
（docs/temporal-master-pattern.md §6）。過去データは applied_rates でイミュータブル保持。
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

# 基礎控除・扶養控除（簡易固定額・令和7年分近似）
BASIC_DEDUCTION_YEN = 480_000
DEPENDENT_DEDUCTION_YEN = 380_000
SPOUSE_DEDUCTION_YEN = 380_000
RECONSTRUCTION_TAX_RATE = 0.021


def salary_income_deduction_yen(payment_yen: int) -> int:
    """給与収入に対する給与所得控除額（簡易表）。"""
    p = max(0, payment_yen)
    if p <= 1_625_000:
        return 550_000
    if p <= 1_800_000:
        return int(p * 0.4 - 100_000)
    if p <= 3_600_000:
        return int(p * 0.3 + 80_000)
    if p <= 6_600_000:
        return int(p * 0.2 + 440_000)
    if p <= 8_500_000:
        return int(p * 0.1 + 1_100_000)
    return 1_950_000


def income_tax_on_taxable(taxable_yen: int) -> int:
    """所得税額（簡易累進税率）。"""
    t = max(0, taxable_yen)
    if t <= 1_950_000:
        return int(t * 0.05)
    if t <= 3_300_000:
        return int(t * 0.10 - 97_500)
    if t <= 6_950_000:
        return int(t * 0.20 - 427_500)
    if t <= 9_000_000:
        return int(t * 0.23 - 636_000)
    if t <= 18_000_000:
        return int(t * 0.33 - 1_536_000)
    if t <= 40_000_000:
        return int(t * 0.40 - 2_796_000)
    return int(t * 0.45 - 4_796_000)


def _annual_payment(rows: List[dict]) -> int:
    return sum(int(r.get("gross_pay_yen") or 0) + int(r.get("bonus_yen") or 0) for r in rows)


def _annual_withheld(rows: List[dict]) -> int:
    return sum(int(r.get("income_tax_yen") or 0) for r in rows)


def _annual_social(rows: List[dict]) -> int:
    return sum(
        int(r.get("health_insurance_yen") or 0)
        + int(r.get("pension_yen") or 0)
        + int(r.get("employment_insurance_yen") or 0)
        for r in rows
    )


def _insurance_deduction_from_marufu(marufu_parsed: Optional[dict]) -> int:
    if not marufu_parsed:
        return 0
    total = 0
    for key in ("life_insurance_yen", "earthquake_insurance_yen", "social_insurance_yen"):
        val = marufu_parsed.get(key)
        if val:
            total += int(val)
    return min(total, 120_000)


def compute_employee_year_end(
    employee: dict,
    ledger_rows: List[dict],
    *,
    marufu_parsed: Optional[dict] = None,
    extra_deductions_yen: int = 0,
) -> Dict[str, Any]:
    """1 従業員の年末調整試算。"""
    payment = _annual_payment(ledger_rows)
    withheld = _annual_withheld(ledger_rows)
    social = _annual_social(ledger_rows)

    salary_deduction = salary_income_deduction_yen(payment)
    salary_income = max(0, payment - salary_deduction)

    dependent = int(employee.get("dependent_count") or 0)
    spouse = bool(employee.get("spouse_deduction"))
    deductions = BASIC_DEDUCTION_YEN
    deductions += dependent * DEPENDENT_DEDUCTION_YEN
    if spouse:
        deductions += SPOUSE_DEDUCTION_YEN
    deductions += _insurance_deduction_from_marufu(marufu_parsed)
    deductions += social
    deductions += extra_deductions_yen

    taxable = max(0, salary_income - deductions)
    income_tax = income_tax_on_taxable(taxable)
    reconstruction = int(income_tax * RECONSTRUCTION_TAX_RATE)
    annual_tax = income_tax + reconstruction

    diff = annual_tax - withheld
    settlement_type = "even"
    if diff > 0:
        settlement_type = "collect"
    elif diff < 0:
        settlement_type = "refund"

    return {
        "employee_id": employee["id"],
        "employee_name": employee.get("name"),
        "tax_column": employee.get("tax_column"),
        "annual_payment_yen": payment,
        "annual_withheld_yen": withheld,
        "annual_social_yen": social,
        "salary_income_deduction_yen": salary_deduction,
        "salary_income_yen": salary_income,
        "total_deductions_yen": deductions,
        "taxable_income_yen": taxable,
        "income_tax_yen": income_tax,
        "reconstruction_tax_yen": reconstruction,
        "annual_tax_yen": annual_tax,
        "settlement_yen": diff,
        "settlement_type": settlement_type,
        "marufu_applied": marufu_parsed is not None,
    }


def compute_client_year_end(
    employees: List[dict],
    all_ledger_rows: List[dict],
    marufu_by_employee: Dict[str, dict],
    *,
    tax_year: int,
) -> Dict[str, Any]:
    """顧問先全体の年末調整一括試算。"""
    prefix = f"{tax_year}-"
    year_rows = [r for r in all_ledger_rows if str(r.get("year_month", "")).startswith(prefix)]

    results: List[dict] = []
    for emp in employees:
        if not emp.get("active", True):
            continue
        emp_rows = [r for r in year_rows if r.get("employee_id") == emp["id"]]
        marufu = marufu_by_employee.get(emp["id"])
        results.append(
            compute_employee_year_end(emp, emp_rows, marufu_parsed=marufu),
        )

    total_collect = sum(r["settlement_yen"] for r in results if r["settlement_yen"] > 0)
    total_refund = sum(-r["settlement_yen"] for r in results if r["settlement_yen"] < 0)

    return {
        "tax_year": tax_year,
        "employee_count": len(results),
        "total_collect_yen": total_collect,
        "total_refund_yen": total_refund,
        "employees": results,
    }
