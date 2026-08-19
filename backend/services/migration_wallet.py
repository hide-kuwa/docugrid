"""初回データ整理用トークンウォレット（月次 AI 枠とは別）。"""

from __future__ import annotations

import math
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from services.billing_catalog import MIGRATION_TOKENS_PER_100_YEN, MIGRATION_YEN_PER_PACK

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
AI_USAGE_DB_PATH = STORAGE_DIR / "ai_usage.db"

VISION_TOKEN_FLOOR = 800


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def migration_tokens_per_100_yen() -> int:
    return max(1, MIGRATION_TOKENS_PER_100_YEN)


def migration_yen_per_pack() -> int:
    return max(1, MIGRATION_YEN_PER_PACK)


def migration_tokens_per_pack() -> int:
    """1 整理パックあたりのトークン数（パック価格に連動）。"""
    yen = migration_yen_per_pack()
    return max(1, int(yen * migration_tokens_per_100_yen() / 100))


def yen_from_migration_tokens(tokens: int) -> int:
    if tokens <= 0:
        return 0
    rate = migration_tokens_per_100_yen()
    return max(0, math.ceil(tokens * 100 / rate))


def tokens_from_migration_yen(yen: int) -> int:
    if yen <= 0:
        return 0
    return max(0, int(yen * migration_tokens_per_100_yen() / 100))


def default_migration_token_balance() -> int:
    raw = os.environ.get("MIGRATION_INCLUDED_TOKENS", "").strip()
    if raw:
        try:
            return max(0, int(raw))
        except ValueError:
            pass
    # 未設定時は 1 整理パック分を初期付与
    return migration_tokens_per_pack()


def migration_estimate_tokens_per_pdf() -> int:
    raw = os.environ.get("MIGRATION_ESTIMATE_TOKENS_PER_PDF", "400").strip()
    try:
        return max(0, int(raw))
    except ValueError:
        return 400


def init_migration_wallet_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(AI_USAGE_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS migration_firm_wallet (
                firm_id TEXT PRIMARY KEY,
                token_balance INTEGER NOT NULL DEFAULT 0,
                tokens_used INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            )
            """
        )


def _ensure_wallet_row(firm_id: str) -> dict[str, Any]:
    init_migration_wallet_db()
    with sqlite3.connect(AI_USAGE_DB_PATH) as conn:
        row = conn.execute(
            "SELECT token_balance, tokens_used FROM migration_firm_wallet WHERE firm_id=?",
            (firm_id,),
        ).fetchone()
        if row:
            return {"token_balance": int(row[0]), "tokens_used": int(row[1])}
        balance = default_migration_token_balance()
        now = _utc_now()
        conn.execute(
            """
            INSERT INTO migration_firm_wallet (firm_id, token_balance, tokens_used, updated_at)
            VALUES (?, ?, 0, ?)
            """,
            (firm_id, balance, now),
        )
        return {"token_balance": balance, "tokens_used": 0}


def migration_pricing_payload() -> dict[str, Any]:
    yen_per_pack = migration_yen_per_pack()
    tokens_per_pack = migration_tokens_per_pack()
    rate = migration_tokens_per_100_yen()
    return {
        "yenPerPack": yen_per_pack,
        "tokensPerPack": tokens_per_pack,
        "tokensPer100Yen": rate,
        "estimateTokensPerPdf": migration_estimate_tokens_per_pdf(),
        "label": f"初回データ整理パック ¥{yen_per_pack:,}",
        "hint": f"¥{yen_per_pack:,}/パック ≒ {tokens_per_pack:,} トークン（¥100 = {rate:,} トークン）",
    }


def get_migration_wallet(firm_id: str) -> dict[str, Any]:
    row = _ensure_wallet_row(firm_id)
    pricing = migration_pricing_payload()
    balance = row["token_balance"]
    used = row["tokens_used"]
    return {
        "tokenBalance": balance,
        "tokensUsed": used,
        "defaultIncluded": default_migration_token_balance(),
        "balanceYenEstimate": yen_from_migration_tokens(balance),
        "usedYenEstimate": yen_from_migration_tokens(used),
        **pricing,
    }


def grant_migration_tokens(firm_id: str, tokens: int) -> dict[str, Any]:
    if tokens <= 0:
        raise ValueError("tokens must be positive")
    init_migration_wallet_db()
    _ensure_wallet_row(firm_id)
    now = _utc_now()
    with sqlite3.connect(AI_USAGE_DB_PATH) as conn:
        conn.execute(
            """
            UPDATE migration_firm_wallet
            SET token_balance = token_balance + ?, updated_at = ?
            WHERE firm_id = ?
            """,
            (tokens, now, firm_id),
        )
    return get_migration_wallet(firm_id)


def grant_migration_packs(firm_id: str, packs: int) -> dict[str, Any]:
    return grant_migration_tokens(firm_id, packs * migration_tokens_per_pack())


def check_migration_budget(firm_id: str, estimated_tokens: int = 0) -> dict[str, Any]:
    wallet = get_migration_wallet(firm_id)
    balance = int(wallet["tokenBalance"])
    allowed = balance >= max(0, estimated_tokens)
    return {
        "allowed": allowed,
        "tokenBalance": balance,
        "tokensUsed": wallet["tokensUsed"],
        "estimatedTokens": estimated_tokens,
        "estimatedYen": yen_from_migration_tokens(estimated_tokens),
        "balanceYenEstimate": wallet["balanceYenEstimate"],
    }


def deduct_migration_tokens(firm_id: str, tokens: int) -> bool:
    if tokens <= 0:
        return True
    init_migration_wallet_db()
    _ensure_wallet_row(firm_id)
    now = _utc_now()
    with sqlite3.connect(AI_USAGE_DB_PATH) as conn:
        row = conn.execute(
            "SELECT token_balance FROM migration_firm_wallet WHERE firm_id=?",
            (firm_id,),
        ).fetchone()
        if not row or int(row[0]) < tokens:
            return False
        conn.execute(
            """
            UPDATE migration_firm_wallet
            SET token_balance = token_balance - ?,
                tokens_used = tokens_used + ?,
                updated_at = ?
            WHERE firm_id = ?
            """,
            (tokens, tokens, now, firm_id),
        )
    return True


def record_migration_usage(
    firm_id: str,
    tokens: int,
    *,
    feature: str = "migration_classify",
    vision: bool = False,
) -> dict[str, Any]:
    charge = max(VISION_TOKEN_FLOOR if vision else 0, max(0, tokens))
    if charge <= 0:
        return {"recorded": True, "tokens": 0, "wallet": get_migration_wallet(firm_id)}
    if not deduct_migration_tokens(firm_id, charge):
        return {
            "recorded": False,
            "reason": "insufficient_migration_tokens",
            "tokens": charge,
            "yenEstimate": yen_from_migration_tokens(charge),
            "wallet": get_migration_wallet(firm_id),
        }
    return {
        "recorded": True,
        "feature": feature,
        "tokens": charge,
        "yenEstimate": yen_from_migration_tokens(charge),
        "wallet": get_migration_wallet(firm_id),
    }
