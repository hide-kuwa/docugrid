"""Form catalog learning / compiler tests."""

from __future__ import annotations

from pathlib import Path

import pytest

from services import form_catalog_samples as samples_mod
from services.form_catalog_compiler import (
    build_learning_vision_prompt,
    compile_catalog_from_samples,
    resolve_preset,
)


@pytest.fixture()
def isolated_samples(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    root = tmp_path / "samples"
    files = root / "files"
    files.mkdir(parents=True)
    monkeypatch.setattr(samples_mod, "_STORAGE_ROOT", root)
    monkeypatch.setattr(samples_mod, "_INDEX_PATH", root / "index.json")
    monkeypatch.setattr(samples_mod, "_FILES_DIR", files)
    return root


def test_resolve_preset_beppyo_1() -> None:
    preset = resolve_preset("別表一（一）法人税の明細書")
    assert preset is not None
    assert preset["form_id"] == "corp_tax_beppyo_1"


def test_compile_from_sample_annotations(isolated_samples: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import fitz

    from services.form_catalog import reload_form_catalog_config

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "placeholder")
    content = doc.tobytes()
    doc.close()

    sample = samples_mod.add_sample(filename="別表一_2024.pdf", content=content)
    samples_mod.upsert_page_annotation(
        sample["id"],
        {
            "page": 1,
            "form_name": "別表一（一）法人税の明細書",
            "form_id": "corp_tax_beppyo_1",
            "slot_label": "法人税申告書",
            "tax_type": "CORP_TAX_RETURN",
            "is_cover": False,
            "markers": [
                {"phrase": "別表一", "region": "top_right"},
                {"phrase": "課税標準法人税額", "region": "any"},
            ],
            "exclude_phrases": ["消費税"],
        },
    )

    saved: dict = {}

    def fake_save(cfg):  # type: ignore[no-untyped-def]
        saved["forms"] = cfg["forms"]
        return cfg

    monkeypatch.setattr("services.form_catalog_compiler.save_form_catalog_config", fake_save)
    monkeypatch.setattr(
        "services.form_catalog_compiler.load_form_catalog_config",
        lambda: {"version": 1, "defaults": {"max_scan_pages": 25}, "forms": []},
    )
    monkeypatch.setattr(
        "services.form_catalog_compiler.build_vision_prompt_snippet",
        lambda forms, max_forms=5: "BASE",
    )

    result = compile_catalog_from_samples(merge=True)
    assert result["forms_updated"] == 1
    assert "corp_tax_beppyo_1" in result["form_ids"]
    forms = saved["forms"]
    entry = next(f for f in forms if f["form_id"] == "corp_tax_beppyo_1")
    assert any("別表一" in (a.get("any_of") or []) for a in entry["anchors"])
    assert "消費税" in entry["must_not"]
    assert "参考資料から学習" in entry["notes"]

    prompt = build_learning_vision_prompt()
    assert "別表一" in prompt
    assert "別表一_2024.pdf" in prompt

    reload_form_catalog_config()


def test_api_sample_upload_text_compile(fresh_client, monkeypatch: pytest.MonkeyPatch) -> None:
    import fitz

    from fastapi.testclient import TestClient

    saved: dict = {}

    def fake_save(cfg):  # type: ignore[no-untyped-def]
        saved["cfg"] = cfg
        return cfg

    monkeypatch.setattr("services.form_catalog_compiler.save_form_catalog_config", fake_save)

    client: TestClient = fresh_client
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "別表一\n法人税の明細書\n課税標準法人税額")
    pdf = doc.tobytes()
    doc.close()

    headers = {
        "X-Docugrid-Role": "platform_admin",
        "X-Docugrid-User": "platform@tax.co.jp",
        "X-Docugrid-Stakeholder": "actor-admin",
    }
    upload = client.post(
        "/api/dev/form-catalog/samples",
        headers=headers,
        files={"file": ("別表1_2024.pdf", pdf, "application/pdf")},
    )
    assert upload.status_code == 201, upload.text
    sample_id = upload.json()["id"]

    text_r = client.get(
        f"/api/dev/form-catalog/samples/{sample_id}/pages/1/text",
        headers=headers,
    )
    assert text_r.status_code == 200
    assert len(text_r.json().get("phrases") or []) >= 1

    image_r = client.get(
        f"/api/dev/form-catalog/samples/{sample_id}/pages/1/image",
        headers=headers,
    )
    assert image_r.status_code == 200
    assert image_r.headers.get("content-type") == "image/png"

    ann_r = client.put(
        f"/api/dev/form-catalog/samples/{sample_id}/annotations",
        headers=headers,
        json={
            "page": 1,
            "form_name": "別表一（一）法人税の明細書",
            "form_id": "corp_tax_beppyo_1",
            "slot_label": "法人税申告書",
            "tax_type": "CORP_TAX_RETURN",
            "markers": [
                {"phrase": "別表一", "region": "top_right"},
                {"phrase": "課税標準法人税額", "region": "any"},
            ],
        },
    )
    assert ann_r.status_code == 200, ann_r.text

    compile_r = client.post("/api/dev/form-catalog/compile-from-samples", headers=headers)
    assert compile_r.status_code == 200, compile_r.text
    assert compile_r.json()["forms_updated"] >= 1
    assert "cfg" in saved

    client.delete(f"/api/dev/form-catalog/samples/{sample_id}", headers=headers)
