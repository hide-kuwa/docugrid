"""Import PROLEXT 顧客一覧 xlsx into client_master.json for firm_prolext only.

IDs are prefixed ``plx-`` so they never collide with demo ``c1``…``c9``.
Existing firm_default / firm_beta rows are left untouched.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from services.client_profile_fields import sanitize_client_profile  # noqa: E402
from services.tenancy import (  # noqa: E402
    DEFAULT_FIRM_ID,
    PROLEXT_FIRM_ID,
    invalidate_client_firm_cache,
)

CLIENT_MASTER_PATH = ROOT / "storage" / "client_master.json"
ID_PREFIX = "plx"

# 顧客名 / 送付先×4 / 本店×4 / 区分 / 資本金 / 決算日 / 消費税 / 法人番号 /
# 税務署 / 都税 / 市町村 / e-Tax / e-Tax PIN / eLTax / eLTax PIN / 設立
COL = {
    "name": 0,
    "mail_zip": 1,
    "mail_pref": 2,
    "mail_city": 3,
    "mail_bldg": 4,
    "hq_zip": 5,
    "hq_pref": 6,
    "hq_city": 7,
    "hq_bldg": 8,
    "entity": 9,
    "capital": 10,
    "fiscal": 11,
    "consumption": 12,
    "corp_no": 13,
    "tax_office": 14,
    "pref_tax": 15,
    "muni_tax": 16,
    "etax": 17,
    "etax_pin": 18,
    "eltax": 19,
    "eltax_pin": 20,
    "established": 21,
}


def _cell(row: tuple[Any, ...], key: str) -> str:
    idx = COL[key]
    if idx >= len(row) or row[idx] is None:
        return ""
    val = row[idx]
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, float) and val.is_integer():
        return str(int(val))
    return str(val).strip()


def _join_address(zip_code: str, pref: str, city: str, bldg: str) -> str:
    parts = []
    if zip_code:
        parts.append(f"〒{zip_code}")
    loc = f"{pref}{city}".strip()
    if loc:
        parts.append(loc)
    if bldg:
        parts.append(bldg)
    return "\n".join(parts)


def _fiscal_month(raw: Any, *, category: str = "corporate") -> int:
    """個人事業は暦年（12月）が原則。法人のみ空欄時 3 月にフォールバック。"""
    default = 12 if category == "individual" else 3
    if raw is None or raw == "":
        return default
    if isinstance(raw, datetime):
        return max(1, min(12, raw.month))
    text = str(raw).strip()
    m = re.search(r"(1[0-2]|0?[1-9])", text)
    if m:
        return int(m.group(1))
    return default


def _category(entity: str, name: str) -> str:
    if "個人" in entity:
        return "individual"
    if "法人" in entity:
        return "corporate"
    if re.search(r"(株式会社|合同会社|有限会社|一般社団|一般財団|医療法人|学校法人)", name):
        return "corporate"
    return "corporate"


def _corp_digits(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    return digits if len(digits) == 13 else ""


def _ascii_slug(name: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-").lower()
    return s[:24]


def _make_id(corp: str, name: str, used: set[str], seq: int) -> str:
    if corp:
        cid = f"{ID_PREFIX}-{corp}"
        if cid not in used:
            return cid
    slug = _ascii_slug(name)
    if slug:
        cid = f"{ID_PREFIX}-{slug}"
        n = 2
        while cid in used:
            cid = f"{ID_PREFIX}-{slug}-{n}"
            n += 1
        return cid
    cid = f"{ID_PREFIX}-{seq:04d}"
    n = seq
    while cid in used:
        n += 1
        cid = f"{ID_PREFIX}-{n:04d}"
    return cid


def _profile_from_row(row: tuple[Any, ...], name: str) -> dict[str, str]:
    mail = _join_address(
        _cell(row, "mail_zip"),
        _cell(row, "mail_pref"),
        _cell(row, "mail_city"),
        _cell(row, "mail_bldg"),
    )
    hq = _join_address(
        _cell(row, "hq_zip"),
        _cell(row, "hq_pref"),
        _cell(row, "hq_city"),
        _cell(row, "hq_bldg"),
    )
    raw = {
        "customer_name": name,
        "mailing_address": mail,
        "head_office_address": hq,
        "entity_major": _cell(row, "entity"),
        "capital": _cell(row, "capital"),
        "fiscal_year_end_date": _cell(row, "fiscal"),
        "consumption_tax": _cell(row, "consumption"),
        "corporate_number": _corp_digits(_cell(row, "corp_no")) or _cell(row, "corp_no"),
        "tax_office": _cell(row, "tax_office"),
        "prefectural_tax_office": _cell(row, "pref_tax"),
        "municipal_tax_office": _cell(row, "muni_tax"),
        "etax_user_id": _cell(row, "etax"),
        "etax_pin": _cell(row, "etax_pin"),
        "eltax_user_id": _cell(row, "eltax"),
        "eltax_pin": _cell(row, "eltax_pin"),
        "established_date": _cell(row, "established"),
    }
    return sanitize_client_profile({k: v for k, v in raw.items() if v})


def parse_xlsx(path: Path) -> list[dict[str, Any]]:
    import openpyxl

    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb.active
    used: set[str] = set()
    clients: list[dict[str, Any]] = []
    for i, row in enumerate(ws.iter_rows(values_only=True), 1):
        if i == 1 or not row:
            continue
        name = _cell(row, "name")
        if not name:
            continue
        corp = _corp_digits(_cell(row, "corp_no"))
        cid = _make_id(corp, name, used, len(clients) + 1)
        used.add(cid)
        category = _category(_cell(row, "entity"), name)
        clients.append(
            {
                "id": cid,
                "name": name,
                "fiscalMonth": _fiscal_month(
                    row[COL["fiscal"]] if COL["fiscal"] < len(row) else None,
                    category=category,
                ),
                "category": category,
                "tags": ["prolext-import"],
                "firmId": PROLEXT_FIRM_ID,
                "profile": _profile_from_row(row, name),
                "profileMeta": {},
                "profileHistory": {},
            }
        )
    wb.close()
    return clients


def load_master() -> dict[str, Any]:
    if not CLIENT_MASTER_PATH.exists():
        return {"clients": [], "groups": [], "relations": [], "relationLayouts": {}}
    return json.loads(CLIENT_MASTER_PATH.read_text(encoding="utf-8"))


def merge_prolext(existing: dict[str, Any], imported: list[dict[str, Any]]) -> dict[str, Any]:
    import_ids = {c["id"] for c in imported}
    kept_clients = []
    for client in existing.get("clients") or []:
        if not isinstance(client, dict):
            continue
        cid = str(client.get("id") or "")
        fid = str(client.get("firmId") or client.get("firm_id") or DEFAULT_FIRM_ID)
        if fid == PROLEXT_FIRM_ID:
            continue
        if cid in import_ids:
            raise SystemExit(f"Refusing to overwrite non-PROLEXT client id {cid!r}")
        if cid.startswith(f"{ID_PREFIX}-"):
            raise SystemExit(f"Refusing to touch id {cid!r} on firm {fid!r}")
        kept_clients.append(client)

    kept_ids = {str(c.get("id")) for c in kept_clients}
    kept_groups = [
        g
        for g in (existing.get("groups") or [])
        if isinstance(g, dict) and all(cid in kept_ids for cid in (g.get("clientIds") or []))
    ]
    kept_relations = [
        r
        for r in (existing.get("relations") or [])
        if isinstance(r, dict)
        and r.get("fromClientId") in kept_ids
        and r.get("toClientId") in kept_ids
    ]
    kept_layouts = {
        k: v
        for k, v in (existing.get("relationLayouts") or {}).items()
        if str(k).split("__", 1)[0] in kept_ids
    }
    return {
        "clients": kept_clients + imported,
        "groups": kept_groups,
        "relations": kept_relations,
        "relationLayouts": kept_layouts,
        "updated_at": existing.get("updated_at"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Import PROLEXT 顧客一覧 into firm_prolext")
    parser.add_argument("--xlsx", required=True, type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    xlsx = args.xlsx.expanduser()
    if not xlsx.is_file():
        raise SystemExit(f"xlsx not found: {xlsx}")

    imported = parse_xlsx(xlsx)
    existing = load_master()
    before_by_firm: dict[str, int] = {}
    for client in existing.get("clients") or []:
        fid = str(client.get("firmId") or DEFAULT_FIRM_ID)
        before_by_firm[fid] = before_by_firm.get(fid, 0) + 1

    merged = merge_prolext(existing, imported)
    after_by_firm: dict[str, int] = {}
    for client in merged["clients"]:
        fid = str(client.get("firmId") or DEFAULT_FIRM_ID)
        after_by_firm[fid] = after_by_firm.get(fid, 0) + 1

    print(f"xlsx rows with name: {len(imported)}")
    print(f"ids prefix: {ID_PREFIX}-  firmId: {PROLEXT_FIRM_ID}")
    print(f"before by firm: {before_by_firm}")
    print(f"after by firm:  {after_by_firm}")
    print("sample:", [c["name"] for c in imported[:5]])
    if not args.apply:
        print("dry-run (pass --apply to write)")
        return

    CLIENT_MASTER_PATH.parent.mkdir(parents=True, exist_ok=True)
    CLIENT_MASTER_PATH.write_text(
        json.dumps(merged, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    invalidate_client_firm_cache()
    print(f"wrote {CLIENT_MASTER_PATH}")


if __name__ == "__main__":
    main()
