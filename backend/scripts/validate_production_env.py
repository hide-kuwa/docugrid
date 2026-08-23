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
import json
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def _load_env_file(path: Path, *, override: bool = True) -> None:
    """Load KEY=VALUE lines into os.environ.

    When used with --env-file, override=True so the file wins over a dirty shell
    (e.g. DOCUGRID_ALLOW_HEADER_AUTH left true from a previous test session).
    """
    if not path.is_file():
        raise FileNotFoundError(path)
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if not key:
            continue
        if override or key not in os.environ:
            os.environ[key] = value


def _ok(msg: str) -> None:
    print(f"  OK  {msg}")


def _fail(msg: str) -> None:
    print(f" FAIL {msg}")


def _warn(msg: str) -> None:
    print(f" WARN {msg}")


def validate(*, check_stripe: bool) -> int:
    from docugrid_auth import (
        is_production,
        jwt_secret_is_placeholder,
        legacy_files_enabled,
        staging_local_enabled,
        validate_auth_config,
    )
    from services.member_directory import MEMBER_DIRECTORY_PATH, member_directory_count
    from services.firm_settings import secret_encryption_key_configured
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

    # --- Phase 2: login allowlist (member_directory and/or firm_members) ---
    print("\n[2] Login allowlist (member_directory / firm_members)")
    from services.firm_members import active_member_count

    active_members = active_member_count() if is_production() else 0
    if is_production():
        has_directory = MEMBER_DIRECTORY_PATH.is_file()
        directory_count = member_directory_count() if has_directory else 0
        if active_members > 0:
            _ok(f"{active_members} active member(s) in firm_members.db")
        elif has_directory and directory_count > 0:
            _ok(f"{directory_count} user(s) in member_directory.json")
        elif has_directory and directory_count == 0:
            warnings.append(
                "member_directory.json is empty - first login via Google registration "
                "(/register) or: python scripts/seed_member_directory.py add user@firm.co.jp actor-s1"
            )
            _warn("member_directory.json empty (OK for fresh deploy if using /register)")
        else:
            warnings.append(
                "No member_directory.json yet - first login via Google registration "
                "(/register) or seed scripts before inviting staff"
            )
            _warn("fresh deploy: add users via /register or seed_member_directory.py")
    else:
        _warn("Skipping login allowlist requirement (not production)")

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

    # --- Phase 5: hardening (aligns with security-checklist §I) ---
    print("\n[5] Production hardening")
    if is_production():
        from docugrid_auth import (
            csrf_protection_enabled,
            header_auth_allowed,
            session_cookie_secure,
        )
        from services.member_directory import (
            login_stakeholder_pick_allowed,
            password_login_allowed,
        )
        from services.super_admin import (
            LEGACY_DEV_SUPER_ADMIN_EMAIL,
            get_super_admin_emails,
        )

        if header_auth_allowed():
            errors.append("DOCUGRID_ALLOW_HEADER_AUTH must be false in production")
            _fail("header auth still enabled")
        else:
            _ok("header auth disabled")
        if password_login_allowed() and not staging_local_enabled():
            errors.append("DOCUGRID_ALLOW_PASSWORD_LOGIN must be false in production")
            _fail("password login still enabled")
        elif password_login_allowed() and staging_local_enabled():
            _warn("staging-local: password login enabled")
        else:
            _ok("password login disabled")
        if login_stakeholder_pick_allowed():
            errors.append("DOCUGRID_ALLOW_LOGIN_STAKEHOLDER_PICK must be false in production")
            _fail("stakeholder pick still enabled")
        else:
            _ok("login stakeholder pick disabled")
        if csrf_protection_enabled():
            _ok("CSRF protection enabled")
        else:
            warnings.append("DOCUGRID_CSRF is false - enable for cookie sessions")
            _warn("CSRF protection disabled")
        if session_cookie_secure() or staging_local_enabled():
            _ok("session cookie Secure flag OK for this mode")
        else:
            warnings.append("DOCUGRID_SESSION_COOKIE_SECURE should be true behind HTTPS")
            _warn("session cookie Secure not forced")

        from services.super_admin import get_super_admin_emails

        super_emails = get_super_admin_emails()
        if not super_emails:
            _ok("legacy super-admin email disabled")
        elif LEGACY_DEV_SUPER_ADMIN_EMAIL in super_emails and not staging_local_enabled():
            errors.append(
                "DOCUGRID_SUPER_ADMIN_EMAIL must not include admin@taxx.jp in production "
                "(unset to disable, or set your operator email)"
            )
            _fail("legacy admin@taxx.jp super-admin still active")
        elif LEGACY_DEV_SUPER_ADMIN_EMAIL in super_emails:
            _warn("staging-local: legacy admin@taxx.jp super-admin enabled")
        else:
            _ok(f"super-admin email configured ({', '.join(super_emails)})")

        if legacy_files_enabled():
            errors.append("DOCUGRID_ALLOW_LEGACY_FILES must be false in production")
            _fail("DOCUGRID_ALLOW_LEGACY_FILES is enabled")
        else:
            _ok("legacy /files API disabled")
        if jwt_secret_is_placeholder():
            errors.append("DOCUGRID_JWT_SECRET is still a placeholder")
            _fail("DOCUGRID_JWT_SECRET placeholder")
        if secret_encryption_key_configured():
            _ok("DOCUGRID_SECRET_ENCRYPTION_KEY set")
        else:
            errors.append("DOCUGRID_SECRET_ENCRYPTION_KEY must be set in production")
            _fail("DOCUGRID_SECRET_ENCRYPTION_KEY missing")
        dev_emails = {
            "admin@taxx.jp",
            "tanaka@tax.co.jp",
            "yamamoto@tax.co.jp",
            "c1@client.example",
            "ceo@client.example",
            "bank@example.com",
        }
        if MEMBER_DIRECTORY_PATH.is_file():
            try:
                raw = json.loads(MEMBER_DIRECTORY_PATH.read_text(encoding="utf-8-sig"))
                registered = {
                    e.lower()
                    for e in (raw.get("emailToStakeholderId") or {})
                    if isinstance(e, str)
                }
                leaked = registered & dev_emails
                if leaked and not staging_local_enabled():
                    errors.append(
                        f"member_directory.json contains dev-only emails: {sorted(leaked)}"
                    )
                    _fail(f"dev emails in member_directory: {sorted(leaked)}")
                elif leaked:
                    _warn(f"staging-local: dev emails present ({len(leaked)})")
                elif registered:
                    _ok(f"member_directory has {len(registered)} production email(s)")
            except json.JSONDecodeError:
                errors.append("member_directory.json is invalid JSON")
                _fail("member_directory.json invalid JSON")
        try:
            import stat

            mode = storage.stat().st_mode
            if mode & stat.S_IROTH or mode & stat.S_IWOTH:
                warnings.append("storage/ is world-readable or world-writable")
                _warn("storage/ permissions too open (chmod 700 recommended)")
            else:
                _ok("storage/ permissions OK (not world-accessible)")
        except OSError:
            pass
    else:
        _warn("Skipping hardening checks (not production)")

    # --- Phase 6: support CS inbox (optional until wired) ---
    print("\n[6] Support CS (email escalation)")
    inbox = os.environ.get("DOCUGRID_SUPPORT_INBOX_EMAIL", "").strip()
    smtp_host = os.environ.get("DOCUGRID_SUPPORT_SMTP_HOST", "").strip()
    if inbox:
        _ok(f"DOCUGRID_SUPPORT_INBOX_EMAIL={inbox}")
    elif is_production():
        warnings.append(
            "DOCUGRID_SUPPORT_INBOX_EMAIL unset - tickets store locally; "
            "set inbox (+ SMTP) before relying on email CS"
        )
        _warn("support inbox not set (tickets stored_only / mailto fallback)")
    else:
        _warn("support inbox not set (dev OK)")

    if smtp_host:
        _ok(f"DOCUGRID_SUPPORT_SMTP_HOST={smtp_host}")
        for var in (
            "DOCUGRID_SUPPORT_SMTP_USER",
            "DOCUGRID_SUPPORT_SMTP_PASSWORD",
            "DOCUGRID_SUPPORT_SMTP_FROM",
        ):
            if os.environ.get(var, "").strip():
                _ok(f"{var} set")
            else:
                warnings.append(f"{var} missing while SMTP host is set")
                _warn(f"{var} missing")
    elif inbox and is_production():
        warnings.append(
            "Support inbox set but DOCUGRID_SUPPORT_SMTP_HOST empty - "
            "outbound mail will not send until SMTP is configured"
        )
        _warn("SMTP host missing (inbox alone = mailto / stored_only)")
    else:
        _warn("SMTP not configured (optional)")

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
