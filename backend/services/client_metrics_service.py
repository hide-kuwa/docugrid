"""ダッシュボード指標 SSOT — CHARTS タブの売上・利益・月次推移。

すべてのグラフ数字は client_metric_facts から読み書きする。
"""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
METRICS_DB_PATH = STORAGE_DIR / "client_metrics.db"

FISCAL_LABELS = ("R5", "R6", "R7")
MONTH_KEYS = tuple(f"M{m:02d}" for m in range(1, 13))


def init_client_metrics_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(METRICS_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS client_metric_facts (
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                metric_key TEXT NOT NULL,
                period_key TEXT NOT NULL,
                value_yen INTEGER,
                value_num REAL,
                source_type TEXT NOT NULL DEFAULT 'manual',
                source_ref TEXT,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (firm_id, client_id, metric_key, period_key)
            )
            """
        )


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "metric_key": row["metric_key"],
        "period_key": row["period_key"],
        "value_yen": row["value_yen"],
        "value_num": row["value_num"],
        "source_type": row["source_type"],
        "source_ref": row["source_ref"],
        "updated_at": row["updated_at"],
    }


def _default_seed(base_yen: int) -> List[dict]:
    """プロフィール等から初回シード用のデフォルト値。"""
    facts: List[dict] = []
    ratios_rev = (0.82, 0.91, 1.0)
    ratios_prof = (0.72 * 0.18, 0.91 * 0.17, 0.16)
    for label, rr, rp in zip(FISCAL_LABELS, ratios_rev, ratios_prof):
        facts.append(
            {
                "metric_key": "annual.revenue",
                "period_key": label,
                "value_yen": round(base_yen * rr),
                "value_num": None,
            }
        )
        facts.append(
            {
                "metric_key": "annual.profit",
                "period_key": label,
                "value_yen": round(base_yen * rp),
                "value_num": None,
            }
        )
    monthly_demo = [62, 58, 71, 65, 78, 82, 74, 69, 88, 91, 85, 94]
    for key, val in zip(MONTH_KEYS, monthly_demo):
        facts.append(
            {
                "metric_key": "monthly.sales_index",
                "period_key": key,
                "value_yen": None,
                "value_num": float(val),
            }
        )
    return facts


def seed_client_metrics_if_empty(
    firm_id: str,
    client_id: str,
    *,
    base_yen: int = 48_000_000,
) -> None:
    init_client_metrics_db()
    with sqlite3.connect(METRICS_DB_PATH) as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM client_metric_facts WHERE firm_id=? AND client_id=?",
            (firm_id, client_id),
        ).fetchone()[0]
        if count > 0:
            return
        now = datetime.utcnow().isoformat()
        for fact in _default_seed(base_yen):
            conn.execute(
                """
                INSERT INTO client_metric_facts
                    (firm_id, client_id, metric_key, period_key, value_yen, value_num,
                     source_type, source_ref, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 'seed', NULL, ?)
                """,
                (
                    firm_id,
                    client_id,
                    fact["metric_key"],
                    fact["period_key"],
                    fact["value_yen"],
                    fact["value_num"],
                    now,
                ),
            )


def list_metric_facts(firm_id: str, client_id: str) -> List[dict]:
    init_client_metrics_db()
    with sqlite3.connect(METRICS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT * FROM client_metric_facts
            WHERE firm_id = ? AND client_id = ?
            ORDER BY metric_key, period_key
            """,
            (firm_id, client_id),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_metric_fact(
    firm_id: str,
    client_id: str,
    metric_key: str,
    period_key: str,
) -> Optional[dict]:
    init_client_metrics_db()
    with sqlite3.connect(METRICS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            """
            SELECT * FROM client_metric_facts
            WHERE firm_id=? AND client_id=? AND metric_key=? AND period_key=?
            """,
            (firm_id, client_id, metric_key, period_key),
        ).fetchone()
    return _row_to_dict(row) if row else None


def upsert_metric_fact(
    firm_id: str,
    client_id: str,
    *,
    metric_key: str,
    period_key: str,
    value_yen: Optional[int] = None,
    value_num: Optional[float] = None,
    source_type: str = "manual",
    source_ref: Optional[str] = None,
) -> dict:
    init_client_metrics_db()
    now = datetime.utcnow().isoformat()
    with sqlite3.connect(METRICS_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO client_metric_facts
                (firm_id, client_id, metric_key, period_key, value_yen, value_num,
                 source_type, source_ref, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(firm_id, client_id, metric_key, period_key) DO UPDATE SET
                value_yen = excluded.value_yen,
                value_num = excluded.value_num,
                source_type = excluded.source_type,
                source_ref = excluded.source_ref,
                updated_at = excluded.updated_at
            """,
            (
                firm_id,
                client_id,
                metric_key,
                period_key,
                value_yen,
                value_num,
                source_type,
                source_ref,
                now,
            ),
        )
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            """
            SELECT * FROM client_metric_facts
            WHERE firm_id=? AND client_id=? AND metric_key=? AND period_key=?
            """,
            (firm_id, client_id, metric_key, period_key),
        ).fetchone()
    return _row_to_dict(row)


def build_charts_payload(firm_id: str, client_id: str, *, seed_base_yen: int = 48_000_000) -> Dict[str, Any]:
    seed_client_metrics_if_empty(firm_id, client_id, base_yen=seed_base_yen)
    facts = list_metric_facts(firm_id, client_id)

    def pick(metric_key: str, period_key: str) -> Optional[dict]:
        return next(
            (f for f in facts if f["metric_key"] == metric_key and f["period_key"] == period_key),
            None,
        )

    fiscal_years = []
    for label in FISCAL_LABELS:
        rev = pick("annual.revenue", label)
        prof = pick("annual.profit", label)
        consumption = pick("annual.consumption_taxable", label)
        fiscal_years.append(
            {
                "label": label,
                "revenue_yen": rev["value_yen"] if rev else 0,
                "profit_yen": prof["value_yen"] if prof else 0,
                "consumption_taxable_yen": consumption["value_yen"] if consumption else 0,
                "consumption_taxable_source": consumption["source_type"] if consumption else None,
            }
        )

    monthly = []
    monthly_revenue = []
    for key in MONTH_KEYS:
        row = pick("monthly.sales_index", key)
        rev_row = pick("monthly.revenue", key)
        monthly.append(
            {
                "month": int(key[1:]),
                "index": row["value_num"] if row and row["value_num"] is not None else 0,
            }
        )
        monthly_revenue.append(
            {
                "month": int(key[1:]),
                "revenue_yen": rev_row["value_yen"] if rev_row and rev_row["value_yen"] is not None else 0,
                "source_type": rev_row["source_type"] if rev_row else None,
            }
        )

    ytd = sum(m["index"] for m in monthly)

    return {
        "client_id": client_id,
        "fiscal_years": fiscal_years,
        "monthly_sales_index": monthly,
        "monthly_revenue_yen": monthly_revenue,
        "monthly_ytd_index": ytd,
        "facts": facts,
    }


VALUATION_PERIOD = "current"
VALUATION_FIELDS = (
    ("valuation.issued_shares", "issued_shares"),
    ("valuation.capital_yen", "capital_yen"),
    ("valuation.net_assets_yen", "net_assets_yen"),
    ("valuation.annual_profit_yen", "annual_profit_yen"),
    ("valuation.annual_dividend_yen", "annual_dividend_yen"),
)


def _parse_profile_yen(raw: Optional[str], fallback: int) -> int:
    if not raw or not str(raw).strip():
        return fallback
    digits = "".join(ch for ch in str(raw) if ch.isdigit())
    if not digits:
        return fallback
    return int(digits)


def seed_valuation_if_empty(firm_id: str, client_id: str, profile: Optional[Dict[str, str]]) -> None:
    init_client_metrics_db()
    profile = profile or {}
    with sqlite3.connect(METRICS_DB_PATH) as conn:
        count = conn.execute(
            """
            SELECT COUNT(*) FROM client_metric_facts
            WHERE firm_id=? AND client_id=? AND metric_key LIKE 'valuation.%'
            """,
            (firm_id, client_id),
        ).fetchone()[0]
        if count > 0:
            return
        capital = _parse_profile_yen(profile.get("capital"), 10_000_000)
        issued = _parse_profile_yen(profile.get("issued_shares"), 1000)
        profit = _parse_profile_yen(profile.get("profit_taxable_income"), max(round(capital * 0.15), 1))
        net_assets = max(round(capital * 2.5), capital)
        now = datetime.utcnow().isoformat()
        seeds = [
            ("valuation.issued_shares", issued, None),
            ("valuation.capital_yen", capital, None),
            ("valuation.net_assets_yen", net_assets, None),
            ("valuation.annual_profit_yen", profit, None),
            ("valuation.annual_dividend_yen", 0, None),
        ]
        for metric_key, yen, num in seeds:
            conn.execute(
                """
                INSERT INTO client_metric_facts
                    (firm_id, client_id, metric_key, period_key, value_yen, value_num,
                     source_type, source_ref, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 'profile_seed', NULL, ?)
                """,
                (firm_id, client_id, metric_key, VALUATION_PERIOD, yen, num, now),
            )


def build_valuation_payload(
    firm_id: str,
    client_id: str,
    profile: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    seed_valuation_if_empty(firm_id, client_id, profile)
    facts = list_metric_facts(firm_id, client_id)

    def pick_yen(metric_key: str) -> int:
        row = next(
            (
                f
                for f in facts
                if f["metric_key"] == metric_key and f["period_key"] == VALUATION_PERIOD
            ),
            None,
        )
        return int(row["value_yen"] or 0) if row else 0

    inputs = {
        "issued_shares": pick_yen("valuation.issued_shares"),
        "capital_yen": pick_yen("valuation.capital_yen"),
        "net_assets_yen": pick_yen("valuation.net_assets_yen"),
        "annual_profit_yen": pick_yen("valuation.annual_profit_yen"),
        "annual_dividend_yen": pick_yen("valuation.annual_dividend_yen"),
    }

    issued = max(inputs["issued_shares"], 1)
    per_share_net = inputs["net_assets_yen"] // issued
    per_share_div = (
        round(inputs["annual_dividend_yen"] / issued / 0.1) if inputs["annual_dividend_yen"] else 0
    )
    per_share_sim = (
        round((inputs["annual_profit_yen"] / issued) * 6) if inputs["annual_profit_yen"] else 0
    )
    candidates = [v for v in (per_share_net, per_share_div, per_share_sim) if v > 0]
    composite = round(sum(candidates) / len(candidates)) if candidates else per_share_net

    methods = {
        "net_asset": {
            "per_share_yen": per_share_net,
            "total_yen": per_share_net * issued,
        },
        "dividend": {
            "per_share_yen": per_share_div,
            "total_yen": per_share_div * issued,
        },
        "similar_industry": {
            "per_share_yen": per_share_sim,
            "total_yen": per_share_sim * issued,
        },
        "composite": {
            "per_share_yen": composite,
            "total_yen": composite * issued,
        },
    }

    return {"client_id": client_id, "inputs": inputs, "methods": methods}
