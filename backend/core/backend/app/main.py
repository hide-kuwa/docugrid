from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from . import accounts, auth, database, journals, models, reports, seed
from .config import settings

models.Base.metadata.create_all(bind=database.engine)

app = FastAPI()

app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(journals.router)
app.include_router(reports.router)

frontend_origin = settings.frontend_base_url.rstrip("/")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    with database.SessionLocal() as db:
        seed.init_db(db)


@app.get("/")
def read_root() -> dict[str, str]:
    return {"Hello": "Authenticated World"}


@app.get("/api/db-test")
def test_db_connection(db: Session = Depends(database.get_db)) -> dict[str, str]:
    try:
        db.execute(text("SELECT 1"))
        return {"status": "success", "message": "Database connection is successful!"}
    except Exception as exc:  # pragma: no cover - defensive
        return {"status": "error", "message": f"Database connection failed: {exc}"}
