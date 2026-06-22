"""
Utilities for merging multiple PDF streams into a single document.
"""

from __future__ import annotations

import io
from typing import Iterable, BinaryIO

from pypdf import PdfReader, PdfWriter


def merge_pdfs(pdf_streams: Iterable[BinaryIO]) -> io.BytesIO:
    """Merge the provided PDF byte streams into one PDF."""
    writer = PdfWriter()
    for stream in pdf_streams:
        stream.seek(0)
        reader = PdfReader(stream)
        for page in reader.pages:
            writer.add_page(page)

    output = io.BytesIO()
    writer.write(output)
    output.seek(0)
    return output
