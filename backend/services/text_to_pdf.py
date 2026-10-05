"""プレーンテキストから PDF を生成（文書作成の保存用）。契約書向けに折返し・頁番号。

CJK は page.insert_font + fontname で埋め込む。
fontfile だけ渡すと Helvetica に落ちて日本語が · だらけになる。
"""

from __future__ import annotations

from pathlib import Path

import fitz

CENTER_PREFIX = ">> "
RIGHT_PREFIX = ">>> "
_JP_FONTNAME = "docugridjp"

# TTC 優先（Identity-H 埋め込みできるもの）。yumin.ttf の fontfile 直指定は使わない。
_FONT_CANDIDATES = (
    "C:/Windows/Fonts/msgothic.ttc",
    "C:/Windows/Fonts/msmincho.ttc",
    "C:/Windows/Fonts/meiryo.ttc",
    "C:/Windows/Fonts/YuGothM.ttc",
    "/System/Library/Fonts/ヒラギノ明朝 ProN.ttc",
    "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
    "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
)


def _japanese_font_path() -> str | None:
    for candidate in _FONT_CANDIDATES:
        if Path(candidate).exists():
            return candidate
    return None


def _register_jp_font(page: fitz.Page, font_path: str | None) -> str | None:
    if not font_path:
        return None
    try:
        page.insert_font(fontname=_JP_FONTNAME, fontfile=font_path)
        return _JP_FONTNAME
    except Exception:
        return None


def _parse_line(raw_line: str) -> tuple[str, str]:
    if raw_line.startswith(RIGHT_PREFIX):
        return raw_line[len(RIGHT_PREFIX) :], "right"
    if raw_line.startswith(CENTER_PREFIX):
        return raw_line[len(CENTER_PREFIX) :], "center"
    return raw_line, "left"


def _text_width(text: str, *, font_path: str | None, font_size: float) -> float:
    try:
        if font_path:
            return float(fitz.get_text_length(text, fontfile=font_path, fontsize=font_size))
        return float(fitz.get_text_length(text, fontsize=font_size))
    except Exception:
        # CJK 概算（全角幅）
        return sum(font_size if ord(ch) > 0x2E80 else font_size * 0.5 for ch in text)


def _leading_indent(text: str) -> tuple[str, str]:
    index = 0
    while index < len(text) and text[index] in {"　", " ", "\t"}:
        index += 1
    return text[:index], text[index:]


def _wrap_line(text: str, *, max_width: float, font_path: str | None, font_size: float) -> list[str]:
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
    fontname: str | None,
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
    kwargs: dict = {"fontsize": font_size}
    if fontname:
        kwargs["fontname"] = fontname
    page.insert_text((x, y), content, **kwargs)


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
    fontname = _register_jp_font(page, font_path)
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
                fontname=fontname,
                font_size=center_font_size,
                margin_x=margin_x,
                page_width=width,
            )
            y += line_height
        y += line_height

    for raw_line in (text or "").splitlines():
        line, align = _parse_line(raw_line)
        font_size = center_font_size if align == "center" else body_font_size
        for wrapped in _wrap_line(line, max_width=max_width, font_path=font_path, font_size=font_size):
            if y > height - margin_y - 12:
                page = doc.new_page(width=width, height=height)
                fontname = _register_jp_font(page, font_path)
                y = margin_y
            _insert_line(
                page,
                y=y,
                text=wrapped,
                align=align,
                font_path=font_path,
                fontname=fontname,
                font_size=font_size,
                margin_x=margin_x,
                page_width=width,
            )
            y += line_height

    total = doc.page_count
    for index in range(total):
        p = doc[index]
        fname = _register_jp_font(p, font_path)
        label = f"— {index + 1} —" if total == 1 else f"{index + 1} / {total}"
        label_w = _text_width(label, font_path=font_path, font_size=9)
        kwargs: dict = {"fontsize": 9}
        if fname:
            kwargs["fontname"] = fname
        p.insert_text(((width - label_w) / 2, height - 28), label, **kwargs)

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes
