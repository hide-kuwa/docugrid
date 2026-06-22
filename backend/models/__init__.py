"""SQLAlchemy / SQLModel table definitions for MVP persistence."""

from .mvp_docugrid import Document, Highlight, Page, User

__all__ = ["User", "Document", "Page", "Highlight"]
