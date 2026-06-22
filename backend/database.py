"""SQLite engine, session, and bootstrap user for DocuGrid MVP persistence."""

from __future__ import annotations

import json
from contextlib import contextmanager
from pathlib import Path
from typing import Generator
from uuid import UUID

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine, select

from models.mvp_docugrid import Document, Highlight, Page, User

STORAGE_DIR = Path("storage")
STORAGE_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_URL = f"sqlite:///{STORAGE_DIR / 'docugrid.db'}"
engine = create_engine(DATABASE_URL, echo=False)

MVP_USER_ID = UUID("00000000-0000-4000-8000-000000000001")
MVP_USER_EMAIL = "mvp@docugrid.local"


def _migrate_document_tenant_columns() -> None:
    with engine.connect() as conn:
        for col in ("client_id", "firm_id"):
            try:
                conn.execute(text(f"ALTER TABLE documents ADD COLUMN {col} TEXT"))
                conn.commit()
            except Exception:
                conn.rollback()


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _migrate_document_tenant_columns()
    with Session(engine) as session:
        u = session.get(User, MVP_USER_ID)
        if u is None:
            session.add(
                User(
                    id=MVP_USER_ID,
                    email=MVP_USER_EMAIL,
                    role="admin",
                    stakeholder_id=None,
                    hashed_password=None,
                )
            )
            session.commit()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


def delete_document_children(session: Session, document_id: UUID) -> None:
    pages = session.exec(select(Page).where(Page.document_id == document_id)).all()
    for p in pages:
        highlights = session.exec(select(Highlight).where(Highlight.page_id == p.id)).all()
        for h in highlights:
            session.delete(h)
        session.delete(p)
