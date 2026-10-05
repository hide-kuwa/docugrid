"""スロット等へのアップロード許可種別（拡張子・MIME・軽いマジックバイト）。"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Optional

ALLOWED_EXTENSIONS = frozenset(
    {
        "pdf",
        "png",
        "jpg",
        "jpeg",
        "webp",
        "gif",
        "xlsx",
        "xls",
        "csv",
        "docx",
        "doc",
        "rtf",
    }
)

IMAGE_EXTENSIONS = frozenset({"png", "jpg", "jpeg", "webp", "gif"})
OFFICE_ZIP_EXTENSIONS = frozenset({"xlsx", "docx"})  # OOXML = ZIP

_MEDIA_TYPES: dict[str, str] = {
    "pdf": "application/pdf",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "gif": "image/gif",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xls": "application/vnd.ms-excel",
    "csv": "text/csv",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "doc": "application/msword",
    "rtf": "application/rtf",
}


class UploadKindError(ValueError):
    """Invalid or disallowed upload."""


def normalize_ext(filename: str | None) -> str:
    """Return lowercase extension without dot, or empty string."""
    if not filename:
        return ""
    name = Path(str(filename).replace("\\", "/")).name
    if "." not in name or name.startswith("."):
        return ""
    return name.rsplit(".", 1)[-1].strip().lower()


def safe_storage_ext(filename: str | None) -> str:
    """Extension for storage_key including leading dot; defaults to .bin if unknown."""
    ext = normalize_ext(filename)
    if ext in ALLOWED_EXTENSIONS:
        return f".{ext}"
    return ".bin"


def guess_media_type(filename: str | None, *, storage_key: str | None = None) -> str:
    ext = normalize_ext(filename)
    if not ext and storage_key:
        ext = normalize_ext(storage_key)
    return _MEDIA_TYPES.get(ext, "application/octet-stream")


def is_pdf_name(filename: str | None) -> bool:
    return normalize_ext(filename) == "pdf"


def is_convertible_image_name(filename: str | None) -> bool:
    return normalize_ext(filename) in IMAGE_EXTENSIONS


def is_allowed_extension(filename: str | None) -> bool:
    return normalize_ext(filename) in ALLOWED_EXTENSIONS


def content_disposition_for(filename: str | None) -> str:
    """PDF inline; others attachment so browsers do not auto-open."""
    disposition = "inline" if is_pdf_name(filename) else "attachment"
    safe = (filename or "download").replace('"', "").replace("\n", " ").replace("\r", " ")
    return f'{disposition}; filename="{safe}"'


def validate_upload_bytes(content: bytes, filename: str | None) -> tuple[Optional[int], str]:
    """
    Validate allowlisted upload.

    Returns (page_count_or_None, normalized_ext).
    Raises UploadKindError on rejection.
    """
    if not content:
        raise UploadKindError("Empty file")
    ext = normalize_ext(filename)
    if not ext:
        raise UploadKindError("Missing file extension")
    if ext not in ALLOWED_EXTENSIONS:
        raise UploadKindError(f"File type not allowed: .{ext}")

    if ext == "pdf":
        try:
            import fitz  # type: ignore

            doc = fitz.open("pdf", content)
            return len(doc), ext
        except Exception as exc:
            raise UploadKindError("Invalid PDF") from exc

    if ext in IMAGE_EXTENSIONS:
        try:
            from PIL import Image  # type: ignore

            img = Image.open(io.BytesIO(content))
            img.verify()
        except Exception as exc:
            raise UploadKindError("Invalid image") from exc
        return None, ext

    if ext in OFFICE_ZIP_EXTENSIONS:
        if not content.startswith(b"PK"):
            raise UploadKindError(f"Invalid .{ext} (expected OOXML/ZIP)")
        return None, ext

    if ext == "xls":
        # OLE Compound Document
        if not content.startswith(b"\xd0\xcf\x11\xe0"):
            raise UploadKindError("Invalid .xls")
        return None, ext

    if ext == "doc":
        if not (
            content.startswith(b"\xd0\xcf\x11\xe0")
            or content.startswith(b"{\\rtf")
        ):
            raise UploadKindError("Invalid .doc")
        return None, ext

    if ext == "rtf":
        head = content[:64].lstrip()
        if not head.startswith(b"{\\rtf"):
            raise UploadKindError("Invalid .rtf")
        return None, ext

    if ext == "csv":
        # Reject binary-looking payloads
        sample = content[:4096]
        if b"\x00" in sample:
            raise UploadKindError("Invalid .csv")
        return None, ext

    raise UploadKindError(f"File type not allowed: .{ext}")
