"""PDF をページ単位で様式カタログと照合する（ルールベース v1）。"""

from __future__ import annotations

import re
from typing import Any, Optional

import unicodedata

import fitz

from services.doc_classifier import extract_page_text_from_doc
from services.form_catalog import FormCatalogEntry, load_form_catalog_config

# 縦書き対応: 空白・改行を落とした「圧縮版」テキストとも照合する。
# 縦書きの「別表一」は抽出時に "別\n表\n一" のように 1 文字ずつ分割されやすい。
_WHITESPACE_RE = re.compile(r"\s+")


def _top_right_vertical_text(page: "fitz.Page") -> str:
    """右上に縦書きで書かれた様式名（別表一 等）を縦書き読み順で再構成する。

    既定の get_text() は縦書きだと文字順が崩れ、隣の縦列と混ざりやすい。
    右上領域の文字を「列ごとに右→左、各列は上→下」で並べ直し、
    "別表一" のような連なりを保った文字列にする。
    """
    try:
        rect = page.rect
        width = float(rect.width) or 1.0
        height = float(rect.height) or 1.0
        raw = page.get_text("rawdict") or {}
    except Exception:
        return ""

    x_min = width * 0.5
    y_max = height * 0.5
    chars: list[tuple[float, float, str]] = []
    for block in raw.get("blocks") or []:
        for line in block.get("lines") or []:
            for span in line.get("spans") or []:
                for ch in span.get("chars") or []:
                    c = str(ch.get("c") or "")
                    if not c.strip():
                        continue
                    bbox = ch.get("bbox") or [0, 0, 0, 0]
                    cx = (float(bbox[0]) + float(bbox[2])) / 2.0
                    cy = (float(bbox[1]) + float(bbox[3])) / 2.0
                    if cx >= x_min and cy <= y_max:
                        chars.append((cx, cy, c))

    if not chars:
        return ""

    # 右→左に列をまとめ、各列は上→下に並べる。
    chars.sort(key=lambda t: -t[0])
    tol = width * 0.02
    columns: list[list[tuple[float, float, str]]] = []
    for cx, cy, c in chars:
        if columns and abs(columns[-1][0][0] - cx) <= tol:
            columns[-1].append((cx, cy, c))
        else:
            columns.append([(cx, cy, c)])

    lines_out: list[str] = []
    for col in columns:
        col.sort(key=lambda t: t[1])
        lines_out.append("".join(c for _, _, c in col))
    return "\n".join(lines_out)


def extract_page_texts(content: bytes, max_pages: int) -> list[dict[str, Any]]:
    """各ページのテキストを抽出。page は 1 始まり。"""
    pages: list[dict[str, Any]] = []
    try:
        doc = fitz.open("pdf", content)
    except Exception:
        return pages

    limit = min(len(doc), max(1, max_pages))
    for i in range(limit):
        text, engine = extract_page_text_from_doc(doc, i)
        # 縦書きの様式名を読み順で再構成し、先頭に付与（excerpt から切れないように）。
        vertical = ""
        if text:
            try:
                vertical = _top_right_vertical_text(doc[i])
            except Exception:
                vertical = ""
        combined = f"{vertical}\n{text}" if vertical else text
        pages.append(
            {
                "page": i + 1,
                "text": text,
                "engine": engine if text else "none",
                "excerpt": (combined or "")[:800],
            }
        )

    return pages


def _score_form_on_page(
    form: FormCatalogEntry,
    page_text: str,
    filename: Optional[str],
) -> tuple[float, list[str], list[str]]:
    haystack = page_text or ""
    haystack_norm = unicodedata.normalize("NFKC", haystack)
    haystack_compact = _WHITESPACE_RE.sub("", haystack_norm)
    fname = filename or ""
    matched: list[str] = []
    reasons: list[str] = []

    def _in_haystack(needle: str) -> bool:
        if not needle:
            return False
        if needle in haystack:
            return True
        needle_norm = unicodedata.normalize("NFKC", needle)
        if needle_norm in haystack_norm:
            return True
        # 縦書き（1 文字ずつ改行/空白区切り）に対応: 空白を除去して照合。
        needle_compact = _WHITESPACE_RE.sub("", needle_norm)
        return bool(needle_compact) and needle_compact in haystack_compact

    for neg in form.get("must_not") or []:
        if neg and _in_haystack(neg):
            return 0.0, [], [f"must_not:{neg}"]

    for hint in form.get("filename_hints") or []:
        fn_norm = unicodedata.normalize("NFKC", fname.lower())
        hint_norm = unicodedata.normalize("NFKC", hint.lower())
        if hint_norm and hint_norm in fn_norm:
            matched.append(f"filename:{hint}")

    anchor_hits = 0
    for anchor in form.get("anchors") or []:
        any_of = anchor.get("any_of") or []
        region = str(anchor.get("region") or "any")
        hit_words = [w for w in any_of if w and _in_haystack(w)]
        if hit_words:
            anchor_hits += 1
            matched.extend(hit_words[:3])
            region_label = {
                "top_right": "右上付近",
                "header": "ヘッダ",
                "any": "本文",
            }.get(region, region)
            reasons.append(f"{region_label}: {', '.join(hit_words[:2])}")

    if anchor_hits == 0 and not any(m.startswith("filename:") for m in matched):
        return 0.0, matched, reasons

    score = 0.25 * anchor_hits + 0.1 * len([m for m in matched if m.startswith("filename:")])
    score = min(1.0, score + 0.15 * len(set(matched)))
    if anchor_hits == 0 and any(m.startswith("filename:") for m in matched):
        score = max(score, 0.45)
    if (form.get("role") or "body") == "skip" and anchor_hits > 0:
        score = max(score, 0.55)
    return round(score, 3), matched, reasons


def classify_page(
    page_text: str,
    *,
    filename: Optional[str] = None,
    forms: Optional[list[FormCatalogEntry]] = None,
) -> dict[str, Any]:
    catalog = forms if forms is not None else load_form_catalog_config()["forms"]
    best_id: str | None = None
    best_label = ""
    best_score = 0.0
    best_reasons: list[str] = []
    best_matched: list[str] = []
    ranked: list[dict[str, Any]] = []

    for form in catalog:
        fid = str(form.get("form_id") or "")
        score, matched, reasons = _score_form_on_page(form, page_text, filename)
        if score <= 0:
            continue
        ranked.append(
            {
                "form_id": fid,
                "label_ja": form.get("label_ja") or fid,
                "score": score,
                "matched": matched,
                "reasons": reasons,
            }
        )
        if score > best_score:
            best_score = score
            best_id = fid
            best_label = str(form.get("label_ja") or fid)
            best_reasons = reasons
            best_matched = matched

    ranked.sort(key=lambda r: r["score"], reverse=True)
    threshold = 0.35
    if best_score < threshold:
        return {
            "form_id": None,
            "label_ja": None,
            "confidence": best_score,
            "matched": best_matched,
            "reasons": best_reasons,
            "ranked": ranked[:5],
        }

    return {
        "form_id": best_id,
        "label_ja": best_label,
        "confidence": best_score,
        "matched": best_matched,
        "reasons": best_reasons,
        "ranked": ranked[:5],
    }


def merge_page_segments(page_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = []
    for row in page_results:
        fid = row.get("form_id")
        if not fid:
            continue
        page_num = int(row.get("page") or 0)
        conf = float(row.get("confidence") or 0)
        if segments and segments[-1]["form_id"] == fid:
            segments[-1]["end_page"] = page_num
            segments[-1]["page_count"] = int(segments[-1]["page_count"]) + 1
            segments[-1]["confidence"] = max(float(segments[-1]["confidence"]), conf)
        else:
            segments.append(
                {
                    "form_id": fid,
                    "label_ja": row.get("label_ja"),
                    "start_page": page_num,
                    "end_page": page_num,
                    "page_count": 1,
                    "confidence": conf,
                    "maps_to": row.get("maps_to"),
                }
            )
    return segments


def scan_pdf_pages(
    content: bytes,
    *,
    filename: Optional[str] = None,
    max_pages: Optional[int] = None,
) -> dict[str, Any]:
    cfg = load_form_catalog_config()
    defaults = cfg.get("defaults") or {}
    limit = int(max_pages or defaults.get("max_scan_pages") or 25)
    forms = cfg["forms"]
    form_by_id = {f["form_id"]: f for f in forms if f.get("form_id")}

    raw_pages = extract_page_texts(content, limit)
    page_results: list[dict[str, Any]] = []
    for raw in raw_pages:
        cls = classify_page(raw["excerpt"], filename=filename, forms=forms)
        form_id = cls.get("form_id")
        maps_to = None
        role = None
        if form_id and form_id in form_by_id:
            entry = form_by_id[form_id]
            maps_to = entry.get("maps_to")
            role = entry.get("role")
        page_results.append(
            {
                "page": raw["page"],
                "form_id": form_id,
                "label_ja": cls.get("label_ja"),
                "role": role,
                "confidence": cls.get("confidence"),
                "engine": raw["engine"],
                "matched": cls.get("matched"),
                "reasons": cls.get("reasons"),
                "maps_to": maps_to,
                "ranked": cls.get("ranked"),
            }
        )

    segments = merge_page_segments(page_results)
    package_forms = [
        s
        for s in segments
        if s.get("form_id")
        and (form_by_id.get(str(s["form_id"])) or {}).get("role") != "skip"
    ]

    return {
        "page_count_scanned": len(raw_pages),
        "max_scan_pages": limit,
        "filename": filename,
        "pages": page_results,
        "segments": segments,
        "package_forms": package_forms,
    }
