"""OCR endpoint for generating searchable PDFs."""

from __future__ import annotations

import io
from typing import Final

import fitz  # PyMuPDF
import pytesseract
from fastapi import APIRouter, File, HTTPException, Response, UploadFile, status
from PIL import Image
from pypdf import PdfReader, PdfWriter
from pytesseract import TesseractError

pytesseract.pytesseract.tesseract_cmd = r'C:\Users\hidey\AppData\Local\Programs\Tesseract-OCR\tesseract.exe'

router = APIRouter()

DEFAULT_LANG: Final[str] = "jpn"


@router.post("/api/ocr")
async def handle_ocr_and_make_searchable(file: UploadFile = File(...)) -> Response:
    """Convert an image-based PDF into a searchable PDF using Tesseract."""
    if file.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF uploads are supported.",
        )

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    try:
        pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:  # noqa: BLE001 - propagate as HTTP error
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to read PDF.",
        ) from exc

    output_pdf = PdfWriter()
    final_pdf_stream: io.BytesIO | None = None

    try:
        for page_index in range(pdf_doc.page_count):
            page = pdf_doc.load_page(page_index)
            pixmap = page.get_pixmap(dpi=300)

            mode = "RGBA" if pixmap.alpha else "RGB"
            image = Image.frombytes(mode, [pixmap.width, pixmap.height], pixmap.samples)
            if mode == "RGBA":
                image = image.convert("RGB")  # pytesseract expects RGB input

            try:
                searchable_pdf_bytes = pytesseract.image_to_pdf_or_hocr(
                    image,
                    lang=DEFAULT_LANG,
                    extension="pdf",
                )
            except (RuntimeError, TesseractError) as exc:
                if "Tesseract is not installed" in str(exc):
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Tesseract is not installed or not available in PATH.",
                    ) from exc
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to process image with Tesseract.",
                ) from exc

            page_pdf = PdfReader(io.BytesIO(searchable_pdf_bytes))
            if not page_pdf.pages:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to create searchable PDF page.",
                )
            output_pdf.add_page(page_pdf.pages[0])

        final_pdf_stream = io.BytesIO()
        output_pdf.write(final_pdf_stream)
        final_pdf_stream.seek(0)
    finally:
        pdf_doc.close()
        output_pdf.close()

    if final_pdf_stream is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Searchable PDF generation failed.",
        )

    download_name = f"ocr_{file.filename or 'document.pdf'}"
    return Response(
        content=final_pdf_stream.read(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )
