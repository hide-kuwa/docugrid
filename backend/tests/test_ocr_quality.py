"""I3 OCR quality — vision escalate only when weak."""

from __future__ import annotations

from services.ocr_quality_service import (
    apply_ocr_quality_boost,
    needs_vision_escalate,
    _match_candidate,
)


def test_needs_vision_on_weak_text() -> None:
    assert needs_vision_escalate(confidence=0.9, text="", text_engine="none") is True
    assert needs_vision_escalate(confidence=0.9, text="短い", text_engine="pymupdf") is True
    assert (
        needs_vision_escalate(
            confidence=0.8,
            text="これは十分な長さのOCRテキストです。" * 3,
            text_engine="pymupdf",
        )
        is False
    )
    assert (
        needs_vision_escalate(
            confidence=0.3,
            text="これは十分な長さのOCRテキストです。" * 3,
            text_engine="pymupdf",
        )
        is True
    )


def test_match_candidate_by_type() -> None:
    cands = [
        {"id": "withholding_slip", "label": "源泉徴収票"},
        {"id": "tax_return_corporate", "label": "法人税申告書"},
    ]
    assert _match_candidate(cands, "WITHHOLDING_SLIP")["id"] == "withholding_slip"
    assert _match_candidate(cands, "UNKNOWN") is None


def test_apply_boost_skips_when_ocr_disabled(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(
        "services.ocr_quality_service.load_system_config_raw",
        lambda _fid: {"ocr_auto_extract_enabled": False},
    )
    out = apply_ocr_quality_boost(
        firm_id="default",
        client_id="c1",
        content=b"%PDF",
        filename="a.pdf",
        candidates=[{"id": "x", "label": "x"}],
        classify_result={"confidence": 0.2, "engine": "rules", "text_excerpt": ""},
        full_text="",
        text_engine="none",
    )
    assert out["vision_escalated"] is False
    assert out["confidence"] == 0.2


def test_apply_boost_calls_vision_when_weak(monkeypatch) -> None:
    monkeypatch.setattr(
        "services.ocr_quality_service.load_system_config_raw",
        lambda _fid: {
            "ocr_auto_extract_enabled": True,
            "ai_openai_enabled": True,
            "ai_gemini_enabled": False,
            "ai_openai_model": "gpt-4o-mini",
        },
    )
    monkeypatch.setattr("services.ocr_quality_service.get_openai_key", lambda _fid: "sk-test")
    monkeypatch.setattr("services.ocr_quality_service.get_gemini_key", lambda _fid: None)
    monkeypatch.setattr(
        "services.ocr_quality_service.check_ai_allowed",
        lambda *_a, **_k: {"allowed": True, "announce": False},
    )
    monkeypatch.setattr(
        "services.ocr_quality_service.get_prompt_template",
        lambda *_a, **_k: ("tpl", False),
    )
    monkeypatch.setattr(
        "services.form_catalog_classify.try_catalog_slot_classify",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "services.ai_classifier.ai_classify_boost",
        lambda *_a, **_k: None,
    )
    recorded = {"n": 0}

    def fake_vision(*_a, **_k):
        recorded["n"] += 1
        return {
            "identifiedType": "CORPORATE_TAX_RETURN",
            "confidence": 0.91,
            "reason": "vision",
            "engine": "openai-vision",
        }

    monkeypatch.setattr(
        "services.vision_classifier.classify_tax_document",
        fake_vision,
    )
    monkeypatch.setattr(
        "services.ocr_quality_service.record_ai_usage",
        lambda *_a, **_k: {"clientUsage": {"tokens_used": 1}},
    )

    out = apply_ocr_quality_boost(
        firm_id="default",
        client_id="c1",
        content=b"%PDF",
        filename="corp.pdf",
        candidates=[{"id": "tax_return_corporate", "label": "法人税申告書"}],
        classify_result={"confidence": 0.1, "engine": "rules", "text_excerpt": ""},
        full_text="",
        text_engine="none",
    )
    assert recorded["n"] == 1
    assert out["vision_escalated"] is True
    assert out["engine"] == "openai-vision"
    assert out["confidence"] == 0.91
    assert out["best"]["id"] == "tax_return_corporate"


def test_apply_boost_skips_vision_when_strong_local(monkeypatch) -> None:
    monkeypatch.setattr(
        "services.ocr_quality_service.load_system_config_raw",
        lambda _fid: {
            "ocr_auto_extract_enabled": True,
            "ai_openai_enabled": True,
        },
    )
    monkeypatch.setattr("services.ocr_quality_service.get_openai_key", lambda _fid: "sk-test")
    monkeypatch.setattr(
        "services.ocr_quality_service.check_ai_allowed",
        lambda *_a, **_k: {"allowed": True},
    )
    called = {"n": 0}

    def boom(*_a, **_k):
        called["n"] += 1
        raise AssertionError("vision must not run")

    monkeypatch.setattr("services.vision_classifier.classify_tax_document", boom)
    out = apply_ocr_quality_boost(
        firm_id="default",
        client_id="c1",
        content=b"%PDF",
        filename="corp.pdf",
        candidates=[{"id": "tax_return_corporate", "label": "法人税"}],
        classify_result={
            "confidence": 0.95,
            "engine": "pymupdf",
            "text_excerpt": "法人税申告書 別表一 課税所得 " * 5,
            "best": {"id": "tax_return_corporate", "label": "法人税", "score": 3},
        },
        full_text="法人税申告書 別表一 課税所得 合計 " * 5,
        text_engine="pymupdf",
    )
    assert called["n"] == 0
    assert out["vision_escalated"] is False
    assert out["confidence"] == 0.95
