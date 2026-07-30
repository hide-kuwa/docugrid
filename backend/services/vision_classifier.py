"""PDF Vision LLM 分類（Structured Outputs）。"""

from __future__ import annotations

import base64
import json
from typing import Dict, List, Optional, Tuple

import fitz
import requests

from services.ai_prompts import render_prompt
from services.form_catalog import build_vision_prompt_snippet, load_form_catalog_config
from services.tax_document_types import (
    AI_CLASSIFICATION_JSON_SCHEMA,
    TAX_DOCUMENT_TYPES,
    infer_type_from_text,
    normalize_type,
)

_MAX_VISION_PAGES = 2
_VISION_DPI = 150


def pdf_pages_as_base64_pngs(content: bytes, max_pages: int = _MAX_VISION_PAGES) -> List[str]:
    """PDF 先頭ページを raw base64 PNG リストに変換（Gemini inline_data 用）。"""
    out: List[str] = []
    try:
        doc = fitz.open("pdf", content)
    except Exception:
        return out
    for i in range(min(len(doc), max_pages)):
        try:
            pix = doc[i].get_pixmap(dpi=_VISION_DPI)
            out.append(base64.standard_b64encode(pix.tobytes("png")).decode("ascii"))
        except Exception:
            continue
    return out


def pdf_pages_as_data_urls(content: bytes, max_pages: int = _MAX_VISION_PAGES) -> List[str]:
    """PDF 先頭ページを base64 data URL リストに変換。"""
    urls: List[str] = []
    try:
        doc = fitz.open("pdf", content)
    except Exception:
        return urls

    for i in range(min(len(doc), max_pages)):
        try:
            pix = doc[i].get_pixmap(dpi=_VISION_DPI)
            b64 = base64.standard_b64encode(pix.tobytes("png")).decode("ascii")
            urls.append(f"data:image/png;base64,{b64}")
        except Exception:
            continue
    return urls


def _vision_catalog_snippet() -> str:
    if not load_form_catalog_config or not build_vision_prompt_snippet:
        return ""
    try:
        from services.form_catalog_compiler import build_learning_vision_prompt

        snippet = build_learning_vision_prompt(max_forms=8)
        if not snippet:
            forms = load_form_catalog_config()["forms"]
            snippet = build_vision_prompt_snippet(forms, max_forms=8)
        if snippet:
            return f"\n\n## 様式カタログ（参照）\n{snippet}"
    except Exception:
        pass
    return ""


def _build_vision_prompt(
    filename: Optional[str],
    text_excerpt: str,
    *,
    template: Optional[str] = None,
) -> str:
    types_line = ", ".join(TAX_DOCUMENT_TYPES)
    filename_display = filename or "(不明)"
    excerpt_display = text_excerpt[:1500] or "(なし)"
    catalog = _vision_catalog_snippet()

    tpl = (template or "").strip() or None
    if tpl:
        return render_prompt(
            tpl,
            filename=filename_display,
            text_excerpt=excerpt_display,
            types_line=types_line,
            catalog_snippet=catalog,
        )

    base = (
        "あなたは日本の税務・会計書類を識別する専門家です。"
        "添付画像は税務・会計ソフトから出力された PDF のページです（複数ページの場合はページ番号順）。"
        "表紙・送付状をスキップし、各様式本体が何ページ目から始まるかも意識して判定してください。"
        "ヘッダー文字列・表構造・法定様式名から書類種別を判定してください。\n\n"
        f"ファイル名: {filename_display}\n"
        f"抽出テキスト抜粋: {excerpt_display}\n\n"
        f"identifiedType は次のいずれか: {types_line}\n"
        "- TAX_PROXY: 税務代理権限証書\n"
        "- CORP_TAX_RETURN: 法人税申告書・別表\n"
        "- ACCOUNT_DETAILS: 勘定科目内訳明細書\n"
        "- CORP_SUMMARY: 法人事業概況説明書\n"
        "- TRIAL_BALANCE: 試算表・決算報告書\n"
        "- CONSUMPTION_TAX: 消費税申告書・試算表\n"
        "- UNKNOWN: 判定不能\n"
    )
    if catalog:
        return base + catalog
    return base


def vision_classify_openai(
    content: bytes,
    filename: Optional[str],
    text_excerpt: str,
    api_key: str,
    model: str = "gpt-4o-mini",
    *,
    prompt_template: Optional[str] = None,
) -> Optional[Dict[str, object]]:
    """OpenAI Vision + Structured Outputs で書類種別を返す。"""
    if not api_key:
        return None

    images = pdf_pages_as_data_urls(content)
    if not images:
        return None

    prompt = _build_vision_prompt(filename, text_excerpt, template=prompt_template)
    user_content: List[dict] = [{"type": "text", "text": prompt}]
    for url in images:
        user_content.append({"type": "image_url", "image_url": {"url": url, "detail": "low"}})

    try:
        res = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": user_content}],
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "tax_document_classification",
                        "strict": True,
                        "schema": AI_CLASSIFICATION_JSON_SCHEMA,
                    },
                },
                "temperature": 0.1,
                "max_tokens": 300,
            },
            timeout=45,
        )
        if res.status_code != 200:
            return None
        raw = res.json()["choices"][0]["message"]["content"]
        parsed = json.loads(raw)
        doc_type = normalize_type(str(parsed.get("identifiedType", "")))
        confidence = max(0.0, min(1.0, float(parsed.get("confidence", 0.5))))
        return {
            "identifiedType": doc_type,
            "confidence": round(confidence, 3),
            "reason": str(parsed.get("reason", ""))[:200],
            "engine": "openai-vision",
        }
    except Exception:
        return None


def vision_classify_gemini(
    content: bytes,
    filename: Optional[str],
    text_excerpt: str,
    api_key: str,
    model: str = "gemini-2.5-flash",
    *,
    prompt_template: Optional[str] = None,
) -> Optional[Dict[str, object]]:
    """Gemini Vision + JSON 出力で書類種別を返す。"""
    if not api_key:
        return None

    images = pdf_pages_as_base64_pngs(content)
    if not images:
        return None

    prompt = _build_vision_prompt(filename, text_excerpt, template=prompt_template)
    parts: List[dict] = [{"text": prompt}]
    for b64 in images:
        parts.append({"inline_data": {"mime_type": "image/png", "data": b64}})

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    try:
        res = requests.post(
            url,
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"parts": parts}],
                "generationConfig": {
                    "temperature": 0.1,
                    "maxOutputTokens": 300,
                    "responseMimeType": "application/json",
                    "responseSchema": AI_CLASSIFICATION_JSON_SCHEMA,
                },
            },
            timeout=45,
        )
        if res.status_code != 200:
            return None
        body = res.json()
        cand_parts = body.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        if not cand_parts:
            return None
        parsed = json.loads(cand_parts[0].get("text", "{}"))
        doc_type = normalize_type(str(parsed.get("identifiedType", "")))
        confidence = max(0.0, min(1.0, float(parsed.get("confidence", 0.5))))
        return {
            "identifiedType": doc_type,
            "confidence": round(confidence, 3),
            "reason": str(parsed.get("reason", ""))[:200],
            "engine": "gemini-vision",
        }
    except Exception:
        return None


def classify_tax_document(
    content: bytes,
    filename: Optional[str],
    *,
    text_excerpt: str = "",
    openai_key: Optional[str] = None,
    openai_model: str = "gpt-4o-mini",
    gemini_key: Optional[str] = None,
    gemini_model: str = "gemini-2.5-flash",
    use_openai_vision: bool = True,
    use_gemini_vision: bool = False,
    prompt_template: Optional[str] = None,
) -> Dict[str, object]:
    """ルール → OpenAI Vision → Gemini Vision の順で TaxDocumentType を判定。"""
    rule_type, rule_conf, rule_reason = infer_type_from_text(text_excerpt, filename)
    if rule_conf >= 0.6:
        return {
            "identifiedType": rule_type,
            "confidence": rule_conf,
            "reason": rule_reason,
            "engine": "rules",
        }

    best: Optional[Dict[str, object]] = None
    if use_openai_vision and openai_key:
        best = vision_classify_openai(
            content,
            filename,
            text_excerpt,
            openai_key,
            openai_model,
            prompt_template=prompt_template,
        )
    if (not best or float(best.get("confidence") or 0) <= rule_conf) and use_gemini_vision and gemini_key:
        gemini = vision_classify_gemini(
            content,
            filename,
            text_excerpt,
            gemini_key,
            gemini_model,
            prompt_template=prompt_template,
        )
        if gemini and float(gemini.get("confidence") or 0) > float((best or {}).get("confidence") or rule_conf):
            best = gemini

    if best and float(best.get("confidence") or 0) > rule_conf:
        return best

    if rule_type != "UNKNOWN":
        return {
            "identifiedType": rule_type,
            "confidence": rule_conf,
            "reason": rule_reason,
            "engine": "rules",
        }

    return {
        "identifiedType": "UNKNOWN",
        "confidence": rule_conf,
        "reason": rule_reason or "判定不能",
        "engine": "none",
    }
