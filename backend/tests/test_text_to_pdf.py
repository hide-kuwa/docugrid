"""text_to_pdf: 明朝折返しと頁番号。"""

from services.text_to_pdf import _wrap_line, text_to_pdf_bytes


def test_text_to_pdf_bytes_valid() -> None:
    pdf = text_to_pdf_bytes(">> 契　約　書\nあいうえお" + "ん" * 80 + "\n>>> 右寄せ")
    assert pdf[:4] == b"%PDF"


def test_wrap_line_splits_long_text() -> None:
    wrapped = _wrap_line("あ" * 40, max_width=80, font_path=None, font_size=11)
    assert len(wrapped) >= 2
    assert all(not line.startswith("　") for line in wrapped)


def test_wrap_line_keeps_leading_indent() -> None:
    wrapped = _wrap_line("　" + "あ" * 40, max_width=80, font_path=None, font_size=11)
    assert len(wrapped) >= 2
    assert all(line.startswith("　") for line in wrapped)
