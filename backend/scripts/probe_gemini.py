"""One-off Gemini connectivity probe (does not print full API key)."""
from __future__ import annotations

import json
import sys

import requests

from services.ai_classifier import gemini_classify_boost
from services.firm_settings import get_gemini_key, load_system_config_raw

FIRM = "firm_default"


def main() -> int:
    cfg = load_system_config_raw(FIRM)
    key = get_gemini_key(FIRM)
    model = cfg.get("ai_gemini_model", "gemini-2.0-flash")

    print("=== Config ===")
    print("ai_gemini_enabled:", cfg.get("ai_gemini_enabled"))
    print("ai_gemini_model:", model)
    print("key_present:", bool(key))
    if key:
        print("key_prefix:", key[:10] + "...")
        print("key_len:", len(key))
        print("looks_like_ai_studio:", key.startswith("AIza"))

    if not key:
        print("\nRESULT: no Gemini key stored")
        return 1

    print("\n=== Direct Gemini API ===")
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={key}"
    )
    payload = {
        "contents": [{"parts": [{"text": 'Return JSON: {"ok": true}'}]}],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 32},
    }
    try:
        res = requests.post(
            url,
            headers={"Content-Type": "application/json"},
            json=payload,
            timeout=30,
        )
        print("http_status:", res.status_code)
        body = res.json()
        if res.status_code != 200:
            err = body.get("error", {})
            print("error_status:", err.get("status"))
            print("error_message:", (err.get("message") or str(body))[:400])
        else:
            parts = body.get("candidates", [{}])[0].get("content", {}).get("parts", [])
            text = parts[0].get("text", "") if parts else ""
            print("response_preview:", text[:160])
    except Exception as exc:
        print("request_failed:", type(exc).__name__, str(exc)[:200])
        return 2

    print("\n=== gemini_classify_boost ===")
    candidates = [
        {"id": "tax_return_corporate", "label": "法人税申告書"},
        {"id": "tax_return_consumption", "label": "消費税申告書"},
    ]
    boost = gemini_classify_boost(
        "法人税申告書 別表一 課税所得",
        "法人税申告書_2024.pdf",
        candidates,
        key,
        model,
    )
    print("boost_result:", json.dumps(boost, ensure_ascii=False) if boost else None)

    print("\n=== App would use Gemini? ===")
    print("enabled_and_key:", bool(cfg.get("ai_gemini_enabled") and key))
    return 0 if res.status_code == 200 and boost else 3


if __name__ == "__main__":
    raise SystemExit(main())
