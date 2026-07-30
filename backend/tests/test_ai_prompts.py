"""AI prompt template storage and studio API tests."""

from __future__ import annotations

import json

import fitz
import pytest
from fastapi.testclient import TestClient

from main import app
from services.ai_prompts import (
    PROMPT_KEY_CLASSIFY_TEXT,
    PROMPT_KEY_CLASSIFY_VISION,
    builtin_default,
    get_prompt_template,
    render_prompt,
    reset_prompt_template,
    save_prompt_template,
)
from services.tenancy import DEFAULT_FIRM_ID

client = TestClient(app)


def _minimal_pdf_bytes() -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "試算表 株式会社テスト")
    return doc.write()


def _platform_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "platform_admin",
        "X-Docugrid-User": "admin@taxx.jp",
        "X-Docugrid-Stakeholder": "super-admin",
        "X-Docugrid-Firm": DEFAULT_FIRM_ID,
    }


def _firm_admin_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "firm_admin",
        "X-Docugrid-User": "yamamoto@tax.co.jp",
        "X-Docugrid-Stakeholder": "actor-s3",
        "X-Docugrid-Firm": DEFAULT_FIRM_ID,
    }


def test_render_prompt_replaces_variables() -> None:
    tpl = "file={filename} text={excerpt} labels={labels}"
    out = render_prompt(tpl, filename="a.pdf", excerpt="hello", labels="試算表")
    assert out == "file=a.pdf text=hello labels=試算表"


def test_prompt_fallback_firm_global_builtin(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    firm_id = "firm_prompt_test"
    global_path = tmp_path / "firms" / DEFAULT_FIRM_ID / "ai_prompts.json"
    firm_path = tmp_path / "firms" / firm_id / "ai_prompts.json"
    monkeypatch.setattr("services.ai_prompts.STORAGE_DIR", tmp_path)

    tpl, source = get_prompt_template(firm_id, PROMPT_KEY_CLASSIFY_TEXT)
    assert source == "builtin"
    assert tpl == builtin_default(PROMPT_KEY_CLASSIFY_TEXT)

    global_path.parent.mkdir(parents=True, exist_ok=True)
    global_path.write_text(
        json.dumps({"templates": {PROMPT_KEY_CLASSIFY_TEXT: "GLOBAL {filename}"}}),
        encoding="utf-8",
    )
    tpl, source = get_prompt_template(firm_id, PROMPT_KEY_CLASSIFY_TEXT)
    assert source == "global"
    assert tpl == "GLOBAL {filename}"

    firm_path.parent.mkdir(parents=True, exist_ok=True)
    firm_path.write_text(
        json.dumps({"templates": {PROMPT_KEY_CLASSIFY_TEXT: "FIRM {filename}"}}),
        encoding="utf-8",
    )
    tpl, source = get_prompt_template(firm_id, PROMPT_KEY_CLASSIFY_TEXT)
    assert source == "firm"
    assert tpl == "FIRM {filename}"


def test_save_and_reset_prompt_template(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setattr("services.ai_prompts.STORAGE_DIR", tmp_path)
    save_prompt_template("firm_a", PROMPT_KEY_CLASSIFY_VISION, "CUSTOM {filename}", scope="firm")
    tpl, source = get_prompt_template("firm_a", PROMPT_KEY_CLASSIFY_VISION)
    assert source == "firm"
    assert tpl == "CUSTOM {filename}"

    assert reset_prompt_template("firm_a", PROMPT_KEY_CLASSIFY_VISION, scope="firm")
    tpl, source = get_prompt_template("firm_a", PROMPT_KEY_CLASSIFY_VISION)
    assert source == "builtin"


def test_dev_ai_prompts_get_and_put(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setattr("services.ai_prompts.STORAGE_DIR", tmp_path)

    r = client.get("/api/dev/ai-prompts", headers=_platform_headers())
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["prompts"]) == 2
    keys = {p["key"] for p in body["prompts"]}
    assert PROMPT_KEY_CLASSIFY_TEXT in keys
    assert PROMPT_KEY_CLASSIFY_VISION in keys

    put = client.put(
        f"/api/dev/ai-prompts/{PROMPT_KEY_CLASSIFY_TEXT}",
        headers=_platform_headers(),
        json={"template": "DEV GLOBAL {filename}", "scope": "global"},
    )
    assert put.status_code == 200, put.text
    assert put.json()["template"] == "DEV GLOBAL {filename}"


def test_firm_ai_prompts_put_requires_manage(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setattr("services.ai_prompts.STORAGE_DIR", tmp_path)

    denied = client.put(
        f"/api/ai-prompts/{PROMPT_KEY_CLASSIFY_TEXT}",
        headers={
            "X-Docugrid-Role": "operator",
            "X-Docugrid-User": "tanaka@tax.co.jp",
            "X-Docugrid-Stakeholder": "actor-s1",
            "X-Docugrid-Firm": DEFAULT_FIRM_ID,
        },
        json={"template": "SHOULD FAIL", "scope": "firm"},
    )
    assert denied.status_code == 403

    ok = client.put(
        f"/api/ai-prompts/{PROMPT_KEY_CLASSIFY_TEXT}",
        headers=_firm_admin_headers(),
        json={"template": "FIRM OVERRIDE {filename}", "scope": "firm"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["source"] in ("firm", "global", "builtin")


def test_ai_prompts_test_endpoint_with_mocked_gemini(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setattr("services.ai_prompts.STORAGE_DIR", tmp_path)
    monkeypatch.setattr(
        "api.routers.ai_prompts.get_gemini_key",
        lambda _firm: "fake-gemini-key",
    )
    monkeypatch.setattr(
        "api.routers.ai_prompts.get_openai_key",
        lambda _firm: None,
    )

    import json as json_module

    def _fake_post(url, headers=None, json=None, timeout=None):  # noqa: ANN001
        class _Resp:
            status_code = 200
            headers = {"content-type": "application/json"}

            @staticmethod
            def json() -> dict:
                return {
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {
                                        "text": json_module.dumps(
                                            {
                                                "label": "\u8a66\u7b97\u8868",
                                                "confidence": 0.91,
                                                "reason": "matched keyword",
                                            }
                                        )
                                    }
                                ]
                            }
                        }
                    ]
                }

        return _Resp()

    monkeypatch.setattr("requests.post", _fake_post)

    cfg = type(
        "Cfg",
        (),
        {
            "ai_gemini_enabled": True,
            "ai_openai_enabled": False,
            "ai_gemini_model": "gemini-2.5-flash",
            "ai_openai_model": "gpt-4o-mini",
        },
    )()
    monkeypatch.setattr("api.routers.ai_prompts._load_system_config", lambda _firm: cfg)

    pdf = _minimal_pdf_bytes()
    r = client.post(
        "/api/dev/ai-prompts/test",
        headers=_platform_headers(),
        files={"file": ("sample.pdf", pdf, "application/pdf")},
        data={
            "key": PROMPT_KEY_CLASSIFY_TEXT,
            "draft_template": "TEST {filename} {excerpt} {labels}",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["engine"] == "gemini"
    assert body["parsed"] is not None
    assert "TEST" in body["prompt_used"]
