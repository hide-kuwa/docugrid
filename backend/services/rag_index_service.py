"""Minimal RAG index (I2) — SQLite chunk + vector store, firm/client first.

Embedding: OpenAI text-embedding-3-small when OPENAI_API_KEY is set;
otherwise a deterministic local n-gram hash (dev / pytest / offline VPS).
"""

from __future__ import annotations

import hashlib
import math
import os
import re
import sqlite3
import struct
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
RAG_DB_PATH = STORAGE_DIR / "rag_index.db"

LOCAL_DIM = 96
LOCAL_MODEL = "local-ngram-v1"
OPENAI_MODEL = "text-embedding-3-small"
OPENAI_DIM = 1536

SOURCE_DOCUMENT = "document_version"
SOURCE_KARTE = "client_karte"


def init_rag_index_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(RAG_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS rag_chunks (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                source TEXT NOT NULL,
                doc_id TEXT,
                version_id TEXT NOT NULL,
                content_sha256 TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                text TEXT NOT NULL,
                embedding BLOB NOT NULL,
                dims INTEGER NOT NULL,
                model TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(firm_id, source, version_id, chunk_index)
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_rag_firm_client
                ON rag_chunks (firm_id, client_id, source)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_rag_sha
                ON rag_chunks (firm_id, content_sha256)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_rag_version
                ON rag_chunks (firm_id, source, version_id)
            """
        )


def _now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def _pack_embedding(vec: list[float]) -> bytes:
    return struct.pack(f"<{len(vec)}f", *vec)


def _unpack_embedding(blob: bytes, dims: int) -> list[float]:
    return list(struct.unpack(f"<{dims}f", blob[: dims * 4]))


def _l2_normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _local_embed_one(text: str, dims: int = LOCAL_DIM) -> list[float]:
    """Character n-gram hashing — offline, deterministic, JP-friendly enough for I2."""
    cleaned = re.sub(r"\s+", " ", (text or "").strip().lower())
    if not cleaned:
        return [0.0] * dims
    vec = [0.0] * dims
    for n in (2, 3):
        if len(cleaned) < n:
            continue
        for i in range(len(cleaned) - n + 1):
            gram = cleaned[i : i + n]
            h = int(hashlib.sha256(gram.encode("utf-8")).hexdigest()[:8], 16)
            idx = h % dims
            sign = 1.0 if (h & 1) == 0 else -1.0
            vec[idx] += sign
    return _l2_normalize(vec)


def _openai_embed(texts: list[str]) -> Optional[list[list[float]]]:
    key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key or not texts:
        return None
    try:
        import requests

        resp = requests.post(
            "https://api.openai.com/v1/embeddings",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={"model": OPENAI_MODEL, "input": texts},
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()["data"]
        data_sorted = sorted(data, key=lambda d: int(d["index"]))
        return [_l2_normalize(list(d["embedding"])) for d in data_sorted]
    except Exception:
        return None


def embed_texts(texts: list[str]) -> tuple[list[list[float]], str, int]:
    """Return (vectors, model_id, dims). Prefers OpenAI when available."""
    cleaned = [t or "" for t in texts]
    openai_vecs = _openai_embed(cleaned)
    if openai_vecs is not None and len(openai_vecs) == len(cleaned):
        return openai_vecs, OPENAI_MODEL, len(openai_vecs[0]) if openai_vecs else OPENAI_DIM
    return [_local_embed_one(t) for t in cleaned], LOCAL_MODEL, LOCAL_DIM


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b))


def chunk_text(text: str, *, max_chars: int = 800, overlap: int = 100) -> list[str]:
    """Markdown-ish split: headings / blank lines first, then size windows."""
    raw = (text or "").replace("\r\n", "\n").strip()
    if not raw:
        return []
    # Drop very short noise lines (page numbers etc.)
    lines = []
    for line in raw.split("\n"):
        s = line.strip()
        if not s:
            lines.append("")
            continue
        if re.fullmatch(r"[\d\W_]{1,8}", s):
            continue
        lines.append(s)
    cleaned = "\n".join(lines).strip()
    if not cleaned:
        return []

    blocks: list[str] = []
    buf: list[str] = []
    for line in cleaned.split("\n"):
        is_heading = bool(re.match(r"^#{1,6}\s+", line)) or bool(
            re.match(r"^【.+】$", line)
        )
        if is_heading and buf:
            blocks.append("\n".join(buf).strip())
            buf = [line]
        elif line == "" and buf:
            blocks.append("\n".join(buf).strip())
            buf = []
        else:
            if line:
                buf.append(line)
    if buf:
        blocks.append("\n".join(buf).strip())

    chunks: list[str] = []
    for block in blocks:
        if len(block) <= max_chars:
            if block:
                chunks.append(block)
            continue
        start = 0
        while start < len(block):
            end = min(len(block), start + max_chars)
            piece = block[start:end].strip()
            if piece:
                chunks.append(piece)
            if end >= len(block):
                break
            start = max(end - overlap, start + 1)
    return chunks[:200]


def _delete_version_chunks(conn: sqlite3.Connection, firm_id: str, source: str, version_id: str) -> None:
    conn.execute(
        "DELETE FROM rag_chunks WHERE firm_id=? AND source=? AND version_id=?",
        (firm_id, source, version_id),
    )


def _existing_sha(conn: sqlite3.Connection, firm_id: str, source: str, version_id: str) -> Optional[str]:
    row = conn.execute(
        """
        SELECT content_sha256 FROM rag_chunks
        WHERE firm_id=? AND source=? AND version_id=?
        LIMIT 1
        """,
        (firm_id, source, version_id),
    ).fetchone()
    return row[0] if row else None


def ingest_text(
    *,
    firm_id: str,
    client_id: str,
    source: str,
    version_id: str,
    content_sha256: str,
    text: str,
    doc_id: Optional[str] = None,
) -> dict[str, Any]:
    """Idempotent ingest: same sha => no-op; sha change => replace chunks."""
    init_rag_index_db()
    sha = (content_sha256 or "").strip()
    if not sha:
        sha = hashlib.sha256((text or "").encode("utf-8")).hexdigest()

    with sqlite3.connect(RAG_DB_PATH) as conn:
        prev = _existing_sha(conn, firm_id, source, version_id)
        if prev == sha:
            count = conn.execute(
                "SELECT COUNT(*) FROM rag_chunks WHERE firm_id=? AND source=? AND version_id=?",
                (firm_id, source, version_id),
            ).fetchone()[0]
            return {
                "reused": True,
                "chunk_count": int(count),
                "content_sha256": sha,
                "model": None,
            }

        pieces = chunk_text(text)
        if not pieces:
            _delete_version_chunks(conn, firm_id, source, version_id)
            return {"reused": False, "chunk_count": 0, "content_sha256": sha, "model": None}

        vectors, model, dims = embed_texts(pieces)
        _delete_version_chunks(conn, firm_id, source, version_id)
        now = _now()
        for i, (piece, vec) in enumerate(zip(pieces, vectors)):
            conn.execute(
                """
                INSERT INTO rag_chunks (
                    id, firm_id, client_id, source, doc_id, version_id, content_sha256,
                    chunk_index, text, embedding, dims, model, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    uuid.uuid4().hex,
                    firm_id,
                    client_id,
                    source,
                    doc_id,
                    version_id,
                    sha,
                    i,
                    piece[:8000],
                    _pack_embedding(vec),
                    dims,
                    model,
                    now,
                ),
            )
        return {
            "reused": False,
            "chunk_count": len(pieces),
            "content_sha256": sha,
            "model": model,
        }


def ingest_ocr_document(
    *,
    firm_id: str,
    client_id: str,
    document_version_id: str,
    content_sha256: str,
    text: str,
    logical_document_id: Optional[str] = None,
) -> dict[str, Any]:
    return ingest_text(
        firm_id=firm_id,
        client_id=client_id,
        source=SOURCE_DOCUMENT,
        version_id=document_version_id,
        content_sha256=content_sha256,
        text=text,
        doc_id=logical_document_id,
    )


def ingest_karte_entry(
    *,
    firm_id: str,
    client_id: str,
    entry_id: str,
    content_sha256: str,
    text: str,
) -> dict[str, Any]:
    return ingest_text(
        firm_id=firm_id,
        client_id=client_id,
        source=SOURCE_KARTE,
        version_id=entry_id,
        content_sha256=content_sha256,
        text=text,
        doc_id=entry_id,
    )


def delete_source_chunks(firm_id: str, source: str, version_id: str) -> int:
    init_rag_index_db()
    with sqlite3.connect(RAG_DB_PATH) as conn:
        cur = conn.execute(
            "DELETE FROM rag_chunks WHERE firm_id=? AND source=? AND version_id=?",
            (firm_id, source, version_id),
        )
        return cur.rowcount


def version_has_chunks(firm_id: str, source: str, version_id: str) -> bool:
    init_rag_index_db()
    with sqlite3.connect(RAG_DB_PATH) as conn:
        row = conn.execute(
            """
            SELECT 1 FROM rag_chunks
            WHERE firm_id=? AND source=? AND version_id=?
            LIMIT 1
            """,
            (firm_id, source, version_id),
        ).fetchone()
    return row is not None


def sync_karte_for_client(firm_id: str, client_id: str) -> dict[str, Any]:
    """Manual/backfill helper — not called from search (write-on-read forbidden)."""
    from services.client_karte_service import list_karte_for_rag_export

    exported = list_karte_for_rag_export(firm_id, client_id)
    ingested = 0
    reused = 0
    for item in exported:
        result = ingest_karte_entry(
            firm_id=firm_id,
            client_id=client_id,
            entry_id=str(item["id"]),
            content_sha256=str(item.get("content_sha256") or ""),
            text=str(item.get("text") or ""),
        )
        if result.get("reused"):
            reused += 1
        else:
            ingested += 1
    return {"entries": len(exported), "ingested": ingested, "reused": reused}


def search_rag(
    firm_id: str,
    *,
    query: str,
    client_id: Optional[str] = None,
    limit: int = 20,
    mode: str = "hybrid",
) -> list[dict[str, Any]]:
    """Search: filter firm/(client) in SQL first, then score. Never writes / never cross firm."""
    init_rag_index_db()
    q = (query or "").strip()
    if not q:
        return []
    mode_n = (mode or "hybrid").strip().lower()
    if mode_n not in ("keyword", "semantic", "hybrid"):
        mode_n = "hybrid"

    sql = "SELECT * FROM rag_chunks WHERE firm_id=?"
    params: list[Any] = [firm_id]
    if client_id:
        sql += " AND client_id=?"
        params.append(client_id)
    # Cap candidate scan for single-process SQLite
    sql += " ORDER BY created_at DESC LIMIT ?"
    params.append(2000)

    with sqlite3.connect(RAG_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()

    q_lower = q.lower()
    query_vecs, _, q_dims = embed_texts([q])
    q_vec = query_vecs[0] if query_vecs else []

    scored: list[tuple[float, dict[str, Any]]] = []
    for row in rows:
        text = row["text"] or ""
        dims = int(row["dims"])
        try:
            vec = _unpack_embedding(row["embedding"], dims)
        except Exception:
            vec = []
        kw_hit = q_lower in text.lower()
        sim = cosine(q_vec, vec) if vec and len(vec) == len(q_vec) else 0.0
        # Dim mismatch (OpenAI vs local): fall back to keyword only for that row
        if dims != q_dims:
            sim = 0.0

        if mode_n == "keyword":
            if not kw_hit:
                continue
            score = 1.0
        elif mode_n == "semantic":
            if sim < 0.05:
                continue
            score = sim
        else:  # hybrid
            if not kw_hit and sim < 0.08:
                continue
            score = sim + (0.35 if kw_hit else 0.0)

        scored.append(
            (
                score,
                {
                    "id": row["id"],
                    "firm_id": row["firm_id"],
                    "client_id": row["client_id"],
                    "source": row["source"],
                    "doc_id": row["doc_id"],
                    "version_id": row["version_id"],
                    "document_version_id": row["version_id"]
                    if row["source"] == SOURCE_DOCUMENT
                    else None,
                    "content_sha256": row["content_sha256"],
                    "chunk_index": row["chunk_index"],
                    "text_excerpt": text[:2000],
                    "score": round(score, 4),
                    "model": row["model"],
                    "match": "keyword" if kw_hit and mode_n != "semantic" else "semantic",
                },
            )
        )

    scored.sort(key=lambda x: x[0], reverse=True)
    return [item for _, item in scored[: max(1, min(limit, 100))]]


def _legacy_keyword_hit(kh: dict[str, Any]) -> dict[str, Any]:
    vid = kh.get("document_version_id")
    return {
        "id": None,
        "firm_id": kh.get("firm_id"),
        "client_id": kh.get("client_id"),
        "source": SOURCE_DOCUMENT,
        "doc_id": None,
        "version_id": vid,
        "document_version_id": vid,
        "content_sha256": kh.get("content_sha256"),
        "chunk_index": 0,
        "text_excerpt": kh.get("text_excerpt"),
        "score": 0.5,
        "model": None,
        "match": "keyword",
        "ocr_status": kh.get("ocr_status"),
        "indexed_at": kh.get("indexed_at"),
        "legacy_index": True,
    }


def search_documents_for_api(
    firm_id: str,
    *,
    query: str,
    client_id: str,
    limit: int = 50,
    mode: str = "hybrid",
) -> dict[str, Any]:
    """Primary: rag_chunks. Legacy: document_index_state excerpts for OCR-ready docs not yet ingested."""
    from services.ocr_job_service import search_index_excerpts

    mode_n = (mode or "hybrid").strip().lower()
    if mode_n not in ("keyword", "semantic", "hybrid"):
        mode_n = "hybrid"

    rag_hits = search_rag(
        firm_id,
        query=query,
        client_id=client_id,
        limit=limit,
        mode=mode_n,
    )

    items: list[dict[str, Any]] = list(rag_hits[:limit])
    covered_versions = {
        f"{hit.get('source')}:{hit.get('version_id')}"
        for hit in items
        if hit.get("version_id")
    }

    # Only fill gaps for docs that never reached rag_chunks (pre-I2 / failed ingest).
    if mode_n in ("keyword", "hybrid") and len(items) < limit:
        keyword_hits = search_index_excerpts(
            firm_id, keyword=query, client_id=client_id, limit=limit
        )
        for kh in keyword_hits:
            vid = kh.get("document_version_id")
            key = f"{SOURCE_DOCUMENT}:{vid}"
            if not vid or key in covered_versions:
                continue
            if version_has_chunks(firm_id, SOURCE_DOCUMENT, str(vid)):
                continue
            covered_versions.add(key)
            items.append(_legacy_keyword_hit(kh))
            if len(items) >= limit:
                break

    return {
        "query": query,
        "mode": mode_n,
        "items": items,
        "count": len(items),
    }
