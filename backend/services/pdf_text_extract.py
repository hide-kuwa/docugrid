"""Extract plain text from PDF bytes for RAG ingest (no Vision)."""

from __future__ import annotations


def extract_pdf_text(content: bytes, *, max_chars: int = 120_000) -> str:
    if not content:
        return ""
    try:
        import fitz  # type: ignore

        doc = fitz.open("pdf", content)
        parts: list[str] = []
        total = 0
        for page in doc:
            text = (page.get_text("text") or "").strip()
            if not text:
                continue
            parts.append(text)
            total += len(text)
            if total >= max_chars:
                break
        out = "\n\n".join(parts).strip()
        return out[:max_chars]
    except Exception:
        return ""
