import io
from typing import List

from fastapi import APIRouter, File, Response, UploadFile

from pdf_utils.converter import convert_images_to_pdf

router = APIRouter()


@router.post("/api/convert-images")
async def handle_image_conversion(files: List[UploadFile] = File(...)) -> Response:
    try:
        image_streams = [io.BytesIO(await file.read()) for file in files]
        pdf_stream = convert_images_to_pdf(image_streams)

        if pdf_stream is None:
            return Response(content="No valid images provided", status_code=400)

        return Response(
            content=pdf_stream.read(),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=converted.pdf"},
        )
    except Exception as exc:  # noqa: BLE001
        return Response(content=f"Error: {exc}", status_code=500)
