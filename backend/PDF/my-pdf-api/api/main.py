from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.image_converter import router as converter_router
from api.merge import router as merge_router
from api.ocr import router as ocr_router
from api.reorder import router as reorder_router
from api.thumbnail import router as thumbnail_router


def create_app() -> FastAPI:
    app = FastAPI(title="PDF Utility API")

    origins = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "https://pdf-q1s4.vercel.app",
    ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(merge_router)
    app.include_router(reorder_router)
    app.include_router(thumbnail_router)
    app.include_router(ocr_router)
    app.include_router(converter_router)

    return app


app = create_app()
