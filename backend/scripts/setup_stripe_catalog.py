#!/usr/bin/env python3
"""
Create Stripe Products/Prices for DocuGrid billing (test or live).

Usage (from backend/, loads .env if present):
  python scripts/setup_stripe_catalog.py
  python scripts/setup_stripe_catalog.py --env-file .env --write-env

Idempotent: reuses existing products named "DocuGrid ..." when found.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _find_product_by_name(stripe, name: str) -> str | None:
    for product in stripe.Product.list(limit=100, active=True).auto_paging_iter():
        if product.name == name:
            return str(product.id)
    return None


def _find_price(stripe, *, product_id: str, lookup_key: str | None = None) -> str | None:
    params: dict = {"product": product_id, "active": True, "limit": 100}
    if lookup_key:
        params["lookup_keys"] = [lookup_key]
    prices = stripe.Price.list(**params)
    for price in prices.data:
        if lookup_key and price.lookup_key == lookup_key:
            return str(price.id)
        if not lookup_key:
            return str(price.id)
    return None


def _find_meter_by_event(stripe, event_name: str) -> str | None:
    for meter in stripe.billing.Meter.list(limit=100).auto_paging_iter():
        if meter.event_name == event_name:
            return str(meter.id)
    return None


def ensure_catalog(stripe) -> dict[str, str]:
    from services.billing_catalog import (
        AI_YEN_PER_PACK,
        CLIENT_METER_EVENT_NAME,
        FIRM_BASE_YEN_MONTHLY,
        FIRM_PER_CLIENT_YEN_MONTHLY,
    )

    out: dict[str, str] = {}

    # --- Firm base (fixed monthly) ---
    base_name = "DocuGrid 事務所プラン（基本料）"
    base_product = _find_product_by_name(stripe, base_name)
    if not base_product:
        base_product = stripe.Product.create(
            name=base_name,
            description=f"月額基本料 ¥{FIRM_BASE_YEN_MONTHLY:,}",
        ).id
    base_price = _find_price(stripe, product_id=base_product, lookup_key="docugrid_firm_base")
    if not base_price:
        base_price = stripe.Price.create(
            product=base_product,
            currency="jpy",
            unit_amount=FIRM_BASE_YEN_MONTHLY,
            recurring={"interval": "month"},
            lookup_key="docugrid_firm_base",
        ).id
    out["STRIPE_PRICE_FIRM_BASE"] = str(base_price)

    # --- Client metered (per client per month) ---
    meter_name = "DocuGrid 顧問先从量"
    meter_product = _find_product_by_name(stripe, meter_name)
    if not meter_product:
        meter_product = stripe.Product.create(
            name=meter_name,
            description=f"顧問先 ¥{FIRM_PER_CLIENT_YEN_MONTHLY}/社/月（従量）",
        ).id
    meter_event = CLIENT_METER_EVENT_NAME
    meter_id = _find_meter_by_event(stripe, meter_event)
    if not meter_id:
        meter = stripe.billing.Meter.create(
            display_name="DocuGrid 顧問先数",
            event_name=meter_event,
            default_aggregation={"formula": "last"},
            customer_mapping={
                "type": "by_id",
                "event_payload_key": "stripe_customer_id",
            },
            value_settings={"event_payload_key": "value"},
        )
        meter_id = str(meter.id)
    out["STRIPE_METER_CLIENT_EVENT"] = meter_event

    meter_price = _find_price(stripe, product_id=meter_product, lookup_key="docugrid_client_metered")
    if not meter_price:
        meter_price = stripe.Price.create(
            product=meter_product,
            currency="jpy",
            unit_amount=FIRM_PER_CLIENT_YEN_MONTHLY,
            recurring={
                "interval": "month",
                "usage_type": "metered",
                "meter": meter_id,
            },
            billing_scheme="per_unit",
            lookup_key="docugrid_client_metered",
        ).id
    out["STRIPE_PRICE_CLIENT_METERED"] = str(meter_price)

    # --- AI top-up (one-time payment price, used in Checkout) ---
    ai_name = "DocuGrid AI トークン（100円パック）"
    ai_product = _find_product_by_name(stripe, ai_name)
    if not ai_product:
        ai_product = stripe.Product.create(
            name=ai_name,
            description=f"AI 利用トークン ¥{AI_YEN_PER_PACK}/パック",
        ).id
    ai_price = _find_price(stripe, product_id=ai_product, lookup_key="docugrid_ai_topup_100")
    if not ai_price:
        ai_price = stripe.Price.create(
            product=ai_product,
            currency="jpy",
            unit_amount=AI_YEN_PER_PACK,
            lookup_key="docugrid_ai_topup_100",
        ).id
    out["STRIPE_PRICE_AI_TOPUP_100"] = str(ai_price)

    return out


def _append_env_lines(env_path: Path, lines: dict[str, str]) -> None:
    existing_lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.is_file() else []
    result: list[str] = []
    keys_written: set[str] = set()
    for line in existing_lines:
        stripped = line.strip()
        replaced = False
        if stripped and not stripped.startswith("#"):
            key = stripped.split("=", 1)[0].strip()
            if key in lines:
                result.append(f"{key}={lines[key]}")
                keys_written.add(key)
                replaced = True
        else:
            for key, value in lines.items():
                prefix = f"{key}="
                body = stripped.lstrip("#").strip()
                if body.startswith(prefix):
                    result.append(f"{key}={value}")
                    keys_written.add(key)
                    replaced = True
                    break
        if not replaced:
            result.append(line)
    for key, value in lines.items():
        if key not in keys_written:
            result.append(f"{key}={value}")
    env_path.write_text("\n".join(result) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Create Stripe catalog for DocuGrid")
    parser.add_argument("--env-file", type=Path, default=BACKEND_ROOT / ".env")
    parser.add_argument(
        "--write-env",
        action="store_true",
        help="Append/replace price IDs in --env-file",
    )
    args = parser.parse_args()

    _load_env_file(args.env_file.resolve())
    from services.stripe_client import is_stripe_configured, stripe_client

    if not is_stripe_configured():
        print("STRIPE_SECRET_KEY not set. Add to .env first.", file=sys.stderr)
        return 1

    stripe = stripe_client()
    mode = "test" if os.environ.get("STRIPE_SECRET_KEY", "").startswith("sk_test_") else "live"
    print(f"Stripe mode: {mode}\n")

    prices = ensure_catalog(stripe)
    for key, value in prices.items():
        print(f"{key}={value}")

    if args.write_env:
        _append_env_lines(args.env_file.resolve(), prices)
        print(f"\nUpdated {args.env_file}")

    print("\nAdd the above to backend/.env.production when ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
