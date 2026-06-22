"""
Utilities for reordering pages within a PDF stream.
"""

from __future__ import annotations

import io
from typing import Iterable, BinaryIO, Sequence

from pypdf import PdfReader, PdfWriter


def reorder_pages(input_stream: BinaryIO, page_order: Iterable[int]) -> io.BytesIO:
    """Return a new PDF stream whose pages are ordered according to `page_order`."""
    return reorder_pages_stream(input_stream, page_order)


def reorder_pages_stream(input_stream: BinaryIO, page_order: Sequence[int]) -> io.BytesIO:
    """Reorder the provided PDF stream according to a 1-based `page_order` sequence."""
    page_indices = [int(number) for number in page_order]
    if not page_indices:
        raise ValueError("Page order must contain at least one element.")

    input_stream.seek(0)
    reader = PdfReader(input_stream)
    max_pages = len(reader.pages)

    writer = PdfWriter()

    for page_num in page_indices:
        if page_num < 1 or page_num > max_pages:
            raise ValueError(f"Page number {page_num} is out of range (1-{max_pages}).")
        writer.add_page(reader.pages[page_num - 1])

    output = io.BytesIO()
    writer.write(output)
    writer.close()
    output.seek(0)
    return output
