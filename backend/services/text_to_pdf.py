"""プレーンテキストから PDF を生成（文書作成の保存用）。"""

from __future__ import annotations

from pathlib import Path

import fitz

CENTER_PREFIX = ">> "
RIGHT_PREFIX = ">>> "


def _japanese_font_path() -> str | None:
    for candidate in (
        "C:/Windows/Fonts/meiryo.ttc",
        "C:/Windows/Fonts/msgothic.ttc",
        "C:/Windows/Fonts/YuGothM.ttc",
        "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ):
        if Path(candidate).exists():
            return candidate
    return None


def _parse_line(raw_line: str) -> tuple[str, str]:
    if raw_line.startswith(RIGHT_PREFIX):
        return raw_line[len(RIGHT_PREFIX) :], "right"
    if raw_line.startswith(CENTER_PREFIX):
        return raw_line[len(CENTER_PREFIX) :], "center"
    return raw_line, "left"


def _text_width(text: str, *, font_path: str | None, font_size: float) -> float:
    try:
        return float(fitz.get_text_length(text, fontfile=font_path, fontsize=font_size))
    except Exception:
        return len(text) * font_size * 0.55


def _insert_line(
    page: fitz.Page,
    *,
    y: float,
    text: str,
    align: str,
    font_path: str | None,
    font_size: float,
    margin_x: float,
    page_width: float,
) -> None:
    content = text.rstrip() or " "
    text_width = _text_width(content, font_path=font_path, font_size=font_size)
    if align == "center":
        x = max(margin_x, (page_width - text_width) / 2)
    elif align == "right":
        x = max(margin_x, page_width - margin_x - text_width)
    else:
        x = margin_x
    page.insert_text(
        (x, y),
        content,
        fontsize=font_size,
        fontfile=font_path,
    )


def text_to_pdf_bytes(text: str, *, title: str = "") -> bytes:
    doc = fitz.open()
    rect = fitz.paper_rect("a4")
    width, height = rect.width, rect.height
    margin_x = 56
    margin_y = 56
    body_font_size = 11
    center_font_size = 13
    line_height = 16
    font_path = _japanese_font_path()

    page = doc.new_page(width=width, height=height)
    y = margin_y

    if title.strip():
        _insert_line(
            page,
            y=y,
            text=title.strip(),
            align="center",
            font_path=font_path,
            font_size=center_font_size,
            margin_x=margin_x,
            page_width=width,
        )
        y += line_height * 2

    for raw_line in (text or "").splitlines():
        line, align = _parse_line(raw_line)
        font_size = center_font_size if align == "center" else body_font_size
        if y > height - margin_y:
            page = doc.new_page(width=width, height=height)
            y = margin_y
        _insert_line(
            page,
            y=y,
            text=line,
            align=align,
            font_path=font_path,
            font_size=font_size,
            margin_x=margin_x,
            page_width=width,
        )
        y += line_height

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes
