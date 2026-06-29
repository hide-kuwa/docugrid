"""AI token usage per client with announce → stop → pay-as-you-go."""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
AI_USAGE_DB_PATH = STORAGE_DIR / "ai_usage.db"


def _period_key() -> str:
    return datetime.utcnow().strftime("%Y-%m")


def included_tokens_per_client() -> int:
    return int(os.environ.get("AI_INCLUDED_TOKENS_PER_CLIENT_MONTH", "25000"))


def tokens_per_100_yen() -> int:
    return int(os.environ.get("AI_TOKENS_PER_100_YEN", "10000"))


def init_ai_usage_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(AI_USAGE_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_client_usage (
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                period_key TEXT NOT NULL,
                tokens_used INTEGER NOT NULL DEFAULT 0,
                state TEXT NOT NULL DEFAULT 'normal',
                announced_at TEXT,
                stopped_at TEXT,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (firm_id, client_id, period_key)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_firm_wallet (
                firm_id TEXT PRIMARY KEY,
                paygo_enabled INTEGER NOT NULL DEFAULT 0,
                token_balance INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            )
            """
        )


def _utc_now() -> str:
    return datetime.utcnow().isoformat()


def _get_wallet(firm_id: str) -> dict[str, Any]:
    init_ai_usage_db()
    with sqlite3.connect(AI_USAGE_DB_PATH) as conn:
        row = conn.execute(
            "SELECT paygo_enabled, token_balance FROM ai_firm_wallet WHERE firm_id=?",
            (firm_id,),
        ).fetchone()
    if not row:
        return {"paygo_enabled": False, "token_balance": 0}
    return {"paygo_enabled": bool(row[0]), "token_balance": int(row[1])}


def _get_client_row(firm_id: str, client_id: str, period: str) -> dict[str, Any]:
    init_ai_usage_db()
    with sqlite3.connect(AI_USAGE_DB_PATH) as conn:
        row = conn.execute(
            """
            SELECT tokens_used, state, announced_at, stopped_at
            FROM ai_client_usage
            WHERE firm_id=? AND client_id=? AND period_key=?
            """,
            (firm_id, client_id, period),
        ).fetchone()
    if not row:
        return {
            "tokens_used": 0,
            "state": "normal",
            "announced_at": None,
            "stopped_at": None,
        }
    return {
        "tokens_used": int(row[0]),
        "state": str(row[1]),
        "announced_at": row[2],
        "stopped_at": row[3],
    }


def _save_client_row(
    firm_id: str,
    client_id: str,
    period: str,
    *,
    tokens_used: int,
    state: str,
    announced_at: str | None = None,
    stopped_at: str | None = None,
) -> None:
    init_ai_usage_db()
    now = _utc_now()
    with sqlite3.connect(AI_USAGE_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO ai_client_usage
                (firm_id, client_id, period_key, tokens_used, state, announced_at, stopped_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(firm_id, client_id, period_key) DO UPDATE SET
                tokens_used=excluded.tokens_used,
                state=excluded.state,
                announced_at=excluded.announced_at,
                stopped_at=excluded.stopped_at,
                updated_at=excluded.updated_at
            """,
            (firm_id, client_id, period, tokens_used, state, announced_at, stopped_at, now),
        )


def enable_paygo(firm_id: str) -> dict[str, Any]:
    init_ai_usage_db()
    now = _utc_now()
    with sqlite3.connect(AI_USAGE_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO ai_firm_wallet (firm_id, paygo_enabled, token_balance, updated_at)
            VALUES (?, 1, 0, ?)
            ON CONFLICT(firm_id) DO UPDATE SET paygo_enabled=1, updated_at=excluded.updated_at
            """,
            (firm_id, now),
        )
    return get_firm_ai_summary(firm_id)


def grant_tokens_from_yen(firm_id: str, yen: int) -> dict[str, Any]:
    packs = max(0, yen) // 100
    tokens = packs * tokens_per_100_yen()
    if tokens <= 0:
        return get_firm_ai_summary(firm_id)
    init_ai_usage_db()
    now = _utc_now()
    with sqlite3.connect(AI_USAGE_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO ai_firm_wallet (firm_id, paygo_enabled, token_balance, updated_at)
            VALUES (?, 0, ?, ?)
            ON CONFLICT(firm_id) DO UPDATE SET
                token_balance=token_balance + excluded.token_balance,
                updated_at=excluded.updated_at
            """,
            (firm_id, tokens, now),
        )
    return get_firm_ai_summary(firm_id)


def _deduct_wallet(firm_id: str, tokens: int) -> bool:
    wallet = _get_wallet(firm_id)
    if wallet["token_balance"] < tokens:
        return False
    init_ai_usage_db()
    with sqlite3.connect(AI_USAGE_DB_PATH) as conn:
        conn.execute(
            """
            UPDATE ai_firm_wallet
            SET token_balance = token_balance - ?, updated_at=?
            WHERE firm_id=? AND token_balance >= ?
            """,
            (tokens, _utc_now(), firm_id, tokens),
        )
        changed = conn.total_changes
    return changed > 0


def check_ai_allowed(firm_id: str, client_id: str) -> dict[str, Any]:
    period = _period_key()
    included = included_tokens_per_client()
    row = _get_client_row(firm_id, client_id, period)
    wallet = _get_wallet(firm_id)
    used = row["tokens_used"]
    state = row["state"]

    if state == "stopped":
        if wallet["paygo_enabled"] and wallet["token_balance"] > 0:
            return {
                "allowed": True,
                "code": "paygo",
                "message": "従量課金トークンを使用します。",
                "announce": False,
                "clientUsage": _usage_payload(client_id, used, included, state, wallet),
            }
        return {
            "allowed": False,
            "code": "stopped",
            "message": "この顧問先の AI 利用は停止中です。従量課金に同意のうえ、100円単位でトークンを追加してください。",
            "announce": False,
            "clientUsage": _usage_payload(client_id, used, included, state, wallet),
        }

    if used >= included:
        if state == "normal":
            _save_client_row(
                firm_id,
                client_id,
                period,
                tokens_used=used,
                state="announced",
                announced_at=_utc_now(),
            )
            return {
                "allowed": True,
                "code": "announced",
                "message": "今月の無料 AI 枠を超えました。次回利用から停止されます。従量課金で継続できます。",
                "announce": True,
                "clientUsage": _usage_payload(client_id, used, included, "announced", wallet),
            }
        if state == "announced":
            _save_client_row(
                firm_id,
                client_id,
                period,
                tokens_used=used,
                state="stopped",
                announced_at=row["announced_at"],
                stopped_at=_utc_now(),
            )
            return {
                "allowed": False,
                "code": "stopped",
                "message": "AI 利用を停止しました。従量課金に同意し、トークンを購入してください。",
                "announce": True,
                "clientUsage": _usage_payload(client_id, used, included, "stopped", wallet),
            }

    return {
        "allowed": True,
        "code": "ok",
        "message": "",
        "announce": False,
        "clientUsage": _usage_payload(client_id, used, included, state, wallet),
    }


def record_ai_usage(
    firm_id: str,
    client_id: str,
    tokens: int,
    *,
    feature: str = "classify",
) -> dict[str, Any]:
    period = _period_key()
    included = included_tokens_per_client()
    row = _get_client_row(firm_id, client_id, period)
    wallet = _get_wallet(firm_id)
    used = row["tokens_used"] + max(0, tokens)

    overage = max(0, used - included)
    if overage > 0 and wallet["paygo_enabled"]:
        if not _deduct_wallet(firm_id, overage):
            _save_client_row(
                firm_id,
                client_id,
                period,
                tokens_used=used,
                state="stopped",
                announced_at=row["announced_at"],
                stopped_at=_utc_now(),
            )
            return {
                "recorded": False,
                "reason": "insufficient_tokens",
                "clientUsage": get_client_usage(firm_id, client_id),
            }

    _save_client_row(
        firm_id,
        client_id,
        period,
        tokens_used=used,
        state=row["state"],
        announced_at=row["announced_at"],
        stopped_at=row["stopped_at"],
    )
    return {"recorded": True, "feature": feature, "tokens": tokens, "clientUsage": get_client_usage(firm_id, client_id)}


def _usage_payload(
    client_id: str,
    used: int,
    included: int,
    state: str,
    wallet: dict[str, Any],
) -> dict[str, Any]:
    return {
        "clientId": client_id,
        "tokensUsed": used,
        "includedTokens": included,
        "state": state,
        "paygoEnabled": wallet["paygo_enabled"],
        "tokenBalance": wallet["token_balance"],
        "periodKey": _period_key(),
    }


def get_client_usage(firm_id: str, client_id: str) -> dict[str, Any]:
    period = _period_key()
    included = included_tokens_per_client()
    row = _get_client_row(firm_id, client_id, period)
    wallet = _get_wallet(firm_id)
    return _usage_payload(client_id, row["tokens_used"], included, row["state"], wallet)


def list_client_usages(firm_id: str, client_ids: list[str]) -> list[dict[str, Any]]:
    return [get_client_usage(firm_id, cid) for cid in client_ids]


def get_firm_ai_summary(firm_id: str) -> dict[str, Any]:
    wallet = _get_wallet(firm_id)
    return {
        "periodKey": _period_key(),
        "includedTokensPerClient": included_tokens_per_client(),
        "tokensPer100Yen": tokens_per_100_yen(),
        "paygoEnabled": wallet["paygo_enabled"],
        "tokenBalance": wallet["token_balance"],
        "yenPerPack": 100,
    }


def estimate_tokens_from_text(text: str, *, max_tokens: int = 200) -> int:
    chars = len(text or "")
    return min(max_tokens, max(500, chars // 2 + 300))
