"""キャプチャ画像/PDF の PDF 変換（G3）。"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Tuple

from services.capture_service import get_capture_file_path, get_capture_mime


def capture_bytes_as_pdf(content: bytes, mime_type: str, file_name: str) -> Tuple[bytes, str]:
    """画像を 1 ページ PDF に変換。PDF はそのまま返す。"""
    if mime_type == "application/pdf":
        name = file_name if file_name.lower().endswith(".pdf") else f"{file_name}.pdf"
        return content, name

    try:
        from PIL import Image  # type: ignore
    except ImportError as exc:
        raise ValueError("Pillow is required to convert images to PDF") from exc

    img = Image.open(io.BytesIO(content))
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    pdf_buf = io.BytesIO()
    img.save(pdf_buf, format="PDF", resolution=150.0)
    pdf_bytes = pdf_buf.getvalue()
    base = Path(file_name).stem or "capture"
    return pdf_bytes, f"{base}.pdf"


def load_capture_as_pdf(firm_id: str, item_id: str) -> Tuple[bytes, str, str]:
    path = get_capture_file_path(firm_id, item_id)
    if not path:
        raise FileNotFoundError("Capture file not found")
    mime = get_capture_mime(firm_id, item_id) or "application/octet-stream"
    content = path.read_bytes()
    pdf_bytes, pdf_name = capture_bytes_as_pdf(content, mime, path.name.split("_", 1)[-1])
    return pdf_bytes, pdf_name, mime
