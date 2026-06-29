#!/usr/bin/env python3
"""
Bootstrap production/staging environment files and member directory.

Usage (from backend/):
  python scripts/bootstrap_production.py
  python scripts/bootstrap_production.py --domain app.example.com --api-domain api.example.com
  python scripts/bootstrap_production.py --staging-local   # localhost Docker staging
"""

from __future__ import annotations

import argparse
import json
import secrets
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
STORAGE_DIR = BACKEND_ROOT / "storage"
MEMBER_PATH = STORAGE_DIR / "member_directory.json"
EXAMPLE_PROD = BACKEND_ROOT / ".env.production.example"
OUT_PROD = BACKEND_ROOT / ".env.production"
DEV_ENV = BACKEND_ROOT / ".env"
FRONTEND_ROOT = BACKEND_ROOT.parent / "frontend"
OUT_FRONT_PROD = FRONTEND_ROOT / ".env.production.local"


def _load_env_map(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        out[key.strip()] = value.strip().strip('"').strip("'")
    return out


def _merge_lines(template: str, overrides: dict[str, str]) -> str:
    lines: list[str] = []
    seen: set[str] = set()
    for line in template.splitlines():
        if "=" in line and not line.strip().startswith("#"):
            key = line.split("=", 1)[0].strip()
            if key in overrides:
                lines.append(f"{key}={overrides[key]}")
                seen.add(key)
                continue
        lines.append(line)
    for key, value in overrides.items():
        if key not in seen:
            lines.append(f"{key}={value}")
    return "\n".join(lines) + "\n"


def _seed_member_directory() -> int:
    from services.member_directory import DEFAULT_EMAIL_TO_STAKEHOLDER

    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    if MEMBER_PATH.is_file():
        data = json.loads(MEMBER_PATH.read_text(encoding="utf-8"))
        mapping = dict(data.get("emailToStakeholderId") or {})
    else:
        mapping = {}
    added = 0
    for email, sid in DEFAULT_EMAIL_TO_STAKEHOLDER.items():
        if email.lower() not in mapping:
            mapping[email.lower()] = sid
            added += 1
    payload = {"emailToStakeholderId": mapping}
    MEMBER_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return added


def main() -> int:
    parser = argparse.ArgumentParser(description="Bootstrap production environment")
    parser.add_argument("--domain", default="", help="Frontend HTTPS origin, e.g. app.example.com")
    parser.add_argument("--api-domain", default="", help="API HTTPS origin, e.g. api.example.com")
    parser.add_argument(
        "--staging-local",
        action="store_true",
        help="Use localhost URLs for Docker staging (still DOCUGRID_ENV=production)",
    )
    parser.add_argument("--skip-member-directory", action="store_true")
    args = parser.parse_args()

    if not EXAMPLE_PROD.is_file():
        print(f"Missing {EXAMPLE_PROD}", file=sys.stderr)
        return 1

    dev = _load_env_map(DEV_ENV)
    jwt = secrets.token_urlsafe(48)

    if args.staging_local:
        front = "http://localhost:3000"
        api = "http://localhost:8000"
        domain = "localhost:3000"
    elif args.domain:
        domain = args.domain.replace("https://", "").replace("http://", "").rstrip("/")
        front = f"https://{domain}"
        api_host = (args.api_domain or f"api.{domain.split(':')[0]}").replace("https://", "").replace("http://", "")
        api = f"https://{api_host}"
    else:
        front = "https://app.example.com"
        api = "https://api.example.com"
        domain = "app.example.com"

    overrides: dict[str, str] = {
        "DOCUGRID_ENV": "production",
        "DOCUGRID_JWT_SECRET": jwt,
        "DOCUGRID_CORS_ORIGINS": front,
        "DOCUGRID_FRONTEND_URL": front,
        "DOCUGRID_ALLOW_HEADER_AUTH": "false",
        "DOCUGRID_ALLOW_PASSWORD_LOGIN": "false",
        "DOCUGRID_ALLOW_LOGIN_STAKEHOLDER_PICK": "false",
        "DOCUGRID_CSRF": "true",
    }

    if args.staging_local:
        overrides["DOCUGRID_STAGING_LOCAL"] = "true"
        overrides["DOCUGRID_ALLOW_PASSWORD_LOGIN"] = "true"
        overrides["DOCUGRID_LOGIN_PASSWORD"] = "staging"

    # Carry over from dev .env when present (never print secrets)
    for key in (
        "GOOGLE_OAUTH_CLIENT_ID",
        "STRIPE_SECRET_KEY",
        "STRIPE_PUBLISHABLE_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "STRIPE_PRICE_FIRM_BASE",
        "STRIPE_PRICE_CLIENT_METERED",
        "STRIPE_PRICE_AI_TOPUP_100",
        "STRIPE_METER_CLIENT_EVENT",
    ):
        if dev.get(key):
            overrides[key] = dev[key]

    if not overrides.get("GOOGLE_OAUTH_CLIENT_ID"):
        overrides["GOOGLE_OAUTH_CLIENT_ID"] = "REPLACE_AFTER_GOOGLE_CONSOLE_SETUP.apps.googleusercontent.com"

    body = _merge_lines(EXAMPLE_PROD.read_text(encoding="utf-8"), overrides)
    OUT_PROD.write_text(body, encoding="utf-8")
    print(f"Wrote {OUT_PROD}")

    front_env = {
        "NEXT_PUBLIC_API_BASE": f"{api}/api",
        "NEXT_PUBLIC_GOOGLE_CLIENT_ID": overrides.get("GOOGLE_OAUTH_CLIENT_ID", ""),
    }
    if dev.get("STRIPE_PUBLISHABLE_KEY"):
        front_env["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"] = dev["STRIPE_PUBLISHABLE_KEY"]

    front_lines = [f"{k}={v}" for k, v in front_env.items()]
    OUT_FRONT_PROD.write_text("\n".join(front_lines) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_FRONT_PROD}")

    if not args.skip_member_directory:
        added = _seed_member_directory()
        print(f"member_directory.json: {added} email(s) added -> {MEMBER_PATH}")

    print("\nNext:")
    print("  1. Set GOOGLE_OAUTH_CLIENT_ID in .env.production + Google Console origins")
    print("  2. python scripts/validate_production_env.py --env-file .env.production")
    if args.staging_local:
        print("  3. docker compose -f docker-compose.staging.yml up -d --build")
    else:
        print("  3. docker compose -f docker-compose.prod.yml up -d --build")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
