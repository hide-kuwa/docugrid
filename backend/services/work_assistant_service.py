"""業務アシスタント（ヘルプ + 充足確認 + OCR反映提案 + 資料 RAG）。

書き込みはしない。反映は既存 /api/extraction/apply をユーザー確認後に呼ぶ。
firm / client 境界は呼び出し側で authorize 済みの前提。
"""

from __future__ import annotations

import json
import re
import sqlite3
from typing import Any, Optional

from api.constants import SLOT_DOCS_DB_PATH
from services.document_version_service import get_version
from services.support_help_kb import answer_support_question

_COVERAGE_RE = re.compile(
    r"(揃|そろ|不足|欠け|カバレッジ|coverage|足り|揃って|そろって|資料.*ある|何が.*ない)",
    re.IGNORECASE,
)
_OCR_RE = re.compile(
    r"(ocr|OCR|抽出|基本情報|マスタ.*反映|反映.*マスタ|プロフィール|会社名|住所.*取)",
    re.IGNORECASE,
)
_HELP_RE = re.compile(
    r"(使い方|どうやって|ヘルプ|手順|設定方法|接続方法|どこ(に|で)押|チュートリアル|ツアー)",
    re.IGNORECASE,
)
_RAG_RE = re.compile(
    r"(書いて|記載|いくら|金額|内容|資料に|探して|検索|どこに.*書|意味|摘要|"
    r"源泉|給与|売上|所得|支払|年末調整|申告|別表|決算|総勘定|残高)",
    re.IGNORECASE,
)


def detect_intent(message: str, *, has_client: bool = False) -> str:
    text = (message or "").strip()
    if not text:
        return "help"
    if _COVERAGE_RE.search(text):
        return "coverage"
    if _OCR_RE.search(text):
        return "extraction_propose"
    if _HELP_RE.search(text):
        return "help"
    if has_client and (_RAG_RE.search(text) or "？" in text or "?" in text):
        return "rag"
    if has_client and len(text) >= 4 and not _HELP_RE.search(text):
        return "rag"
    return "help"


def build_coverage_summary(
    *,
    firm_id: str,
    client_id: str,
    period_key: str,
    expected_slots: list[dict[str, str]],
) -> dict[str, Any]:
    """Compare expected slots (from UI layout) to persisted slot_documents."""
    from services.tenancy import get_client_firm_id

    if get_client_firm_id(client_id) != firm_id:
        return {
            "clientId": client_id,
            "periodKey": period_key,
            "error": "client_firm_mismatch",
            "filled": [],
            "missing": [],
            "extra": [],
            "filledCount": 0,
            "missingCount": 0,
            "expectedCount": 0,
        }

    filled_by_slot: dict[str, dict[str, Any]] = {}
    if SLOT_DOCS_DB_PATH.exists():
        with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """
                SELECT id, slot_id, slot_label, original_name, page_count, deleted_at
                FROM slot_documents
                WHERE client_id=? AND period_key=?
                  AND (deleted_at IS NULL OR deleted_at='')
                """,
                (client_id, period_key),
            ).fetchall()
        for row in rows:
            sid = str(row["slot_id"] or "")
            if sid.startswith("unassigned") or sid.startswith("deleted"):
                continue
            filled_by_slot[sid] = {
                "slotId": sid,
                "slotLabel": row["slot_label"] or sid,
                "originalName": row["original_name"],
                "pageCount": row["page_count"],
                "docId": row["id"],
            }

    expected_ids = {str(s.get("slotId") or s.get("slot_id") or "") for s in expected_slots}
    expected_ids.discard("")
    filled: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []
    for slot in expected_slots:
        sid = str(slot.get("slotId") or slot.get("slot_id") or "")
        label = str(slot.get("label") or slot.get("slotLabel") or sid)
        if not sid:
            continue
        hit = filled_by_slot.get(sid)
        if hit:
            filled.append({**hit, "slotLabel": label or hit["slotLabel"]})
        else:
            missing.append({"slotId": sid, "slotLabel": label})

    extra = [
        v for k, v in filled_by_slot.items() if expected_ids and k not in expected_ids
    ]

    return {
        "clientId": client_id,
        "periodKey": period_key,
        "filled": filled,
        "missing": missing,
        "extra": extra,
        "filledCount": len(filled),
        "missingCount": len(missing),
        "expectedCount": len(expected_slots),
    }


def format_coverage_message(coverage: dict[str, Any], client_label: str = "") -> str:
    if coverage.get("error"):
        return "この顧問先にはアクセスできません。"
    name = client_label or coverage.get("clientId") or "顧問先"
    period = coverage.get("periodKey") or ""
    filled_n = int(coverage.get("filledCount") or 0)
    missing_n = int(coverage.get("missingCount") or 0)
    expected = int(coverage.get("expectedCount") or 0)
    lines = [
        f"**{name}**（{period}）の資料充足です。",
        f"揃っている枠: **{filled_n}** / {expected or '—'}",
    ]
    missing = coverage.get("missing") or []
    if missing:
        labels = "、".join(str(m.get("slotLabel") or m.get("slotId")) for m in missing[:12])
        more = f" ほか{len(missing) - 12}件" if len(missing) > 12 else ""
        lines.append(f"不足: {labels}{more}")
    else:
        lines.append("不足している枠はありません。")
    lines.append("※ 今の画面レイアウト上の枠との比較です。")
    return "\n".join(lines)


def _fields_from_meta(meta: dict[str, Any]) -> list[dict[str, Any]]:
    fields_out: list[dict[str, Any]] = []
    raw_fields = meta.get("field_extractions") or meta.get("fields")
    if isinstance(raw_fields, list):
        for f in raw_fields:
            if not isinstance(f, dict):
                continue
            fid = str(f.get("field_id") or f.get("id") or "").strip()
            val = f.get("value")
            if not fid or val is None or str(val).strip() == "":
                continue
            fields_out.append(
                {
                    "fieldId": fid,
                    "label": str(f.get("label") or fid),
                    "value": str(val),
                    "confidence": float(f.get("confidence") or 0),
                    "status": str(f.get("status") or "extracted"),
                }
            )
        return fields_out
    profile = meta.get("extracted_profile")
    if isinstance(profile, dict):
        for fid, val in profile.items():
            if val is None or str(val).strip() == "":
                continue
            fields_out.append(
                {
                    "fieldId": str(fid),
                    "label": str(fid),
                    "value": str(val),
                    "confidence": 1.0,
                    "status": "extracted",
                }
            )
    return fields_out


def propose_extraction_from_slots(
    *,
    firm_id: str,
    client_id: str,
    period_key: str,
) -> Optional[dict[str, Any]]:
    """Pick the newest slot version that has extractable profile fields."""
    from services.tenancy import get_client_firm_id

    if get_client_firm_id(client_id) != firm_id:
        return None
    if not SLOT_DOCS_DB_PATH.exists():
        return None

    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT id, slot_id, slot_label, current_version_id, original_name, uploaded_at
            FROM slot_documents
            WHERE client_id=? AND period_key=?
              AND (deleted_at IS NULL OR deleted_at='')
            ORDER BY uploaded_at DESC
            """,
            (client_id, period_key),
        ).fetchall()

    for row in rows:
        vid = row["current_version_id"]
        if not vid:
            continue
        version = get_version(str(vid))
        if not version or not version.metadata_json:
            continue
        try:
            meta = json.loads(version.metadata_json)
        except json.JSONDecodeError:
            continue
        if not isinstance(meta, dict):
            continue
        fields = _fields_from_meta(meta)
        if not fields:
            continue
        return {
            "clientId": client_id,
            "periodKey": period_key,
            "slotId": str(row["slot_id"]),
            "slotLabel": row["slot_label"] or row["slot_id"],
            "docId": row["id"],
            "originalName": row["original_name"],
            "fields": fields,
            "needsConfirm": True,
        }
    return None


def format_extraction_message(proposal: Optional[dict[str, Any]]) -> str:
    if not proposal:
        return (
            "この期の資料から、マスタへ反映できる抽出結果は見つかりませんでした。"
            "PDF を枠に上げたあと、OCR／正規化が走っているか確認してください。"
            "見つかった場合は、下のカードで内容を確認してから反映できます。"
        )
    n = len(proposal.get("fields") or [])
    label = proposal.get("slotLabel") or proposal.get("slotId")
    return (
        f"「{label}」から **{n} 項目** を基本情報へ反映できそうです。\n"
        "下のカードを確認し、問題なければ **反映する** を押してください。"
        "（確認前にはマスタへ書き込みません）"
    )


def search_client_documents(
    *,
    firm_id: str,
    client_id: str,
    query: str,
    limit: int = 8,
) -> dict[str, Any]:
    """Firm/client-scoped document RAG (chunk + embedding / keyword hybrid)."""
    from services.rag_index_service import search_documents_for_api
    from services.tenancy import get_client_firm_id

    if get_client_firm_id(client_id) != firm_id:
        return {
            "query": query,
            "mode": "hybrid",
            "items": [],
            "count": 0,
            "error": "client_firm_mismatch",
        }
    payload = search_documents_for_api(
        firm_id,
        query=query,
        client_id=client_id,
        limit=limit,
        mode="hybrid",
    )
    hits: list[dict[str, Any]] = []
    for it in payload.get("items") or []:
        hits.append(
            {
                "versionId": it.get("document_version_id") or it.get("version_id"),
                "docId": it.get("doc_id"),
                "source": it.get("source"),
                "excerpt": (it.get("text_excerpt") or "")[:480],
                "score": it.get("score"),
                "match": it.get("match"),
                "chunkIndex": it.get("chunk_index"),
                "legacyIndex": bool(it.get("legacy_index")),
            }
        )
    return {
        "query": payload.get("query") or query,
        "mode": payload.get("mode") or "hybrid",
        "items": hits,
        "count": len(hits),
    }


def format_rag_message(
    rag: dict[str, Any],
    *,
    client_label: str = "",
) -> str:
    if rag.get("error"):
        return "この顧問先にはアクセスできません。"
    name = client_label or "顧問先"
    q = rag.get("query") or ""
    items = rag.get("items") or []
    if not items:
        return (
            f"**{name}** の索引に「{q}」に合う抜粋はまだありません。\n"
            "テキスト付き PDF を枠へ上げるとすぐ検索できます。"
            "スキャンのみの資料は OCR 完了後にヒットします。"
        )
    lines = [
        f"**{name}** の資料から **{len(items)} 件** ヒットしました（firm 内のみ）。",
        "下の抜粋を確認してください。",
    ]
    return "\n".join(lines)


def answer_work_question(
    *,
    message: str,
    firm_id: str,
    client_id: Optional[str] = None,
    period_key: Optional[str] = None,
    client_label: Optional[str] = None,
    expected_slots: Optional[list[dict[str, str]]] = None,
) -> dict[str, Any]:
    intent = detect_intent(message, has_client=bool(client_id))
    out: dict[str, Any] = {
        "role": "assistant",
        "intent": intent,
        "content": "",
        "help_doc_id": None,
        "tour_id": None,
        "citations": [],
        "engine": "work_assistant",
        "coverage": None,
        "extraction_proposal": None,
        "rag": None,
        "suggest_ticket": False,
    }

    if intent == "coverage":
        if not client_id or not period_key:
            out["content"] = (
                "資料の充足を見るには、マトリクスで顧問先と期を選んでから聞いてください。"
                "例:「このクライアント、資料揃ってる？」"
            )
            return out
        coverage = build_coverage_summary(
            firm_id=firm_id,
            client_id=client_id,
            period_key=period_key,
            expected_slots=list(expected_slots or []),
        )
        out["coverage"] = coverage
        out["content"] = format_coverage_message(coverage, client_label or "")
        out["engine"] = "coverage"
        return out

    if intent == "extraction_propose":
        if not client_id or not period_key:
            out["content"] = (
                "OCR 結果を基本情報へ載せるには、顧問先と期を選んでから聞いてください。"
                "例:「OCRして基本情報に反映して」"
            )
            return out
        proposal = propose_extraction_from_slots(
            firm_id=firm_id,
            client_id=client_id,
            period_key=period_key,
        )
        out["extraction_proposal"] = proposal
        out["content"] = format_extraction_message(proposal)
        out["engine"] = "extraction_propose"
        return out

    if intent == "rag":
        if not client_id:
            out["content"] = (
                "資料を探すには、マトリクスで顧問先を選んでから聞いてください。"
                "例:「源泉徴収票を探して」"
            )
            return out
        rag = search_client_documents(
            firm_id=firm_id,
            client_id=client_id,
            query=message.strip(),
            limit=8,
        )
        out["rag"] = rag
        out["content"] = format_rag_message(rag, client_label=client_label or "")
        out["engine"] = "rag"
        out["citations"] = [
            {
                "id": str(h.get("versionId") or h.get("docId") or i),
                "title": (h.get("excerpt") or "")[:80],
                "path": f"version:{h.get('versionId') or ''}",
                "score": float(h.get("score") or 0),
            }
            for i, h in enumerate(rag.get("items") or [])
        ]
        return out

    # Default: help KB
    help_result = answer_support_question(message)
    out["content"] = help_result.get("content") or ""
    out["help_doc_id"] = help_result.get("help_doc_id")
    out["tour_id"] = help_result.get("tour_id")
    out["citations"] = help_result.get("citations") or []
    out["engine"] = help_result.get("engine") or "help_kb"
    out["intent"] = "help"
    return out
