"""DocuGrid API — pdf routes."""

from __future__ import annotations

from fastapi import APIRouter

from api.router_imports import *  # noqa: F403
from api.constants import *  # noqa: F403
from api.deps import *  # noqa: F403
from api.persistence import *  # noqa: F403
from api.master_store import *  # noqa: F403
from api.session import *  # noqa: F403
from api.billing_access import *  # noqa: F403
from api.schemas import *  # noqa: F403
from api.route_helpers import *  # noqa: F403

router = APIRouter()

# --- 1. PDF情報取得 ---
@router.post("/api/pdf/info")
async def get_pdf_info(request: Request, file: UploadFile = File(...)):
    role = _require_permission(request, "document.upload")
    _require_client_scope(request, role)
    try:
        content = await file.read()
        doc = fitz.open("pdf", content)
        _log_audit_event(request, "pdf.info", "success", f"pages={len(doc)}")
        return {"page_count": len(doc), "pageCount": len(doc)}
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})

# --- 2. 編集・描画 (大幅強化) ---
@router.post("/api/highlight")
async def highlight_pdf(
    request: Request,
    file: UploadFile = File(...),
    page: int = Form(...),
    # 0.0〜1.0の正規化座標 (画面上の比率) で受け取る
    x: float = Form(...),
    y: float = Form(...),
    w: float = Form(...),
    h: float = Form(...),
    type: str = Form("marker"),  # marker, box, line, check, eraser
    # marker / eraser のフリーハンド: [{ "x": 0..1, "y": 0..1 }, ...] の JSON 配列
    path_json: Optional[str] = Form(None),
    # "1" / "true" のとき PDF に加えレンダー PNG を JSON で返し、クライアントの2往復を1回にまとめる
    include_render: Optional[str] = Form(None),
):
    role = _require_permission(request, "document.annotate")
    _require_client_scope(request, role)
    try:
        content = await file.read()
        doc = fitz.open("pdf", content)
        
        if 0 <= page < len(doc):
            p = doc[page]
            page_w = p.rect.width
            page_h = p.rect.height
            
            # 比率を実際のPDF座標に変換
            abs_x = x * page_w
            abs_y = y * page_h
            abs_w = w * page_w
            abs_h = h * page_h
            
            rect = fitz.Rect(abs_x, abs_y, abs_x + abs_w, abs_y + abs_h)
            stroke_path = parse_norm_path_json(path_json)

            if type == "box":
                add_box_annotation(p, rect)
            elif type == "marker":
                if stroke_path:
                    draw_freehand_marker(p, stroke_path)
                else:
                    annot = p.add_highlight_annot(rect)
                    annot.set_colors(stroke=(1, 1, 0))
                    tag_docugrid_annotation(annot, "marker")
                    annot.update(blend_mode="Multiply", opacity=0.2)
            elif type == "line":
                add_line_annotation(
                    p,
                    fitz.Point(abs_x, abs_y),
                    fitz.Point(abs_x + abs_w, abs_y + abs_h),
                )
            elif type == "check":
                add_check_annotation(p, rect)
            elif type == "eraser":
                erase_rect = path_bbox_rect(p, stroke_path) if stroke_path else rect
                delete_one_docugrid_annotation(p, erase_rect)

        output_buffer = io.BytesIO()
        doc.save(output_buffer)
        output_buffer.seek(0)
        pdf_bytes = output_buffer.getvalue()
        _log_audit_event(request, "pdf.highlight", "success", f"page={page} type={type}")

        want_render = include_render and str(include_render).lower() in ("1", "true", "yes", "on")
        if want_render:
            preview_b64 = ""
            doc_r = None
            try:
                doc_r = fitz.open(stream=pdf_bytes, filetype="pdf")
                if 0 <= page < len(doc_r):
                    pr = doc_r[page]
                    pix = pr.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))
                    preview_b64 = base64.b64encode(pix.tobytes("png")).decode("utf-8")
            except Exception as render_err:
                print(f"Highlight include_render preview: {render_err}")
            finally:
                if doc_r is not None:
                    doc_r.close()
            return JSONResponse(
                content={
                    "pdf_base64": base64.b64encode(pdf_bytes).decode("utf-8"),
                    "preview_png_base64": preview_b64,
                }
            )

        return Response(content=pdf_bytes, media_type="application/pdf")

    except Exception as e:
        print(f"Highlight Error: {str(e)}")
        return JSONResponse(status_code=500, content={"message": str(e)})

# --- 3. ページ並べ替え ---
@router.post("/api/edit/reorder")
async def reorder_pdf(
    request: Request,
    file: UploadFile = File(...),
    order: str = Form(...)
):
    role = _require_permission(request, "document.annotate")
    _require_client_scope(request, role)
    try:
        content = await file.read()
        doc = fitz.open("pdf", content)
        try:
            page_indices = [int(x.strip()) for x in order.split(",") if x.strip()]
        except ValueError:
            return JSONResponse(status_code=400, content={"message": "Invalid order format"})

        max_page = len(doc) - 1
        valid_indices = [idx for idx in page_indices if 0 <= idx <= max_page]
        if not valid_indices:
            return JSONResponse(status_code=400, content={"message": "No valid pages to reorder"})

        doc.select(valid_indices)
        output_buffer = io.BytesIO()
        doc.save(output_buffer)
        output_buffer.seek(0)
        _log_audit_event(request, "pdf.reorder", "success", f"order={order}")
        return Response(content=output_buffer.getvalue(), media_type="application/pdf")

    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})

# --- 4. サムネイル取得 ---
@router.post("/api/pdf/thumbnails")
async def get_pdf_thumbnails(request: Request, file: UploadFile = File(...)):
    role = _require_permission(request, "document.view")
    _require_client_scope(request, role)
    try:
        content = await file.read()
        doc = fitz.open("pdf", content)
        thumbnails = []
        for page in doc:
            pix = page.get_pixmap(matrix=fitz.Matrix(0.3, 0.3)) 
            img_data = pix.tobytes("png")
            b64_str = base64.b64encode(img_data).decode("utf-8")
            thumbnails.append(f"data:image/png;base64,{b64_str}")
        _log_audit_event(request, "pdf.thumbnails", "success", f"count={len(thumbnails)}")
        return JSONResponse(content={"thumbnails": thumbnails})
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})

# --- 5. PDF結合（OrderPayload + ファイル ID 対応） ---
@router.post("/api/edit/merge-ordered")
async def merge_pdfs_ordered(
    request: Request,
    order: str = Form(..., description="JSON string of OrderPayload (camelCase)"),
    file_ids: str = Form(..., description='JSON array of file ids, same order as "files" parts'),
    files: List[UploadFile] = File(...),
):
    """
    multipart/form-data:
    - `order`: OrderPayload の JSON 文字列（version, orderedPages, highlightsByPage など）
    - `file_ids`: `["file-uuid-1","file-uuid-2"]` 形式（`files` と同じ長さ・順序）
    - `files`: 各 file_id に対応する PDF バイナリ（フィールド名はすべて `files`）
    """
    role = _require_permission(request, "document.upload")
    _require_client_scope(request, role)
    try:
        payload = OrderPayload.model_validate_json(order)
        ids = json.loads(file_ids)
        if not isinstance(ids, list) or not all(isinstance(x, str) for x in ids):
            raise HTTPException(status_code=400, detail="file_ids must be a JSON array of strings")
        if len(ids) != len(files):
            raise HTTPException(status_code=400, detail="file_ids and files length mismatch")
        file_bytes_by_id: dict[str, bytes] = {}
        for fid, uf in zip(ids, files):
            file_bytes_by_id[fid] = await uf.read()
        merged_bytes = merge_pdf_bytes_from_order_payload(file_bytes_by_id, payload)
        hl = payload.highlights_by_page
        hl_note = f" highlight_batches={len(hl)}" if hl else ""
        _log_audit_event(
            request,
            "pdf.merge_ordered",
            "success",
            f"ordered_pages={len(payload.ordered_pages)}{hl_note}",
        )
        return Response(content=merged_bytes, media_type="application/pdf")
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})


@router.post("/api/edit/merge")
async def merge_pdfs(request: Request, files: List[UploadFile] = File(...)):
    role = _require_permission(request, "document.upload")
    _require_client_scope(request, role)
    try:
        merged_doc = fitz.open()
        for file in files:
            content = await file.read()
            doc = fitz.open("pdf", content)
            merged_doc.insert_pdf(doc)
        output_buffer = io.BytesIO()
        merged_doc.save(output_buffer)
        output_buffer.seek(0)
        _log_audit_event(request, "pdf.merge", "success", f"files={len(files)}")
        return Response(content=output_buffer.getvalue(), media_type="application/pdf")
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})

# --- 6. ページ画像レンダリング (NEW!) ---
# 編集用に高画質(matrix=2.0)で1ページだけ取得する
@router.post("/api/pdf/render")
async def render_pdf_page(
    request: Request,
    file: UploadFile = File(...),
    page: int = Form(...)
):
    role = _require_permission(request, "document.view")
    _require_client_scope(request, role)
    try:
        content = await file.read()
        doc = fitz.open("pdf", content)
        if 0 <= page < len(doc):
            p = doc[page]
            pix = p.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))
            img_data = pix.tobytes("png")
            _log_audit_event(request, "pdf.render", "success", f"page={page}")
            return Response(content=img_data, media_type="image/png")
        else:
            return JSONResponse(status_code=400, content={"message": "Page out of range"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})


# --- DocuGrid ワークスペース永続化 ---
@router.post("/api/docugrid/save")
async def docugrid_save(request: Request, body: DocugridSaveRequest):
    role = _require_permission(request, "document.annotate")
    if not (body.client_id and body.period_key and body.slot_id):
        raise HTTPException(
            status_code=400,
            detail="client_id, period_key, and slot_id are required",
        )
    _require_client_access(request, role, body.client_id, required_permission="document.annotate")
    ctx = _auth_context(request)
    try:
        out = save_workspace(
            body,
            client_id=body.client_id,
            firm_id=ctx.firm_id,
        )
        doc_id = out.get("documentId")
        if doc_id:
            _link_docugrid_to_slot(body.client_id, body.period_key, body.slot_id, str(doc_id))
        _log_audit_event(
            request,
            "docugrid.save",
            "success",
            f"documentId={doc_id} client={body.client_id} slot={body.slot_id}",
        )
        return out
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})


@router.get("/api/docugrid/load/{document_id}")
async def docugrid_load(request: Request, document_id: str):
    role = _require_permission(request, "document.view")
    workspace_client_id = resolve_docugrid_client_id(document_id)
    if not workspace_client_id:
        raise HTTPException(status_code=404, detail="Workspace not linked to a client slot")
    _require_client_access(request, role, workspace_client_id, required_permission="document.view")
    try:
        data = load_workspace(document_id)
        _log_audit_event(request, "docugrid.load", "success", f"documentId={document_id}")
        return data
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})
