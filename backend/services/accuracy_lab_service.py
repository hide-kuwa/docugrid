"""Accuracy lab journal — no-code trials, auto/manual notes, markdown export."""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import yaml

from services.tenancy import DEFAULT_FIRM_ID

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
PRESETS_PATH = Path(__file__).resolve().parent.parent / "config" / "accuracy_lab_presets.yaml"
DOCS_FINDINGS_PATH = Path(__file__).resolve().parent.parent.parent / "docs" / "accuracy-lab-findings.md"

ALLOWED_SOURCES = frozenset({"auto", "manual"})
ALLOWED_KINDS = frozenset(
    {"search", "ocr", "get_document", "status", "note", "failure", "rating"}
)
ALLOWED_OUTCOMES = frozenset({"ok", "partial", "fail", "unknown"})


def _now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def _firm_dir(firm_id: str) -> Path:
    fid = (firm_id or "").strip() or DEFAULT_FIRM_ID
    path = STORAGE_DIR / "firms" / fid / "accuracy_lab"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _db_path(firm_id: str) -> Path:
    return _firm_dir(firm_id) / "journal.db"


def _presets_override_path(firm_id: str) -> Path:
    fid = (firm_id or "").strip() or DEFAULT_FIRM_ID
    return STORAGE_DIR / "firms" / fid / "accuracy_lab_presets.json"


def init_accuracy_lab_db(firm_id: str) -> None:
    with sqlite3.connect(_db_path(firm_id)) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS journal_entries (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                client_id TEXT,
                source TEXT NOT NULL,
                kind TEXT NOT NULL,
                outcome TEXT NOT NULL,
                title TEXT NOT NULL,
                body TEXT,
                context_json TEXT,
                tags_json TEXT,
                created_by TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_accuracy_lab_firm_created
                ON journal_entries (firm_id, created_at DESC)
            """
        )


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    ctx: Any = {}
    tags: list[str] = []
    if row["context_json"]:
        try:
            ctx = json.loads(row["context_json"])
        except Exception:
            ctx = {}
    if row["tags_json"]:
        try:
            raw = json.loads(row["tags_json"])
            tags = [str(t) for t in raw] if isinstance(raw, list) else []
        except Exception:
            tags = []
    return {
        "id": row["id"],
        "firm_id": row["firm_id"],
        "client_id": row["client_id"],
        "source": row["source"],
        "kind": row["kind"],
        "outcome": row["outcome"],
        "title": row["title"],
        "body": row["body"] or "",
        "context": ctx if isinstance(ctx, dict) else {},
        "tags": tags,
        "created_by": row["created_by"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def load_presets(firm_id: str | None = None) -> dict[str, Any]:
    base: dict[str, Any] = {
        "version": 1,
        "trial_keywords": [],
        "check_prompts": [],
        "outcome_labels": {
            "ok": "意図どおり",
            "partial": "部分的に可",
            "fail": "ダメ",
            "unknown": "未判定",
        },
    }
    if PRESETS_PATH.exists():
        try:
            raw = yaml.safe_load(PRESETS_PATH.read_text(encoding="utf-8")) or {}
            if isinstance(raw, dict):
                base.update({k: v for k, v in raw.items() if v is not None})
        except Exception:
            pass
    override_path = _presets_override_path(firm_id or DEFAULT_FIRM_ID)
    if override_path.exists():
        try:
            over = json.loads(override_path.read_text(encoding="utf-8"))
            if isinstance(over, dict):
                if isinstance(over.get("trial_keywords"), list):
                    base["trial_keywords"] = [str(x) for x in over["trial_keywords"] if str(x).strip()]
                if isinstance(over.get("check_prompts"), list):
                    base["check_prompts"] = over["check_prompts"]
                if isinstance(over.get("outcome_labels"), dict):
                    base["outcome_labels"] = {
                        **base.get("outcome_labels", {}),
                        **{str(k): str(v) for k, v in over["outcome_labels"].items()},
                    }
        except Exception:
            pass
    return base


def save_presets_override(firm_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    cleaned: dict[str, Any] = {"updated_at": _now()}
    if isinstance(payload.get("trial_keywords"), list):
        cleaned["trial_keywords"] = [
            str(x).strip() for x in payload["trial_keywords"] if str(x).strip()
        ][:80]
    if isinstance(payload.get("check_prompts"), list):
        cleaned["check_prompts"] = payload["check_prompts"][:40]
    path = _presets_override_path(firm_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cleaned, ensure_ascii=False, indent=2), encoding="utf-8")
    return load_presets(firm_id)


def create_entry(
    *,
    firm_id: str,
    source: str,
    kind: str,
    title: str,
    outcome: str = "unknown",
    body: str = "",
    client_id: Optional[str] = None,
    context: Optional[dict[str, Any]] = None,
    tags: Optional[list[str]] = None,
    created_by: Optional[str] = None,
) -> dict[str, Any]:
    if source not in ALLOWED_SOURCES:
        source = "manual"
    if kind not in ALLOWED_KINDS:
        kind = "note"
    if outcome not in ALLOWED_OUTCOMES:
        outcome = "unknown"
    init_accuracy_lab_db(firm_id)
    entry_id = uuid.uuid4().hex
    now = _now()
    with sqlite3.connect(_db_path(firm_id)) as conn:
        conn.execute(
            """
            INSERT INTO journal_entries (
                id, firm_id, client_id, source, kind, outcome, title, body,
                context_json, tags_json, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry_id,
                firm_id,
                client_id,
                source,
                kind,
                outcome,
                (title or "").strip()[:300] or "(無題)",
                (body or "")[:8000],
                json.dumps(context or {}, ensure_ascii=False),
                json.dumps(tags or [], ensure_ascii=False),
                created_by,
                now,
                now,
            ),
        )
    return get_entry(firm_id, entry_id)  # type: ignore[return-value]


def get_entry(firm_id: str, entry_id: str) -> Optional[dict[str, Any]]:
    init_accuracy_lab_db(firm_id)
    with sqlite3.connect(_db_path(firm_id)) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM journal_entries WHERE id=? AND firm_id=?",
            (entry_id, firm_id),
        ).fetchone()
    return _row_to_dict(row) if row else None


def list_entries(
    firm_id: str,
    *,
    client_id: Optional[str] = None,
    outcome: Optional[str] = None,
    source: Optional[str] = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    init_accuracy_lab_db(firm_id)
    sql = "SELECT * FROM journal_entries WHERE firm_id=?"
    params: list[Any] = [firm_id]
    if client_id:
        sql += " AND client_id=?"
        params.append(client_id)
    if outcome and outcome in ALLOWED_OUTCOMES:
        sql += " AND outcome=?"
        params.append(outcome)
    if source and source in ALLOWED_SOURCES:
        sql += " AND source=?"
        params.append(source)
    sql += " ORDER BY created_at DESC LIMIT ?"
    params.append(max(1, min(limit, 500)))
    with sqlite3.connect(_db_path(firm_id)) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()
    return [_row_to_dict(r) for r in rows]


def delete_entry(firm_id: str, entry_id: str) -> bool:
    init_accuracy_lab_db(firm_id)
    with sqlite3.connect(_db_path(firm_id)) as conn:
        cur = conn.execute(
            "DELETE FROM journal_entries WHERE id=? AND firm_id=?",
            (entry_id, firm_id),
        )
        return cur.rowcount > 0


def render_markdown(firm_id: str, *, limit: int = 200) -> str:
    presets = load_presets(firm_id)
    entries = list_entries(firm_id, limit=limit)
    labels = presets.get("outcome_labels") or {}
    lines = [
        "# Accuracy lab findings（精度実験ログ）",
        "",
        f"生成日時: {_now()} UTC",
        f"firm_id: `{firm_id}`",
        "",
        "この文書はノーコード実験ラボの記録から自動生成されます。",
        "コードを書き直すときの参考（失敗パターン・期待との差分・手動メモ）として使ってください。",
        "",
        "## 試行キーワード（プリセット）",
        "",
    ]
    kws = presets.get("trial_keywords") or []
    if kws:
        for kw in kws:
            lines.append(f"- `{kw}`")
    else:
        lines.append("- （なし）")
    lines.extend(["", "## チェック観点", ""])
    for prompt in presets.get("check_prompts") or []:
        if isinstance(prompt, dict):
            lines.append(f"- **{prompt.get('id', '')}**: {prompt.get('label', '')}")
        else:
            lines.append(f"- {prompt}")

    fails = [e for e in entries if e["outcome"] == "fail"]
    partials = [e for e in entries if e["outcome"] == "partial"]
    oks = [e for e in entries if e["outcome"] == "ok"]
    lines.extend(
        [
            "",
            "## サマリ",
            "",
            f"- 記録件数: {len(entries)}",
            f"- ダメ (fail): {len(fails)}",
            f"- 部分的 (partial): {len(partials)}",
            f"- 意図どおり (ok): {len(oks)}",
            "",
            "## 失敗・要改善（コード改修の優先候補）",
            "",
        ]
    )
    priority = fails + partials
    if not priority:
        lines.append("_まだ fail / partial の記録はありません。_")
    else:
        for e in priority:
            lines.extend(_entry_md_block(e, labels))

    lines.extend(["", "## 全ログ（新しい順）", ""])
    if not entries:
        lines.append("_記録なし_")
    else:
        for e in entries:
            lines.extend(_entry_md_block(e, labels))

    lines.extend(
        [
            "",
            "## 実装への示唆（テンプレ）",
            "",
            "- [ ] 抜粋が空／短すぎるケース → OCR / excerpt 切り出しを見直す",
            "- [ ] キーワード部分一致の取りこぼし → 正規化・同義語・I2 ベクトル",
            "- [ ] false positive が多い → スコープ・カテゴリフィルタ",
            "- [ ] OCR failed が多い → スキャン品質・エンジン分岐",
            "",
        ]
    )
    return "\n".join(lines)


def _entry_md_block(e: dict[str, Any], labels: dict[str, Any]) -> list[str]:
    outcome = e.get("outcome") or "unknown"
    label = labels.get(outcome, outcome)
    ctx = e.get("context") or {}
    lines = [
        f"### {e.get('created_at', '')} — {e.get('title', '')}",
        "",
        f"- source: `{e.get('source')}` / kind: `{e.get('kind')}` / outcome: **{label}** (`{outcome}`)",
        f"- client_id: `{e.get('client_id') or '—'}` / by: `{e.get('created_by') or '—'}`",
    ]
    tags = e.get("tags") or []
    if tags:
        lines.append(f"- tags: {', '.join(f'`{t}`' for t in tags)}")
    if e.get("body"):
        lines.extend(["", e["body"], ""])
    if ctx:
        lines.extend(["", "```json", json.dumps(ctx, ensure_ascii=False, indent=2), "```", ""])
    else:
        lines.append("")
    return lines


def write_snapshot(firm_id: str) -> dict[str, Any]:
    md = render_markdown(firm_id)
    path = _firm_dir(firm_id) / "LATEST.md"
    path.write_text(md, encoding="utf-8")
    return {"path": str(path), "bytes": len(md.encode("utf-8")), "markdown": md}


def publish_docs_findings(firm_id: str) -> dict[str, Any]:
    """Write repo docs snapshot for coding reference (explicit user action)."""
    snap = write_snapshot(firm_id)
    DOCS_FINDINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    header = (
        "<!-- Generated by accuracy lab. Re-run from Settings → AI / MCP → ドキュメント化. -->\n\n"
    )
    DOCS_FINDINGS_PATH.write_text(header + snap["markdown"], encoding="utf-8")
    return {
        **snap,
        "docs_path": "docs/accuracy-lab-findings.md",
    }
