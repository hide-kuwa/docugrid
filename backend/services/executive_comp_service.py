"""役員報酬最適化 — 法人税と個人の税・社会保険のトレードオフを試算する。

会社の「役員報酬控除前利益」を固定し、年間役員報酬を変化させたときの
合計負担（法人税＋所得税＋復興特別所得税＋住民税＋社会保険料〈労使〉）を求め、
合計手取り（会社内部留保＋役員手取り）が最大＝合計負担が最小となる点を探索する。

マスタから取得する値（ハードコードしない）:
- 厚生年金保険料率: legal_master(social_insurance.pension.rate)
- 標準報酬月額の上限: ref_table(social_insurance_standard_caps)
- 基礎控除（所得税）: legal_master(deduction.basic)
- 所得税の速算表: legal_master(income_tax_bracket)
- 法人税率: corporate_tax_service
- 給与所得控除: ref_table(employment_income_deduction)
- 個人住民税: legal_calc_service.calc_individual_resident_tax
- 法人地方税: legal_calc_service.calc_corporate_local_taxes
  （地方法人税・法人税割・均等割・事業税・特別法人事業税。事業所税は対象外）

簡易化の前提（結果に明示する）:
- 賞与は考慮しない。役員は雇用保険の対象外。労災は無視。
- 社会保険料は標準報酬月額×料率×12で近似（等級表の刻みは考慮しない）。
- 住民税の基礎控除は430,000円で近似。所得控除は基礎控除と社会保険料控除のみ。
- 外形標準課税（付加価値割・資本割）と事業所税は未対応。
"""

from __future__ import annotations

import datetime as _dt
import math
from typing import Any, Optional

from services import legal_calc_service, legal_master_service, ref_table_service

_RESIDENT_BASIC_DEDUCTION = 430000
_RECONSTRUCTION_RATE = 0.021


def _floor(value: float) -> int:
    return max(0, int(math.floor(value)))


def _corporate_burden(
    taxable_income: int,
    fiscal_year_start: str,
    *,
    small_business: bool,
    capital: int = 10_000_000,
    employees: int = 30,
    jurisdiction: str = "tokyo_23",
    use_excess_rate: bool = False,
) -> dict[str, Any]:
    """法人税＋地方法人税＋法人住民税（法人税割・均等割）＋事業税＋特別法人事業税。

    料率は参照テーブル／legal_master から解決する（ハードコードしない）。
    """
    result = legal_calc_service.calc_corporate_local_taxes(
        taxable_income,
        fiscal_year_start,
        small_business=small_business,
        capital=capital,
        employees=employees,
        jurisdiction=jurisdiction,
        use_excess_rate=use_excess_rate,
    )
    return {
        "national": int(result["national"]),
        "local_corporate": int(result["local_corporate"]),
        "resident_levy": int(result["resident_levy"]),
        "percapita": int(result["percapita"]),
        "enterprise": int(result["enterprise"]),
        "special_enterprise": int(result["special_enterprise"]),
        "total": int(result["total"]),
        "detail": result,
    }


def _floor_1000(value: float) -> int:
    return max(0, int(math.floor(value / 1000)) * 1000)


def _income_tax(taxable_income: int, as_of: str) -> int:
    """所得税の速算表から税額を求める（課税所得は1,000円未満切捨）。"""
    brackets = legal_master_service.list_income_tax_brackets(as_of)
    taxable = _floor_1000(taxable_income)
    for b in brackets:
        bmin = int(b.get("bracket_min") or 0)
        bmax = b.get("bracket_max")
        if taxable >= bmin and (bmax is None or taxable < int(bmax)):
            rate = float(b.get("rate") or 0)
            base = int(b.get("base_deduction") or 0)
            return _floor(taxable * rate - base)
    return 0


def _cap_monthly(insurance: str, as_of: Optional[str]) -> int:
    row = ref_table_service.find_row(
        "social_insurance_standard_caps",
        {"insurance": insurance, "basis": "標準報酬月額"},
        as_of=as_of,
    )
    return int(row.get("cap_amount") or 0) if row else 0


def _social_insurance(
    annual_salary: int,
    as_of: Optional[str],
    *,
    executive_age: int,
    pension_rate: float,
    health_rate: float,
) -> dict[str, int]:
    """年齢による加入区分を反映し、社会保険料（労使）を近似する。"""
    monthly = annual_salary / 12
    pension_cap = _cap_monthly("厚生年金", as_of)
    health_cap = _cap_monthly("健康保険", as_of)
    pension_base = min(monthly, pension_cap) if pension_cap else monthly
    health_base = min(monthly, health_cap) if health_cap else monthly

    # 厚生年金は原則70歳未満、健康保険は原則75歳未満。
    pension_total_m = _floor(pension_base * pension_rate) if executive_age < 70 else 0
    health_total_m = _floor(health_base * health_rate) if executive_age < 75 else 0
    # 労使折半（被保険者負担は総額の半分・端数は切捨）。
    pension_emp_m = _floor(pension_total_m / 2)
    health_emp_m = _floor(health_total_m / 2)

    employee_annual = (pension_emp_m + health_emp_m) * 12
    total_annual = (pension_total_m + health_total_m) * 12
    employer_annual = max(0, total_annual - employee_annual)
    return {
        "employee_annual": employee_annual,
        "employer_annual": employer_annual,
        "total_annual": total_annual,
    }


def _evaluate(
    monthly_salary: int,
    profit: int,
    fiscal_year_start: str,
    as_of: str,
    *,
    small_business: bool,
    executive_age: int,
    pension_rate: float,
    health_rate: float,
    basic_income_deduction: int,
    include_social: bool,
) -> dict[str, Any]:
    annual_salary = monthly_salary * 12

    if include_social:
        si = _social_insurance(
            annual_salary,
            as_of,
            executive_age=executive_age,
            pension_rate=pension_rate,
            health_rate=health_rate,
        )
    else:
        si = {"employee_annual": 0, "employer_annual": 0, "total_annual": 0}
    employee_si = si["employee_annual"]
    employer_si = si["employer_annual"]

    # 法人側（役員報酬・会社負担社会保険料は損金）。地方税を含む実効負担で評価する。
    company_taxable = _floor_1000(profit - annual_salary - employer_si)
    corp = _corporate_burden(
        company_taxable, fiscal_year_start, small_business=small_business
    )
    corporate_tax = corp["total"]

    # 個人側（給与所得→課税所得→所得税＋復興特別＋住民税）。
    # 役員報酬がゼロの場合は個人課税なし（納税義務者が存在しない）。
    if annual_salary <= 0:
        employment_income = 0
        income_tax = 0
        reconstruction_tax = 0
        resident_tax = 0
    else:
        emp = legal_calc_service.calc_employment_income(annual_salary, as_of=as_of)
        employment_income = int(emp["employment_income"])

        taxable_it = max(0, employment_income - employee_si - basic_income_deduction)
        income_tax = _income_tax(taxable_it, as_of)
        reconstruction_tax = _floor(income_tax * _RECONSTRUCTION_RATE)

        taxable_rt = max(0, employment_income - employee_si - _RESIDENT_BASIC_DEDUCTION)
        rt = legal_calc_service.calc_individual_resident_tax(taxable_rt, as_of)
        resident_tax = int(rt["total"])

    total_burden = (
        corporate_tax
        + employee_si
        + employer_si
        + income_tax
        + reconstruction_tax
        + resident_tax
    )
    company_retained = profit - annual_salary - employer_si - corporate_tax
    executive_take_home = annual_salary - employee_si - income_tax - reconstruction_tax - resident_tax
    combined_net = profit - total_burden

    return {
        "monthly_salary": monthly_salary,
        "annual_salary": annual_salary,
        "company_taxable": company_taxable,
        "corporate_tax": corporate_tax,
        "corporate_breakdown": corp,
        "employee_social": employee_si,
        "employer_social": employer_si,
        "total_social": employee_si + employer_si,
        "income_tax": income_tax,
        "reconstruction_tax": reconstruction_tax,
        "resident_tax": resident_tax,
        "total_burden": total_burden,
        "company_retained": company_retained,
        "executive_take_home": executive_take_home,
        "combined_net": combined_net,
    }


def optimize_executive_comp(
    pretax_profit: int,
    fiscal_year_start: str,
    *,
    executive_age: int,
    small_business: bool = True,
    prefecture_code: str = "13",
    health_rate: Optional[float] = None,
    monthly_step: int = 100000,
    as_of: Optional[str] = None,
    include_social: bool = True,
    current_monthly: Optional[int] = None,
) -> dict[str, Any]:
    """役員報酬を刻みで振って合計負担が最小（合計手取り最大）となる点を探索する。

    current_monthly を渡すと、その月額を評価し optimal との差額（delta）も返す。
    """
    profit = max(0, int(pretax_profit))
    age = int(executive_age)
    if age < 18 or age > 99:
        raise ValueError("役員年齢は18〜99歳で入力してください")
    as_of = as_of or fiscal_year_start or _dt.date.today().isoformat()

    # 年齢判定に必要な介護・厚年料率を含め、協会けんぽ都道府県マスタを解決する。
    rates_meta: dict[str, Any] = {}
    try:
        rates_meta = legal_calc_service.lookup_association_health_rate(
            prefecture_code, as_of=as_of
        )
    except ValueError:
        rates_meta = {}
    resolved_health_rate = (
        float(health_rate)
        if health_rate is not None
        else float(rates_meta.get("health_rate") or 0.0985)
    )

    care_applicable = 40 <= age <= 64
    if care_applicable:
        resolved_health_rate = float(
            rates_meta.get("health_care_rate")
            or float(resolved_health_rate) + float(rates_meta.get("care_rate") or 0)
        )

    pension_rate = float(rates_meta.get("pension_rate") or 0)
    if not pension_rate:
        pension_entry = legal_master_service.lookup_rate("social_insurance.pension.rate", as_of)
        pension_rate = (
            float(pension_entry["value"])
            if pension_entry and pension_entry.get("value") is not None
            else 0.183
        )
    basic_entry = legal_master_service.lookup_rate("deduction.basic", as_of)
    basic_income_deduction = (
        int(basic_entry["value"]) if basic_entry and basic_entry.get("value") is not None else 480000
    )

    eval_kwargs = dict(
        small_business=small_business,
        executive_age=age,
        pension_rate=pension_rate,
        health_rate=float(resolved_health_rate),
        basic_income_deduction=basic_income_deduction,
        include_social=include_social,
    )

    max_monthly = profit // 12
    step = max(10000, int(monthly_step))
    # 表示行が多くなりすぎないよう、40行を超える場合は刻みを自動で粗くする。
    if max_monthly > 0 and (max_monthly // step) > 40:
        step = int(math.ceil((max_monthly / 40) / 10000) * 10000)

    candidates: list[dict[str, Any]] = []
    monthly = 0
    guard = 0
    while monthly <= max_monthly and guard < 100:
        guard += 1
        candidates.append(
            _evaluate(monthly, profit, fiscal_year_start, as_of, **eval_kwargs)
        )
        monthly += step

    if not candidates:
        candidates.append(_evaluate(0, profit, fiscal_year_start, as_of, **eval_kwargs))

    optimal = max(candidates, key=lambda c: c["combined_net"])

    current: Optional[dict[str, Any]] = None
    delta: Optional[dict[str, Any]] = None
    if current_monthly is not None:
        cur_m = max(0, int(current_monthly))
        existing = next((c for c in candidates if c["monthly_salary"] == cur_m), None)
        current = existing or _evaluate(cur_m, profit, fiscal_year_start, as_of, **eval_kwargs)
        if existing is None:
            # 刻み外の設定額も一覧に入れて比較できるようにする。
            candidates.append(current)
            candidates.sort(key=lambda c: c["monthly_salary"])
        delta = {
            "monthly_salary": current["monthly_salary"] - optimal["monthly_salary"],
            "annual_salary": current["annual_salary"] - optimal["annual_salary"],
            "combined_net": current["combined_net"] - optimal["combined_net"],
            "total_burden": current["total_burden"] - optimal["total_burden"],
            "corporate_tax": current["corporate_tax"] - optimal["corporate_tax"],
            "income_tax": (current["income_tax"] + current["reconstruction_tax"])
            - (optimal["income_tax"] + optimal["reconstruction_tax"]),
            "resident_tax": current["resident_tax"] - optimal["resident_tax"],
            "total_social": current["total_social"] - optimal["total_social"],
            "company_retained": current["company_retained"] - optimal["company_retained"],
            "executive_take_home": current["executive_take_home"] - optimal["executive_take_home"],
        }

    # 地方税マスタの適用料率を assumptions に載せる（表示用。ゼロ所得で取る）。
    try:
        sample_local = legal_calc_service.calc_corporate_local_taxes(
            0, fiscal_year_start, small_business=small_business
        )
    except ValueError:
        sample_local = {}

    return {
        "pretax_profit": profit,
        "fiscal_year_start": fiscal_year_start,
        "as_of": as_of,
        "small_business": small_business,
        "include_social": include_social,
        "executive_age": age,
        "monthly_step": step,
        "prefecture_code": prefecture_code,
        "optimal": optimal,
        "current": current,
        "delta": delta,
        "candidates": candidates,
        "assumptions": {
            "pension_rate": pension_rate,
            "health_rate": float(resolved_health_rate),
            "executive_age": age,
            "care_applicable": care_applicable,
            "pension_applicable": age < 70,
            "health_applicable": age < 75,
            "prefecture": rates_meta.get("prefecture"),
            "basic_income_deduction": basic_income_deduction,
            "resident_basic_deduction": _RESIDENT_BASIC_DEDUCTION,
            "reconstruction_rate": _RECONSTRUCTION_RATE,
            "corporate_local_tax_rate": sample_local.get("local_corporate_rate"),
            "corporate_resident_levy_rate": sample_local.get("resident_levy_rate"),
            "corporate_percapita": sample_local.get("percapita"),
            "special_enterprise_rate": sample_local.get("special_enterprise_rate"),
            "jurisdiction": sample_local.get("jurisdiction_label") or sample_local.get("jurisdiction"),
            "notes": [
                "賞与は考慮していません（役員報酬は毎月定額の前提）。",
                "役員は雇用保険の対象外として計算しています。",
                "社会保険料は標準報酬月額×料率×12の近似です（等級表の刻みは未考慮）。",
                "健康保険料率は協会けんぽ都道府県マスタ（既定: 東京）から取得します。",
                f"役員年齢は{age}歳。40〜64歳は介護保険を加算し、70歳以上は厚生年金、75歳以上は健康保険を計算対象外としています。",
                "65歳以上の介護保険料（市区町村が徴収）と75歳以上の後期高齢者医療保険料は本試算に含みません。",
                "住民税の基礎控除は430,000円、所得控除は基礎控除と社会保険料控除のみで概算しています。",
                "法人地方税はマスタ（地方法人税・法人税割・均等割・事業税・特別法人事業税）から解決します。既定は東京23区・標準税率。事業所税・外形標準課税は対象外。",
                "事業税の損金算入（翌期）は考慮していません。実際の判断は税理士にご確認ください。",
            ],
        },
    }
