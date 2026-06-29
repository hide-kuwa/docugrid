#!/usr/bin/env python3
"""
Pre-flight checks before production deploy.

Usage (from backend/):
  python scripts/validate_production_env.py
  python scripts/validate_production_env.py --env-file .env.production
  python scripts/validate_production_env.py --check-stripe
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
        raise FileNotFoundError(path)
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _ok(msg: str) -> None:
    print(f"  OK  {msg}")


def _fail(msg: str) -> None:
    print(f" FAIL {msg}")


def _warn(msg: str) -> None:
    print(f" WARN {msg}")


def validate(*, check_stripe: bool) -> int:
    from docugrid_auth import is_production, staging_local_enabled, validate_auth_config
    from services.member_directory import MEMBER_DIRECTORY_PATH, member_directory_count
    from services.stripe_client import is_stripe_configured, stripe_webhook_secret

    errors: list[str] = []
    warnings: list[str] = []

    print("DocuGrid production pre-flight\n")
    if staging_local_enabled():
        print("  (DOCUGRID_STAGING_LOCAL - localhost staging, Google OAuth skipped)\n")

    # --- Phase 1: core auth (raises in production on fatal misconfig) ---
    print("[1] Auth & security")
    try:
        extra = validate_auth_config(strict=is_production())
        for w in extra:
            warnings.append(w)
        _ok("validate_auth_config()")
    except RuntimeError as exc:
        errors.append(str(exc))
        _fail(str(exc))

    if not is_production():
        _warn("DOCUGRID_ENV is not production - strict auth checks relaxed")

    storage = BACKEND_ROOT / "storage"
    try:
        storage.mkdir(parents=True, exist_ok=True)
        probe = storage / ".write_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        _ok(f"storage writable: {storage}")
    except OSError as exc:
        errors.append(f"storage not writable: {exc}")
        _fail(f"storage not writable: {exc}")

    # --- Phase 2: member directory ---
    print("\n[2] Member directory (Google login allowlist)")
    if is_production():
        if not MEMBER_DIRECTORY_PATH.is_file():
            errors.append(
                "member_directory.json missing - run: "
                "python scripts/seed_member_directory.py add user@firm.co.jp actor-s1"
            )
            _fail("member_directory.json missing")
        elif member_directory_count() == 0:
            errors.append("member_directory.json has no emailToStakeholderId entries")
            _fail("member_directory.json empty")
        else:
            _ok(f"{member_directory_count()} user(s) in member_directory.json")
    else:
        _warn("Skipping member_directory requirement (not production)")

    # --- Phase 3: frontend URL (Stripe redirects, CORS sanity) ---
    print("\n[3] URLs")
    frontend = (
        os.environ.get("DOCUGRID_FRONTEND_URL", "").strip()
        or os.environ.get("FRONTEND_URL", "").strip()
    )
    cors = os.environ.get("DOCUGRID_CORS_ORIGINS", "").strip()
    if is_production():
        if not frontend or frontend.startswith("http://localhost"):
            warnings.append("DOCUGRID_FRONTEND_URL should be your HTTPS app URL (Stripe Checkout)")
            _warn("DOCUGRID_FRONTEND_URL not set or still localhost")
        else:
            _ok(f"DOCUGRID_FRONTEND_URL={frontend}")
        if cors and "localhost" in cors:
            warnings.append("DOCUGRID_CORS_ORIGINS still contains localhost")
            _warn("CORS origins include localhost")
        elif cors:
            _ok(f"DOCUGRID_CORS_ORIGINS={cors}")

    google_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()
    if google_id:
        _ok("GOOGLE_OAUTH_CLIENT_ID set")
    elif is_production():
        errors.append("GOOGLE_OAUTH_CLIENT_ID required in production")
        _fail("GOOGLE_OAUTH_CLIENT_ID missing")

    # --- Phase 4: Stripe (optional) ---
    print("\n[4] Stripe billing (optional)")
    if check_stripe or is_stripe_configured():
        if not is_stripe_configured():
            errors.append("STRIPE_SECRET_KEY missing (--check-stripe)")
            _fail("STRIPE_SECRET_KEY missing")
        else:
            _ok("STRIPE_SECRET_KEY set")
            for var in (
                "STRIPE_PUBLISHABLE_KEY",
                "STRIPE_PRICE_FIRM_BASE",
                "STRIPE_PRICE_CLIENT_METERED",
            ):
                if os.environ.get(var, "").strip():
                    _ok(f"{var} set")
                else:
                    warnings.append(f"{var} not set")
                    _warn(f"{var} not set")
            if not stripe_webhook_secret():
                warnings.append("STRIPE_WEBHOOK_SECRET not set - webhooks will fail")
                _warn("STRIPE_WEBHOOK_SECRET missing")
            else:
                _ok("STRIPE_WEBHOOK_SECRET set")
    else:
        _warn("Stripe not configured (billing APIs return 503) - skip with no --check-stripe")

    # --- Summary ---
    print("\n--- Summary ---")
    for w in warnings:
        print(f"  WARN: {w}")
    if errors:
        print(f"\n{len(errors)} error(s). Fix before deploying.")
        return 1
    if warnings:
        print(f"\nPassed with {len(warnings)} warning(s).")
    else:
        print("\nAll checks passed.")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate DocuGrid production environment")
    parser.add_argument(
        "--env-file",
        type=Path,
        default=None,
        help="Load variables from file (e.g. .env.production) before checks",
    )
    parser.add_argument(
        "--check-stripe",
        action="store_true",
        help="Require Stripe keys and price IDs",
    )
    args = parser.parse_args()

    if args.env_file:
        _load_env_file(args.env_file.resolve())

    raise SystemExit(validate(check_stripe=args.check_stripe))


if __name__ == "__main__":
    main()
