#!/usr/bin/env python3
"""CLI: migrate legacy storage/versions/*.pdf to firm-scoped paths."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow `python scripts/migrate_legacy_storage.py` from backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.storage_migration import (  # noqa: E402
    list_orphan_legacy_files,
    migrate_legacy_version_files,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate legacy PDF storage to firm-scoped paths")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Copy files and update DB (default: dry-run only)",
    )
    parser.add_argument(
        "--list-orphans",
        action="store_true",
        help="List legacy PDFs with no document_versions row",
    )
    args = parser.parse_args()

    if args.list_orphans:
        orphans = list_orphan_legacy_files()
        if not orphans:
            print("No orphan legacy PDFs found.")
            return 0
        print("Orphan legacy PDFs (not referenced in document_versions):")
        for path in orphans:
            print(f"  - {path}")
        return 0

    dry_run = not args.apply
    mode = "DRY-RUN" if dry_run else "APPLY"
    print(f"[{mode}] Scanning document_versions for legacy storage keys...\n")

    results = migrate_legacy_version_files(dry_run=dry_run)
    if not results:
        print("No document_versions rows found.")
        return 0

    counts: dict[str, int] = {}
    for item in results:
        counts[item.status] = counts.get(item.status, 0) + 1
        print(f"{item.status:16} {item.version_id[:12]}…  {item.old_key} -> {item.new_key}")
        if item.detail:
            print(f"                 {item.detail}")

    print("\nSummary:")
    for status, count in sorted(counts.items()):
        print(f"  {status}: {count}")

    if dry_run:
        print("\nRe-run with --apply to copy files and update the database.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
