# backend/PDF/editor.py
import fitz  # PyMuPDF
import io
import json

def apply_mark(file_content: bytes, x: float, y: float, tool: str, page_num: int = 0) -> bytes:
    doc = fitz.open(stream=file_content, filetype="pdf")
    if len(doc) <= page_num: raise Exception("Page not found")
    
    page = doc[page_num]
    w, h = page.rect.width, page.rect.height
    
    if tool == 'marker':
        rect_w, rect_h = 100, 20
        color = None
        fill = (1, 1, 0)
        fill_opacity = 0.4
        width = 0
    else: # box
        rect_w, rect_h = 50, 50
        color = (1, 0, 0)
        fill = None
        fill_opacity = 1
        width = 3
    
    cx, cy = x * w, y * h
    rect = fitz.Rect(cx - rect_w/2, cy - rect_h/2, cx + rect_w/2, cy + rect_h/2)
    
    page.draw_rect(rect, color=color, fill=fill, fill_opacity=fill_opacity, width=width)
        
    out = io.BytesIO()
    doc.save(out)
    return out.getvalue()

def reorder_pdf(file_content: bytes, order_json: str) -> bytes:
    doc = fitz.open(stream=file_content, filetype="pdf")
    new_order = json.loads(order_json)
    doc.select(new_order)
    out = io.BytesIO()
    doc.save(out)
    return out.getvalue()

def merge_pdfs(file_contents: list[bytes]) -> bytes:
    if not file_contents:
        raise Exception("No PDF files provided")
    merged = fitz.open()
    try:
        for content in file_contents:
            if not content:
                raise Exception("Empty PDF file provided")
            doc = fitz.open(stream=content, filetype="pdf")
            try:
                merged.insert_pdf(doc)
            finally:
                doc.close()
        out = io.BytesIO()
        merged.save(out)
        return out.getvalue()
    finally:
        merged.close()

# ★この関数が「田」ボタンのために絶対に必要です！
def get_page_count(file_content: bytes) -> int:
    doc = fitz.open(stream=file_content, filetype="pdf")
    return len(doc)
