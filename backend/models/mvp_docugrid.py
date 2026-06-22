"""
MVP 永続化用スキーマ（ログイン・権限実装前の土台）。

FK のみ定義し、Relationship は付けない（SQLAlchemy 2 / SQLModel のジェネリック解決を避ける）。
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    email: str = Field(index=True, unique=True, max_length=320)
    role: str = Field(max_length=64, description="viewer | operator | admin 等")
    stakeholder_id: Optional[str] = Field(default=None, max_length=128, index=True)
    hashed_password: Optional[str] = Field(default=None, max_length=255)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Document(SQLModel, table=True):
    __tablename__ = "documents"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    owner_user_id: UUID = Field(foreign_key="users.id", index=True)
    storage_key: str = Field(default="", max_length=1024, description="S3/Blob 等のオブジェクトキー")
    original_filename: str = Field(max_length=512)
    mime_type: str = Field(default="application/pdf", max_length=128)
    page_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    files_json: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    page_order_json: str = Field(default="[]", sa_column=Column(Text))
    client_id: Optional[str] = Field(default=None, max_length=128, index=True)
    firm_id: Optional[str] = Field(default=None, max_length=128, index=True)


class Page(SQLModel, table=True):
    __tablename__ = "pages"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    document_id: UUID = Field(foreign_key="documents.id", index=True)
    ordinal: int = Field(description="pageOrder 内の位置（0-based）")
    source_page_index: int = Field(description="元 PDF 内の 0-based ページ番号")
    storage_key: Optional[str] = Field(default=None, max_length=1024)
    frontend_page_id: str = Field(max_length=512, index=True)
    frontend_file_id: str = Field(max_length=128)
    display_key: str = Field(default="", max_length=512)


class Highlight(SQLModel, table=True):
    __tablename__ = "highlights"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    page_id: UUID = Field(foreign_key="pages.id", index=True)
    frontend_highlight_id: str = Field(default="", max_length=128, index=True)
    tool: str = Field(max_length=16, description="marker | box | line | check")
    x: float = Field(description="正規化 0..1")
    y: float = Field()
    w: float = Field()
    h: float = Field()
    z_index: int = 0
    extra_json: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: datetime = Field(default_factory=datetime.utcnow)
