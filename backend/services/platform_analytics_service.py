"""DocuGrid platform executive analytics — cross-tenant MRR/ARR/churn rollup."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from services.billing_catalog import (
    FIRM_BASE_YEN_MONTHLY,
    FIRM_PER_CLIENT_YEN_MONTHLY,
    PARTNER_COMMISSION_PERCENT_DEFAULT,
    estimate_firm_monthly_yen,
)
from services.client_master_store import load_raw as load_client_master_raw
from services.firm_members import (
    MEMBER_STATUS_ACTIVE,
    init_firm_members_db,
    list_members_for_firm,
)
from services.stripe_billing_service import load_billing_record
from services.stripe_connect_service import get_partner, list_partners
from services.tenancy import FIRM_LABELS, firm_label

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
SNAPSHOTS_DB_PATH = STORAGE_DIR / "platform_metrics.db"

ACTIVE_BILLING_STATUSES = frozenset({"active", "trialing"})
PAYING_BILLING_STATUSES = frozenset({"active", "trialing", "past_due"})


def _utc_now() -> str:
    return datetime.utcnow().isoformat()


def _today_key() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d")


def init_platform_metrics_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(SNAPSHOTS_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS platform_daily_snapshots (
                snapshot_date TEXT PRIMARY KEY,
                mrr_yen INTEGER NOT NULL,
                arr_yen INTEGER NOT NULL,
                active_firms INTEGER NOT NULL,
                paying_firms INTEGER NOT NULL,
                total_clients INTEGER NOT NULL,
                churned_firms INTEGER NOT NULL,
                at_risk_firms INTEGER NOT NULL,
                partner_commission_yen INTEGER NOT NULL,
                net_mrr_yen INTEGER NOT NULL,
                recorded_at TEXT NOT NULL
            )
            """
        )


def _list_firms_from_db() -> list[dict[str, str]]:
    init_firm_members_db()
    db_path = STORAGE_DIR / "firm_members.db"
    if not db_path.exists():
        return []
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(
            "SELECT id, label, status FROM firms ORDER BY label"
        ).fetchall()
    return [{"id": str(r[0]), "label": str(r[1]), "status": str(r[2])} for r in rows]


def discover_firm_ids() -> list[str]:
    ids: set[str] = set(FIRM_LABELS.keys())
    for row in _list_firms_from_db():
        ids.add(row["id"])
    firms_dir = STORAGE_DIR / "firms"
    if firms_dir.is_dir():
        for path in firms_dir.iterdir():
            if path.is_dir():
                ids.add(path.name)
    for client in load_client_master_raw().get("clients") or []:
        if isinstance(client, dict) and client.get("firmId"):
            ids.add(str(client["firmId"]))
    return sorted(ids)


def _clients_by_firm() -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for client in load_client_master_raw().get("clients") or []:
        if not isinstance(client, dict):
            continue
        firm_id = str(client.get("firmId") or "firm_default")
        grouped.setdefault(firm_id, []).append(
            {
                "id": str(client.get("id") or ""),
                "name": str(client.get("name") or ""),
                "category": str(client.get("category") or ""),
                "fiscalMonth": client.get("fiscalMonth"),
                "tags": client.get("tags") or [],
            }
        )
    for firm_id in grouped:
        grouped[firm_id].sort(key=lambda c: c["name"])
    return grouped


def _partner_commission_yen(mrr_yen: int, billing: dict[str, Any]) -> int:
    partner_id = billing.get("referralPartnerId")
    if not partner_id or billing.get("status") not in PAYING_BILLING_STATUSES:
        return 0
    ends_raw = billing.get("partnerCommissionEndsAt")
    if ends_raw:
        try:
            if datetime.fromisoformat(str(ends_raw)) < datetime.utcnow():
                return 0
        except ValueError:
            pass
    partner = get_partner(str(partner_id))
    if not partner or not partner.get("onboardingComplete"):
        return 0
    pct = float(
        billing.get("partnerCommissionPercent")
        or partner.get("commissionPercent")
        or PARTNER_COMMISSION_PERCENT_DEFAULT
    )
    return int(round(mrr_yen * pct / 100))


def compute_avg_clients_per_firm_stats(firms: list[dict[str, Any]]) -> dict[str, Any]:
    """事務所ごとの顧問先数から実績ベースの平均・中央値を算出."""
    counts = [int(f.get("clientCount") or 0) for f in firms]
    with_clients = [c for c in counts if c > 0]
    paying_counts = [int(f["clientCount"]) for f in firms if f.get("isPaying")]

    total_clients = sum(counts)
    firm_count = len(counts)
    firms_with_clients = len(with_clients)
    paying_firm_count = len(paying_counts)

    def _avg(vals: list[int]) -> float | None:
        return round(sum(vals) / len(vals), 1) if vals else None

    def _median(vals: list[int]) -> float | None:
        if not vals:
            return None
        s = sorted(vals)
        n = len(s)
        mid = n // 2
        if n % 2:
            return float(s[mid])
        return round((s[mid - 1] + s[mid]) / 2, 1)

    primary: int | None = None
    source = "none"
    if with_clients:
        primary = int(round(sum(with_clients) / len(with_clients)))
        source = "firms_with_clients"
    elif firm_count > 0 and total_clients > 0:
        primary = int(round(total_clients / firm_count))
        source = "all_firms"
    elif paying_counts:
        primary = int(round(sum(paying_counts) / len(paying_counts)))
        source = "paying_firms_only"

    return {
        "avgClientsPerFirm": primary or 0,
        "source": source,
        "sourceLabel": {
            "firms_with_clients": "顧問先あり事務所の平均",
            "all_firms": "全登録事務所の平均",
            "paying_firms_only": "課金事務所の平均",
            "none": "実績なし",
        }.get(source, source),
        "totalClients": total_clients,
        "firmCount": firm_count,
        "firmsWithClients": firms_with_clients,
        "payingFirmCount": paying_firm_count,
        "avgAllFirms": _avg(counts),
        "avgFirmsWithClients": _avg(with_clients),
        "avgPayingFirms": _avg(paying_counts),
        "medianClientsPerFirm": _median(with_clients) if with_clients else _median(counts),
        "minClientsPerFirm": min(with_clients) if with_clients else (min(counts) if counts else 0),
        "maxClientsPerFirm": max(with_clients) if with_clients else (max(counts) if counts else 0),
    }


def build_firm_row(firm_id: str, clients_map: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    billing = load_billing_record(firm_id)
    status = str(billing.get("status") or "none")
    client_count = len(clients_map.get(firm_id, []))
    members = list_members_for_firm(firm_id)
    active_members = sum(1 for m in members if m.status == MEMBER_STATUS_ACTIVE)
    mrr_yen = estimate_firm_monthly_yen(client_count) if status in PAYING_BILLING_STATUSES else 0
    base_yen = FIRM_BASE_YEN_MONTHLY if status in PAYING_BILLING_STATUSES else 0
    client_meter_yen = FIRM_PER_CLIENT_YEN_MONTHLY * client_count if status in PAYING_BILLING_STATUSES else 0
    partner_commission = _partner_commission_yen(mrr_yen, billing)
    partner_id = billing.get("referralPartnerId")
    partner_name = None
    if partner_id:
        p = get_partner(str(partner_id))
        partner_name = p.get("name") if p else None
    return {
        "firmId": firm_id,
        "label": firm_label(firm_id),
        "billingStatus": status,
        "planId": billing.get("planId"),
        "clientCount": client_count,
        "activeMemberCount": active_members,
        "mrrYen": mrr_yen,
        "baseYen": base_yen,
        "clientMeterYen": client_meter_yen,
        "arrYen": mrr_yen * 12,
        "partnerCommissionYen": partner_commission,
        "netMrrYen": max(0, mrr_yen - partner_commission),
        "cancelAtPeriodEnd": bool(billing.get("cancelAtPeriodEnd")),
        "currentPeriodEnd": billing.get("currentPeriodEnd"),
        "referralPartnerId": partner_id,
        "referralPartnerName": partner_name,
        "subscriptionId": billing.get("subscriptionId"),
        "isPaying": status in PAYING_BILLING_STATUSES,
        "isActive": status in ACTIVE_BILLING_STATUSES,
        "isChurned": status == "canceled",
        "isAtRisk": bool(billing.get("cancelAtPeriodEnd")) or status == "past_due",
    }


def _record_daily_snapshot(summary: dict[str, Any]) -> None:
    init_platform_metrics_db()
    kpis = summary["kpis"]
    with sqlite3.connect(SNAPSHOTS_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO platform_daily_snapshots (
                snapshot_date, mrr_yen, arr_yen, active_firms, paying_firms,
                total_clients, churned_firms, at_risk_firms,
                partner_commission_yen, net_mrr_yen, recorded_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(snapshot_date) DO UPDATE SET
                mrr_yen=excluded.mrr_yen,
                arr_yen=excluded.arr_yen,
                active_firms=excluded.active_firms,
                paying_firms=excluded.paying_firms,
                total_clients=excluded.total_clients,
                churned_firms=excluded.churned_firms,
                at_risk_firms=excluded.at_risk_firms,
                partner_commission_yen=excluded.partner_commission_yen,
                net_mrr_yen=excluded.net_mrr_yen,
                recorded_at=excluded.recorded_at
            """,
            (
                _today_key(),
                int(kpis["mrrYen"]),
                int(kpis["arrYen"]),
                int(kpis["activeFirms"]),
                int(kpis["payingFirms"]),
                int(kpis["totalClients"]),
                int(kpis["churnedFirms"]),
                int(kpis["atRiskFirms"]),
                int(kpis["partnerCommissionYen"]),
                int(kpis["netMrrYen"]),
                _utc_now(),
            ),
        )


def load_mrr_trend(days: int = 90) -> list[dict[str, Any]]:
    init_platform_metrics_db()
    cutoff = (datetime.utcnow() - timedelta(days=max(1, days))).strftime("%Y-%m-%d")
    with sqlite3.connect(SNAPSHOTS_DB_PATH) as conn:
        rows = conn.execute(
            """
            SELECT snapshot_date, mrr_yen, arr_yen, total_clients, net_mrr_yen, paying_firms
            FROM platform_daily_snapshots
            WHERE snapshot_date >= ?
            ORDER BY snapshot_date
            """,
            (cutoff,),
        ).fetchall()
    return [
        {
            "date": str(r[0]),
            "mrrYen": int(r[1]),
            "arrYen": int(r[2]),
            "totalClients": int(r[3]),
            "netMrrYen": int(r[4]),
            "payingFirms": int(r[5]),
        }
        for r in rows
    ]


def build_executive_dashboard(*, record_snapshot: bool = True) -> dict[str, Any]:
    clients_map = _clients_by_firm()
    firm_ids = discover_firm_ids()
    firms = [build_firm_row(fid, clients_map) for fid in firm_ids]
    firms.sort(key=lambda f: (-f["mrrYen"], f["label"]))

    paying = [f for f in firms if f["isPaying"]]
    active = [f for f in firms if f["isActive"]]
    churned = [f for f in firms if f["isChurned"]]
    at_risk = [f for f in firms if f["isAtRisk"]]
    total_clients = sum(f["clientCount"] for f in firms)
    mrr_yen = sum(f["mrrYen"] for f in paying)
    partner_commission_yen = sum(f["partnerCommissionYen"] for f in paying)
    net_mrr_yen = sum(f["netMrrYen"] for f in paying)
    base_mrr = sum(f["baseYen"] for f in paying)
    client_meter_mrr = sum(f["clientMeterYen"] for f in paying)

    ever_subscribed = sum(1 for f in firms if f["billingStatus"] not in ("none",))
    churn_rate = (len(churned) / ever_subscribed) if ever_subscribed else 0.0
    logo_churn_rate = churn_rate
    arpc_yen = int(round(mrr_yen / total_clients)) if total_clients and mrr_yen else 0
    arpf_yen = int(round(mrr_yen / len(paying))) if paying else 0

    status_breakdown: dict[str, int] = {}
    for f in firms:
        key = f["billingStatus"]
        status_breakdown[key] = status_breakdown.get(key, 0) + 1

    all_clients: list[dict[str, Any]] = []
    for firm_id, clients in clients_map.items():
        label = firm_label(firm_id)
        for c in clients:
            all_clients.append({**c, "firmId": firm_id, "firmLabel": label})
    all_clients.sort(key=lambda c: (c["firmLabel"], c["name"]))

    partners = list_partners()
    onboarded_partners = sum(1 for p in partners if p.get("onboardingComplete"))

    kpis = {
        "mrrYen": mrr_yen,
        "arrYen": mrr_yen * 12,
        "netMrrYen": net_mrr_yen,
        "partnerCommissionYen": partner_commission_yen,
        "baseMrrYen": base_mrr,
        "clientMeterMrrYen": client_meter_mrr,
        "firmCount": len(firms),
        "payingFirms": len(paying),
        "activeFirms": len(active),
        "churnedFirms": len(churned),
        "atRiskFirms": len(at_risk),
        "totalClients": total_clients,
        "churnRate": round(churn_rate, 4),
        "logoChurnRate": round(logo_churn_rate, 4),
        "arpcYen": arpc_yen,
        "arpfYen": arpf_yen,
        "partnerCount": len(partners),
        "onboardedPartners": onboarded_partners,
        "generatedAt": _utc_now(),
    }

    charts = {
        "mrrByFirm": [
            {"firmId": f["firmId"], "label": f["label"], "mrrYen": f["mrrYen"], "clientCount": f["clientCount"]}
            for f in firms
            if f["mrrYen"] > 0
        ][:12],
        "clientsByFirm": [
            {"firmId": f["firmId"], "label": f["label"], "clientCount": f["clientCount"]}
            for f in sorted(firms, key=lambda x: -x["clientCount"])
        ][:12],
        "statusBreakdown": [
            {"status": k, "count": v} for k, v in sorted(status_breakdown.items(), key=lambda x: -x[1])
        ],
        "revenueMix": {
            "baseYen": base_mrr,
            "clientMeterYen": client_meter_mrr,
            "partnerCommissionYen": partner_commission_yen,
            "netMrrYen": net_mrr_yen,
        },
        "mrrTrend": load_mrr_trend(90),
    }

    accounting = {
        "grossMrrYen": mrr_yen,
        "partnerPayoutYen": partner_commission_yen,
        "netMrrYen": net_mrr_yen,
        "annualizedGrossArrYen": mrr_yen * 12,
        "annualizedNetArrYen": net_mrr_yen * 12,
        "basePlanRevenueYen": base_mrr,
        "usageRevenueYen": client_meter_mrr,
        "usageSharePercent": round((client_meter_mrr / mrr_yen) * 100, 1) if mrr_yen else 0,
    }

    payload = {
        "kpis": kpis,
        "charts": charts,
        "accounting": accounting,
        "firms": firms,
        "clients": all_clients,
        "partners": partners,
    }
    if record_snapshot:
        _record_daily_snapshot(payload)
        payload["charts"]["mrrTrend"] = load_mrr_trend(90)
    return payload


def build_firm_detail(firm_id: str) -> dict[str, Any] | None:
    clients_map = _clients_by_firm()
    if firm_id not in discover_firm_ids() and firm_id not in clients_map:
        return None
    row = build_firm_row(firm_id, clients_map)
    billing = load_billing_record(firm_id)
    members = list_members_for_firm(firm_id)
    return {
        **row,
        "billing": billing,
        "clients": clients_map.get(firm_id, []),
        "members": [
            {
                "id": m.id,
                "email": m.email,
                "role": m.firm_role,
                "status": m.status,
                "displayName": m.display_name,
            }
            for m in members
        ],
    }
