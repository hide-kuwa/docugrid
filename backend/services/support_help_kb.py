"""Support assistant knowledge base over docs/help/*.md (S2 retrieval).

No cross-firm data. LLM synthesis is optional (OPENAI_API_KEY).
"""

from __future__ import annotations

import json
import logging
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

logger = logging.getLogger("docugrid.support")

# backend/services -> backend -> repo root
_REPO_ROOT = Path(__file__).resolve().parents[2]
HELP_DIR = _REPO_ROOT / "docs" / "help"

# Only user-facing help pages (exclude maintaining/coverage/vision internals as answers)
ALLOWED_HELP_FILES: dict[str, str] = {
    "overview": "overview.md",
    "support": "support.md",
    "support-ops": "support-ops.md",
    "workspace": "workspace.md",
    "doc-matrix": "doc-matrix.md",
    "slot-attachments": "slot-attachments.md",
    "work-assistant": "work-assistant.md",
    "crm-perm": "crm-perm.md",
    "auto-sort": "auto-sort.md",
    "audit-flow": "audit-flow.md",
    "pdf": "pdf.md",
    "guest-pdf": "guest-pdf.md",
    "karte": "karte.md",
    "karte-master": "karte-master.md",
    "karte-charts": "karte-charts.md",
    "karte-payroll": "karte-payroll.md",
    "karte-progress": "karte-progress.md",
    "karte-stock": "karte-stock.md",
    "karte-special": "karte-special.md",
    "tax-progress": "tax-progress.md",
    "dm": "dm.md",
    "saving": "saving.md",
    "google-drive": "google-drive.md",
    "faq": "faq.md",
}

KEYWORD_BOOST: dict[str, tuple[str, ...]] = {
    "work-assistant": ("アシスタント", "チャット", "揃って", "充足", "docugrid ai"),
    "slot-attachments": ("xlsx", "画像", "png", "jpeg", "pdf化", "ダウンロード"),
    "auto-sort": ("自動", "振り分け", "要確認", "キュー", "まとめて", "確信度"),
    "saving": ("保存", "サーバー", "drive", "ドライブ", "見えない", "どこ"),
    "guest-pdf": ("ゲスト", "/pdf", "ログイン不要"),
    "pdf": ("注釈", "並べ替え", "ダウンロード", "add pdf"),
    "karte": ("カルテ", "メモ", "マスタ", "グラフ", "給与"),
    "karte-payroll": ("給与", "源泉", "まるふ", "年末調整", "従業員"),
    "karte-progress": ("進捗", "アラート", "カレンダー", "マイルストーン"),
    "karte-stock": ("株評", "自社株", "評価", "非上場"),
    "karte-special": ("特殊", "特例", "注意書き"),
    "doc-matrix": ("マトリクス", "スロット", "r8", "期", "doc"),
    "crm-perm": ("保有", "提案", "案件", "保険", "crm", "永続"),
    "workspace": ("レール", "メニュー", "≡"),
    "tax-progress": ("税務進捗", "tax", "中間", "源泉"),
    "audit-flow": ("承認", "監査", "作業保存", "差戻"),
    "dm": ("dm", "連絡"),
    "support": ("電話", "cs", "サポート", "不具合", "バグ"),
    "support-ops": ("電話", "運用", "ポリシー", "指標", "cs運用"),
    "faq": ("faq", "よくある"),
    "google-drive": ("google", "ミラー"),
}

TOUR_HINTS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("first_workspace", ("はじめ", "最初", "全体", "使い方")),
    ("doc_matrix", ("マトリクス", "スロット", "期")),
    ("auto_sort", ("自動", "振り分け", "要確認")),
    ("karte_hub", ("カルテ",)),
    ("pdf_workspace", ("pdf", "注釈")),
    ("tax_board", ("tax", "税務")),
    ("saving_basics", ("保存", "どこ")),
)

_TITLE_RE = re.compile(r"^#\s+(.+)$", re.M)


@dataclass(frozen=True)
class HelpHit:
    id: str
    title: str
    path: str
    score: float
    excerpt: str


def help_docs_dir() -> Path:
    return HELP_DIR


def _normalize(text: str) -> str:
    return re.sub(r"\s+", "", text.strip().lower())


def _query_tokens(text: str) -> list[str]:
    """ASCII words + CJK chunks + CJK bigrams (日本語クエリ用)."""
    out: list[str] = []
    out.extend(re.findall(r"[a-zA-Z0-9_/.-]{2,}", text))
    for chunk in re.findall(r"[一-龥ぁ-んァ-ヶー]{2,}", text):
        out.append(chunk)
        for i in range(len(chunk) - 1):
            out.append(chunk[i : i + 2])
    seen: set[str] = set()
    uniq: list[str] = []
    for t in out:
        n = _normalize(t)
        if len(n) < 2 or n in seen:
            continue
        seen.add(n)
        uniq.append(t)
    return uniq


def _read_article(doc_id: str) -> tuple[str, str, str] | None:
    file_name = ALLOWED_HELP_FILES.get(doc_id)
    if not file_name:
        return None
    path = HELP_DIR / file_name
    if not path.is_file():
        return None
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None
    title_m = _TITLE_RE.search(text)
    title = (title_m.group(1).strip() if title_m else doc_id)
    return title, text, str(path.relative_to(_REPO_ROOT)).replace("\\", "/")


def _score(query: str, doc_id: str, title: str, body: str) -> float:
    q = _normalize(query)
    if not q:
        return 0.0
    score = 0.0
    hay = _normalize(f"{doc_id}{title}{body[:5000]}")
    if doc_id.replace("-", "") in q or _normalize(doc_id) in q:
        score += 10.0
    for part in re.split(r"[\s·・/]+", title):
        p = _normalize(part)
        if len(p) >= 2 and (p in q or q in p):
            score += 6.0
        for i in range(max(0, len(part) - 1)):
            bi = _normalize(part[i : i + 2])
            if len(bi) == 2 and bi in q:
                score += 2.0
    for w in KEYWORD_BOOST.get(doc_id, ()):
        if _normalize(w) in q:
            score += 5.0
    for token in _query_tokens(query):
        t = _normalize(token)
        if t and t in hay:
            score += 1.5 if len(t) >= 3 else 1.0
    return score


def _excerpt(body: str, query: str, max_len: int = 420) -> str:
    lines = [ln.strip() for ln in body.splitlines() if ln.strip() and not ln.strip().startswith("#")]
    q_tokens = _query_tokens(query)
    best = ""
    best_score = -1
    for i, line in enumerate(lines):
        sc = sum(1 for t in q_tokens if t.lower() in line.lower())
        if sc > best_score:
            best_score = sc
            window = " ".join(lines[i : i + 4])
            best = window
    if not best and lines:
        best = " ".join(lines[:5])
    best = re.sub(r"\s+", " ", best).strip()
    if len(best) > max_len:
        return best[: max_len - 1] + "…"
    return best


def retrieve_help(query: str, *, limit: int = 3) -> list[HelpHit]:
    scored: list[HelpHit] = []
    for doc_id in ALLOWED_HELP_FILES:
        loaded = _read_article(doc_id)
        if not loaded:
            continue
        title, body, rel = loaded
        sc = _score(query, doc_id, title, body)
        if sc <= 0:
            continue
        scored.append(
            HelpHit(
                id=doc_id,
                title=title,
                path=rel,
                score=sc,
                excerpt=_excerpt(body, query),
            )
        )
    scored.sort(key=lambda h: h.score, reverse=True)
    return scored[:limit]


def suggest_tour_id(query: str) -> str | None:
    q = _normalize(query)
    best_id: str | None = None
    best_sc = 0
    for tour_id, words in TOUR_HINTS:
        sc = sum(3 for w in words if _normalize(w) in q)
        if sc > best_sc:
            best_sc = sc
            best_id = tour_id
    return best_id if best_sc > 0 else None


def format_retrieval_answer(query: str, hits: list[HelpHit], tour_id: str | None) -> str:
    if not hits:
        return (
            "近いヘルプ記事が見つかりませんでした。\n"
            "言い方を変えるか、ヘルプセンター（/help）から探してください。\n"
            "例: 「保存はどこ？」「要確認キュー」「カルテの左」\n"
            "解決しなければ CS はメールが基本です（電話は最終手段）。"
        )
    top = hits[0]
    lines = [
        "ヘルプ本文から拾った案内です。",
        f"いちばん近い記事: {top.title}",
        top.excerpt,
        f"詳しく: /help?id={top.id}",
    ]
    if len(hits) > 1:
        others = " / ".join(h.title for h in hits[1:])
        lines.append(f"ほかの候補: {others}")
    if tour_id:
        lines.append(f"画面ガイド「{tour_id}」も使えます（ガイドを再生）。")
    if any(k in _normalize(query) for k in ("バグ", "不具合", "エラー", "動かない")):
        lines.append(
            "不具合のときは: いつ／画面名／操作／メッセージ を控えてメール CS へ。"
            "電話はメールで足りないときだけです。"
        )
    return "\n".join(lines)


def _openai_synthesize(query: str, hits: list[HelpHit]) -> str | None:
    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key or not hits:
        return None
    model = (os.environ.get("DOCUGRID_SUPPORT_MODEL") or "gpt-4o-mini").strip()
    context = "\n\n".join(
        f"### {h.title} (id={h.id})\n{h.excerpt}" for h in hits
    )
    system = (
        "あなたは DocuGrid の社内サポート助手です。"
        "与えられたヘルプ抜粋だけを根拠に、日本語で短く具体的に答えます。"
        "税務の最終判断はせず、不明ならヘルプや担当者確認を促します。"
        "パスワードや秘密情報は求めません。"
        "CS はメール優先、電話は最終手段です。"
    )
    user = f"質問: {query}\n\nヘルプ抜粋:\n{context}\n\n回答:"
    payload = {
        "model": model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as res:
            data = json.loads(res.read().decode("utf-8"))
        content = data["choices"][0]["message"]["content"]
        text = str(content or "").strip()
        if not text:
            return None
        cites = ", ".join(f"{h.title} (/help?id={h.id})" for h in hits[:2])
        return f"{text}\n\n参照: {cites}"
    except (urllib.error.URLError, TimeoutError, KeyError, IndexError, TypeError, ValueError) as exc:
        logger.info("support llm synthesize skipped: %s", exc)
        return None


def answer_support_question(message: str) -> dict[str, Any]:
    query = (message or "").strip()
    if not query:
        return {
            "content": "質問を入力してください。",
            "help_doc_id": None,
            "tour_id": None,
            "citations": [],
            "engine": "help_kb",
        }
    hits = retrieve_help(query, limit=3)
    tour_id = suggest_tour_id(query)
    llm = _openai_synthesize(query, hits)
    if llm:
        content = llm
        engine = "openai+help_kb"
    else:
        content = format_retrieval_answer(query, hits, tour_id)
        engine = "help_kb"
    return {
        "content": content,
        "help_doc_id": hits[0].id if hits else None,
        "tour_id": tour_id,
        "citations": [
            {"id": h.id, "title": h.title, "path": h.path, "score": round(h.score, 2)}
            for h in hits
        ],
        "engine": engine,
    }
