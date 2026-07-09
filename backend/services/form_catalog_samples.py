"""参考資料（実 PDF）とページ注釈 — 非エンジニア向け様式学習の保存。"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, TypedDict

import fitz
import requests

from services.doc_classifier import extract_page_text_from_doc
from services.form_page_scanner import classify_page

_STORAGE_ROOT = Path(__file__).resolve().parent.parent / "storage" / "form_catalog_samples"
_INDEX_PATH = _STORAGE_ROOT / "index.json"
_FILES_DIR = _STORAGE_ROOT / "files"

Region = Literal["top_right", "header", "any", "body"]


class TextMarker(TypedDict, total=False):
    id: str
    phrase: str
    region: Region
    note: str


class PageAnnotation(TypedDict, total=False):
    id: str
    page: int
    form_name: str
    form_id: str | None
    slot_label: str | None
    tax_type: str | None
    is_cover: bool
    markers: list[TextMarker]
    exclude_phrases: list[str]
    notes: str
    source_filename: str


class SampleRecord(TypedDict, total=False):
    id: str
    original_filename: str
    stored_filename: str
    page_count: int
    uploaded_at: str
    notes: str
    annotations: list[PageAnnotation]


class SampleIndex(TypedDict):
    version: int
    samples: list[SampleRecord]


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _ensure_dirs() -> None:
    _FILES_DIR.mkdir(parents=True, exist_ok=True)


def _load_index_raw() -> SampleIndex:
    _ensure_dirs()
    if not _INDEX_PATH.is_file():
        return {"version": 1, "samples": []}
    data = json.loads(_INDEX_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("sample index must be an object")
    samples = data.get("samples")
    if not isinstance(samples, list):
        raise ValueError("samples must be a list")
    return {"version": int(data.get("version") or 1), "samples": samples}


def _save_index(index: SampleIndex) -> None:
    _ensure_dirs()
    _INDEX_PATH.write_text(
        json.dumps(index, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def list_samples() -> list[dict[str, Any]]:
    return [dict(s) for s in _load_index_raw()["samples"]]


def get_sample(sample_id: str) -> SampleRecord | None:
    sid = sample_id.strip()
    for sample in _load_index_raw()["samples"]:
        if sample.get("id") == sid:
            return sample
    return None


def sample_pdf_path(sample_id: str) -> Path | None:
    sample = get_sample(sample_id)
    if not sample:
        return None
    path = _FILES_DIR / str(sample.get("stored_filename") or "")
    return path if path.is_file() else None


def read_sample_pdf_bytes(sample_id: str) -> bytes:
    path = sample_pdf_path(sample_id)
    if not path:
        raise ValueError(f"sample not found: {sample_id}")
    return path.read_bytes()


def _pdf_page_count(content: bytes) -> int:
    doc = fitz.open("pdf", content)
    try:
        return len(doc)
    finally:
        doc.close()


def add_sample(*, filename: str, content: bytes, notes: str = "") -> SampleRecord:
    _ensure_dirs()
    sample_id = uuid.uuid4().hex
    stored = f"{sample_id}.pdf"
    (_FILES_DIR / stored).write_bytes(content)
    record: SampleRecord = {
        "id": sample_id,
        "original_filename": filename or "document.pdf",
        "stored_filename": stored,
        "page_count": _pdf_page_count(content),
        "uploaded_at": _now_iso(),
        "notes": notes.strip(),
        "annotations": [],
    }
    index = _load_index_raw()
    index["samples"].append(record)
    _save_index(index)
    return record


def delete_sample(sample_id: str) -> None:
    sid = sample_id.strip()
    index = _load_index_raw()
    kept: list[SampleRecord] = []
    removed: SampleRecord | None = None
    for sample in index["samples"]:
        if sample.get("id") == sid:
            removed = sample
        else:
            kept.append(sample)
    if not removed:
        raise ValueError(f"sample not found: {sid}")
    index["samples"] = kept
    _save_index(index)
    stored = removed.get("stored_filename")
    if stored:
        path = _FILES_DIR / str(stored)
        if path.is_file():
            path.unlink()


def _normalize_markers(markers: list[dict[str, Any]] | None) -> list[TextMarker]:
    out: list[TextMarker] = []
    for raw in markers or []:
        phrase = str(raw.get("phrase") or "").strip()
        if not phrase:
            continue
        region = str(raw.get("region") or "any")
        if region not in ("top_right", "header", "any", "body"):
            region = "any"
        out.append(
            TextMarker(
                id=str(raw.get("id") or uuid.uuid4().hex[:12]),
                phrase=phrase,
                region=region,  # type: ignore[typeddict-item]
                note=str(raw.get("note") or "").strip(),
            )
        )
    return out


def upsert_page_annotation(sample_id: str, annotation: dict[str, Any]) -> PageAnnotation:
    sid = sample_id.strip()
    page = int(annotation.get("page") or 0)
    if page < 1:
        raise ValueError("page must be >= 1")
    form_name = str(annotation.get("form_name") or "").strip()
    if not form_name:
        raise ValueError("form_name is required")

    sample = get_sample(sid)
    if not sample:
        raise ValueError(f"sample not found: {sid}")
    if page > int(sample.get("page_count") or 0):
        raise ValueError("page out of range")

    entry: PageAnnotation = PageAnnotation(
        id=str(annotation.get("id") or uuid.uuid4().hex[:12]),
        page=page,
        form_name=form_name,
        form_id=(str(annotation["form_id"]).strip() if annotation.get("form_id") else None),
        slot_label=(str(annotation["slot_label"]).strip() if annotation.get("slot_label") else None),
        tax_type=(str(annotation["tax_type"]).strip() if annotation.get("tax_type") else None),
        is_cover=bool(annotation.get("is_cover")),
        markers=_normalize_markers(annotation.get("markers")),
        exclude_phrases=[
            str(x).strip() for x in (annotation.get("exclude_phrases") or []) if str(x).strip()
        ],
        notes=str(annotation.get("notes") or "").strip(),
        source_filename=str(sample.get("original_filename") or ""),
    )
    if not entry.get("markers"):
        raise ValueError("markers: at least one phrase is required")

    index = _load_index_raw()
    for idx, s in enumerate(index["samples"]):
        if s.get("id") != sid:
            continue
        anns = list(s.get("annotations") or [])
        anns = [a for a in anns if not (a.get("page") == page and a.get("id") != entry["id"])]
        replaced = False
        for ai, a in enumerate(anns):
            if a.get("id") == entry["id"]:
                anns[ai] = entry
                replaced = True
                break
        if not replaced:
            anns.append(entry)
        s["annotations"] = anns
        index["samples"][idx] = s
        _save_index(index)
        return entry
    raise ValueError(f"sample not found: {sid}")


def delete_page_annotation(sample_id: str, annotation_id: str) -> None:
    sid = sample_id.strip()
    aid = annotation_id.strip()
    index = _load_index_raw()
    for idx, s in enumerate(index["samples"]):
        if s.get("id") != sid:
            continue
        before = list(s.get("annotations") or [])
        after = [a for a in before if a.get("id") != aid]
        if len(after) == len(before):
            raise ValueError(f"annotation not found: {aid}")
        s["annotations"] = after
        index["samples"][idx] = s
        _save_index(index)
        return
    raise ValueError(f"sample not found: {sid}")


def render_sample_page_png(sample_id: str, page: int, *, scale: float = 2.0) -> bytes:
    content = read_sample_pdf_bytes(sample_id)
    doc = fitz.open("pdf", content)
    try:
        idx = page - 1
        if idx < 0 or idx >= len(doc):
            raise ValueError("page out of range")
        pix = doc[idx].get_pixmap(matrix=fitz.Matrix(scale, scale))
        return pix.tobytes("png")
    finally:
        doc.close()


def _phrases_from_text(text: str) -> tuple[list[str], list[str]]:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    phrases: list[str] = []
    seen: set[str] = set()
    for ln in lines:
        if len(ln) < 2 or ln in seen:
            continue
        seen.add(ln)
        phrases.append(ln)
    for ln in lines:
        for part in re.split(r"[\s　]+", ln):
            part = part.strip()
            if len(part) >= 2 and part not in seen:
                seen.add(part)
                phrases.append(part)
    return lines[:40], phrases[:60]


def extract_sample_page_text(
    sample_id: str,
    page: int,
    *,
    gemini_key: str | None = None,
    gemini_model: str = "gemini-2.5-flash",
    use_ai: bool = False,
) -> dict[str, Any]:
    content = read_sample_pdf_bytes(sample_id)
    doc = fitz.open("pdf", content)
    try:
        idx = page - 1
        if idx < 0 or idx >= len(doc):
            raise ValueError("page out of range")
        text, engine = extract_page_text_from_doc(doc, idx)
    finally:
        doc.close()

    lines, phrases = _phrases_from_text(text)
    result: dict[str, Any] = {
        "page": page,
        "full_text": text,
        "lines": lines,
        "phrases": phrases,
        "engine": engine,
        "ai_used": False,
    }

    sparse = len(phrases) < 3
    if (use_ai or sparse) and gemini_key:
        ai = _extract_page_phrases_gemini(content, page, gemini_key, gemini_model)
        if ai:
            ai_lines = ai.get("lines") or []
            ai_phrases = ai.get("phrases") or []
            merged_lines, merged_phrases = _phrases_from_text(
                "\n".join([text] + list(ai_lines) + list(ai_phrases))
            )
            result["lines"] = merged_lines
            result["phrases"] = merged_phrases
            result["engine"] = "gemini" if not text.strip() else f"{engine}+gemini"
            result["ai_used"] = True
            result["detected_form"] = ai.get("detected_form")
            if ai.get("full_text"):
                result["full_text"] = f"{text}\n{ai['full_text']}".strip()

    sample = get_sample(sample_id)
    if sample and text:
        cls = classify_page(text, filename=sample.get("original_filename"))
        if cls.get("form_id"):
            result["suggested_form"] = {
                "form_id": cls.get("form_id"),
                "label_ja": cls.get("label_ja"),
                "confidence": cls.get("confidence"),
            }

    return result


def _extract_page_phrases_gemini(
    content: bytes,
    page: int,
    api_key: str,
    model: str,
) -> dict[str, Any] | None:
    """スキャン PDF 向け: Gemini Vision でページ上の日本語フレーズを抽出。"""
    if not api_key:
        return None
    try:
        doc = fitz.open("pdf", content)
        idx = page - 1
        if idx < 0 or idx >= len(doc):
            doc.close()
            return None
        pix = doc[idx].get_pixmap(dpi=150)
        png = pix.tobytes("png")
        doc.close()
    except Exception:
        return None

    import base64

    b64 = base64.standard_b64encode(png).decode("ascii")
    prompt = (
        "この画像は日本の税務書類 PDF の1ページです。"
        "OCR として読み取れる日本語テキストを抽出してください。"
        "様式名（別表一・別表１など）、見出し、欄名を phrases に含めてください。"
        "JSON のみ返してください。"
    )
    schema = {
        "type": "object",
        "properties": {
            "phrases": {"type": "array", "items": {"type": "string"}},
            "lines": {"type": "array", "items": {"type": "string"}},
            "detected_form": {"type": "string"},
            "full_text": {"type": "string"},
        },
        "required": ["phrases"],
    }
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    try:
        res = requests.post(
            url,
            headers={"Content-Type": "application/json"},
            json={
                "contents": [
                    {
                        "parts": [
                            {"text": prompt},
                            {"inline_data": {"mime_type": "image/png", "data": b64}},
                        ]
                    }
                ],
                "generationConfig": {
                    "temperature": 0.1,
                    "maxOutputTokens": 1024,
                    "responseMimeType": "application/json",
                    "responseSchema": schema,
                },
            },
            timeout=60,
        )
        if res.status_code != 200:
            return None
        body = res.json()
        parts = body.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        if not parts:
            return None
        parsed = json.loads(parts[0].get("text", "{}"))
        if not isinstance(parsed, dict):
            return None
        return parsed
    except Exception:
        return None


def all_annotations() -> list[tuple[SampleRecord, PageAnnotation]]:
    out: list[tuple[SampleRecord, PageAnnotation]] = []
    for sample in _load_index_raw()["samples"]:
        for ann in sample.get("annotations") or []:
            out.append((sample, ann))
    return out
