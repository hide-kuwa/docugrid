"""Support assistant help KB + chat API."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from services.support_help_kb import answer_support_question, retrieve_help
from tests.test_smoke import _admin_headers

client = TestClient(app)


@pytest.fixture(autouse=True)
def enable_header_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)


def test_retrieve_saving() -> None:
    hits = retrieve_help("保存はどこにされますか")
    assert hits
    assert hits[0].id in {"saving", "faq", "google-drive"}


def test_answer_without_llm() -> None:
    out = answer_support_question("要確認キューに振り分けが残る")
    assert out["engine"] == "help_kb"
    assert out["help_doc_id"] == "auto-sort"
    assert out["citations"]


def test_support_chat_api() -> None:
    res = client.post(
        "/api/support/chat",
        headers=_admin_headers(),
        json={"message": "カルテの左側の一覧は何？", "surface_id": "support.assistant"},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["role"] == "assistant"
    assert data["content"]
    assert data["engine"] in {"help_kb", "openai+help_kb"}
