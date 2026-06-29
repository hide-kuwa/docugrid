#!/usr/bin/env python3
"""
Manage production login allowlist (member_directory.json).

Usage (from backend/):
  python scripts/seed_member_directory.py list
  python scripts/seed_member_directory.py add tanaka@firm.co.jp actor-s1
  python scripts/seed_member_directory.py remove tanaka@firm.co.jp
  python scripts/seed_member_directory.py init-from-example
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
STORAGE_DIR = BACKEND_ROOT / "storage"
MEMBER_DIRECTORY_PATH = STORAGE_DIR / "member_directory.json"
EXAMPLE_PATH = STORAGE_DIR / "member_directory.json.example"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load() -> dict:
    if not MEMBER_DIRECTORY_PATH.is_file():
        return {"emailToStakeholderId": {}, "updated_at": None}
    return json.loads(MEMBER_DIRECTORY_PATH.read_text(encoding="utf-8"))


def _save(payload: dict) -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    payload["updated_at"] = _utc_now()
    MEMBER_DIRECTORY_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def cmd_list() -> int:
    data = _load()
    mapping = data.get("emailToStakeholderId") or {}
    if not mapping:
        print("No users registered.")
        print(f"File: {MEMBER_DIRECTORY_PATH}")
        return 0
    for email in sorted(mapping.keys()):
        print(f"  {email} -> {mapping[email]}")
    print(f"\n{len(mapping)} user(s). File: {MEMBER_DIRECTORY_PATH}")
    return 0


def cmd_add(email: str, stakeholder_id: str) -> int:
    email = email.strip().lower()
    stakeholder_id = stakeholder_id.strip()
    if not email or "@" not in email:
        print("Invalid email", file=sys.stderr)
        return 1
    if not stakeholder_id:
        print("stakeholder_id required", file=sys.stderr)
        return 1
    data = _load()
    mapping = dict(data.get("emailToStakeholderId") or {})
    mapping[email] = stakeholder_id
    data["emailToStakeholderId"] = mapping
    _save(data)
    print(f"Added {email} -> {stakeholder_id}")
    return 0


def cmd_remove(email: str) -> int:
    email = email.strip().lower()
    data = _load()
    mapping = dict(data.get("emailToStakeholderId") or {})
    if email not in mapping:
        print(f"Not found: {email}", file=sys.stderr)
        return 1
    del mapping[email]
    data["emailToStakeholderId"] = mapping
    _save(data)
    print(f"Removed {email}")
    return 0


def cmd_init_from_example() -> int:
    if MEMBER_DIRECTORY_PATH.exists():
        print(f"Already exists: {MEMBER_DIRECTORY_PATH}", file=sys.stderr)
        return 1
    if not EXAMPLE_PATH.is_file():
        print(f"Missing example: {EXAMPLE_PATH}", file=sys.stderr)
        return 1
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    MEMBER_DIRECTORY_PATH.write_text(EXAMPLE_PATH.read_text(encoding="utf-8"), encoding="utf-8")
    print(f"Created {MEMBER_DIRECTORY_PATH} from example — edit emails before production.")
    return 0


def cmd_sync_dev_personas() -> int:
    import sys as _sys

    if str(BACKEND_ROOT) not in _sys.path:
        _sys.path.insert(0, str(BACKEND_ROOT))
    from services.member_directory import DEFAULT_EMAIL_TO_STAKEHOLDER

    data = _load()
    mapping = dict(data.get("emailToStakeholderId") or {})
    added = 0
    for email, sid in DEFAULT_EMAIL_TO_STAKEHOLDER.items():
        key = email.lower()
        if key not in mapping:
            mapping[key] = sid
            added += 1
    data["emailToStakeholderId"] = mapping
    _save(data)
    print(f"Synced {added} dev persona email(s) -> {MEMBER_DIRECTORY_PATH}")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage member_directory.json")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list", help="List registered emails")

    p_add = sub.add_parser("add", help="Register email -> stakeholder_id")
    p_add.add_argument("email")
    p_add.add_argument("stakeholder_id")

    p_rm = sub.add_parser("remove", help="Remove email")
    p_rm.add_argument("email")

    sub.add_parser("init-from-example", help="Copy member_directory.json.example")

    p_sync = sub.add_parser(
        "sync-dev-personas",
        help="Merge DEFAULT_EMAIL_TO_STAKEHOLDER into member_directory (staging bootstrap)",
    )

    args = parser.parse_args()
    if args.command == "list":
        raise SystemExit(cmd_list())
    if args.command == "add":
        raise SystemExit(cmd_add(args.email, args.stakeholder_id))
    if args.command == "remove":
        raise SystemExit(cmd_remove(args.email))
    if args.command == "init-from-example":
        raise SystemExit(cmd_init_from_example())
    if args.command == "sync-dev-personas":
        raise SystemExit(cmd_sync_dev_personas())


if __name__ == "__main__":
    main()
