"""Shared Stripe client helpers (avoids circular imports between billing modules)."""

from __future__ import annotations

import os


def stripe_secret_key() -> str:
    return os.environ.get("STRIPE_SECRET_KEY", "").strip()


def stripe_webhook_secret() -> str:
    return os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()


def frontend_base_url() -> str:
    return (
        os.environ.get("DOCUGRID_FRONTEND_URL", "").strip()
        or os.environ.get("FRONTEND_URL", "").strip()
        or "http://localhost:3000"
    ).rstrip("/")


def is_stripe_configured() -> bool:
    return bool(stripe_secret_key())


def stripe_client():
    if not is_stripe_configured():
        raise RuntimeError("stripe_not_configured")
    import stripe  # type: ignore

    stripe.api_key = stripe_secret_key()
    return stripe
