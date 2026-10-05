"""Work assistant: coverage / extraction / RAG intent / help routing."""

from __future__ import annotations

import io

import fitz
from fastapi.testclient import TestClient

from main import app
from services.work_assistant_service import (
    detect_intent,
    format_coverage_message,
    build_coverage_summary,
)

client = TestClient(app)


def _admin_headers(client_id: str = "c1") -> dict[str, str]:
    return {
        "X-Docugrid-Role": "admin",
        "X-Docugrid-User": "admin@taxx.jp",
        "X-Docugrid-Stakeholder": "actor-admin",
        "X-Docugrid-Client": client_id,
    }


def _minimal_pdf_bytes() -> bytes:
    doc = fitz.open()
    doc.new_page()
    return doc.write()


def _text_pdf_bytes(text: str) -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    return doc.write()


def test_detect_intent_coverage() -> None:
    assert detect_intent("このクライアント資料揃ってる？") == "coverage"
    assert detect_intent("不足している枠は？") == "coverage"


def test_detect_intent_extraction() -> None:
    assert detect_intent("OCRして基本情報に反映して") == "extraction_propose"
    assert detect_intent("抽出結果をマスタに載せたい") == "extraction_propose"


def test_detect_intent_help() -> None:
    assert detect_intent("自動振り分けの使い方") == "help"


def test_detect_intent_rag() -> None:
    assert detect_intent("源泉徴収票を探して", has_client=True) == "rag"
    assert detect_intent("源泉徴収票を探して", has_client=False) == "help"


def test_assistant_chat_help() -> None:
    r = client.post(
        "/api/assistant/chat",
        json={"message": "Google Drive の接続方法"},
        headers=_admin_headers(),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["intent"] == "help"
    assert body["content"]
    assert body["role"] == "assistant"


def test_assistant_chat_coverage_with_slots() -> None:
    pdf = _minimal_pdf_bytes()
    up = client.post(
        "/api/slots",
        data={
            "client_id": "c1",
            "period_key": "year:1",
            "slot_id": "wa_slot_a",
            "slot_label": "決算書",
        },
        files={"file": ("a.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert up.status_code == 200, up.text
    doc_id = up.json()["id"]

    r = client.post(
        "/api/assistant/chat",
        json={
            "message": "資料揃ってる？",
            "client_id": "c1",
            "period_key": "year:1",
            "client_label": "テスト商事",
            "expected_slots": [
                {"slotId": "wa_slot_a", "label": "決算書"},
                {"slotId": "wa_slot_b", "label": "総勘定元帳"},
            ],
        },
        headers=_admin_headers(),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["intent"] == "coverage"
    cov = body["coverage"]
    assert cov is not None
    assert cov["filledCount"] == 1
    assert cov["missingCount"] == 1
    assert any(m["slotId"] == "wa_slot_b" for m in cov["missing"])

    client.delete(f"/api/slots/{doc_id}", headers=_admin_headers())


def test_assistant_chat_coverage_requires_client() -> None:
    r = client.post(
        "/api/assistant/chat",
        json={"message": "揃ってる？"},
        headers=_admin_headers(),
    )
    assert r.status_code == 200, r.text
    assert "顧問先" in r.json()["content"]


def test_assistant_chat_rag_with_upload(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr("services.rag_index_service.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("services.rag_index_service.RAG_DB_PATH", tmp_path / "rag_index.db")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    marker = "GENSENCHO_TOKEN_XYZ99"
    pdf = _text_pdf_bytes(f"withholding slip document {marker} amount 1000000")
    up = client.post(
        "/api/slots",
        data={
            "client_id": "c1",
            "period_key": "year:rag1",
            "slot_id": "wa_rag_slot",
            "slot_label": "gensen",
        },
        files={"file": ("gensen.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert up.status_code == 200, up.text
    doc_id = up.json()["id"]

    r = client.post(
        "/api/assistant/chat",
        json={
            "message": f"{marker} を探して",
            "client_id": "c1",
            "period_key": "year:rag1",
            "client_label": "テスト商事",
        },
        headers=_admin_headers(),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["intent"] == "rag"
    assert body["engine"] == "rag"
    assert body["rag"] is not None
    assert body["rag"]["count"] >= 1
    assert any(marker in (h.get("excerpt") or "") for h in body["rag"]["items"])

    client.delete(f"/api/slots/{doc_id}", headers=_admin_headers())


def test_format_coverage_message() -> None:
    msg = format_coverage_message(
        {
            "clientId": "c1",
            "periodKey": "year:1",
            "filledCount": 1,
            "missingCount": 1,
            "expectedCount": 2,
            "missing": [{"slotId": "x", "slotLabel": "元帳"}],
            "filled": [],
        },
        "テスト商事",
    )
    assert "テスト商事" in msg
    assert "元帳" in msg


def test_build_coverage_empty_expected() -> None:
    out = build_coverage_summary(
        firm_id="firm_default",
        client_id="c1",
        period_key="year:1",
        expected_slots=[],
    )
    assert out["expectedCount"] == 0
    assert out["missingCount"] == 0
