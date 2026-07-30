"""様式カタログ → 本番分類（マトリクス / 申告パッケージ）のブリッジ。"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from services.form_page_scanner import scan_pdf_pages
from services.tax_document_types import (
    label_for_type,
    normalize_type,
    slot_id_for_type,
)


def _maps_to_tax_type(maps_to: Optional[dict]) -> str:
    if not maps_to:
        return "UNKNOWN"
    return normalize_type(str(maps_to.get("tax_type") or "UNKNOWN"))


def segment_to_batch_document(seg: dict[str, Any], filename: str) -> dict[str, Any]:
    maps_to = seg.get("maps_to") if isinstance(seg.get("maps_to"), dict) else {}
    tax_type = _maps_to_tax_type(maps_to)
    start = int(seg.get("start_page") or 0)
    end = int(seg.get("end_page") or start)
    reasons = []
    if start:
        reasons.append(f"p.{start}" + (f"–{end}" if end > start else ""))
    if seg.get("label_ja"):
        reasons.append(str(seg["label_ja"]))
    return {
        "fileName": filename,
        "sourceFileName": filename,
        "identifiedType": tax_type,
        "confidence": float(seg.get("confidence") or 0),
        "reason": " · ".join(reasons) if reasons else str(seg.get("form_id") or ""),
        "engine": "form_catalog",
        "slotId": slot_id_for_type(tax_type),
        "label": label_for_type(tax_type),
        "formId": seg.get("form_id"),
        "startPage": start or None,
        "endPage": end or None,
    }


def _should_use_catalog_scan(scan: dict[str, Any]) -> bool:
    segments = scan.get("package_forms") or []
    if len(segments) >= 2:
        return True
    page_count = int(scan.get("page_count_scanned") or 0)
    if len(segments) == 1 and page_count > 1:
        return True
    if len(segments) == 1 and float(segments[0].get("confidence") or 0) >= 0.4:
        return True
    return False


def classify_pdf_for_tax_package(
    content: bytes,
    filename: Optional[str],
    *,
    vision_classify: Callable[[], dict[str, Any]],
) -> list[dict[str, Any]]:
    """1 PDF → 1件以上の申告パッケージ行（束 PDF は様式ごとに展開）。"""
    fname = filename or "document.pdf"
    scan = scan_pdf_pages(content, filename=fname)
    segments = scan.get("package_forms") or []

    if _should_use_catalog_scan(scan) and segments:
        return [segment_to_batch_document(seg, fname) for seg in segments]

    result = vision_classify()
    doc_type = normalize_type(str(result.get("identifiedType") or "UNKNOWN"))
    return [
        {
            "fileName": fname,
            "sourceFileName": fname,
            "identifiedType": doc_type,
            "confidence": float(result.get("confidence") or 0),
            "reason": result.get("reason"),
            "engine": str(result.get("engine") or "none"),
            "slotId": slot_id_for_type(doc_type),
            "label": label_for_type(doc_type),
            "formId": None,
            "startPage": None,
            "endPage": None,
        }
    ]


def _pick_catalog_segment(scan: dict[str, Any]) -> Optional[dict[str, Any]]:
    for seg in scan.get("package_forms") or []:
        return seg
    best: Optional[dict[str, Any]] = None
    best_conf = 0.0
    for page in scan.get("pages") or []:
        if not page.get("form_id") or page.get("role") == "skip":
            continue
        conf = float(page.get("confidence") or 0)
        if conf > best_conf:
            best_conf = conf
            best = {
                "form_id": page.get("form_id"),
                "label_ja": page.get("label_ja"),
                "confidence": conf,
                "maps_to": page.get("maps_to"),
                "start_page": page.get("page"),
                "end_page": page.get("page"),
                "reasons": page.get("reasons") or [],
            }
    return best


def try_catalog_slot_classify(
    content: bytes,
    filename: Optional[str],
    candidates: List[Dict[str, str]],
    *,
    max_pages: int = 15,
) -> Optional[Dict[str, object]]:
    """マトリクス自動振り分け: 様式カタログでスロット候補を推定。"""
    if not candidates:
        return None

    scan = scan_pdf_pages(content, filename=filename, max_pages=max_pages)
    seg = _pick_catalog_segment(scan)
    if not seg or float(seg.get("confidence") or 0) < 0.35:
        return None

    maps_to = seg.get("maps_to") if isinstance(seg.get("maps_to"), dict) else {}
    from services.document_types import resolve_type_id_from_maps_to

    resolved_type_id = resolve_type_id_from_maps_to(maps_to)
    slot_label = str(maps_to.get("slot_label") or "").strip()
    form_label = str(seg.get("label_ja") or "").strip()
    labels_to_try = [x for x in (slot_label, form_label) if x]

    match = None
    if resolved_type_id:
        for candidate in candidates:
            cid = str(candidate.get("id") or "").strip()
            if cid == resolved_type_id:
                match = candidate
                break
    if not match:
        for candidate in candidates:
            clabel = str(candidate.get("label") or "").strip()
            if clabel in labels_to_try:
                match = candidate
                break
    if not match:
        for candidate in candidates:
            clabel = str(candidate.get("label") or "").strip()
            if any(t in clabel or clabel in t for t in labels_to_try if t):
                match = candidate
                break
    if not match:
        return None

    start = int(seg.get("start_page") or 0)
    page_hint = f"p.{start}" if start else ""
    reason_parts = list(seg.get("reasons") or [])
    if page_hint:
        reason_parts.insert(0, page_hint)

    confidence = min(1.0, float(seg.get("confidence") or 0) + 0.1)
    return {
        "best": {
            "id": match.get("id", match.get("label", "")),
            "label": match.get("label", ""),
            "score": 99,
            "matched": ["form_catalog", str(seg.get("form_id") or "")],
        },
        "confidence": round(confidence, 3),
        "reason": " · ".join(reason_parts)[:200] or str(seg.get("form_id") or ""),
        "engine": "form_catalog",
        "form_id": seg.get("form_id"),
        "start_page": start or None,
    }
