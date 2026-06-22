import io
import json
from typing import List, Optional

from fastapi import APIRouter, File, Form, Response, UploadFile
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

from pdf_utils.merger import merge_pdfs
from pdf_utils.reorder import reorder_pages_stream

MERGED_PDF_NAME = "merged.pdf"

router = APIRouter()


def apply_highlights(stream: io.BytesIO, highlight_entries: list) -> io.BytesIO:
    if not highlight_entries:
        stream.seek(0)
        return stream

    stream.seek(0)
    reader = PdfReader(stream)
    writer = PdfWriter()

    entries_by_index = {
        int(entry.get("originalIndex", 0)) - 1: entry
        for entry in highlight_entries
        if entry and entry.get("highlights")
    }

    for page_index, page in enumerate(reader.pages):
        entry = entries_by_index.get(page_index)
        drew_overlay = False

        if entry:
            width = float(page.mediabox.width)
            height = float(page.mediabox.height)

            overlay_buffer = io.BytesIO()
            overlay_canvas = canvas.Canvas(overlay_buffer, pagesize=(width, height))
            overlay_canvas.setFillColorRGB(1, 1, 0)
            overlay_canvas.setFillAlpha(0.35)

            for highlight in entry.get("highlights", []):
                try:
                    x = float(highlight.get("x", 0.0))
                    y = float(highlight.get("y", 0.0))
                    w = float(highlight.get("width", 0.0))
                    h = float(highlight.get("height", 0.0))
                except (TypeError, ValueError):
                    continue

                if w <= 0 or h <= 0:
                    continue

                left = max(0.0, min(width, x * width))
                right = max(0.0, min(width, (x + w) * width))
                top = max(0.0, min(height, (1 - y) * height))
                bottom = max(0.0, min(height, top - h * height))

                overlay_canvas.rect(left, bottom, right - left, top - bottom, fill=1, stroke=0)
                drew_overlay = True

            if drew_overlay:
                overlay_canvas.save()
                overlay_buffer.seek(0)
                overlay_reader = PdfReader(overlay_buffer)
                overlay_page = overlay_reader.pages[0]
                page.merge_page(overlay_page)

        writer.add_page(page)

    output = io.BytesIO()
    writer.write(output)
    output.seek(0)
    return output


@router.post("/api/merge")
async def handle_merge(
    files: List[UploadFile] = File(...),
    orders: Optional[str] = Form(None),
    highlights: Optional[str] = Form(None),
):
    try:
        parsed_orders: list = []
        if orders:
            try:
                parsed_orders = json.loads(orders)
            except json.JSONDecodeError:
                return Response(content="Error: invalid orders payload", status_code=400)

        parsed_highlights: Optional[list] = None
        if highlights:
            try:
                parsed_highlights = json.loads(highlights)
            except json.JSONDecodeError:
                return Response(content="Error: invalid highlights payload", status_code=400)

        pdf_streams: List[io.BytesIO] = []
        for index, file in enumerate(files):
            raw_stream = io.BytesIO(await file.read())
            file_highlights = []
            if parsed_highlights and index < len(parsed_highlights):
                file_highlights = parsed_highlights[index] or []

            processed_stream = apply_highlights(raw_stream, file_highlights)

            page_order = None
            if parsed_orders and index < len(parsed_orders):
                page_order = parsed_orders[index]

            if page_order:
                try:
                    processed_stream = reorder_pages_stream(processed_stream, page_order)
                except Exception as exc:  # noqa: BLE001
                    return Response(content=f"Error: failed to reorder pages - {exc}", status_code=400)

            processed_stream.seek(0)
            pdf_streams.append(processed_stream)

        merged_pdf_stream = merge_pdfs(pdf_streams)
        merged_bytes = merged_pdf_stream.read()

        return Response(
            content=merged_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={MERGED_PDF_NAME}"},
        )
    except Exception as exc:  # noqa: BLE001
        return Response(content=f"Error: {exc}", status_code=500)
