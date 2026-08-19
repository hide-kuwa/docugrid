"""Public (unauthenticated) PDF edit endpoints for the guest /pdf workspace.

Security notes:
- No firm/client data access — request body PDF only, response is processed bytes.
- Auth is intentionally omitted; CSRF exempt via /api/public/pdf prefix.
- Upload size is enforced (same limit as authenticated uploads).
- Page caps reduce thumbnail/render abuse.
"""

from __future__ import annotations

import base64
import io
from typing import List, Optional

import fitz
from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse, Response

from api.deps import _read_upload_content
from services.pdf_annotations import (
    add_box_annotation,
    add_check_annotation,
    add_line_annotation,
    add_text_annotation,
    delete_one_docugrid_annotation,
    draw_freehand_marker,
    find_text_annotation_at,
    parse_norm_path_json,
    path_bbox_rect,
    replace_text_annotation,
    tag_docugrid_annotation,
)

router = APIRouter(prefix="/api/public/pdf", tags=["public-pdf"])

_MAX_PUBLIC_PAGES = 200
_MAX_THUMBNAIL_PAGES = 80


async def _read_pdf(upload: UploadFile) -> bytes:
    return await _read_upload_content(upload)


def _open_pdf(content: bytes) -> fitz.Document:
    if not content:
        raise ValueError("Empty file")
    return fitz.open("pdf", content)


@router.post("/info")
async def public_pdf_info(file: UploadFile = File(...)):
    try:
        content = await _read_pdf(file)
        doc = _open_pdf(content)
        pages = len(doc)
        if pages > _MAX_PUBLIC_PAGES:
            return JSONResponse(
                status_code=400,
                content={"message": f"PDF exceeds {_MAX_PUBLIC_PAGES} pages"},
            )
        return {"page_count": pages, "pageCount": pages}
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})


@router.post("/highlight")
async def public_highlight_pdf(
    file: UploadFile = File(...),
    page: int = Form(...),
    x: float = Form(...),
    y: float = Form(...),
    w: float = Form(...),
    h: float = Form(...),
    type: str = Form("marker"),
    path_json: Optional[str] = Form(None),
    text: Optional[str] = Form(None),
    fontsize: Optional[float] = Form(None),
    text_color: Optional[str] = Form(None),
    probe_only: Optional[str] = Form(None),
    replace_text: Optional[str] = Form(None),
    origin_x: Optional[float] = Form(None),
    origin_y: Optional[float] = Form(None),
    origin_w: Optional[float] = Form(None),
    origin_h: Optional[float] = Form(None),
    include_render: Optional[str] = Form(None),
):
    try:
        content = await _read_pdf(file)
        doc = _open_pdf(content)
        if page < 0 or page >= len(doc):
            return JSONResponse(status_code=400, content={"message": "Page out of range"})
        if len(doc) > _MAX_PUBLIC_PAGES:
            return JSONResponse(
                status_code=400,
                content={"message": f"PDF exceeds {_MAX_PUBLIC_PAGES} pages"},
            )

        p = doc[page]
        page_w = p.rect.width
        page_h = p.rect.height
        abs_x = x * page_w
        abs_y = y * page_h
        abs_w = w * page_w
        abs_h = h * page_h
        rect = fitz.Rect(abs_x, abs_y, abs_x + abs_w, abs_y + abs_h)
        stroke_path = parse_norm_path_json(path_json)

        if type == "box":
            add_box_annotation(p, rect)
        elif type == "marker":
            if stroke_path:
                draw_freehand_marker(p, stroke_path)
            else:
                annot = p.add_highlight_annot(rect)
                annot.set_colors(stroke=(1, 1, 0))
                tag_docugrid_annotation(annot, "marker")
                annot.update(blend_mode="Multiply", opacity=0.2)
        elif type == "line":
            add_line_annotation(
                p,
                fitz.Point(abs_x, abs_y),
                fitz.Point(abs_x + abs_w, abs_y + abs_h),
            )
        elif type == "check":
            add_check_annotation(p, rect)
        elif type == "text":
            want_probe = probe_only and str(probe_only).lower() in ("1", "true", "yes", "on")
            if want_probe:
                hit = find_text_annotation_at(p, rect)
                return JSONResponse(content={"hit": hit})
            rgb = None
            if text_color and text_color.startswith("#") and len(text_color) >= 7:
                try:
                    rgb = (
                        int(text_color[1:3], 16) / 255.0,
                        int(text_color[3:5], 16) / 255.0,
                        int(text_color[5:7], 16) / 255.0,
                    )
                except ValueError:
                    rgb = None
            want_replace = replace_text and str(replace_text).lower() in (
                "1",
                "true",
                "yes",
                "on",
            )
            if (
                want_replace
                and origin_x is not None
                and origin_y is not None
                and origin_w is not None
                and origin_h is not None
            ):
                origin = fitz.Rect(
                    origin_x * page_w,
                    origin_y * page_h,
                    (origin_x + origin_w) * page_w,
                    (origin_y + origin_h) * page_h,
                )
                replace_text_annotation(
                    p,
                    origin,
                    rect,
                    text or "",
                    fontsize=fontsize,
                    text_color=rgb,
                )
            else:
                add_text_annotation(
                    p,
                    rect,
                    text or "",
                    fontsize=fontsize,
                    text_color=rgb,
                )
        elif type == "eraser":
            erase_rect = path_bbox_rect(p, stroke_path) if stroke_path else rect
            delete_one_docugrid_annotation(p, erase_rect)

        output_buffer = io.BytesIO()
        doc.save(output_buffer)
        pdf_bytes = output_buffer.getvalue()

        want_render = include_render and str(include_render).lower() in ("1", "true", "yes", "on")
        if want_render:
            preview_b64 = ""
            doc_r = None
            try:
                doc_r = fitz.open(stream=pdf_bytes, filetype="pdf")
                if 0 <= page < len(doc_r):
                    pr = doc_r[page]
                    pix = pr.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))
                    preview_b64 = base64.b64encode(pix.tobytes("png")).decode("utf-8")
            finally:
                if doc_r is not None:
                    doc_r.close()
            return JSONResponse(
                content={
                    "pdf_base64": base64.b64encode(pdf_bytes).decode("utf-8"),
                    "preview_png_base64": preview_b64,
                }
            )
        return Response(content=pdf_bytes, media_type="application/pdf")
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})


@router.post("/reorder")
async def public_reorder_pdf(
    file: UploadFile = File(...),
    order: str = Form(...),
):
    try:
        content = await _read_pdf(file)
        doc = _open_pdf(content)
        try:
            page_indices = [int(x.strip()) for x in order.split(",") if x.strip()]
        except ValueError:
            return JSONResponse(status_code=400, content={"message": "Invalid order format"})
        max_page = len(doc) - 1
        valid_indices = [idx for idx in page_indices if 0 <= idx <= max_page]
        if not valid_indices:
            return JSONResponse(status_code=400, content={"message": "No valid pages to reorder"})
        doc.select(valid_indices)
        output_buffer = io.BytesIO()
        doc.save(output_buffer)
        return Response(content=output_buffer.getvalue(), media_type="application/pdf")
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})


@router.post("/merge")
async def public_merge_pdfs(files: List[UploadFile] = File(...)):
    try:
        if len(files) > 20:
            return JSONResponse(status_code=400, content={"message": "Too many files"})
        merged_doc = fitz.open()
        total_pages = 0
        for file in files:
            content = await _read_pdf(file)
            doc = _open_pdf(content)
            total_pages += len(doc)
            if total_pages > _MAX_PUBLIC_PAGES:
                return JSONResponse(
                    status_code=400,
                    content={"message": f"Merged PDF exceeds {_MAX_PUBLIC_PAGES} pages"},
                )
            merged_doc.insert_pdf(doc)
        output_buffer = io.BytesIO()
        merged_doc.save(output_buffer)
        return Response(content=output_buffer.getvalue(), media_type="application/pdf")
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})


@router.post("/thumbnails")
async def public_pdf_thumbnails(file: UploadFile = File(...)):
    try:
        content = await _read_pdf(file)
        doc = _open_pdf(content)
        if len(doc) > _MAX_THUMBNAIL_PAGES:
            return JSONResponse(
                status_code=400,
                content={"message": f"PDF exceeds {_MAX_THUMBNAIL_PAGES} pages for thumbnails"},
            )
        thumbnails = []
        for page in doc:
            pix = page.get_pixmap(matrix=fitz.Matrix(0.3, 0.3))
            b64_str = base64.b64encode(pix.tobytes("png")).decode("utf-8")
            thumbnails.append(f"data:image/png;base64,{b64_str}")
        return JSONResponse(content={"thumbnails": thumbnails})
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})


@router.post("/render")
async def public_render_pdf_page(
    file: UploadFile = File(...),
    page: int = Form(...),
):
    try:
        content = await _read_pdf(file)
        doc = _open_pdf(content)
        if 0 <= page < len(doc):
            p = doc[page]
            pix = p.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))
            return Response(content=pix.tobytes("png"), media_type="image/png")
        return JSONResponse(status_code=400, content={"message": "Page out of range"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})
