import io

from fastapi import APIRouter, File, Form, Response, UploadFile

from pdf_utils.reorder import reorder_pages

router = APIRouter()


@router.post("/api/reorder")
async def handle_reorder(file: UploadFile = File(...), order: str = Form(...)) -> Response:
    try:
        page_order = [int(p.strip()) for p in order.split(",")]
        input_stream = io.BytesIO(await file.read())
        processed_pdf_stream = reorder_pages(input_stream, page_order)

        return Response(content=processed_pdf_stream.read(), media_type="application/pdf")
    except Exception as exc:  # noqa: BLE001
        return Response(content=f"Error: {exc}", status_code=500)
