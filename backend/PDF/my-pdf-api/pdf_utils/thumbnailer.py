"""
Utilities for generating page thumbnails from PDF streams.
"""

from __future__ import annotations

import io
from typing import BinaryIO, List

import fitz  # PyMuPDF
from PIL import Image


def create_thumbnail(pdf_stream: BinaryIO, dpi: int = 96) -> io.BytesIO:
    """Return a PNG thumbnail (as BytesIO) for the first page of a PDF."""
    pdf_bytes = pdf_stream.read()

    with fitz.open(stream=pdf_bytes, filetype="pdf") as pdf_doc:
        if pdf_doc.page_count == 0:
            raise ValueError("PDF must contain at least one page.")

        page = pdf_doc.load_page(0)
        pix = page.get_pixmap(dpi=dpi)

    if pix.alpha:
        pix = fitz.Pixmap(fitz.csRGB, pix)

    image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    output = io.BytesIO()
    image.save(output, format="PNG")
    output.seek(0)
    return output


def create_thumbnails(pdf_stream: BinaryIO, dpi: int = 96) -> List[io.BytesIO]:
    """Return PNG thumbnails for every page in the PDF."""
    pdf_bytes = pdf_stream.read()

    thumbnails: List[io.BytesIO] = []
    with fitz.open(stream=pdf_bytes, filetype="pdf") as pdf_doc:
        if pdf_doc.page_count == 0:
            raise ValueError("PDF must contain at least one page.")

        for page_index in range(pdf_doc.page_count):
            page = pdf_doc.load_page(page_index)
            pix = page.get_pixmap(dpi=dpi)
            if pix.alpha:
                pix = fitz.Pixmap(fitz.csRGB, pix)

            image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            output = io.BytesIO()
            image.save(output, format="PNG")
            output.seek(0)
            thumbnails.append(output)

    return thumbnails
