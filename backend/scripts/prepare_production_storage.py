#!/usr/bin/env python3
"""
Create an empty production storage tree (do NOT copy local/dev storage).

Usage (from backend/):
  python scripts/prepare_production_storage.py --dest ../deploy/storage
  python scripts/prepare_production_storage.py --dest /var/docugrid/storage --force

Writes:
  - empty firms/ placeholder
  - empty member_directory.json (add users with seed_member_directory.py)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare empty production storage")
    parser.add_argument(
        "--dest",
        type=Path,
        required=True,
        help="Destination storage directory (must be empty unless --force)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Allow non-empty dest (will not delete existing files)",
    )
    args = parser.parse_args()
    dest: Path = args.dest.resolve()

    if dest.exists() and any(dest.iterdir()) and not args.force:
        print(
            f"Refusing: {dest} is not empty. Use a fresh path or pass --force.",
            file=sys.stderr,
        )
        return 1

    dest.mkdir(parents=True, exist_ok=True)
    (dest / "firms").mkdir(exist_ok=True)
    member = dest / "member_directory.json"
    if not member.is_file():
        member.write_text(
            json.dumps({"emailToStakeholderId": {}}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    readme = dest / "README.production.txt"
    readme.write_text(
        "Production storage for DocuGrid.\n"
        "Do not copy backend/storage from a developer machine.\n"
        "Add users: python scripts/seed_member_directory.py add you@firm.co.jp actor-s1\n"
        f"(run with STORAGE pointing at this directory / volume mount)\n",
        encoding="utf-8",
    )

    print(f"Prepared empty storage at {dest}")
    print("Next: seed member_directory, mount as /app/storage in Docker.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
