"""Moneytree LINK — 銀行・クレカ口座の OAuth 連携とステージング同期.

docs/moneytree-link-integration.md
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import requests

from services.stripe_client import frontend_base_url

STORAGE_DIR = __import__("pathlib").Path(__file__).resolve().parent.parent / "storage"
DB_PATH = STORAGE_DIR / "moneytree_link.db"

DEFAULT_SCOPES = "guest_read accounts_read transactions_read request_refresh"

_AUTH_HOST_STAGING = "https://myaccount-staging.getmoneytree.com"
_AUTH_HOST_PRODUCTION = "https://myaccount.getmoneytree.com"
_API_HOST_STAGING = "https://jp-api-staging.getmoneytree.com"
_API_HOST_PRODUCTION = "https://jp-api.getmoneytree.com"
_VAULT_STAGING = "https://vault-staging.getmoneytree.com"
_VAULT_PRODUCTION = "https://vault.getmoneytree.com"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


def _link_env() -> str:
    return (os.getenv("MONEYTREE_LINK_ENV") or "staging").strip().lower()


def _auth_host() -> str:
    return _AUTH_HOST_PRODUCTION if _link_env() == "production" else _AUTH_HOST_STAGING


def _default_api_host() -> str:
    return _API_HOST_PRODUCTION if _link_env() == "production" else _API_HOST_STAGING


def _vault_base() -> str:
    return _VAULT_PRODUCTION if _link_env() == "production" else _VAULT_STAGING


def _client_id() -> str:
    return (os.getenv("MONEYTREE_LINK_CLIENT_ID") or "").strip()


def _client_secret() -> str:
    return (os.getenv("MONEYTREE_LINK_CLIENT_SECRET") or "").strip()


def _redirect_uri() -> str:
    explicit = (os.getenv("MONEYTREE_LINK_REDIRECT_URI") or "").strip()
    if explicit:
        return explicit
    api_base = (os.getenv("DOCUGRID_API_BASE") or "http://localhost:8000").rstrip("/")
    return f"{api_base}/api/integrations/moneytree/callback"


def _has_credentials() -> bool:
    return bool(_client_id() and _client_secret())


def is_mock_mode() -> bool:
    mock_flag = (os.getenv("MONEYTREE_LINK_MOCK") or "").strip().lower()
    if mock_flag in ("1", "true", "yes"):
        return True
    if mock_flag in ("0", "false", "no"):
        return False
    env = (os.getenv("DOCUGRID_ENV") or "development").strip().lower()
    return env != "production" and not _has_credentials()


def is_moneytree_configured() -> bool:
    return is_mock_mode() or _has_credentials()


def _api_host_for_resource_server(resource_server: str | None) -> str:
    rs = (resource_server or "").lower()
    if "staging" in rs:
        return _API_HOST_STAGING
    if rs:
        return _API_HOST_PRODUCTION
    return _default_api_host()


def _conn() -> sqlite3.Connection:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _require_client_id(client_id: str) -> str:
    cid = (client_id or "").strip()
    if not cid:
        raise ValueError("client_id_required")
    return cid


def _init_db() -> None:
    with _conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS oauth_pending (
                state TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL DEFAULT '',
                code_verifier TEXT NOT NULL,
                return_path TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS connections (
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL DEFAULT '',
                access_token TEXT,
                refresh_token TEXT,
                resource_server TEXT,
                expires_at TEXT,
                scopes TEXT,
                guest_label TEXT,
                connected_at TEXT,
                last_sync_at TEXT,
                mock INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (firm_id, client_id)
            );
            CREATE TABLE IF NOT EXISTS staging_accounts (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL DEFAULT '',
                external_id TEXT NOT NULL,
                account_kind TEXT NOT NULL,
                institution_name TEXT,
                account_name TEXT,
                account_subtype TEXT,
                currency TEXT,
                balance REAL,
                raw_json TEXT,
                synced_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS staging_transactions (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL DEFAULT '',
                account_external_id TEXT NOT NULL,
                txn_date TEXT,
                amount REAL,
                description TEXT,
                raw_json TEXT,
                synced_at TEXT NOT NULL
            );
            """
        )
        cols = {row[1] for row in conn.execute("PRAGMA table_info(oauth_pending)").fetchall()}
        if "return_path" not in cols:
            conn.execute("ALTER TABLE oauth_pending ADD COLUMN return_path TEXT")


_init_db()


def _connection_key(firm_id: str, client_id: str = "") -> tuple[str, str]:
    return firm_id.strip(), (client_id or "").strip()


def _get_connection(firm_id: str, client_id: str = "") -> dict[str, Any] | None:
    fid, cid = _connection_key(firm_id, client_id)
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM connections WHERE firm_id=? AND client_id=?",
            (fid, cid),
        ).fetchone()
    return dict(row) if row else None


def _save_connection(
    firm_id: str,
    client_id: str,
    *,
    access_token: str | None = None,
    refresh_token: str | None = None,
    resource_server: str | None = None,
    expires_at: str | None = None,
    scopes: str | None = None,
    guest_label: str | None = None,
    mock: bool = False,
) -> dict[str, Any]:
    fid, cid = _connection_key(firm_id, client_id)
    existing = _get_connection(fid, cid) or {}
    now = _utc_now_iso()
    payload = {
        "firm_id": fid,
        "client_id": cid,
        "access_token": access_token if access_token is not None else existing.get("access_token"),
        "refresh_token": refresh_token if refresh_token is not None else existing.get("refresh_token"),
        "resource_server": resource_server if resource_server is not None else existing.get("resource_server"),
        "expires_at": expires_at if expires_at is not None else existing.get("expires_at"),
        "scopes": scopes if scopes is not None else existing.get("scopes"),
        "guest_label": guest_label if guest_label is not None else existing.get("guest_label"),
        "connected_at": existing.get("connected_at") or now,
        "last_sync_at": existing.get("last_sync_at"),
        "mock": 1 if mock else int(existing.get("mock") or 0),
    }
    with _conn() as conn:
        conn.execute(
            """
            INSERT INTO connections (
                firm_id, client_id, access_token, refresh_token, resource_server,
                expires_at, scopes, guest_label, connected_at, last_sync_at, mock
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(firm_id, client_id) DO UPDATE SET
                access_token=excluded.access_token,
                refresh_token=excluded.refresh_token,
                resource_server=excluded.resource_server,
                expires_at=excluded.expires_at,
                scopes=excluded.scopes,
                guest_label=excluded.guest_label,
                connected_at=excluded.connected_at,
                last_sync_at=excluded.last_sync_at,
                mock=excluded.mock
            """,
            (
                payload["firm_id"],
                payload["client_id"],
                payload["access_token"],
                payload["refresh_token"],
                payload["resource_server"],
                payload["expires_at"],
                payload["scopes"],
                payload["guest_label"],
                payload["connected_at"],
                payload["last_sync_at"],
                payload["mock"],
            ),
        )
    return payload


def disconnect(firm_id: str, client_id: str = "") -> None:
    fid, cid = _connection_key(firm_id, client_id)
    with _conn() as conn:
        conn.execute("DELETE FROM connections WHERE firm_id=? AND client_id=?", (fid, cid))
        conn.execute("DELETE FROM staging_accounts WHERE firm_id=? AND client_id=?", (fid, cid))
        conn.execute("DELETE FROM staging_transactions WHERE firm_id=? AND client_id=?", (fid, cid))


def _pkce_pair() -> tuple[str, str]:
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode("ascii").rstrip("=")
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return verifier, challenge


def _cleanup_pending_states() -> None:
    cutoff = (_utc_now() - timedelta(hours=1)).isoformat()
    with _conn() as conn:
        conn.execute("DELETE FROM oauth_pending WHERE created_at < ?", (cutoff,))


def build_authorize_url(
    firm_id: str,
    client_id: str,
    *,
    return_path: str = "",
) -> dict[str, Any]:
    cid = _require_client_id(client_id)
    if is_mock_mode():
        return {"mock": True, "authorize_url": None}
    if not _has_credentials():
        raise RuntimeError("moneytree_not_configured")

    _cleanup_pending_states()
    state = secrets.token_urlsafe(24)
    verifier, challenge = _pkce_pair()
    fid, _ = _connection_key(firm_id, cid)
    safe_return = (return_path or "").strip()
    if safe_return and not safe_return.startswith("/"):
        safe_return = f"/{safe_return}"

    with _conn() as conn:
        conn.execute(
            """
            INSERT INTO oauth_pending (state, firm_id, client_id, code_verifier, return_path, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (state, fid, cid, verifier, safe_return or None, _utc_now_iso()),
        )

    params = {
        "client_id": _client_id(),
        "response_type": "code",
        "scope": DEFAULT_SCOPES,
        "redirect_uri": _redirect_uri(),
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "locale": "ja-JP",
    }
    url = f"{_auth_host()}/oauth/authorize?{urlencode(params)}"
    return {"mock": False, "authorize_url": url, "state": state}


def _exchange_code(code: str, code_verifier: str) -> dict[str, Any]:
    resp = requests.post(
        f"{_auth_host()}/oauth/token",
        data={
            "grant_type": "authorization_code",
            "client_id": _client_id(),
            "client_secret": _client_secret(),
            "code": code,
            "redirect_uri": _redirect_uri(),
            "code_verifier": code_verifier,
        },
        timeout=30,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"moneytree_token_exchange_failed:{resp.status_code}")
    return resp.json()


def _refresh_access_token(refresh_token: str) -> dict[str, Any]:
    resp = requests.post(
        f"{_auth_host()}/oauth/token",
        data={
            "grant_type": "refresh_token",
            "client_id": _client_id(),
            "client_secret": _client_secret(),
            "refresh_token": refresh_token,
        },
        timeout=30,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"moneytree_token_refresh_failed:{resp.status_code}")
    return resp.json()


def _expires_at_from_token(token: dict[str, Any]) -> str:
    expires_in = int(token.get("expires_in") or 3600)
    return (_utc_now() + timedelta(seconds=expires_in)).isoformat()


def handle_oauth_callback(code: str, state: str) -> tuple[str, str, str | None]:
    """Returns (firm_id, client_id, return_path) on success."""
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM oauth_pending WHERE state=?",
            (state,),
        ).fetchone()
        if not row:
            raise KeyError("invalid_oauth_state")
        pending = dict(row)
        conn.execute("DELETE FROM oauth_pending WHERE state=?", (state,))

    token = _exchange_code(code, pending["code_verifier"])
    guest_label = None
    try:
        profile = _api_get(
            token["access_token"],
            token.get("resource_server"),
            "/link/profile.json",
        )
        guest_label = (profile.get("email") or profile.get("id") or "")[:120] or None
    except Exception:
        pass

    _save_connection(
        pending["firm_id"],
        pending["client_id"],
        access_token=token["access_token"],
        refresh_token=token.get("refresh_token"),
        resource_server=token.get("resource_server"),
        expires_at=_expires_at_from_token(token),
        scopes=token.get("scope") or DEFAULT_SCOPES,
        guest_label=guest_label,
        mock=False,
    )
    return pending["firm_id"], pending["client_id"], pending.get("return_path")


def mock_connect(firm_id: str, client_id: str) -> dict[str, Any]:
    cid = _require_client_id(client_id)
    if not is_mock_mode():
        raise RuntimeError("mock_mode_disabled")
    conn = _save_connection(
        firm_id,
        cid,
        access_token="mock",
        refresh_token="mock",
        resource_server="myaccount-staging",
        expires_at=(_utc_now() + timedelta(days=30)).isoformat(),
        scopes=DEFAULT_SCOPES,
        guest_label="デモ利用者",
        mock=True,
    )
    sync_accounts(firm_id, cid)
    return conn


def _token_expired(expires_at: str | None) -> bool:
    if not expires_at:
        return True
    try:
        exp = datetime.fromisoformat(expires_at)
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        return exp <= _utc_now() + timedelta(seconds=60)
    except ValueError:
        return True


def _ensure_access_token(firm_id: str, client_id: str = "") -> dict[str, Any]:
    row = _get_connection(firm_id, client_id)
    if not row:
        raise KeyError("not_connected")
    if row.get("mock"):
        return row
    if not _token_expired(row.get("expires_at")):
        return row
    refresh = row.get("refresh_token")
    if not refresh:
        raise RuntimeError("refresh_token_missing")
    token = _refresh_access_token(str(refresh))
    return _save_connection(
        firm_id,
        client_id,
        access_token=token["access_token"],
        refresh_token=token.get("refresh_token") or refresh,
        resource_server=token.get("resource_server") or row.get("resource_server"),
        expires_at=_expires_at_from_token(token),
        scopes=token.get("scope") or row.get("scopes"),
    )


def _api_get(access_token: str, resource_server: str | None, path: str) -> dict[str, Any]:
    base = _api_host_for_resource_server(resource_server)
    url = f"{base}{path}"
    resp = requests.get(
        url,
        headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
        timeout=60,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"moneytree_api_error:{path}:{resp.status_code}")
    return resp.json()


def _normalize_account(raw: dict[str, Any], kind: str) -> dict[str, Any]:
    institution = raw.get("institution") or {}
    inst_name = institution.get("name") if isinstance(institution, dict) else str(institution or "")
    balance = raw.get("current_balance")
    if balance is None:
        balance = raw.get("balance")
    return {
        "external_id": str(raw.get("id") or raw.get("account_id") or ""),
        "account_kind": kind,
        "institution_name": inst_name or raw.get("institution_name") or "",
        "account_name": raw.get("nickname") or raw.get("name") or raw.get("account_name") or "",
        "account_subtype": raw.get("account_subtype") or raw.get("subtype") or "",
        "currency": raw.get("currency") or "JPY",
        "balance": float(balance) if balance is not None else None,
        "raw": raw,
    }


def _mock_accounts() -> list[dict[str, Any]]:
    return [
        {
            "external_id": "mock-bank-001",
            "account_kind": "personal",
            "institution_name": "デモ銀行",
            "account_name": "普通預金",
            "account_subtype": "savings",
            "currency": "JPY",
            "balance": 1_248_500.0,
            "raw": {"id": "mock-bank-001", "mock": True},
        },
        {
            "external_id": "mock-card-001",
            "account_kind": "personal",
            "institution_name": "デモカード",
            "account_name": "ビジネスカード",
            "account_subtype": "credit_card",
            "currency": "JPY",
            "balance": -84_320.0,
            "raw": {"id": "mock-card-001", "mock": True},
        },
    ]


def _mock_transactions() -> list[dict[str, Any]]:
    return [
        {
            "account_external_id": "mock-card-001",
            "txn_date": "2026-06-20",
            "amount": -3200.0,
            "description": "タクシー（渋谷→新宿）",
            "raw": {"mock": True},
        },
        {
            "account_external_id": "mock-card-001",
            "txn_date": "2026-06-18",
            "amount": -12800.0,
            "description": "会食 〇〇商事",
            "raw": {"mock": True},
        },
        {
            "account_external_id": "mock-bank-001",
            "txn_date": "2026-06-15",
            "amount": 500000.0,
            "description": "売上入金",
            "raw": {"mock": True},
        },
    ]


def _persist_accounts(firm_id: str, client_id: str, accounts: list[dict[str, Any]]) -> int:
    fid, cid = _connection_key(firm_id, client_id)
    now = _utc_now_iso()
    with _conn() as conn:
        conn.execute("DELETE FROM staging_accounts WHERE firm_id=? AND client_id=?", (fid, cid))
        for acct in accounts:
            conn.execute(
                """
                INSERT INTO staging_accounts (
                    id, firm_id, client_id, external_id, account_kind, institution_name,
                    account_name, account_subtype, currency, balance, raw_json, synced_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"mt-acct-{uuid.uuid4().hex[:12]}",
                    fid,
                    cid,
                    acct["external_id"],
                    acct["account_kind"],
                    acct.get("institution_name"),
                    acct.get("account_name"),
                    acct.get("account_subtype"),
                    acct.get("currency"),
                    acct.get("balance"),
                    json.dumps(acct.get("raw") or {}, ensure_ascii=False),
                    now,
                ),
            )
    return len(accounts)


def _persist_transactions(firm_id: str, client_id: str, txns: list[dict[str, Any]]) -> int:
    fid, cid = _connection_key(firm_id, client_id)
    now = _utc_now_iso()
    with _conn() as conn:
        conn.execute("DELETE FROM staging_transactions WHERE firm_id=? AND client_id=?", (fid, cid))
        for txn in txns:
            conn.execute(
                """
                INSERT INTO staging_transactions (
                    id, firm_id, client_id, account_external_id, txn_date, amount,
                    description, raw_json, synced_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"mt-txn-{uuid.uuid4().hex[:12]}",
                    fid,
                    cid,
                    txn["account_external_id"],
                    txn.get("txn_date"),
                    txn.get("amount"),
                    txn.get("description"),
                    json.dumps(txn.get("raw") or {}, ensure_ascii=False),
                    now,
                ),
            )
    return len(txns)


def sync_accounts(firm_id: str, client_id: str = "") -> dict[str, Any]:
    row = _get_connection(firm_id, client_id)
    if not row:
        raise KeyError("not_connected")

    accounts: list[dict[str, Any]] = []
    transactions: list[dict[str, Any]] = []

    if row.get("mock"):
        accounts = _mock_accounts()
        transactions = _mock_transactions()
    else:
        conn = _ensure_access_token(firm_id, client_id)
        token = str(conn["access_token"])
        rs = conn.get("resource_server")

        for path, kind in (
            ("/link/accounts.json", "personal"),
            ("/link/corporate_accounts.json", "corporate"),
        ):
            try:
                data = _api_get(token, rs, path)
                items = data.get("accounts") if isinstance(data, dict) else data
                if isinstance(items, list):
                    for item in items:
                        if isinstance(item, dict):
                            accounts.append(_normalize_account(item, kind))
            except Exception:
                continue

        for acct in accounts[:20]:
            ext_id = acct["external_id"]
            if not ext_id:
                continue
            base = "/link/accounts" if acct["account_kind"] == "personal" else "/link/corporate_accounts"
            try:
                data = _api_get(token, rs, f"{base}/{ext_id}/transactions.json?limit=50")
                items = data.get("transactions") if isinstance(data, dict) else data
                if not isinstance(items, list):
                    continue
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    transactions.append(
                        {
                            "account_external_id": ext_id,
                            "txn_date": item.get("date") or item.get("transaction_date"),
                            "amount": float(item.get("amount") or 0),
                            "description": item.get("description_guest")
                            or item.get("description")
                            or item.get("memo")
                            or "",
                            "raw": item,
                        }
                    )
            except Exception:
                continue

    acct_count = _persist_accounts(firm_id, client_id, accounts)
    txn_count = _persist_transactions(firm_id, client_id, transactions)
    _save_connection(
        firm_id,
        client_id,
        access_token=row.get("access_token"),
        refresh_token=row.get("refresh_token"),
        resource_server=row.get("resource_server"),
        expires_at=row.get("expires_at"),
        scopes=row.get("scopes"),
        guest_label=row.get("guest_label"),
        mock=bool(row.get("mock")),
    )
    fid, cid = _connection_key(firm_id, client_id)
    with _conn() as conn:
        conn.execute(
            "UPDATE connections SET last_sync_at=? WHERE firm_id=? AND client_id=?",
            (_utc_now_iso(), fid, cid),
        )

    return {
        "accounts_synced": acct_count,
        "transactions_synced": txn_count,
        "synced_at": _utc_now_iso(),
    }


def list_accounts(firm_id: str, client_id: str = "") -> list[dict[str, Any]]:
    fid, cid = _connection_key(firm_id, client_id)
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT external_id, account_kind, institution_name, account_name,
                   account_subtype, currency, balance, synced_at
            FROM staging_accounts WHERE firm_id=? AND client_id=?
            ORDER BY institution_name, account_name
            """,
            (fid, cid),
        ).fetchall()
    return [dict(r) for r in rows]


def list_transactions(
    firm_id: str,
    client_id: str = "",
    *,
    account_external_id: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    fid, cid = _connection_key(firm_id, client_id)
    limit = max(1, min(limit, 500))
    query = """
        SELECT account_external_id, txn_date, amount, description, synced_at
        FROM staging_transactions WHERE firm_id=? AND client_id=?
    """
    params: list[Any] = [fid, cid]
    if account_external_id:
        query += " AND account_external_id=?"
        params.append(account_external_id)
    query += " ORDER BY txn_date DESC LIMIT ?"
    params.append(limit)
    with _conn() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


def build_vault_url() -> str | None:
    if is_mock_mode() or not _has_credentials():
        return None
    params = urlencode({"client_id": _client_id(), "configs[back_to]": frontend_base_url()})
    return f"{_vault_base()}/?{params}"


def firm_clients_status(firm_id: str, client_ids: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for raw_id in client_ids:
        cid = (raw_id or "").strip()
        if not cid:
            continue
        row = _get_connection(firm_id, cid)
        accounts = list_accounts(firm_id, cid) if row else []
        out.append(
            {
                "client_id": cid,
                "connected": row is not None,
                "guest_label": (row or {}).get("guest_label"),
                "connected_at": (row or {}).get("connected_at"),
                "last_sync_at": (row or {}).get("last_sync_at"),
                "accounts_count": len(accounts),
            }
        )
    return out


def status_payload(firm_id: str, client_id: str) -> dict[str, Any]:
    cid = _require_client_id(client_id)
    row = _get_connection(firm_id, cid)
    accounts = list_accounts(firm_id, cid) if row else []
    return {
        "configured": is_moneytree_configured(),
        "mock_mode": is_mock_mode(),
        "connected": row is not None,
        "guest_label": (row or {}).get("guest_label"),
        "connected_at": (row or {}).get("connected_at"),
        "last_sync_at": (row or {}).get("last_sync_at"),
        "accounts_count": len(accounts),
        "environment": _link_env(),
        "vault_url": build_vault_url(),
        "client_id_scope": cid,
    }


def callback_redirect_url(
    success: bool,
    detail: str = "",
    *,
    return_path: str | None = None,
) -> str:
    base = frontend_base_url().rstrip("/")
    path = (return_path or "/workspace/client_accounting").strip()
    if not path.startswith("/"):
        path = f"/{path}"
    params: dict[str, str] = {
        "moneytree": "connected" if success else "error",
    }
    if detail:
        params["moneytree_detail"] = detail[:200]
    return f"{base}{path}?{urlencode(params)}"
