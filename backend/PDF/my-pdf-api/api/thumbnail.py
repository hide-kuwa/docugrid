import base64
import io
from typing import List

from fastapi import APIRouter, File, Response, UploadFile

from pdf_utils.thumbnailer import create_thumbnail, create_thumbnails

router = APIRouter()


@router.post("/api/thumbnail")
async def handle_thumbnail_creation(files: List[UploadFile] = File(...)):
    try:
        thumbnails_base64 = []

        for file in files:
            pdf_stream = io.BytesIO(await file.read())
            thumbnail_stream = create_thumbnail(pdf_stream)
            encoded_string = base64.b64encode(thumbnail_stream.read()).decode("utf-8")
            thumbnails_base64.append(f"data:image/png;base64,{encoded_string}")

        return {"thumbnails": thumbnails_base64}
    except Exception as exc:  # noqa: BLE001
        return Response(content=f"Error: {exc}", status_code=500)


@router.post("/api/pdf/thumbnails")
async def handle_pdf_thumbnail_creation(files: List[UploadFile] = File(...)):
    try:
        thumbnails_base64: List[List[str]] = []

        for file in files:
            pdf_stream = io.BytesIO(await file.read())
            thumbnails = create_thumbnails(pdf_stream)
            encoded_pages = [
                f"data:image/png;base64,{base64.b64encode(thumbnail.read()).decode('utf-8')}"
                for thumbnail in thumbnails
            ]
            thumbnails_base64.append(encoded_pages)

        return {"thumbnails": thumbnails_base64}
    except Exception as exc:  # noqa: BLE001
        return Response(content=f"Error: {exc}", status_code=500)
