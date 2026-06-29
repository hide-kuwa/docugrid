"""MA goal planning — 10億円 ARR などの逆算モデル."""

from __future__ import annotations

import json
import math
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from services.billing_catalog import (
    FIRM_BASE_YEN_MONTHLY,
    FIRM_PER_CLIENT_YEN_MONTHLY,
    PARTNER_COMMISSION_PERCENT_DEFAULT,
    estimate_firm_monthly_yen,
)
from services.platform_analytics_service import (
    build_executive_dashboard,
    compute_avg_clients_per_firm_stats,
)

# DocuGrid 中期 MA 目標（デフォルト 10 億円 ARR）
DEFAULT_TARGET_ARR_YEN = int(os.environ.get("MA_TARGET_ARR_YEN", "1000000000"))
DEFAULT_HORIZON_MONTHS = int(os.environ.get("MA_TARGET_HORIZON_MONTHS", "60"))

# SaaS ベンチマーク（年間ロゴ・チャーン）
CHURN_BENCHMARKS = {
    "excellent": {"annual": 0.03, "label": "優良（≤3%）", "note": "エンタープライズ SaaS 上位"},
    "good": {"annual": 0.05, "label": "健全（≤5%）", "note": "B2B SaaS の一般的な目標"},
    "acceptable": {"annual": 0.08, "label": "許容（≤8%）", "note": "成長期だが改善余地あり"},
    "warning": {"annual": 0.12, "label": "危険（>10%）", "note": "獲得コスト回収が困難"},
}

ARR_MILESTONE_RATIOS = [0.1, 0.25, 0.5, 0.75, 1.0]
HORIZON_PRESETS_MONTHS = [36, 48, 60, 84]
AVG_CLIENTS_PRESETS = [50, 80, 100, 150, 200]

# 実績が少ない初期は計画仮定を使う（税理士事務所の業界感覚値）
DEFAULT_PLANNING_AVG_CLIENTS_PER_FIRM = int(
    os.environ.get("MA_PLANNING_AVG_CLIENTS_PER_FIRM", "80")
)
MIN_FIRMS_FOR_ACTUAL_AVG = int(os.environ.get("MA_MIN_FIRMS_FOR_ACTUAL_AVG", "5"))

ASSUMPTIONS_PATH = Path(__file__).resolve().parent.parent / "storage" / "platform_ma_assumptions.json"
VALID_AVG_CLIENTS_MODES = frozenset({"planning", "actual", "auto"})


def _utc_now() -> str:
    return datetime.utcnow().isoformat()


def load_ma_assumptions() -> dict[str, Any]:
    if not ASSUMPTIONS_PATH.is_file():
        return {
            "planningAvgClientsPerFirm": DEFAULT_PLANNING_AVG_CLIENTS_PER_FIRM,
            "avgClientsMode": "auto",
            "updated_at": None,
        }
    try:
        data = json.loads(ASSUMPTIONS_PATH.read_text(encoding="utf-8"))
        mode = str(data.get("avgClientsMode") or "auto")
        if mode not in VALID_AVG_CLIENTS_MODES:
            mode = "auto"
        return {
            "planningAvgClientsPerFirm": max(
                1,
                int(data.get("planningAvgClientsPerFirm") or DEFAULT_PLANNING_AVG_CLIENTS_PER_FIRM),
            ),
            "avgClientsMode": mode,
            "updated_at": data.get("updated_at"),
        }
    except Exception:
        return {
            "planningAvgClientsPerFirm": DEFAULT_PLANNING_AVG_CLIENTS_PER_FIRM,
            "avgClientsMode": "auto",
            "updated_at": None,
        }


def save_ma_assumptions(
    *,
    planning_avg_clients_per_firm: int | None = None,
    avg_clients_mode: str | None = None,
) -> dict[str, Any]:
    current = load_ma_assumptions()
    if planning_avg_clients_per_firm is not None:
        current["planningAvgClientsPerFirm"] = max(1, int(planning_avg_clients_per_firm))
    if avg_clients_mode is not None:
        mode = str(avg_clients_mode).strip().lower()
        if mode not in VALID_AVG_CLIENTS_MODES:
            raise ValueError("invalid_avg_clients_mode")
        current["avgClientsMode"] = mode
    current["updated_at"] = _utc_now()
    ASSUMPTIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
    ASSUMPTIONS_PATH.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return current


def resolve_avg_clients_per_firm(
    *,
    actual_stats: dict[str, Any],
    avg_clients_per_firm: int | None,
    avg_clients_mode: str | None,
    planning_avg_clients_per_firm: int,
    min_firms_for_actual: int = MIN_FIRMS_FOR_ACTUAL_AVG,
) -> dict[str, Any]:
    """計画仮定 / 実績 / 自動のいずれかで逆算に使う平均顧問先数を決定."""
    actual_avg = max(0, int(actual_stats.get("avgClientsPerFirm") or 0))
    firms_with_clients = int(actual_stats.get("firmsWithClients") or 0)
    actual_ready = firms_with_clients >= min_firms_for_actual and actual_avg > 0

    if avg_clients_per_firm is not None:
        return {
            "value": max(1, int(avg_clients_per_firm)),
            "source": "explicit_override",
            "sourceLabel": "手動指定（この画面の入力）",
            "mode": avg_clients_mode or "planning",
            "isOverride": True,
            "actualReady": actual_ready,
            "planningAvgClientsPerFirm": planning_avg_clients_per_firm,
        }

    mode = (avg_clients_mode or "auto").strip().lower()
    if mode not in VALID_AVG_CLIENTS_MODES:
        mode = "auto"

    if mode == "actual":
        resolved = actual_avg if actual_avg > 0 else planning_avg_clients_per_firm
        label = actual_stats.get("sourceLabel") or "実績ベース"
        if actual_avg <= 0:
            label = f"実績なしのため計画仮定 {planning_avg_clients_per_firm} 社"
        return {
            "value": max(1, resolved),
            "source": "actual" if actual_avg > 0 else "planning_fallback",
            "sourceLabel": label,
            "mode": mode,
            "isOverride": False,
            "actualReady": actual_ready,
            "planningAvgClientsPerFirm": planning_avg_clients_per_firm,
        }

    if mode == "planning" or (mode == "auto" and not actual_ready):
        return {
            "value": max(1, planning_avg_clients_per_firm),
            "source": "planning_assumption",
            "sourceLabel": (
                f"計画仮定 {planning_avg_clients_per_firm} 社/事務所"
                + (
                    f"（実績は {firms_with_clients}/{min_firms_for_actual} 事務所 — 自動で仮定を使用）"
                    if mode == "auto"
                    else ""
                )
            ),
            "mode": mode,
            "isOverride": False,
            "actualReady": actual_ready,
            "planningAvgClientsPerFirm": planning_avg_clients_per_firm,
        }

    return {
        "value": max(1, actual_avg),
        "source": "actual",
        "sourceLabel": actual_stats.get("sourceLabel") or "実績ベース",
        "mode": "auto",
        "isOverride": False,
        "actualReady": actual_ready,
        "planningAvgClientsPerFirm": planning_avg_clients_per_firm,
    }


def arr_per_firm_gross_yen(avg_clients_per_firm: int) -> int:
    return estimate_firm_monthly_yen(avg_clients_per_firm) * 12


def firms_needed_for_arr(target_arr_yen: int, avg_clients_per_firm: int) -> int:
    per_firm = arr_per_firm_gross_yen(avg_clients_per_firm)
    if per_firm <= 0:
        return 0
    return int(math.ceil(target_arr_yen / per_firm))


def monthly_acquisition_plan(
    *,
    current_paying_firms: int,
    target_paying_firms: int,
    horizon_months: int,
    annual_logo_churn: float,
) -> dict[str, Any]:
    if horizon_months < 1:
        horizon_months = 1
    monthly_churn = annual_logo_churn / 12.0
    firms_gap = max(0, target_paying_firms - current_paying_firms)
    avg_firms = (current_paying_firms + target_paying_firms) / 2.0
    monthly_net_new = firms_gap / horizon_months
    monthly_churn_replacement = avg_firms * monthly_churn
    monthly_gross_acquisitions = monthly_net_new + monthly_churn_replacement
    return {
        "horizonMonths": horizon_months,
        "firmsGap": firms_gap,
        "monthlyNetNewFirms": round(monthly_net_new, 2),
        "monthlyChurnReplacement": round(monthly_churn_replacement, 2),
        "monthlyGrossAcquisitions": round(monthly_gross_acquisitions, 2),
        "weeklyGrossAcquisitions": round(monthly_gross_acquisitions / 4.33, 2),
        "annualLogoChurnAssumed": annual_logo_churn,
    }


def build_scenario(
    *,
    target_arr_yen: int,
    avg_clients_per_firm: int,
    horizon_months: int,
    annual_logo_churn: float,
    current_paying_firms: int,
    partner_attach_rate: float,
) -> dict[str, Any]:
    arr_per_firm = arr_per_firm_gross_yen(avg_clients_per_firm)
    mrr_per_firm = arr_per_firm // 12
    target_firms = firms_needed_for_arr(target_arr_yen, avg_clients_per_firm)
    target_clients = target_firms * avg_clients_per_firm
    acquisition = monthly_acquisition_plan(
        current_paying_firms=current_paying_firms,
        target_paying_firms=target_firms,
        horizon_months=horizon_months,
        annual_logo_churn=annual_logo_churn,
    )
    commission = PARTNER_COMMISSION_PERCENT_DEFAULT / 100.0 * partner_attach_rate
    net_arr_per_firm = int(arr_per_firm * (1.0 - commission))
    return {
        "avgClientsPerFirm": avg_clients_per_firm,
        "arrPerFirmYen": arr_per_firm,
        "mrrPerFirmYen": mrr_per_firm,
        "netArrPerFirmYen": net_arr_per_firm,
        "targetPayingFirms": target_firms,
        "targetTotalClients": target_clients,
        "monthlyNewClients": int(round(acquisition["monthlyGrossAcquisitions"] * avg_clients_per_firm)),
        **acquisition,
    }


def build_ma_goals(
    *,
    target_arr_yen: int = DEFAULT_TARGET_ARR_YEN,
    horizon_months: int = DEFAULT_HORIZON_MONTHS,
    annual_logo_churn: float = 0.05,
    avg_clients_per_firm: int | None = None,
    avg_clients_mode: str | None = None,
    partner_attach_rate: float = 0.5,
) -> dict[str, Any]:
    assumptions = load_ma_assumptions()
    dash = build_executive_dashboard(record_snapshot=False)
    kpis = dash["kpis"]
    firms = dash.get("firms") or []
    actual_stats = compute_avg_clients_per_firm_stats(firms)
    current_arr = int(kpis["arrYen"])
    current_mrr = int(kpis["mrrYen"])
    current_paying = int(kpis["payingFirms"])
    current_clients = int(kpis["totalClients"])
    current_churn = float(kpis.get("logoChurnRate") or 0.0)

    resolved_mode = avg_clients_mode or assumptions["avgClientsMode"]
    resolved = resolve_avg_clients_per_firm(
        actual_stats=actual_stats,
        avg_clients_per_firm=avg_clients_per_firm,
        avg_clients_mode=resolved_mode,
        planning_avg_clients_per_firm=int(assumptions["planningAvgClientsPerFirm"]),
    )
    avg_clients_per_firm = resolved["value"]
    using_override = resolved["isOverride"]

    arr_gap = max(0, target_arr_yen - current_arr)
    primary = build_scenario(
        target_arr_yen=target_arr_yen,
        avg_clients_per_firm=avg_clients_per_firm,
        horizon_months=horizon_months,
        annual_logo_churn=annual_logo_churn,
        current_paying_firms=current_paying,
        partner_attach_rate=partner_attach_rate,
    )
    firms_gap = max(0, primary["targetPayingFirms"] - current_paying)
    clients_gap = max(0, primary["targetTotalClients"] - current_clients)
    monthly_mrr_growth = int(math.ceil(arr_gap / max(horizon_months, 1) / 12))

    milestones = []
    for ratio in ARR_MILESTONE_RATIOS:
        milestone_arr = int(target_arr_yen * ratio)
        milestone_firms = firms_needed_for_arr(milestone_arr, avg_clients_per_firm)
        month_index = int(round(horizon_months * ratio))
        milestones.append(
            {
                "ratio": ratio,
                "label": f"{int(ratio * 100)}%",
                "arrYen": milestone_arr,
                "payingFirms": milestone_firms,
                "monthIndex": month_index,
            }
        )

    horizon_scenarios = []
    for months in HORIZON_PRESETS_MONTHS:
        s = build_scenario(
            target_arr_yen=target_arr_yen,
            avg_clients_per_firm=avg_clients_per_firm,
            horizon_months=months,
            annual_logo_churn=annual_logo_churn,
            current_paying_firms=current_paying,
            partner_attach_rate=partner_attach_rate,
        )
        horizon_scenarios.append(
            {
                "horizonMonths": months,
                "horizonYears": round(months / 12, 1),
                "monthlyGrossAcquisitions": s["monthlyGrossAcquisitions"],
                "weeklyGrossAcquisitions": s["weeklyGrossAcquisitions"],
                "monthlyNewClients": s["monthlyNewClients"],
            }
        )

    client_assumption_scenarios = []
    scenario_avgs = sorted(set(AVG_CLIENTS_PRESETS + [avg_clients_per_firm]))
    for avg_c in scenario_avgs:
        s = build_scenario(
            target_arr_yen=target_arr_yen,
            avg_clients_per_firm=avg_c,
            horizon_months=horizon_months,
            annual_logo_churn=annual_logo_churn,
            current_paying_firms=current_paying,
            partner_attach_rate=partner_attach_rate,
        )
        client_assumption_scenarios.append(
            {
                "avgClientsPerFirm": avg_c,
                "targetPayingFirms": s["targetPayingFirms"],
                "targetTotalClients": s["targetTotalClients"],
                "arrPerFirmYen": s["arrPerFirmYen"],
                "monthlyGrossAcquisitions": s["monthlyGrossAcquisitions"],
                "isActual": avg_c == avg_clients_per_firm and resolved["source"] == "actual",
                "isPlanning": avg_c == assumptions["planningAvgClientsPerFirm"],
            }
        )

    churn_scenarios = []
    for key, bench in CHURN_BENCHMARKS.items():
        if key == "warning":
            continue
        s = build_scenario(
            target_arr_yen=target_arr_yen,
            avg_clients_per_firm=avg_clients_per_firm,
            horizon_months=horizon_months,
            annual_logo_churn=bench["annual"],
            current_paying_firms=current_paying,
            partner_attach_rate=partner_attach_rate,
        )
        churn_scenarios.append(
            {
                "tier": key,
                "label": bench["label"],
                "annualChurn": bench["annual"],
                "note": bench["note"],
                "monthlyGrossAcquisitions": s["monthlyGrossAcquisitions"],
            }
        )

    # 進捗率
    progress_pct = min(100.0, (current_arr / target_arr_yen) * 100) if target_arr_yen else 0.0

    return {
        "assumptions": {
            "planningAvgClientsPerFirm": assumptions["planningAvgClientsPerFirm"],
            "avgClientsMode": resolved["mode"],
            "minFirmsForActualAvg": MIN_FIRMS_FOR_ACTUAL_AVG,
            "updatedAt": assumptions.get("updated_at"),
        },
        "target": {
            "arrYen": target_arr_yen,
            "arrLabel": "10億円" if target_arr_yen == 1_000_000_000 else None,
            "horizonMonths": horizon_months,
            "horizonYears": round(horizon_months / 12, 1),
            "annualLogoChurnTarget": annual_logo_churn,
            "avgClientsPerFirm": avg_clients_per_firm,
            "avgClientsPerFirmIsOverride": using_override,
            "avgClientsMode": resolved["mode"],
            "avgClientsSource": resolved["source"],
            "avgClientsSourceLabel": resolved["sourceLabel"],
            "actualReady": resolved["actualReady"],
            "partnerAttachRate": partner_attach_rate,
        },
        "avgClientsActual": actual_stats,
        "current": {
            "arrYen": current_arr,
            "mrrYen": current_mrr,
            "payingFirms": current_paying,
            "totalClients": current_clients,
            "logoChurnRate": current_churn,
            "arpfYen": int(kpis.get("arpfYen") or 0),
            "arpcYen": int(kpis.get("arpcYen") or 0),
        },
        "gap": {
            "arrYen": arr_gap,
            "payingFirms": firms_gap,
            "totalClients": clients_gap,
            "monthlyMrrGrowthYen": monthly_mrr_growth,
            "progressPercent": round(progress_pct, 2),
        },
        "recommendations": {
            "targetArrYen": target_arr_yen,
            "targetAnnualLogoChurnMax": 0.05,
            "targetAnnualLogoChurnStretch": 0.03,
            "targetPayingFirms": primary["targetPayingFirms"],
            "targetTotalClients": primary["targetTotalClients"],
            "monthlyGrossAcquisitions": primary["monthlyGrossAcquisitions"],
            "weeklyGrossAcquisitions": primary["weeklyGrossAcquisitions"],
            "monthlyNewClients": primary["monthlyNewClients"],
            "monthlyNetNewFirms": primary["monthlyNetNewFirms"],
            "monthlyChurnReplacement": primary["monthlyChurnReplacement"],
            "arrPerFirmYen": primary["arrPerFirmYen"],
            "netArrPerFirmYen": primary["netArrPerFirmYen"],
            "valuationAt10xArrYen": target_arr_yen * 10,
            "valuationMultipleNote": "B2B SaaS の一般的な ARR 倍率 8〜12x（参考値）",
        },
        "churnBenchmarks": CHURN_BENCHMARKS,
        "pricing": {
            "firmBaseYenMonthly": FIRM_BASE_YEN_MONTHLY,
            "firmPerClientYenMonthly": FIRM_PER_CLIENT_YEN_MONTHLY,
            "partnerCommissionPercent": PARTNER_COMMISSION_PERCENT_DEFAULT,
        },
        "milestones": milestones,
        "horizonScenarios": horizon_scenarios,
        "clientAssumptionScenarios": client_assumption_scenarios,
        "churnScenarios": churn_scenarios,
        "primaryScenario": primary,
    }
