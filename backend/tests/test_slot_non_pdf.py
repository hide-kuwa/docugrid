"""Non-PDF slot upload, download Content-Type, image convert-to-pdf."""

from __future__ import annotations

import io

import fitz
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from main import app
from services.upload_file_kinds import UploadKindError, validate_upload_bytes

client = TestClient(app)


def _admin_headers(client_id: str = "c1") -> dict[str, str]:
    return {
        "X-Docugrid-Role": "admin",
        "X-Docugrid-User": "smoke-test@example.com",
        "X-Docugrid-Stakeholder": "actor-admin",
        "X-Docugrid-Client": client_id,
    }


def _staff_other_client() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "staff",
        "X-Docugrid-User": "s2@example.com",
        "X-Docugrid-Stakeholder": "actor-s2",
        "X-Docugrid-Client": "c2",
    }


def _png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (32, 24), color=(200, 80, 40)).save(buf, format="PNG")
    return buf.getvalue()


def _minimal_pdf_bytes() -> bytes:
    doc = fitz.open()
    doc.new_page()
    return doc.write()


def test_validate_upload_bytes_rejects_exe() -> None:
    with pytest.raises(UploadKindError):
        validate_upload_bytes(b"MZ\x90\x00fake", "malware.exe")


def test_validate_upload_bytes_accepts_png() -> None:
    page_count, ext = validate_upload_bytes(_png_bytes(), "scan.png")
    assert page_count is None
    assert ext == "png"


def test_slot_xlsx_upload_and_download_attachment() -> None:
    # Minimal OOXML (ZIP) signature — validate only checks PK for xlsx
    xlsx = b"PK\x03\x04" + b"\x00" * 64
    up = client.post(
        "/api/slots",
        data={
            "client_id": "c1",
            "period_key": "year:1",
            "slot_id": "slot_nonpdf_xlsx",
            "slot_label": "試算表(xlsx)",
        },
        files={
            "file": (
                "trial.xlsx",
                io.BytesIO(xlsx),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        headers=_admin_headers(),
    )
    assert up.status_code == 200, up.text
    item = up.json()
    assert item["is_pdf"] is False
    assert item["is_convertible_image"] is False
    assert "spreadsheet" in (item.get("content_type") or "")
    assert item["page_count"] is None
    doc_id = item["id"]

    dl = client.get(f"/api/slots/{doc_id}/file", headers=_admin_headers())
    assert dl.status_code == 200
    assert "spreadsheet" in dl.headers.get("content-type", "")
    cd = dl.headers.get("content-disposition", "")
    assert "attachment" in cd.lower()
    assert dl.content.startswith(b"PK")

    client.delete(f"/api/slots/{doc_id}", headers=_admin_headers())


def test_slot_png_convert_to_pdf() -> None:
    png = _png_bytes()
    up = client.post(
        "/api/slots",
        data={
            "client_id": "c1",
            "period_key": "year:1",
            "slot_id": "slot_nonpdf_png",
            "slot_label": "スキャン",
        },
        files={"file": ("scan.png", io.BytesIO(png), "image/png")},
        headers=_admin_headers(),
    )
    assert up.status_code == 200, up.text
    item = up.json()
    assert item["is_pdf"] is False
    assert item["is_convertible_image"] is True
    doc_id = item["id"]
    old_version = item.get("current_version_id")

    conv = client.post(f"/api/slots/{doc_id}/convert-to-pdf", headers=_admin_headers())
    assert conv.status_code == 200, conv.text
    after = conv.json()
    assert after["is_pdf"] is True
    assert after["is_convertible_image"] is False
    assert after["original_name"].lower().endswith(".pdf")
    assert after["page_count"] and after["page_count"] >= 1
    assert after.get("current_version_id") != old_version

    dl = client.get(f"/api/slots/{doc_id}/file", headers=_admin_headers())
    assert dl.status_code == 200
    assert dl.headers.get("content-type", "").startswith("application/pdf")
    assert dl.content.startswith(b"%PDF")
    cd = dl.headers.get("content-disposition", "")
    assert "inline" in cd.lower()

    # Original PNG still in version history
    versions = client.get(
        "/api/logical-documents/versions",
        params={
            "client_id": "c1",
            "period_key": "year:1",
            "slot_id": "slot_nonpdf_png",
        },
        headers=_admin_headers(),
    )
    assert versions.status_code == 200
    names = [v["original_name"] for v in versions.json()]
    assert any(n.lower().endswith(".png") for n in names)
    assert any(n.lower().endswith(".pdf") for n in names)

    client.delete(f"/api/slots/{doc_id}", headers=_admin_headers())


def test_slot_rejects_exe() -> None:
    r = client.post(
        "/api/slots",
        data={
            "client_id": "c1",
            "period_key": "year:1",
            "slot_id": "slot_exe",
            "slot_label": "ng",
        },
        files={"file": ("bad.exe", io.BytesIO(b"MZ\x00\x00"), "application/octet-stream")},
        headers=_admin_headers(),
    )
    assert r.status_code == 400


def test_convert_to_pdf_denied_other_client(monkeypatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")
    png = _png_bytes()
    up = client.post(
        "/api/slots",
        data={
            "client_id": "c1",
            "period_key": "year:1",
            "slot_id": "slot_nonpdf_deny",
            "slot_label": "scan",
        },
        files={"file": ("a.png", io.BytesIO(png), "image/png")},
        headers=_admin_headers("c1"),
    )
    assert up.status_code == 200, up.text
    doc_id = up.json()["id"]

    denied = client.post(
        f"/api/slots/{doc_id}/convert-to-pdf",
        headers=_staff_other_client(),
    )
    assert denied.status_code == 403, denied.text

    client.delete(f"/api/slots/{doc_id}", headers=_admin_headers("c1"))


def test_pdf_upload_still_works() -> None:
    pdf = _minimal_pdf_bytes()
    up = client.post(
        "/api/slots",
        data={
            "client_id": "c1",
            "period_key": "year:1",
            "slot_id": "slot_still_pdf",
            "slot_label": "申告書",
        },
        files={"file": ("a.pdf", io.BytesIO(pdf), "application/pdf")},
        headers=_admin_headers(),
    )
    assert up.status_code == 200, up.text
    item = up.json()
    assert item["is_pdf"] is True
    client.delete(f"/api/slots/{item['id']}", headers=_admin_headers())
