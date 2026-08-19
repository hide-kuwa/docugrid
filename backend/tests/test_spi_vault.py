"""SPI vault — encrypted specific personal information storage."""

from __future__ import annotations

import hashlib
from pathlib import Path

import fitz
import pytest
from fastapi.testclient import TestClient

from main import app
from services.spi_vault import (
    encrypt_bytes,
    decrypt_bytes,
    init_spi_db,
    is_spi_storage_key,
    mask_individual_number_text,
    purge_expired,
    store_encrypted_pdf,
    read_decrypted,
)
import services.spi_vault as spi_mod


@pytest.fixture()
def spi_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr(spi_mod, "STORAGE_DIR", tmp_path)
    monkeypatch.setattr(spi_mod, "SPI_DB_PATH", tmp_path / "spi_documents.db")
    monkeypatch.setenv("DOCUGRID_SECRET_ENCRYPTION_KEY", "test-spi-encryption-key-32bytes!!")
    init_spi_db()
    return tmp_path


def _pdf_bytes() -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "SPI test")
    data = doc.tobytes()
    doc.close()
    return data


def test_encrypt_roundtrip(spi_tmp):
    plain = b"hello-spi"
    token = encrypt_bytes(plain)
    assert token != plain
    assert decrypt_bytes(token) == plain


def test_mask_individual_number():
    assert "****-****-9012" in mask_individual_number_text("番号は123456789012です")
    assert mask_individual_number_text("普通の文") == "普通の文"


def test_store_and_read(spi_tmp):
    content = _pdf_bytes()
    sha = hashlib.sha256(content).hexdigest()
    doc = store_encrypted_pdf(
        firm_id="firm_default",
        client_id="c1",
        content=content,
        original_name="mynumber.pdf",
        content_sha256=sha,
        page_count=1,
        created_by="tester",
    )
    assert is_spi_storage_key(doc.storage_key)
    path = spi_tmp / doc.storage_key
    assert path.is_file()
    assert path.read_bytes() != content
    got, plain = read_decrypted("firm_default", doc.id)
    assert got.id == doc.id
    assert plain == content


def test_purge_expired(spi_tmp):
    content = _pdf_bytes()
    sha = hashlib.sha256(content).hexdigest()
    doc = store_encrypted_pdf(
        firm_id="firm_default",
        client_id="c1",
        content=content,
        original_name="old.pdf",
        content_sha256=sha,
        retention_until="2000-01-01T00:00:00",
    )
    out = purge_expired("firm_default", as_of="2020-01-01T00:00:00")
    assert out["purged_count"] == 1
    assert doc.id in out["ids"]
    assert not (spi_tmp / doc.storage_key).exists()


def test_api_policy_and_upload_download(spi_tmp, monkeypatch):
    monkeypatch.setattr("services.document_version_service.STORAGE_DIR", spi_tmp)
    client = TestClient(app)
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@taxx.jp", "password": "password", "stakeholder_id": ""},
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    policy = client.get("/api/spi/policy", headers=headers)
    assert policy.status_code == 200, policy.text
    body = policy.json()
    assert body["driveMirror"] is False
    assert body["aiClassify"] is False

    files = {"file": ("mynumber.pdf", _pdf_bytes(), "application/pdf")}
    up = client.post(
        "/api/spi/documents",
        headers=headers,
        data={"client_id": "c1", "retention_years": "7"},
        files=files,
    )
    assert up.status_code == 200, up.text
    spi_id = up.json()["id"]
    assert up.json()["encrypted"] is True

    dl = client.get(f"/api/spi/documents/{spi_id}/file", headers=headers)
    assert dl.status_code == 200, dl.text
    assert dl.content[:4] == b"%PDF"
