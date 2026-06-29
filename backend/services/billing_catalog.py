"""DocuGrid commercial pricing catalog (SSOT for billing logic)."""

from __future__ import annotations

import os
from typing import Any

# 税理士事務所: 基本料 1 万円/月 + 顧問先 100 円/社/月
FIRM_BASE_YEN_MONTHLY = int(os.environ.get("BILLING_FIRM_BASE_YEN", "10000"))
FIRM_PER_CLIENT_YEN_MONTHLY = int(os.environ.get("BILLING_FIRM_PER_CLIENT_YEN", "100"))

# 販売パートナー: 手数料 20% · 契約 1〜3 年
PARTNER_COMMISSION_PERCENT_DEFAULT = float(os.environ.get("BILLING_PARTNER_COMMISSION_PERCENT", "20"))
PARTNER_CONTRACT_YEARS_MIN = 1
PARTNER_CONTRACT_YEARS_MAX = 3

# クライアント AI: 100 円パックあたりのトークン数
AI_YEN_PER_PACK = 100

# Stripe Billing Meters（API 2025-03-31+）— 顧問先从量の event_name
CLIENT_METER_EVENT_NAME = "docugrid_billable_clients"

PRIMARY_PLAN_ID = "firm"

PLAN_CATALOG: dict[str, dict[str, str]] = {
    "firm": {
        "label": "事務所プラン",
        "description": f"基本料 ¥{FIRM_BASE_YEN_MONTHLY:,}/月 + 顧問先 ¥{FIRM_PER_CLIENT_YEN_MONTHLY}/社/月",
        "base_price_env": "STRIPE_PRICE_FIRM_BASE",
        "meter_price_env": "STRIPE_PRICE_CLIENT_METERED",
    },
}


def estimate_firm_monthly_yen(client_count: int) -> int:
    return FIRM_BASE_YEN_MONTHLY + FIRM_PER_CLIENT_YEN_MONTHLY * max(0, client_count)


def pricing_model_payload() -> dict[str, Any]:
    return {
        "firmBaseYen": FIRM_BASE_YEN_MONTHLY,
        "firmPerClientYen": FIRM_PER_CLIENT_YEN_MONTHLY,
        "partnerCommissionPercent": PARTNER_COMMISSION_PERCENT_DEFAULT,
        "partnerContractYearsMin": PARTNER_CONTRACT_YEARS_MIN,
        "partnerContractYearsMax": PARTNER_CONTRACT_YEARS_MAX,
        "aiYenPerPack": AI_YEN_PER_PACK,
        "primaryPlanId": PRIMARY_PLAN_ID,
    }
