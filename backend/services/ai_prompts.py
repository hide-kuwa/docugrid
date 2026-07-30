"""Editable AI classification prompt templates (firm override → global → builtin)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from services.tenancy import DEFAULT_FIRM_ID

PROMPT_KEY_CLASSIFY_TEXT = "classify_text"
PROMPT_KEY_CLASSIFY_VISION = "classify_vision"

PROMPT_KEYS = frozenset({PROMPT_KEY_CLASSIFY_TEXT, PROMPT_KEY_CLASSIFY_VISION})

PromptScope = Literal["firm", "global"]
PromptSource = Literal["firm", "global", "builtin"]

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"

PROMPT_VARIABLES: dict[str, list[str]] = {
    PROMPT_KEY_CLASSIFY_TEXT: ["filename", "excerpt", "labels"],
    PROMPT_KEY_CLASSIFY_VISION: ["filename", "text_excerpt", "types_line", "catalog_snippet"],
}

BUILTIN_DEFAULTS: dict[str, str] = {
    PROMPT_KEY_CLASSIFY_TEXT: (
        "あなたは日本の税務・会計書類の分類アシスタントです。"
        "以下の PDF から抽出したテキストとファイル名から、最も適切な書類種別を1つ選んでください。\n\n"
        "ファイル名: {filename}\n\n"
        "テキスト抜粋:\n{excerpt}\n\n"
        "候補ラベル: {labels}\n\n"
        'JSON のみで返答: {"label":"<候補のいずれか>","confidence":0.0-1.0,"reason":"短い理由"}'
    ),
    PROMPT_KEY_CLASSIFY_VISION: (
        "あなたは日本の税務・会計書類を識別する専門家です。"
        "添付画像は税務・会計ソフトから出力された PDF のページです（複数ページの場合はページ番号順）。"
        "表紙・送付状をスキップし、各様式本体が何ページ目から始まるかも意識して判定してください。"
        "ヘッダー文字列・表構造・法定様式名から書類種別を判定してください。\n\n"
        "ファイル名: {filename}\n"
        "抽出テキスト抜粋: {text_excerpt}\n\n"
        "identifiedType は次のいずれか: {types_line}\n"
        "- TAX_PROXY: 税務代理権限証書\n"
        "- CORP_TAX_RETURN: 法人税申告書・別表\n"
        "- ACCOUNT_DETAILS: 勘定科目内訳明細書\n"
        "- CORP_SUMMARY: 法人事業概況説明書\n"
        "- TRIAL_BALANCE: 試算表・決算報告書\n"
        "- CONSUMPTION_TAX: 消費税申告書・試算表\n"
        "- UNKNOWN: 判定不能\n"
        "{catalog_snippet}"
    ),
}


def ai_prompts_path(firm_id: str) -> Path:
    fid = (firm_id or "").strip() or DEFAULT_FIRM_ID
    return STORAGE_DIR / "firms" / fid / "ai_prompts.json"


def _load_raw(firm_id: str) -> dict:
    path = ai_prompts_path(firm_id)
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_raw(firm_id: str, data: dict) -> None:
    path = ai_prompts_path(firm_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = dict(data)
    payload["updated_at"] = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def render_prompt(template: str, **variables: str) -> str:
    """Replace {key} placeholders without using str.format (JSON braces safe)."""
    out = template
    for key, value in variables.items():
        out = out.replace("{" + key + "}", value or "")
    return out


def builtin_default(key: str) -> str:
    if key not in PROMPT_KEYS:
        raise ValueError("invalid_prompt_key")
    return BUILTIN_DEFAULTS[key]


def get_prompt_template(firm_id: str, key: str) -> tuple[str, PromptSource]:
    """Resolve template: firm override → global (DEFAULT_FIRM) → builtin."""
    if key not in PROMPT_KEYS:
        raise ValueError("invalid_prompt_key")

    fid = (firm_id or "").strip() or DEFAULT_FIRM_ID
    firm_raw = _load_raw(fid)
    firm_templates = firm_raw.get("templates") or {}
    if isinstance(firm_templates, dict):
        firm_tpl = (firm_templates.get(key) or "").strip()
        if firm_tpl:
            return firm_tpl, "firm"

    if fid != DEFAULT_FIRM_ID:
        global_raw = _load_raw(DEFAULT_FIRM_ID)
        global_templates = global_raw.get("templates") or {}
        if isinstance(global_templates, dict):
            global_tpl = (global_templates.get(key) or "").strip()
            if global_tpl:
                return global_tpl, "global"

    return builtin_default(key), "builtin"


def save_prompt_template(
    firm_id: str,
    key: str,
    template: str,
    *,
    scope: PromptScope,
) -> None:
    if key not in PROMPT_KEYS:
        raise ValueError("invalid_prompt_key")
    tpl = (template or "").strip()
    if not tpl:
        raise ValueError("template_empty")

    target_firm = DEFAULT_FIRM_ID if scope == "global" else ((firm_id or "").strip() or DEFAULT_FIRM_ID)
    raw = _load_raw(target_firm)
    templates = dict(raw.get("templates") or {})
    templates[key] = tpl
    raw["templates"] = templates
    _write_raw(target_firm, raw)


def reset_prompt_template(firm_id: str, key: str, *, scope: PromptScope) -> bool:
    if key not in PROMPT_KEYS:
        raise ValueError("invalid_prompt_key")

    target_firm = DEFAULT_FIRM_ID if scope == "global" else ((firm_id or "").strip() or DEFAULT_FIRM_ID)
    raw = _load_raw(target_firm)
    templates = dict(raw.get("templates") or {})
    if key not in templates:
        return False
    templates.pop(key)
    if templates:
        raw["templates"] = templates
        _write_raw(target_firm, raw)
    else:
        path = ai_prompts_path(target_firm)
        if path.exists():
            path.unlink()
    return True


def list_prompt_definitions(firm_id: str) -> list[dict]:
    """All prompt keys with resolved template, source, variables, builtin default."""
    out: list[dict] = []
    for key in sorted(PROMPT_KEYS):
        template, source = get_prompt_template(firm_id, key)
        out.append(
            {
                "key": key,
                "template": template,
                "source": source,
                "variables": list(PROMPT_VARIABLES.get(key, [])),
                "builtin_default": builtin_default(key),
            }
        )
    return out


def _default_text_candidates() -> list[dict[str, str]]:
    return [
        {"id": "trial_balance", "label": "試算表"},
        {"id": "corp_tax", "label": "法人税申告書"},
        {"id": "account_details", "label": "勘定科目内訳明細書"},
        {"id": "consumption_tax", "label": "消費税申告書"},
        {"id": "tax_proxy", "label": "税務代理権限証書"},
    ]


def execute_prompt_test(
    *,
    firm_id: str,
    key: str,
    content: bytes,
    filename: str,
    draft_template: str | None,
    candidates_json: str | None,
    gemini_key: str | None,
    gemini_model: str,
    openai_key: str | None = None,
    openai_model: str = "gpt-4o-mini",
    prefer_gemini: bool = True,
) -> dict:
    """Run draft or resolved prompt against sample PDF; return engine + raw + parsed."""
    from services.ai_classifier import _build_classify_prompt, _parse_ai_label_response
    from services.doc_classifier import extract_text_from_pdf
    from services.tax_document_types import TAX_DOCUMENT_TYPES
    from services.vision_classifier import _build_vision_prompt, vision_classify_gemini, vision_classify_openai

    if key not in PROMPT_KEYS:
        raise ValueError("invalid_prompt_key")

    tpl = (draft_template or "").strip() or get_prompt_template(firm_id, key)[0]
    text, extract_engine = extract_text_from_pdf(content)
    excerpt = (text or "")[:3000]
    fname = filename or "sample.pdf"

    if key == PROMPT_KEY_CLASSIFY_TEXT:
        labels: list[str] = []
        if candidates_json:
            try:
                parsed_cands = json.loads(candidates_json)
                if isinstance(parsed_cands, list):
                    labels = [
                        str(c.get("label", "")).strip()
                        for c in parsed_cands
                        if isinstance(c, dict) and c.get("label")
                    ]
            except Exception:
                pass
        if not labels:
            labels = [c["label"] for c in _default_text_candidates()]
        prompt_used = _build_classify_prompt(excerpt, fname, labels, template=tpl)

        raw_response: dict | str | None = None
        parsed: dict | None = None
        engine = "none"
        error: str | None = None

        if prefer_gemini and gemini_key:
            import requests

            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{gemini_model}:generateContent?key={gemini_key}"
            )
            try:
                res = requests.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    json={
                        "contents": [{"parts": [{"text": prompt_used}]}],
                        "generationConfig": {
                            "temperature": 0.1,
                            "maxOutputTokens": 256,
                            "responseMimeType": "application/json",
                        },
                    },
                    timeout=45,
                )
                raw_response = res.json() if res.headers.get("content-type", "").startswith("application/json") else res.text
                if res.status_code == 200:
                    parts = raw_response.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                    if parts:
                        content_text = parts[0].get("text", "")
                        parsed_json = json.loads(content_text)
                        boost = _parse_ai_label_response(
                            parsed_json,
                            [{"id": lbl, "label": lbl} for lbl in labels],
                        )
                        parsed = boost
                        engine = "gemini"
                else:
                    error = f"gemini_http_{res.status_code}"
            except Exception as exc:
                error = str(exc)[:300]
        elif openai_key:
            import requests

            try:
                res = requests.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {openai_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": openai_model,
                        "messages": [{"role": "user", "content": prompt_used}],
                        "response_format": {"type": "json_object"},
                        "temperature": 0.1,
                        "max_tokens": 200,
                    },
                    timeout=45,
                )
                raw_response = res.json() if res.headers.get("content-type", "").startswith("application/json") else res.text
                if res.status_code == 200:
                    content_text = raw_response["choices"][0]["message"]["content"]
                    parsed_json = json.loads(content_text)
                    boost = _parse_ai_label_response(
                        parsed_json,
                        [{"id": lbl, "label": lbl} for lbl in labels],
                    )
                    parsed = boost
                    engine = "openai"
                else:
                    error = f"openai_http_{res.status_code}"
            except Exception as exc:
                error = str(exc)[:300]
        else:
            error = "no_api_key_configured"

        return {
            "key": key,
            "engine": engine,
            "prompt_used": prompt_used,
            "text_excerpt": excerpt[:400],
            "raw_response": raw_response,
            "parsed": parsed,
            "error": error,
        }

    # Vision classify
    types_line = ", ".join(TAX_DOCUMENT_TYPES)
    catalog = ""
    try:
        from services.vision_classifier import _vision_catalog_snippet

        catalog = _vision_catalog_snippet()
    except Exception:
        pass
    prompt_used = _build_vision_prompt(fname, excerpt, template=tpl)

    result = None
    raw_response = None
    engine = "none"
    error = None

    if prefer_gemini and gemini_key:
        import requests

        from services.vision_classifier import pdf_pages_as_base64_pngs

        images = pdf_pages_as_base64_pngs(content)
        if not images:
            return {
                "key": key,
                "engine": "none",
                "prompt_used": prompt_used,
                "text_excerpt": excerpt[:400],
                "raw_response": None,
                "parsed": None,
                "error": "pdf_render_failed",
            }
        parts: list[dict] = [{"text": prompt_used}]
        for b64 in images:
            parts.append({"inline_data": {"mime_type": "image/png", "data": b64}})
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{gemini_model}:generateContent?key={gemini_key}"
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
                    },
                },
                timeout=60,
            )
            raw_response = res.json() if res.headers.get("content-type", "").startswith("application/json") else res.text
            if res.status_code == 200:
                cand_parts = raw_response.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                if cand_parts:
                    result = json.loads(cand_parts[0].get("text", "{}"))
                    engine = "gemini-vision"
            else:
                error = f"gemini_http_{res.status_code}"
        except Exception as exc:
            error = str(exc)[:300]
    elif openai_key:
        result = vision_classify_openai(
            content,
            fname,
            excerpt,
            openai_key,
            openai_model,
            prompt_template=tpl,
        )
        if result:
            engine = str(result.get("engine") or "openai-vision")
            raw_response = result
    else:
        error = "no_api_key_configured"

    return {
        "key": key,
        "engine": engine,
        "prompt_used": prompt_used,
        "text_excerpt": excerpt[:400],
        "raw_response": raw_response,
        "parsed": result,
        "error": error,
    }
