"""書類の OCR テキスト抽出とルールベース分類（P3 自動振り分け v1）。

設計方針:
- テキスト埋め込み PDF は PyMuPDF で抽出（高速・無依存）。
- スキャン PDF はテキストが取れないため、tesseract が利用可能なら任意で OCR。
  tesseract 未導入でもクラッシュさせず、engine="none" / confidence=0 で要確認に回す。
- 分類はキーワードルール。確信度は「最高スコア」と「2位との差」から算出。
"""

from __future__ import annotations

import os
from typing import Dict, List, Optional, Tuple

import fitz  # PyMuPDF

# 書類種別ごとの判定キーワード（ラベルそのものも常に候補に含める）。
DOC_TYPE_KEYWORDS: Dict[str, List[str]] = {
    # 永久保存
    "定款": ["定款", "発起人", "商号", "本店の所在地", "事業年度", "公告"],
    "履歴事項全部証明書": ["履歴事項", "全部証明", "会社法人等番号", "登記記録", "登記官"],
    "株主名簿": ["株主名簿", "株主", "持株数", "株式の種類", "議決権"],
    "設立届出書": ["設立", "法人設立届出書", "異動届出書", "設立年月日"],
    # 年次
    "決算報告書": ["決算報告", "貸借対照表", "損益計算書", "株主資本等変動", "個別注記表", "決算書"],
    "総勘定元帳": ["総勘定元帳", "元帳", "前期繰越", "次期繰越", "相手科目"],
    "法人税申告書": ["法人税", "別表", "課税所得", "確定申告", "地方法人税", "別表一"],
    "消費税申告書": ["消費税", "課税標準額", "課税売上", "仕入控除税額", "中間納付"],
    "税務代理権限証書": ["税務代理", "代理権限", "権限証書", "税理士", "提出委任"],
    "勘定科目内訳明細書": ["勘定科目", "内訳明細", "内訳書", "明細書"],
    "法人事業概況説明書": ["事業概況", "概況説明", "法人事業概況", "事業の状況"],
    # 月次
    "月次試算表": ["試算表", "合計残高試算表", "月次", "前月繰越"],
    "通帳コピー": ["普通預金", "当座預金", "お預り", "お支払い", "差引残高", "銀行", "支店"],
    "請求書綴り": ["請求書", "御請求", "請求金額", "御中", "お支払期限", "ご請求"],
    "給与台帳": ["給与", "賃金台帳", "支給", "控除", "源泉所得税", "社会保険"],
}

_MAX_PAGES_DEFAULT = 5


def _try_tesseract(doc: "fitz.Document", max_pages: int) -> str:
    """tesseract が使える環境でのみ OCR を試みる。失敗時は空文字。"""
    try:
        import pytesseract  # type: ignore
        from PIL import Image  # type: ignore
    except Exception:
        return ""

    cmd = os.environ.get("TESSERACT_CMD")
    if cmd:
        pytesseract.pytesseract.tesseract_cmd = cmd

    lang = os.environ.get("TESSERACT_LANG", "jpn")
    parts: List[str] = []
    try:
        import io

        for i in range(min(len(doc), max_pages)):
            page = doc[i]
            pix = page.get_pixmap(dpi=200)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            parts.append(pytesseract.image_to_string(img, lang=lang))
    except Exception:
        return ""
    return "\n".join(parts).strip()


def extract_text_from_pdf(content: bytes, max_pages: int = _MAX_PAGES_DEFAULT) -> Tuple[str, str]:
    """PDF からテキストを抽出して (text, engine) を返す。

    engine: "pymupdf" | "tesseract" | "none"
    """
    try:
        doc = fitz.open("pdf", content)
    except Exception:
        return "", "none"

    parts: List[str] = []
    for i in range(min(len(doc), max_pages)):
        try:
            parts.append(doc[i].get_text())
        except Exception:
            continue
    text = "\n".join(parts).strip()
    if len(text) >= 10:  # 埋め込みテキストとして十分
        return text, "pymupdf"

    ocr_text = _try_tesseract(doc, max_pages)
    if ocr_text:
        return ocr_text, "tesseract"
    return text, "none"


def classify_text(
    text: str,
    filename: Optional[str],
    candidates: List[Dict[str, str]],
) -> Dict[str, object]:
    """抽出テキスト＋ファイル名を候補ラベルに対してスコアリングする。

    candidates: [{"id": "0", "label": "総勘定元帳"}, ...]
    戻り値: {"best": {...}|None, "ranked": [...], "confidence": float}
    """
    haystack = f"{text or ''}\n{filename or ''}"

    ranked: List[Dict[str, object]] = []
    for candidate in candidates:
        label = candidate.get("label", "")
        keywords = set(DOC_TYPE_KEYWORDS.get(label, []))
        if label:
            keywords.add(label)
        matched = sorted({kw for kw in keywords if kw and kw in haystack})
        ranked.append(
            {
                "id": candidate.get("id", label),
                "label": label,
                "score": len(matched),
                "matched": matched,
            }
        )

    ranked.sort(key=lambda r: r["score"], reverse=True)
    best = ranked[0] if ranked else None
    second = ranked[1]["score"] if len(ranked) > 1 else 0

    confidence = 0.0
    if best and best["score"] > 0:
        base = min(1.0, best["score"] / 3.0)
        margin = best["score"] - second
        margin_factor = 0.5 + 0.5 * min(1.0, margin / 2.0)
        confidence = round(base * margin_factor, 3)

    return {"best": best, "ranked": ranked, "confidence": confidence}


def classify_pdf(
    content: bytes,
    filename: Optional[str],
    candidates: List[Dict[str, str]],
    max_pages: int = _MAX_PAGES_DEFAULT,
) -> Dict[str, object]:
    text, engine = extract_text_from_pdf(content, max_pages=max_pages)
    result = classify_text(text, filename, candidates)
    result["engine"] = engine
    result["text_excerpt"] = (text or "")[:400]
    return result
