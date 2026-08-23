"""プレーンテキストから PDF を生成（文書作成の保存用）。契約書向けに明朝・折返し・頁番号。"""

from __future__ import annotations

from pathlib import Path

import fitz

CENTER_PREFIX = ">> "
RIGHT_PREFIX = ">>> "


def _japanese_font_path() -> str | None:
    for candidate in (
        "C:/Windows/Fonts/yumin.ttf",
        "C:/Windows/Fonts/YuMincho.ttc",
        "C:/Windows/Fonts/msmincho.ttc",
        "C:/Windows/Fonts/meiryo.ttc",
        "C:/Windows/Fonts/msgothic.ttc",
        "C:/Windows/Fonts/YuGothM.ttc",
        "/System/Library/Fonts/ヒラギノ明朝 ProN.ttc",
        "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
        "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
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


def _leading_indent(text: str) -> tuple[str, str]:
    index = 0
    while index < len(text) and text[index] in {"　", " ", "\t"}:
        index += 1
    return text[:index], text[index:]


def _wrap_line(text: str, *, max_width: float, font_path: str | None, font_size: float) -> list[str]:
    """折返し後も先頭の字下げを維持する（文字間は詰めない）。"""
    if not text:
        return [" "]
    indent, body = _leading_indent(text)
    if not body:
        return [indent or " "]
    indent_width = _text_width(indent, font_path=font_path, font_size=font_size) if indent else 0.0
    body_max = max(max_width - indent_width, font_size)
    if _text_width(body, font_path=font_path, font_size=font_size) <= body_max:
        return [indent + body]
    lines: list[str] = []
    buf = ""
    for ch in body:
        trial = buf + ch
        if buf and _text_width(trial, font_path=font_path, font_size=font_size) > body_max:
            lines.append(indent + buf)
            buf = ch
        else:
            buf = trial
    if buf:
        lines.append(indent + buf)
    return lines or [indent or " "]


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


def _add_page_numbers(doc: fitz.Document, *, font_path: str | None, page_width: float, page_height: float) -> None:
    total = doc.page_count
    for index in range(total):
        page = doc[index]
        label = f"— {index + 1} —" if total == 1 else f"{index + 1} / {total}"
        width = _text_width(label, font_path=font_path, font_size=9)
        page.insert_text(
            ((page_width - width) / 2, page_height - 28),
            label,
            fontsize=9,
            fontfile=font_path,
        )


def text_to_pdf_bytes(text: str, *, title: str = "") -> bytes:
    doc = fitz.open()
    rect = fitz.paper_rect("a4")
    width, height = rect.width, rect.height
    margin_x = 56
    margin_y = 64
    body_font_size = 11
    center_font_size = 14
    line_height = 18
    max_width = width - margin_x * 2
    font_path = _japanese_font_path()

    page = doc.new_page(width=width, height=height)
    y = margin_y

    if title.strip():
        for wrapped in _wrap_line(
            title.strip(),
            max_width=max_width,
            font_path=font_path,
            font_size=center_font_size,
        ):
            _insert_line(
                page,
                y=y,
                text=wrapped,
                align="center",
                font_path=font_path,
                font_size=center_font_size,
                margin_x=margin_x,
                page_width=width,
            )
            y += line_height
        y += line_height

    for raw_line in (text or "").splitlines():
        line, align = _parse_line(raw_line)
        font_size = center_font_size if align == "center" else body_font_size
        wrapped_lines = _wrap_line(
            line,
            max_width=max_width,
            font_path=font_path,
            font_size=font_size,
        )
        for wrapped in wrapped_lines:
            if y > height - margin_y - 12:
                page = doc.new_page(width=width, height=height)
                y = margin_y
            _insert_line(
                page,
                y=y,
                text=wrapped,
                align=align,
                font_path=font_path,
                font_size=font_size,
                margin_x=margin_x,
                page_width=width,
            )
            y += line_height

    _add_page_numbers(doc, font_path=font_path, page_width=width, page_height=height)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes
