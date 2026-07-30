"""ルール分類の補助として OpenAI / Gemini を使う（キー設定時のみ）。"""

from __future__ import annotations

import json
from typing import Dict, List, Optional

import requests

from services.ai_prompts import render_prompt


def _parse_ai_label_response(
    parsed: dict,
    candidates: List[Dict[str, str]],
) -> Optional[Dict[str, object]]:
    label = str(parsed.get("label", "")).strip()
    labels = [c.get("label", "") for c in candidates if c.get("label")]
    if label not in labels:
        return None
    confidence = float(parsed.get("confidence", 0.5))
    confidence = max(0.0, min(1.0, confidence))
    match = next((c for c in candidates if c.get("label") == label), None)
    if not match:
        return None
    return {
        "best": {
            "id": match.get("id", label),
            "label": label,
            "score": 99,
            "matched": ["ai"],
        },
        "confidence": round(confidence, 3),
        "reason": str(parsed.get("reason", ""))[:200],
    }


def _build_classify_prompt(
    text: str,
    filename: Optional[str],
    labels: List[str],
    *,
    template: Optional[str] = None,
) -> str:
    excerpt = (text or "")[:3000]
    filename_display = filename or "(不明)"
    labels_display = ", ".join(labels)
    excerpt_display = excerpt or "(テキストなし)"
    tpl = (template or "").strip() or None
    if tpl:
        return render_prompt(
            tpl,
            filename=filename_display,
            excerpt=excerpt_display,
            labels=labels_display,
        )
    return (
        "あなたは日本の税務・会計書類の分類アシスタントです。"
        "以下の PDF から抽出したテキストとファイル名から、最も適切な書類種別を1つ選んでください。\n\n"
        f"ファイル名: {filename_display}\n\n"
        f"テキスト抜粋:\n{excerpt_display}\n\n"
        f"候補ラベル: {labels_display}\n\n"
        'JSON のみで返答: {"label":"<候補のいずれか>","confidence":0.0-1.0,"reason":"短い理由"}'
    )


def ai_classify_boost(
    text: str,
    filename: Optional[str],
    candidates: List[Dict[str, str]],
    api_key: str,
    model: str = "gpt-4o-mini",
    *,
    prompt_template: Optional[str] = None,
) -> Optional[Dict[str, object]]:
    """低確信度時に AI で候補ラベルを推定。失敗時は None。"""
    if not api_key or not candidates:
        return None

    labels = [c.get("label", "") for c in candidates if c.get("label")]
    if not labels:
        return None

    prompt = _build_classify_prompt(text, filename, labels, template=prompt_template)

    try:
        res = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
                "temperature": 0.1,
                "max_tokens": 200,
            },
            timeout=25,
        )
        if res.status_code != 200:
            return None
        content = res.json()["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        return _parse_ai_label_response(parsed, candidates)
    except Exception:
        return None


def gemini_classify_boost(
    text: str,
    filename: Optional[str],
    candidates: List[Dict[str, str]],
    api_key: str,
    model: str = "gemini-2.5-flash",
    *,
    prompt_template: Optional[str] = None,
) -> Optional[Dict[str, object]]:
    """低確信度時に Gemini で候補ラベルを推定。失敗時は None。"""
    if not api_key or not candidates:
        return None

    labels = [c.get("label", "") for c in candidates if c.get("label")]
    if not labels:
        return None

    prompt = _build_classify_prompt(text, filename, labels, template=prompt_template)
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )

    try:
        res = requests.post(
            url,
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.1,
                    "maxOutputTokens": 256,
                    "responseMimeType": "application/json",
                },
            },
            timeout=25,
        )
        if res.status_code != 200:
            return None
        body = res.json()
        parts = body.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        if not parts:
            return None
        content = parts[0].get("text", "")
        parsed = json.loads(content)
        return _parse_ai_label_response(parsed, candidates)
    except Exception:
        return None
