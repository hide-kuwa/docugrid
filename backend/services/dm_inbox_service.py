"""DM unified inbox — messages from connected email / Slack / LINE tools."""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from services.messaging_channels_service import CHANNELS, get_channels_public
from services.tenancy import DEFAULT_FIRM_ID

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
DM_INBOX_DB_PATH = STORAGE_DIR / "dm_inbox.db"

ALLOWED_CHANNELS = frozenset({"email", "slack", "line", "system", "all"})
ALLOWED_DIRECTIONS = frozenset({"inbound", "outbound", "system"})


def _now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def init_dm_inbox_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DM_INBOX_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS dm_inbox_items (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                channel TEXT NOT NULL,
                client_id TEXT,
                direction TEXT NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL DEFAULT '',
                participants TEXT NOT NULL DEFAULT '',
                external_id TEXT,
                meta_json TEXT,
                occurred_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_dm_inbox_firm_occurred
                ON dm_inbox_items (firm_id, occurred_at DESC)
            """
        )
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_inbox_external
                ON dm_inbox_items (firm_id, channel, external_id)
                WHERE external_id IS NOT NULL AND external_id != ''
            """
        )


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    meta: Any = {}
    if row["meta_json"]:
        try:
            meta = json.loads(row["meta_json"])
        except Exception:
            meta = {}
    return {
        "id": row["id"],
        "firm_id": row["firm_id"],
        "channel": row["channel"],
        "client_id": row["client_id"],
        "direction": row["direction"],
        "title": row["title"],
        "body": row["body"] or "",
        "participants": row["participants"] or "",
        "external_id": row["external_id"],
        "meta": meta if isinstance(meta, dict) else {},
        "occurred_at": row["occurred_at"],
        "created_at": row["created_at"],
    }


def ingest_item(
    *,
    firm_id: str,
    channel: str,
    title: str,
    body: str = "",
    direction: str = "inbound",
    client_id: Optional[str] = None,
    participants: str = "",
    external_id: Optional[str] = None,
    meta: Optional[dict[str, Any]] = None,
    occurred_at: Optional[str] = None,
) -> dict[str, Any]:
    """Insert or upsert by (firm, channel, external_id)."""
    init_dm_inbox_db()
    fid = (firm_id or "").strip() or DEFAULT_FIRM_ID
    ch = (channel or "system").strip().lower()
    if ch not in ("email", "slack", "line", "system"):
        ch = "system"
    direction = direction if direction in ALLOWED_DIRECTIONS else "inbound"
    now = _now()
    occurred = (occurred_at or now).strip() or now
    ext = (external_id or "").strip() or None

    with sqlite3.connect(DM_INBOX_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        if ext:
            existing = conn.execute(
                """
                SELECT id FROM dm_inbox_items
                WHERE firm_id=? AND channel=? AND external_id=?
                """,
                (fid, ch, ext),
            ).fetchone()
            if existing:
                conn.execute(
                    """
                    UPDATE dm_inbox_items SET
                        client_id=?, direction=?, title=?, body=?, participants=?,
                        meta_json=?, occurred_at=?
                    WHERE id=?
                    """,
                    (
                        client_id,
                        direction,
                        (title or "").strip()[:300] or "(無題)",
                        (body or "")[:8000],
                        participants or "",
                        json.dumps(meta or {}, ensure_ascii=False),
                        occurred,
                        existing["id"],
                    ),
                )
                row = conn.execute(
                    "SELECT * FROM dm_inbox_items WHERE id=?",
                    (existing["id"],),
                ).fetchone()
                return _row_to_dict(row)

        item_id = uuid.uuid4().hex
        conn.execute(
            """
            INSERT INTO dm_inbox_items (
                id, firm_id, channel, client_id, direction, title, body,
                participants, external_id, meta_json, occurred_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item_id,
                fid,
                ch,
                client_id,
                direction,
                (title or "").strip()[:300] or "(無題)",
                (body or "")[:8000],
                participants or "",
                ext,
                json.dumps(meta or {}, ensure_ascii=False),
                occurred,
                now,
            ),
        )
        row = conn.execute(
            "SELECT * FROM dm_inbox_items WHERE id=?",
            (item_id,),
        ).fetchone()
    return _row_to_dict(row)


def list_inbox(
    firm_id: str,
    *,
    channel: Optional[str] = None,
    client_id: Optional[str] = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    init_dm_inbox_db()
    fid = (firm_id or "").strip() or DEFAULT_FIRM_ID
    sql = "SELECT * FROM dm_inbox_items WHERE firm_id=?"
    params: list[Any] = [fid]
    if channel and channel != "all" and channel in ("email", "slack", "line", "system"):
        sql += " AND channel=?"
        params.append(channel)
    if client_id:
        sql += " AND (client_id=? OR client_id IS NULL OR client_id='')"
        params.append(client_id)
    sql += " ORDER BY occurred_at DESC LIMIT ?"
    params.append(max(1, min(limit, 500)))
    with sqlite3.connect(DM_INBOX_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()
    return [_row_to_dict(r) for r in rows]


def ensure_channel_connected_notice(firm_id: str, channel: str) -> Optional[dict[str, Any]]:
    """When a tool becomes ready, drop a one-time system notice into the inbox."""
    if channel not in CHANNELS:
        return None
    pub = get_channels_public(firm_id)
    block = pub.get(channel) or {}
    if not block.get("ready"):
        return None
    return ingest_item(
        firm_id=firm_id,
        channel=channel,
        direction="system",
        title=f"{channel.upper()} が接続されました",
        body="このチャネルからの通知・メッセージはここに集約されます。",
        participants="DocuGrid",
        external_id=f"connected:{channel}",
        meta={"event": "channel_connected"},
    )


def sync_connected_notices(firm_id: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for ch in CHANNELS:
        item = ensure_channel_connected_notice(firm_id, ch)
        if item:
            out.append(item)
    return out


def workspace_payload(
    firm_id: str,
    *,
    channel: Optional[str] = None,
    client_id: Optional[str] = None,
    limit: int = 100,
) -> dict[str, Any]:
    """Channels status + unified feed for DM UI."""
    sync_connected_notices(firm_id)
    channels = get_channels_public(firm_id)
    items = list_inbox(firm_id, channel=channel, client_id=client_id, limit=limit)

    # Also surface client_comms threads as read-only projections when client scoped
    projected: list[dict[str, Any]] = []
    if client_id:
        try:
            from services.client_comms_service import list_comm_threads

            for t in list_comm_threads(firm_id, client_id):
                projected.append(
                    {
                        "id": f"comms:{t['id']}",
                        "firm_id": firm_id,
                        "channel": t.get("channel") or "email",
                        "client_id": client_id,
                        "direction": "inbound",
                        "title": t.get("subject") or "",
                        "body": t.get("preview") or "",
                        "participants": t.get("participants") or "",
                        "external_id": f"comms:{t['id']}",
                        "meta": {"source": "client_comms", "source_type": t.get("source_type")},
                        "occurred_at": t.get("occurred_at") or t.get("updated_at"),
                        "created_at": t.get("updated_at"),
                        "projection": True,
                    }
                )
        except Exception:
            projected = []

    merged = items + [p for p in projected if p["id"] not in {i["id"] for i in items}]
    merged.sort(key=lambda x: str(x.get("occurred_at") or ""), reverse=True)
    merged = merged[: max(1, min(limit, 500))]

    tools = []
    for ch in CHANNELS:
        block = channels.get(ch) or {}
        tools.append(
            {
                "id": ch,
                "label": {"email": "メール", "slack": "Slack", "line": "LINE"}.get(ch, ch),
                "enabled": bool(block.get("enabled")),
                "ready": bool(block.get("ready")),
                "mode": block.get("mode") or block.get("provider"),
            }
        )

    return {
        "tools": tools,
        "channels": channels,
        "items": merged,
        "count": len(merged),
        "filter": {"channel": channel or "all", "client_id": client_id},
    }
