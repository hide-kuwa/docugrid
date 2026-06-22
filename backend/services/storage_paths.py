"""Resolve on-disk paths for storage_key values (firm-scoped + legacy fallbacks)."""

from __future__ import annotations

from pathlib import Path

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"


def resolve_storage_path(storage_key: str) -> Path:
    """Return the best existing path for a storage_key, with legacy fallbacks."""
    if not storage_key:
        return STORAGE_DIR
    primary = STORAGE_DIR / storage_key
    if primary.exists():
        return primary
    leaf = Path(storage_key).name
    for legacy_dir in ("versions", "slots"):
        candidate = STORAGE_DIR / legacy_dir / leaf
        if candidate.exists():
            return candidate
    if storage_key.startswith(("versions/", "slots/")):
        legacy = STORAGE_DIR / storage_key
        if legacy.exists():
            return legacy
    return primary
