"""法定マスタに基づく計算ロジック（参照テーブル＋スカラーを解決して算定）。

計算アルゴリズムはマスタ（ref_table_service / legal_master_service）から数値を取得し、
金額・料率をハードコーディングしない。端数処理の順序は法令に合わせる。
"""

from __future__ import annotations

import math
from typing import Any, Optional

from services import corporate_tax_service, legal_master_service, ref_table_service


def _floor_yen(value: float) -> int:
    return max(0, int(math.floor(value)))


def _round_50sen(value: float) -> int:
    """雇用保険 被保険者負担額の端数処理：50銭以下切捨・50銭超切上。"""
    frac = value - math.floor(value)
    base = int(math.floor(value))
    return base if frac <= 0.5 else base + 1


# --- 雇用保険料 ---


def calc_employment_insurance(
    wage: int,
    business: str = "一般の事業",
    *,
    as_of: Optional[str] = None,
) -> dict[str, Any]:
    version = ref_table_service.effective_version("employment_insurance_rate", as_of)
    if not version:
        raise ValueError("雇用保険料率マスタが登録されていません")
    row = next((r for r in version.get("rows", []) if r.get("business") == business), None)
    if row is None:
        raise ValueError(f"事業区分が見つかりません: {business}")
    wage = max(0, int(wage))
    worker_rate = float(row.get("worker", 0))
    total_rate = float(row.get("total", 0))
    worker = _round_50sen(wage * worker_rate)
    total = _floor_yen(wage * total_rate)
    employer = max(0, total - worker)
    return {
        "wage": wage,
        "business": business,
        "worker_rate": worker_rate,
        "employer_rate": float(row.get("employer", 0)),
        "total_rate": total_rate,
        "worker_amount": worker,
        "employer_amount": employer,
        "total_amount": total,
        "valid_from": version.get("valid_from"),
        "label": version.get("label"),
    }


# --- 社会保険 標準報酬・賞与上限 ---


def clip_social_insurance_basis(
    amount: int,
    insurance: str,
    basis: str,
    *,
    as_of: Optional[str] = None,
) -> dict[str, Any]:
    """社会保険料計算の基礎額を制度上限でクリップする。

    amount: 実際の報酬月額または賞与額。
    insurance: "厚生年金" / "健康保険"。
    basis: "標準報酬月額" / "標準賞与額"。
    """
    version = ref_table_service.effective_version("social_insurance_standard_caps", as_of)
    if not version:
        raise ValueError("社会保険上限マスタが登録されていません")
    row = next(
        (
            r
            for r in version.get("rows", [])
            if r.get("insurance") == insurance and r.get("basis") == basis
        ),
        None,
    )
    if row is None:
        raise ValueError(f"社会保険上限が見つかりません: {insurance} / {basis}")
    amount = max(0, int(amount))
    cap = int(row.get("cap_amount") or 0)
    return {
        "amount": amount,
        "insurance": insurance,
        "basis": basis,
        "cap_amount": cap,
        "clipped_amount": min(amount, cap),
        "was_clipped": amount > cap,
        "grade": row.get("grade"),
        "valid_from": version.get("valid_from"),
        "label": version.get("label"),
    }


# --- 基礎控除 ---


def lookup_basic_deduction(
    total_income: int,
    *,
    as_of: Optional[str] = None,
    non_resident: bool = False,
) -> dict[str, Any]:
    version = ref_table_service.effective_version("basic_deduction", as_of)
    if not version:
        raise ValueError("基礎控除マスタが登録されていません")
    income = max(0, int(total_income))
    chosen = None
    for row in version.get("rows", []):
        cap = row.get("income_max")
        if cap is None or income <= int(cap):
            chosen = row
            break
    if chosen is None:
        chosen = version["rows"][-1]
    amount = int(chosen.get("amount", 0))
    if non_resident:
        amount = min(amount, 580000)
    return {
        "total_income": income,
        "amount": amount,
        "income_band": chosen.get("income_band"),
        "non_resident": non_resident,
        "valid_from": version.get("valid_from"),
        "label": version.get("label"),
    }


# --- 配偶者控除・配偶者特別控除 ---


def _taxpayer_col(taxpayer_income: int) -> Optional[str]:
    if taxpayer_income <= 9_000_000:
        return "h900"
    if taxpayer_income <= 9_500_000:
        return "h950"
    if taxpayer_income <= 10_000_000:
        return "h1000"
    return None


def lookup_spouse_deduction(
    spouse_income: int,
    taxpayer_income: int,
    *,
    spouse_elderly: bool = False,
    as_of: Optional[str] = None,
) -> dict[str, Any]:
    version = ref_table_service.effective_version("spouse_deduction", as_of)
    if not version:
        raise ValueError("配偶者控除マスタが登録されていません")
    spouse_income = max(0, int(spouse_income))
    taxpayer_income = max(0, int(taxpayer_income))
    col = _taxpayer_col(taxpayer_income)
    rows = version.get("rows", [])

    kind = "none"
    chosen = None
    if spouse_income <= 480000:
        kind = "配偶者控除"
        for r in rows:
            if r.get("kind") == "control" and bool(r.get("elderly")) == spouse_elderly:
                chosen = r
                break
    else:
        kind = "配偶者特別控除"
        for r in rows:
            if r.get("kind") != "special":
                continue
            cap = r.get("spouse_income_max")
            if cap is not None and spouse_income <= int(cap):
                chosen = r
                break

    amount = 0
    if chosen is not None and col is not None:
        amount = int(chosen.get(col, 0))
    if chosen is None or col is None:
        kind = "none"

    return {
        "spouse_income": spouse_income,
        "taxpayer_income": taxpayer_income,
        "spouse_elderly": spouse_elderly,
        "kind": kind,
        "amount": amount,
        "spouse_income_band": chosen.get("spouse_income") if chosen else None,
        "valid_from": version.get("valid_from"),
    }


# --- 法人住民税 均等割 ---


def lookup_corporate_percapita(
    capital: int,
    employees: int,
    *,
    as_of: Optional[str] = None,
) -> dict[str, Any]:
    version = ref_table_service.effective_version("corporate_resident_percapita", as_of)
    if not version:
        raise ValueError("法人住民税均等割マスタが登録されていません")
    capital = max(0, int(capital))
    employees = max(0, int(employees))
    chosen = None
    for row in version.get("rows", []):
        cap = row.get("capital_max")
        if cap is None or capital <= int(cap):
            chosen = row
            break
    if chosen is None:
        chosen = version["rows"][-1]
    pref = int(chosen.get("pref", 0))
    city = int(chosen.get("city_over50" if employees > 50 else "city_le50", 0))
    return {
        "capital": capital,
        "employees": employees,
        "capital_band": chosen.get("capital_band"),
        "prefecture_amount": pref,
        "municipal_amount": city,
        "total": pref + city,
        "note": "標準税率。自治体により超過課税がある。",
        "valid_from": version.get("valid_from"),
    }


# --- 消費税 簡易課税 みなし仕入率 ---


def calc_simplified_consumption(
    tax_by_type: dict[int, float],
    *,
    unclassified_tax: float = 0.0,
    unclassified_types: Optional[list[int]] = None,
    as_of: Optional[str] = None,
) -> dict[str, Any]:
    """簡易課税の仕入控除税額を計算する。

    tax_by_type: {事業区分番号: 課税標準に対する消費税額}。
    unclassified_tax: 事業区分をしていない売上に係る消費税額。
    unclassified_types: 未区分に含まれる事業区分（最も低いみなし仕入率を適用）。未指定なら第6種を適用。
    """
    version = ref_table_service.effective_version("simplified_tax_deemed_rate", as_of)
    if not version:
        raise ValueError("みなし仕入率マスタが登録されていません")
    rate_by_type: dict[int, float] = {}
    for r in version.get("rows", []):
        no = r.get("type_no")
        if no is not None:
            rate_by_type[int(no)] = float(r.get("deemed_rate", 0))

    breakdown: list[dict[str, Any]] = []
    deduction = 0.0
    for type_no, tax in tax_by_type.items():
        rate = rate_by_type.get(int(type_no))
        if rate is None:
            raise ValueError(f"事業区分が不正です: {type_no}")
        portion = float(tax) * rate
        deduction += portion
        breakdown.append({"type_no": int(type_no), "rate": rate, "tax": float(tax), "deduction": portion})

    if unclassified_tax > 0:
        types = unclassified_types or [6]
        low_rate = min(rate_by_type.get(int(t), 0.0) for t in types)
        portion = float(unclassified_tax) * low_rate
        deduction += portion
        breakdown.append(
            {
                "type_no": 0,
                "rate": low_rate,
                "tax": float(unclassified_tax),
                "deduction": portion,
                "note": "未区分のため最も低いみなし仕入率を適用",
            }
        )

    return {
        "deduction": _floor_yen(deduction),
        "breakdown": breakdown,
        "valid_from": version.get("valid_from"),
    }


# --- 給与所得控除（給与収入→給与所得） ---


def calc_employment_income(salary_revenue: int, *, as_of: Optional[str] = None) -> dict[str, Any]:
    """給与収入から給与所得控除額と給与所得を計算する。"""
    version = ref_table_service.effective_version("employment_income_deduction", as_of)
    if not version:
        raise ValueError("給与所得控除マスタが登録されていません")
    revenue = max(0, int(salary_revenue))
    chosen = None
    for row in version.get("rows", []):
        rmin = int(row.get("min") or 0)
        rmax = row.get("max")
        if revenue >= rmin and (rmax is None or revenue <= int(rmax)):
            chosen = row
            break
    if chosen is None:
        chosen = version["rows"][-1]
    if chosen.get("flat") is not None:
        deduction = int(chosen["flat"])
    else:
        deduction = _floor_yen(revenue * float(chosen.get("rate", 0)) + float(chosen.get("add", 0)))
    deduction = min(deduction, revenue)
    return {
        "salary_revenue": revenue,
        "deduction": deduction,
        "employment_income": max(0, revenue - deduction),
        "band": chosen.get("band"),
        "valid_from": version.get("valid_from"),
        "label": version.get("label"),
    }


# --- 個人住民税（所得割・均等割＋自治体別超過課税） ---


def calc_individual_resident_tax(
    taxable_income: int,
    as_of: str,
    *,
    jurisdiction_code: Optional[str] = None,
    designated_city: bool = False,
    include_forest_tax: bool = True,
) -> dict[str, Any]:
    """個人住民税（所得割＋均等割）を計算する。

    taxable_income: 課税総所得金額等（各種所得控除後）。
    designated_city: 政令指定都市（所得割の内訳が道府県2%/市8%。合計は不変）。
    jurisdiction_code: 超過課税テーブルの団体コード（該当があれば上乗せ）。
    """
    income = max(0, int(taxable_income))

    def _rate(key: str) -> float:
        entry = legal_master_service.lookup_rate(key, as_of)
        return float(entry["value"]) if entry and entry.get("value") is not None else 0.0

    def _amt(key: str) -> int:
        entry = legal_master_service.lookup_rate(key, as_of)
        return int(entry["value"]) if entry and entry.get("value") is not None else 0

    if designated_city:
        pref_rate = _rate("resident_tax.income_levy.designated_city.prefecture")
        city_rate = _rate("resident_tax.income_levy.designated_city.municipal")
    else:
        pref_rate = _rate("resident_tax.income_levy.prefecture")
        city_rate = _rate("resident_tax.income_levy.municipal")

    percap_pref = _amt("resident_tax.percapita.prefecture")
    percap_city = _amt("resident_tax.percapita.municipal")
    forest = _amt("resident_tax.forest_environment") if include_forest_tax else 0

    # 超過課税（自治体別例外）。
    excess_percap = 0
    excess_income_rate = 0.0
    excess_row = None
    if jurisdiction_code:
        excess_row = ref_table_service.find_row(
            "resident_tax_excess", {"jurisdiction_code": jurisdiction_code}, as_of=as_of
        )
        if excess_row:
            excess_percap = int(excess_row.get("percapita_add") or 0)
            excess_income_rate = float(excess_row.get("income_rate_add") or 0)

    income_levy = _floor_yen(income * (pref_rate + city_rate + excess_income_rate))
    percapita = percap_pref + percap_city + forest + excess_percap

    return {
        "taxable_income": income,
        "designated_city": designated_city,
        "jurisdiction_code": jurisdiction_code,
        "income_levy_rate": pref_rate + city_rate,
        "excess_income_rate": excess_income_rate,
        "income_levy": income_levy,
        "percapita_prefecture": percap_pref,
        "percapita_municipal": percap_city,
        "forest_environment_tax": forest,
        "excess_percapita": excess_percap,
        "percapita_total": percapita,
        "total": income_levy + percapita,
        "excess_applied": excess_row is not None
        and (excess_percap > 0 or excess_income_rate > 0),
        "valid_from": as_of,
    }


# --- 最低賃金 コンプライアンス判定 ---


def check_minimum_wage(
    monthly_base_salary: int,
    monthly_scheduled_hours: float,
    prefecture: str,
    *,
    as_of: Optional[str] = None,
) -> dict[str, Any]:
    """換算時給が地域別最低賃金を下回らないか判定する。"""
    row = ref_table_service.find_row("minimum_wage", {"prefecture": prefecture}, as_of=as_of)
    if not row:
        raise ValueError(f"最低賃金が見つかりません: {prefecture}")
    version = ref_table_service.effective_version("minimum_wage", as_of)
    minimum = int(row.get("amount") or 0)
    hours = float(monthly_scheduled_hours)
    hourly = (max(0, int(monthly_base_salary)) / hours) if hours > 0 else 0.0
    hourly_floor = int(math.floor(hourly))
    return {
        "prefecture": prefecture,
        "minimum_wage": minimum,
        "converted_hourly": hourly_floor,
        "compliant": hourly_floor >= minimum,
        "shortfall": max(0, minimum - hourly_floor),
        "valid_from": version.get("valid_from") if version else None,
        "label": version.get("label") if version else None,
    }


# --- 防衛特別法人税（基準法人税額に対する付加税） ---


def calc_defense_surtax(corporate_tax_amount: int, as_of: str) -> dict[str, Any]:
    """防衛特別法人税額＝基準法人税額 × 税率（マスタから解決）。"""
    entry = legal_master_service.lookup_rate("corporate_tax.defense_special_rate", as_of)
    rate = float(entry["value"]) if entry and entry.get("value") is not None else 0.0
    amount = _floor_yen(max(0, int(corporate_tax_amount)) * rate)
    return {
        "base_corporate_tax": max(0, int(corporate_tax_amount)),
        "rate": rate,
        "amount": amount,
        "applicable": entry is not None,
        "valid_from": entry.get("valid_from") if entry else None,
    }


# --- 協会けんぽ・厚生年金 保険料額表 ---


def _round_half_yen(value: float) -> float:
    """協会けんぽPDFの『折半額』表記に合わせ、0.5円単位へ丸める（表示用）。"""
    return math.floor(value * 2 + 1e-9) / 2


def lookup_standard_grade(remuneration_monthly: int, *, as_of: Optional[str] = None) -> dict[str, Any]:
    """報酬月額から標準報酬月額等級を解決する。"""
    version = ref_table_service.effective_version("social_insurance_standard_grades", as_of)
    if not version:
        raise ValueError("標準報酬月額等級表が登録されていません")
    amount = max(0, int(remuneration_monthly))
    matched = None
    for row in version.get("rows", []):
        lo = row.get("remuneration_min")
        hi = row.get("remuneration_max")
        lo_ok = lo is None or amount >= int(lo)
        hi_ok = hi is None or amount < int(hi)
        if lo_ok and hi_ok:
            matched = row
            break
    if matched is None:
        # 最上級（報酬が上限開放）へフォールバック。
        rows = version.get("rows") or []
        matched = rows[-1] if rows else None
    if matched is None:
        raise ValueError("等級を解決できませんでした")
    return {
        "remuneration_monthly": amount,
        "grade_health": matched.get("grade_health"),
        "grade_pension": matched.get("grade_pension"),
        "standard_monthly": int(matched.get("standard_monthly") or 0),
        "remuneration_min": matched.get("remuneration_min"),
        "remuneration_max": matched.get("remuneration_max"),
        "valid_from": version.get("valid_from"),
        "label": version.get("label"),
    }


def lookup_association_health_rate(
    prefecture_code: str = "13",
    *,
    as_of: Optional[str] = None,
    prefecture: Optional[str] = None,
) -> dict[str, Any]:
    """都道府県支部の協会けんぽ等の料率を解決する。"""
    version = ref_table_service.effective_version("association_health_rates", as_of)
    if not version:
        raise ValueError("協会けんぽ料率マスタが登録されていません")
    row = None
    if prefecture_code:
        row = next(
            (r for r in version.get("rows", []) if str(r.get("prefecture_code")) == str(prefecture_code)),
            None,
        )
    if row is None and prefecture:
        row = next(
            (r for r in version.get("rows", []) if str(r.get("prefecture")) == prefecture),
            None,
        )
    if row is None:
        raise ValueError(
            f"都道府県の料率が見つかりません: code={prefecture_code} name={prefecture}"
        )
    return {
        **row,
        "valid_from": version.get("valid_from"),
        "label": version.get("label"),
    }


def calc_association_health_premium(
    remuneration_monthly: int,
    *,
    prefecture_code: str = "13",
    care_applicable: bool = False,
    as_of: Optional[str] = None,
) -> dict[str, Any]:
    """協会けんぽ保険料額表相当の計算（等級×都道府県料率）。

    care_applicable: 介護保険第2号被保険者（40〜64歳）に該当するか。
    """
    grade = lookup_standard_grade(remuneration_monthly, as_of=as_of)
    rates = lookup_association_health_rate(prefecture_code, as_of=as_of)

    health_std = int(grade["standard_monthly"])
    pension_std = health_std
    # 厚年等級が無い（健保36級以上）場合は厚年上限650,000円。
    if grade.get("grade_pension") is None and health_std > 650000:
        pension_std = 650000
    elif grade.get("grade_pension") is None and health_std < 88000:
        pension_std = 0

    health_rate = float(rates["health_care_rate"] if care_applicable else rates["health_rate"])
    care_rate = float(rates["care_rate"]) if care_applicable else 0.0
    child_support_rate = float(rates.get("child_support_rate") or 0)
    pension_rate = float(rates.get("pension_rate") or 0)
    childcare_contrib_rate = float(rates.get("childcare_contrib_rate") or 0)

    health_full = health_std * health_rate
    child_support_full = health_std * child_support_rate
    pension_full = pension_std * pension_rate
    childcare_contrib_full = pension_std * childcare_contrib_rate  # 厚年標準報酬ベース・事業主のみ

    def _half(full: float) -> float:
        return _round_half_yen(full / 2)

    health_employee = _half(health_full)
    child_support_employee = _half(child_support_full)
    pension_employee = _half(pension_full) if pension_std else 0.0

    # 納付用の整数額（給与天引き側の端数処理は50銭基準が一般的だが、表の折半額を優先）。
    employee_total = _floor_yen(health_employee + child_support_employee + pension_employee)
    employer_health = _floor_yen(health_full - health_employee)
    employer_child_support = _floor_yen(child_support_full - child_support_employee)
    employer_pension = _floor_yen(pension_full - pension_employee) if pension_std else 0
    employer_childcare = _floor_yen(childcare_contrib_full)
    employer_total = employer_health + employer_child_support + employer_pension + employer_childcare

    return {
        "remuneration_monthly": int(remuneration_monthly),
        "prefecture_code": str(rates.get("prefecture_code")),
        "prefecture": rates.get("prefecture"),
        "care_applicable": care_applicable,
        "grade_health": grade.get("grade_health"),
        "grade_pension": grade.get("grade_pension"),
        "standard_monthly_health": health_std,
        "standard_monthly_pension": pension_std,
        "health_rate": health_rate,
        "care_rate": care_rate,
        "base_health_rate": float(rates["health_rate"]),
        "child_support_rate": child_support_rate,
        "pension_rate": pension_rate,
        "childcare_contrib_rate": childcare_contrib_rate,
        "health_full": round(health_full, 1),
        "health_employee": health_employee,
        "child_support_full": round(child_support_full, 1),
        "child_support_employee": child_support_employee,
        "pension_full": round(pension_full, 2),
        "pension_employee": pension_employee,
        "childcare_contrib_employer": employer_childcare,
        "employee_total": employee_total,
        "employer_total": employer_total,
        "total": employee_total + employer_total,
        "source_url": rates.get("source_url"),
        "valid_from": rates.get("valid_from"),
        "label": rates.get("label"),
    }


def list_association_health_prefectures(*, as_of: Optional[str] = None) -> list[dict[str, Any]]:
    version = ref_table_service.effective_version("association_health_rates", as_of)
    if not version:
        return []
    out = []
    for r in version.get("rows", []):
        out.append(
            {
                "prefecture_code": str(r.get("prefecture_code") or ""),
                "prefecture": r.get("prefecture"),
                "health_rate": r.get("health_rate"),
                "health_care_rate": r.get("health_care_rate"),
                "source_url": r.get("source_url"),
            }
        )
    out.sort(key=lambda x: x["prefecture_code"])
    return out


def _premium_pair(standard: int, rate: float) -> tuple[float, float]:
    full = round(standard * rate, 1) if rate else 0.0
    # PDF 表記に合わせ 0.5 円単位。整数になる場合は .0 相当。
    half = _round_half_yen(full / 2) if full else 0.0
    return full, half


def build_association_health_amount_table(
    prefecture_code: str = "13",
    *,
    as_of: Optional[str] = None,
) -> dict[str, Any]:
    """協会けんぽPDF相当の保険料額一覧（全等級）を組み立てる。"""
    rates = lookup_association_health_rate(prefecture_code, as_of=as_of)
    grades_version = ref_table_service.effective_version("social_insurance_standard_grades", as_of)
    if not grades_version:
        raise ValueError("標準報酬月額等級表が登録されていません")

    health_rate = float(rates.get("health_rate") or 0)
    health_care_rate = float(rates.get("health_care_rate") or 0)
    care_rate = float(rates.get("care_rate") or 0)
    child_support_rate = float(rates.get("child_support_rate") or 0)
    pension_rate = float(rates.get("pension_rate") or 0)

    rows: list[dict[str, Any]] = []
    for g in grades_version.get("rows", []):
        health_std = int(g.get("standard_monthly") or 0)
        grade_pension = g.get("grade_pension")
        pension_std = health_std
        if grade_pension is None and health_std > 650000:
            pension_std = 650000
        elif grade_pension is None and health_std < 88000:
            pension_std = 0

        health_full, health_half = _premium_pair(health_std, health_rate)
        care_full, care_half = _premium_pair(health_std, health_care_rate)
        child_full, child_half = _premium_pair(health_std, child_support_rate)
        if pension_std:
            pension_full, pension_half = _premium_pair(pension_std, pension_rate)
        else:
            pension_full, pension_half = 0.0, 0.0

        rows.append(
            {
                "grade_health": g.get("grade_health"),
                "grade_pension": grade_pension,
                "standard_monthly": health_std,
                "remuneration_min": g.get("remuneration_min"),
                "remuneration_max": g.get("remuneration_max"),
                "health_full": health_full,
                "health_half": health_half,
                "health_care_full": care_full,
                "health_care_half": care_half,
                "child_support_full": child_full,
                "child_support_half": child_half,
                "pension_full": pension_full,
                "pension_half": pension_half,
                "pension_standard_monthly": pension_std,
            }
        )

    return {
        "prefecture_code": str(rates.get("prefecture_code")),
        "prefecture": rates.get("prefecture"),
        "source_url": rates.get("source_url"),
        "valid_from": rates.get("valid_from"),
        "label": rates.get("label"),
        "health_rate": health_rate,
        "care_rate": care_rate,
        "health_care_rate": health_care_rate,
        "child_support_rate": child_support_rate,
        "pension_rate": pension_rate,
        "childcare_contrib_rate": float(rates.get("childcare_contrib_rate") or 0),
        "grades_valid_from": grades_version.get("valid_from"),
        "rows": rows,
    }


# --- 法人地方税（均等割・法人税割・事業税・特別法人事業税） ---


def _lookup_scalar_rate(master_key: str, as_of: str, default: float) -> float:
    entry = legal_master_service.lookup_rate(master_key, as_of)
    if entry and entry.get("value") is not None:
        return float(entry["value"])
    return default


def calc_corporate_enterprise_tax(
    taxable_income: int,
    *,
    as_of: Optional[str] = None,
    corp_type: str = "普通法人",
    use_excess_rate: bool = False,
    reduced_rate_applicable: bool = True,
) -> dict[str, Any]:
    """法人事業税（所得割・1号）を段階税率で計算する。"""
    version = ref_table_service.effective_version("corporate_enterprise_tax", as_of)
    if not version:
        raise ValueError("法人事業税マスタが登録されていません")
    income = max(0, int(taxable_income))
    rate_key = "excess_rate" if use_excess_rate else "standard_rate"
    rows = [r for r in version.get("rows", []) if r.get("corp_type") == corp_type]
    if not rows:
        raise ValueError(f"法人事業税の区分が見つかりません: {corp_type}")

    # 軽減税率不適用法人は全額に最終段階の税率を適用。
    if not reduced_rate_applicable:
        top = rows[-1]
        rate = float(top.get(rate_key) or 0)
        tax = _floor_yen(income * rate)
        return {
            "taxable_income": income,
            "corp_type": corp_type,
            "use_excess_rate": use_excess_rate,
            "reduced_rate_applicable": False,
            "tax": tax,
            "bands": [{"income_band": top.get("income_band"), "portion": income, "rate": rate, "tax": tax}],
            "valid_from": version.get("valid_from"),
            "label": version.get("label"),
        }

    tax = 0.0
    prev = 0
    bands: list[dict[str, Any]] = []
    for row in rows:
        cap = row.get("income_max")
        upper = income if cap is None else min(income, int(cap))
        if upper <= prev:
            continue
        portion = upper - prev
        rate = float(row.get(rate_key) or 0)
        part = portion * rate
        tax += part
        bands.append(
            {
                "income_band": row.get("income_band"),
                "portion": portion,
                "rate": rate,
                "tax": _floor_yen(part),
            }
        )
        prev = upper
        if cap is not None and income <= int(cap):
            break

    return {
        "taxable_income": income,
        "corp_type": corp_type,
        "use_excess_rate": use_excess_rate,
        "reduced_rate_applicable": True,
        "tax": _floor_yen(tax),
        "bands": bands,
        "valid_from": version.get("valid_from"),
        "label": version.get("label"),
    }


def calc_corporate_local_taxes(
    taxable_income: int,
    fiscal_year_start: str,
    *,
    small_business: bool = True,
    capital: int = 10_000_000,
    employees: int = 30,
    jurisdiction: str = "tokyo_23",
    use_excess_rate: bool = False,
    reduced_rate_applicable: bool = True,
    offices_in_prefectures: int = 1,
) -> dict[str, Any]:
    """法人税（国税）＋地方法人税＋法人住民税（法人税割・均等割）＋事業税＋特別法人事業税。

    事業所税は対象外。外形標準課税（資本金1億円超）は未対応（所得割のみ）。
    """
    as_of = fiscal_year_start
    income = max(0, int(taxable_income))

    # 軽減税率不適用の自動判定（簡易）: 資本金1000万円以上かつ都道府県数が3以上、または外形。
    if capital >= 100_000_000:
        # 外形標準課税領域は別途。ここでは所得割の軽減不適用扱いにする。
        reduced_rate_applicable = False
    elif capital >= 10_000_000 and offices_in_prefectures >= 3:
        reduced_rate_applicable = False

    corp = corporate_tax_service.compute_corporate_tax(
        income, fiscal_year_start, small_business=small_business
    )
    national = int(corp["tax"])

    local_rate = _lookup_scalar_rate("corporate_tax.local_corporate_rate", as_of, 0.103)
    local_corporate = _floor_yen(national * local_rate)

    levy_row = ref_table_service.find_row(
        "corporate_resident_levy", {"jurisdiction": jurisdiction}, as_of=as_of
    )
    if not levy_row:
        # フォールバック: 23区標準7%
        levy_rate = 0.104 if use_excess_rate else 0.07
        levy_label = jurisdiction
    else:
        levy_rate = float(
            levy_row.get("excess_rate" if use_excess_rate else "standard_rate") or 0
        )
        levy_label = str(levy_row.get("jurisdiction_label") or jurisdiction)
    resident_levy = _floor_yen(national * levy_rate)

    percap = lookup_corporate_percapita(capital=capital, employees=employees, as_of=as_of)
    percapita = int(percap.get("total") or 0)

    enterprise = calc_corporate_enterprise_tax(
        income,
        as_of=as_of,
        use_excess_rate=use_excess_rate,
        reduced_rate_applicable=reduced_rate_applicable,
    )
    enterprise_tax = int(enterprise["tax"])

    se_rate = _lookup_scalar_rate("corporate_tax.special_enterprise_rate", as_of, 0.37)
    special_enterprise = _floor_yen(enterprise_tax * se_rate)

    total = (
        national
        + local_corporate
        + resident_levy
        + percapita
        + enterprise_tax
        + special_enterprise
    )
    return {
        "taxable_income": income,
        "fiscal_year_start": fiscal_year_start,
        "jurisdiction": jurisdiction,
        "jurisdiction_label": levy_label,
        "use_excess_rate": use_excess_rate,
        "reduced_rate_applicable": reduced_rate_applicable,
        "capital": capital,
        "employees": employees,
        "national": national,
        "local_corporate": local_corporate,
        "local_corporate_rate": local_rate,
        "resident_levy": resident_levy,
        "resident_levy_rate": levy_rate,
        "percapita": percapita,
        "percapita_band": percap.get("capital_band"),
        "enterprise": enterprise_tax,
        "enterprise_bands": enterprise.get("bands", []),
        "special_enterprise": special_enterprise,
        "special_enterprise_rate": se_rate,
        "total": total,
        "office_tax": None,  # 事業所税は対象外
    }
