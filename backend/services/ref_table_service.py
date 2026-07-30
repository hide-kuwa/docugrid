"""参照テーブルマスタ — 表形式の法定基準値を JSON で管理する汎用基盤。

スカラー値は legal_master（CSV）で管理するが、行列・区分表（雇用保険料率、
基礎控除の所得段階、配偶者控除マトリクス、法人住民税均等割、個人事業税区分、
簡易課税みなし仕入率、最低賃金など）は列と行を持つ表として持つ方が自然なため、
本サービスで一元管理する。

各 JSON（backend/config/ref_tables/*.json）のスキーマ:
{
  "id": "employment_insurance_rate",
  "label_ja": "雇用保険料率",
  "category": "labor_insurance",
  "unit": "per_mille" | "percent" | "yen" | "",
  "source_law": "...",
  "source_url": "https://...",
  "notes": ["..."],
  "versions": [
    {
      "valid_from": "2025-04-01",
      "valid_to": null,
      "label": "令和7年度",
      "columns": [{"key": "business", "label": "事業の種類", "type": "text"},
                   {"key": "worker", "label": "労働者負担", "type": "rate"}],
      "rows": [{"business": "一般の事業", "worker": 0.005}]
    }
  ]
}
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

_CONFIG_DIR = Path(__file__).resolve().parent.parent / "config" / "ref_tables"


@lru_cache(maxsize=1)
def _load_all() -> list[dict[str, Any]]:
    tables: list[dict[str, Any]] = []
    if not _CONFIG_DIR.is_dir():
        return tables
    for path in sorted(_CONFIG_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        data["_path"] = str(path)
        tables.append(data)
    tables.sort(key=lambda t: str(t.get("label_ja") or t.get("id") or ""))
    return tables


def reload_ref_tables() -> None:
    _load_all.cache_clear()


def _public(table: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in table.items() if k != "_path"}


def list_ref_tables() -> list[dict[str, Any]]:
    """一覧用の要約（バージョン本体は含めない）。"""
    out: list[dict[str, Any]] = []
    for t in _load_all():
        versions = t.get("versions", [])
        out.append(
            {
                "id": t.get("id", ""),
                "label_ja": t.get("label_ja", ""),
                "category": t.get("category", ""),
                "unit": t.get("unit", ""),
                "source_law": t.get("source_law"),
                "source_url": t.get("source_url"),
                "version_count": len(versions),
                "latest_valid_from": versions[0].get("valid_from") if versions else None,
            }
        )
    return out


def get_ref_table(table_id: str) -> Optional[dict[str, Any]]:
    for t in _load_all():
        if t.get("id") == table_id:
            table = _public(t)
            # バージョンを valid_from 降順（最新が先頭）に整える。
            table["versions"] = sorted(
                table.get("versions", []),
                key=lambda v: str(v.get("valid_from") or ""),
                reverse=True,
            )
            return table
    return None


def effective_version(table_id: str, as_of: Optional[str] = None) -> Optional[dict[str, Any]]:
    """時点で有効なバージョンを返す（as_of 未指定なら最新）。"""
    table = get_ref_table(table_id)
    if not table:
        return None
    versions = table.get("versions", [])
    if not versions:
        return None
    if as_of is None:
        return versions[0]
    for v in versions:  # 新しい順
        vf = str(v.get("valid_from") or "")
        vt = v.get("valid_to")
        if vf and vf > as_of:
            continue
        if vt and str(vt) < as_of:
            continue
        return v
    return None


def find_row(
    table_id: str,
    match: dict[str, Any],
    *,
    as_of: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """有効バージョンから match（列key: 値）に一致する最初の行を返す。"""
    version = effective_version(table_id, as_of)
    if not version:
        return None
    for row in version.get("rows", []):
        if all(row.get(k) == v for k, v in match.items()):
            return row
    return None


def _table_path(table_id: str) -> Optional[Path]:
    for t in _load_all():
        if t.get("id") == table_id:
            raw = t.get("_path")
            return Path(raw) if raw else None
    return None


def save_ref_table(table_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """参照テーブル本体を JSON ファイルへ書き戻す（ノーコード編集用）。"""
    path = _table_path(table_id)
    if path is None:
        # 新規テーブル: id からファイル名を生成。
        if not table_id or not table_id.replace("_", "").isalnum():
            raise ValueError("table_id が不正です")
        path = _CONFIG_DIR / f"{table_id}.json"
        _CONFIG_DIR.mkdir(parents=True, exist_ok=True)

    cleaned = {k: v for k, v in payload.items() if k != "_path"}
    cleaned["id"] = table_id
    path.write_text(json.dumps(cleaned, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    reload_ref_tables()
    result = get_ref_table(table_id)
    if not result:
        raise ValueError("保存後の読み込みに失敗しました")
    return result


def upsert_ref_table_row(
    table_id: str,
    *,
    valid_from: str,
    row: dict[str, Any],
    match_key: str,
) -> dict[str, Any]:
    """指定バージョンの行を match_key で upsert する（都道府県行の追加などを想定）。"""
    table = get_ref_table(table_id)
    if not table:
        raise ValueError(f"参照テーブルが見つかりません: {table_id}")
    if not match_key or match_key not in row:
        raise ValueError(f"match_key '{match_key}' が行にありません")

    versions = list(table.get("versions") or [])
    target = next((v for v in versions if str(v.get("valid_from")) == valid_from), None)
    if target is None:
        raise ValueError(f"バージョンが見つかりません: valid_from={valid_from}")

    key_val = row[match_key]
    rows = list(target.get("rows") or [])
    replaced = False
    for i, existing in enumerate(rows):
        if existing.get(match_key) == key_val:
            rows[i] = {**existing, **row}
            replaced = True
            break
    if not replaced:
        rows.append(row)
    target["rows"] = rows

    # get_ref_table はソート済みコピーを返すので、ディスク上の並びを保つため再読込して差し替える。
    path = _table_path(table_id)
    if path is None:
        raise ValueError("ファイルパスを解決できません")
    on_disk = json.loads(path.read_text(encoding="utf-8"))
    disk_versions = on_disk.get("versions") or []
    for i, v in enumerate(disk_versions):
        if str(v.get("valid_from")) == valid_from:
            disk_versions[i] = {**v, "rows": rows}
            break
    else:
        disk_versions.append(target)
    on_disk["versions"] = disk_versions
    return save_ref_table(table_id, on_disk)
