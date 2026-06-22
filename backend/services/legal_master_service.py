"""法定マスタ — Temporal Master Pattern（valid_from / valid_to）。

docs/temporal-master-pattern.md
docs/no-code-config-vision.md C5
"""

from __future__ import annotations

import csv
import io
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
LEGAL_MASTER_DB_PATH = STORAGE_DIR / "legal_master.db"
SEED_CSV_PATH = Path(__file__).resolve().parent.parent / "config" / "legal_master_seed.csv"

CSV_COLUMNS = [
    "domain",
    "master_key",
    "label_ja",
    "value_numeric",
    "value_text",
    "jurisdiction",
    "valid_from",
    "valid_to",
    "source_law",
    "attributes_json",
    "master_version_id",
]

ImportMode = Literal["replace", "merge"]

_schema_ready = False


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_schema() -> None:
    global _schema_ready
    if _schema_ready:
        return
    LEGAL_MASTER_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(LEGAL_MASTER_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS legal_master_entries (
                id TEXT PRIMARY KEY,
                domain TEXT NOT NULL,
                master_key TEXT NOT NULL,
                label_ja TEXT NOT NULL,
                value_numeric REAL,
                value_text TEXT,
                jurisdiction TEXT,
                valid_from TEXT NOT NULL,
                valid_to TEXT,
                source_law TEXT,
                attributes_json TEXT,
                master_version_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_legal_master_lookup
            ON legal_master_entries (master_key, jurisdiction, valid_from DESC)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_legal_master_domain
            ON legal_master_entries (domain, valid_from DESC)
            """
        )
        conn.commit()
    _schema_ready = True


def init_legal_master_db() -> None:
    _ensure_schema()
    with sqlite3.connect(LEGAL_MASTER_DB_PATH) as conn:
        row = conn.execute("SELECT COUNT(*) AS c FROM legal_master_entries").fetchone()
    if int(row[0]) == 0 and SEED_CSV_PATH.is_file():
        seed_from_file()


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    attrs_raw = row["attributes_json"]
    attributes = None
    if attrs_raw:
        try:
            attributes = json.loads(attrs_raw)
        except json.JSONDecodeError:
            attributes = attrs_raw
    return {
        "id": row["id"],
        "domain": row["domain"],
        "master_key": row["master_key"],
        "label_ja": row["label_ja"],
        "value_numeric": row["value_numeric"],
        "value_text": row["value_text"],
        "jurisdiction": row["jurisdiction"],
        "valid_from": row["valid_from"],
        "valid_to": row["valid_to"],
        "source_law": row["source_law"],
        "attributes": attributes,
        "master_version_id": row["master_version_id"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def count_entries() -> int:
    _ensure_schema()
    with sqlite3.connect(LEGAL_MASTER_DB_PATH) as conn:
        row = conn.execute("SELECT COUNT(*) AS c FROM legal_master_entries").fetchone()
    return int(row[0]) if row else 0


def list_entries(
    *,
    domain: str | None = None,
    master_key: str | None = None,
    as_of: str | None = None,
) -> list[dict[str, Any]]:
    _ensure_schema()
    clauses: list[str] = []
    params: list[Any] = []
    if domain:
        clauses.append("domain = ?")
        params.append(domain)
    if master_key:
        clauses.append("master_key = ?")
        params.append(master_key)
    if as_of:
        clauses.append("valid_from <= ?")
        params.append(as_of)
        clauses.append("(valid_to IS NULL OR valid_to = '' OR valid_to >= ?)")
        params.append(as_of)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    sql = f"""
        SELECT * FROM legal_master_entries
        {where}
        ORDER BY domain, master_key, valid_from DESC
    """
    with sqlite3.connect(LEGAL_MASTER_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_entry(entry_id: str) -> dict[str, Any] | None:
    _ensure_schema()
    with sqlite3.connect(LEGAL_MASTER_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM legal_master_entries WHERE id = ?", (entry_id,)
        ).fetchone()
    return _row_to_dict(row) if row else None


def lookup_rate(
    master_key: str,
    as_of: str,
    *,
    jurisdiction: str | None = None,
) -> dict[str, Any] | None:
    _ensure_schema()
    params: list[Any] = [master_key, as_of, as_of]
    jurisdiction_clause = ""
    if jurisdiction:
        jurisdiction_clause = "AND (jurisdiction IS NULL OR jurisdiction = '' OR jurisdiction = ?)"
        params.append(jurisdiction)
    with sqlite3.connect(LEGAL_MASTER_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            f"""
            SELECT * FROM legal_master_entries
            WHERE master_key = ?
              AND valid_from <= ?
              AND (valid_to IS NULL OR valid_to = '' OR valid_to >= ?)
              {jurisdiction_clause}
            ORDER BY valid_from DESC
            LIMIT 1
            """,
            params,
        ).fetchone()
    if not row:
        return None
    out = _row_to_dict(row)
    out["as_of"] = as_of
    if out.get("value_numeric") is not None:
        out["value"] = out["value_numeric"]
    elif out.get("value_text"):
        out["value"] = out["value_text"]
    return out


def list_income_tax_brackets(as_of: str) -> list[dict[str, Any]]:
    rows = list_entries(domain="income_tax_bracket", as_of=as_of)
    brackets: list[dict[str, Any]] = []
    for row in rows:
        attrs = row.get("attributes") or {}
        if not isinstance(attrs, dict):
            continue
        brackets.append(
            {
                "master_key": row["master_key"],
                "label_ja": row["label_ja"],
                "rate": row.get("value_numeric"),
                "bracket_min": attrs.get("bracket_min"),
                "bracket_max": attrs.get("bracket_max"),
                "base_deduction": attrs.get("base_deduction", 0),
                "valid_from": row["valid_from"],
                "valid_to": row["valid_to"],
                "master_version_id": row.get("master_version_id"),
            }
        )
    brackets.sort(key=lambda b: int(b.get("bracket_min") or 0))
    return brackets


def _parse_optional_float(raw: str) -> float | None:
    text = (raw or "").strip()
    if not text:
        return None
    return float(text)


def _parse_row_dict(item: dict[str, str], *, row_num: int) -> tuple[dict[str, Any], list[str]]:
    errors: list[str] = []
    prefix = f"row {row_num}: "
    domain = (item.get("domain") or "").strip()
    master_key = (item.get("master_key") or "").strip()
    label_ja = (item.get("label_ja") or "").strip()
    valid_from = (item.get("valid_from") or "").strip()
    if not domain:
        errors.append(f"{prefix}domain required")
    if not master_key:
        errors.append(f"{prefix}master_key required")
    if not label_ja:
        label_ja = master_key
    if not valid_from:
        errors.append(f"{prefix}valid_from required")
    attrs_raw = (item.get("attributes_json") or "").strip()
    attributes_json = None
    if attrs_raw:
        try:
            json.loads(attrs_raw)
            attributes_json = attrs_raw
        except json.JSONDecodeError as exc:
            errors.append(f"{prefix}attributes_json invalid JSON: {exc}")
    version_id = (item.get("master_version_id") or "").strip() or None
    return (
        {
            "domain": domain,
            "master_key": master_key,
            "label_ja": label_ja,
            "value_numeric": _parse_optional_float(item.get("value_numeric") or ""),
            "value_text": (item.get("value_text") or "").strip() or None,
            "jurisdiction": (item.get("jurisdiction") or "").strip() or None,
            "valid_from": valid_from,
            "valid_to": (item.get("valid_to") or "").strip() or None,
            "source_law": (item.get("source_law") or "").strip() or None,
            "attributes_json": attributes_json,
            "master_version_id": version_id,
        },
        errors,
    )


def validate_csv_text(text: str) -> tuple[list[str], list[dict[str, Any]]]:
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return ["CSV header missing"], []
    rows: list[dict[str, Any]] = []
    errors: list[str] = []
    for idx, item in enumerate(reader, start=2):
        parsed, row_errors = _parse_row_dict(item, row_num=idx)
        errors.extend(row_errors)
        if not row_errors:
            rows.append(parsed)
    return errors, rows


def _insert_entry(conn: sqlite3.Connection, data: dict[str, Any], entry_id: str | None = None) -> str:
    eid = entry_id or str(uuid.uuid4())
    now = _now()
    conn.execute(
        """
        INSERT INTO legal_master_entries (
            id, domain, master_key, label_ja, value_numeric, value_text,
            jurisdiction, valid_from, valid_to, source_law, attributes_json,
            master_version_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            eid,
            data["domain"],
            data["master_key"],
            data["label_ja"],
            data.get("value_numeric"),
            data.get("value_text"),
            data.get("jurisdiction"),
            data["valid_from"],
            data.get("valid_to"),
            data.get("source_law"),
            data.get("attributes_json"),
            data.get("master_version_id"),
            now,
            now,
        ),
    )
    return eid


def _entry_body_to_row(data: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    attrs = data.get("attributes")
    attrs_json = data.get("attributes_json")
    if isinstance(attrs, dict):
        attrs_json = json.dumps(attrs, ensure_ascii=False)
    item = {
        "domain": str(data.get("domain") or ""),
        "master_key": str(data.get("master_key") or ""),
        "label_ja": str(data.get("label_ja") or ""),
        "value_numeric": str(data.get("value_numeric")) if data.get("value_numeric") is not None else "",
        "value_text": str(data.get("value_text") or ""),
        "jurisdiction": str(data.get("jurisdiction") or ""),
        "valid_from": str(data.get("valid_from") or ""),
        "valid_to": str(data.get("valid_to") or ""),
        "source_law": str(data.get("source_law") or ""),
        "attributes_json": str(attrs_json or ""),
        "master_version_id": str(data.get("master_version_id") or ""),
    }
    return _parse_row_dict(item, row_num=1)


def create_entry(data: dict[str, Any]) -> dict[str, Any]:
    row, errors = _entry_body_to_row(data)
    if errors:
        raise ValueError("; ".join(errors))
    _ensure_schema()
    with sqlite3.connect(LEGAL_MASTER_DB_PATH) as conn:
        eid = _insert_entry(conn, row)
        conn.commit()
    entry = get_entry(eid)
    assert entry is not None
    return entry


def update_entry(entry_id: str, data: dict[str, Any]) -> dict[str, Any]:
    existing = get_entry(entry_id)
    if not existing:
        raise KeyError(f"Entry not found: {entry_id}")
    merged = {**existing, **data}
    row, errors = _entry_body_to_row(merged)
    if errors:
        raise ValueError("; ".join(errors))
    _ensure_schema()
    now = _now()
    with sqlite3.connect(LEGAL_MASTER_DB_PATH) as conn:
        conn.execute(
            """
            UPDATE legal_master_entries SET
                domain = ?, master_key = ?, label_ja = ?, value_numeric = ?, value_text = ?,
                jurisdiction = ?, valid_from = ?, valid_to = ?, source_law = ?,
                attributes_json = ?, master_version_id = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                row["domain"],
                row["master_key"],
                row["label_ja"],
                row.get("value_numeric"),
                row.get("value_text"),
                row.get("jurisdiction"),
                row["valid_from"],
                row.get("valid_to"),
                row.get("source_law"),
                row.get("attributes_json"),
                row.get("master_version_id"),
                now,
                entry_id,
            ),
        )
        conn.commit()
    updated = get_entry(entry_id)
    assert updated is not None
    return updated


def delete_entry(entry_id: str) -> None:
    _ensure_schema()
    with sqlite3.connect(LEGAL_MASTER_DB_PATH) as conn:
        cur = conn.execute("DELETE FROM legal_master_entries WHERE id = ?", (entry_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise KeyError(f"Entry not found: {entry_id}")


def import_csv_text(text: str, *, mode: ImportMode = "merge") -> dict[str, Any]:
    errors, rows = validate_csv_text(text)
    if errors:
        raise ValueError("; ".join(errors))
    _ensure_schema()
    inserted = 0
    with sqlite3.connect(LEGAL_MASTER_DB_PATH) as conn:
        if mode == "replace":
            conn.execute("DELETE FROM legal_master_entries")
        for row in rows:
            version_id = row.get("master_version_id")
            if mode == "merge" and version_id:
                existing = conn.execute(
                    "SELECT id FROM legal_master_entries WHERE master_version_id = ?",
                    (version_id,),
                ).fetchone()
                if existing:
                    conn.execute(
                        """
                        UPDATE legal_master_entries SET
                            domain = ?, master_key = ?, label_ja = ?, value_numeric = ?, value_text = ?,
                            jurisdiction = ?, valid_from = ?, valid_to = ?, source_law = ?,
                            attributes_json = ?, updated_at = ?
                        WHERE master_version_id = ?
                        """,
                        (
                            row["domain"],
                            row["master_key"],
                            row["label_ja"],
                            row.get("value_numeric"),
                            row.get("value_text"),
                            row.get("jurisdiction"),
                            row["valid_from"],
                            row.get("valid_to"),
                            row.get("source_law"),
                            row.get("attributes_json"),
                            _now(),
                            version_id,
                        ),
                    )
                    inserted += 1
                    continue
            _insert_entry(conn, row)
            inserted += 1
        conn.commit()
    return {"imported": inserted, "total": count_entries()}


def export_csv_text(*, domain: str | None = None) -> str:
    rows = list_entries(domain=domain)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_COLUMNS, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow(
            {
                "domain": row["domain"],
                "master_key": row["master_key"],
                "label_ja": row["label_ja"],
                "value_numeric": row.get("value_numeric") if row.get("value_numeric") is not None else "",
                "value_text": row.get("value_text") or "",
                "jurisdiction": row.get("jurisdiction") or "",
                "valid_from": row["valid_from"],
                "valid_to": row.get("valid_to") or "",
                "source_law": row.get("source_law") or "",
                "attributes_json": json.dumps(row["attributes"], ensure_ascii=False)
                if isinstance(row.get("attributes"), dict)
                else (row.get("attributes_json") or ""),
                "master_version_id": row.get("master_version_id") or "",
            }
        )
    return buf.getvalue()


def seed_from_file(path: Path | None = None) -> dict[str, Any]:
    seed_path = path or SEED_CSV_PATH
    if not seed_path.is_file():
        raise FileNotFoundError(f"Seed CSV not found: {seed_path}")
    text = seed_path.read_text(encoding="utf-8")
    return import_csv_text(text, mode="merge")


def summary() -> dict[str, Any]:
    _ensure_schema()
    with sqlite3.connect(LEGAL_MASTER_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        domain_rows = conn.execute(
            """
            SELECT domain, COUNT(*) AS c
            FROM legal_master_entries
            GROUP BY domain
            ORDER BY domain
            """
        ).fetchall()
    return {
        "entry_count": count_entries(),
        "db_path": str(LEGAL_MASTER_DB_PATH),
        "domains": [{"domain": r["domain"], "count": r["c"]} for r in domain_rows],
    }
