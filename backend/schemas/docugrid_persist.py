"""JSON payloads for POST /api/docugrid/save and GET /api/docugrid/load."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class RectPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    x: float
    y: float
    w: float
    h: float


class DocugridSaveRequest(BaseModel):
    """Zustand から送るメタデータ（File バイナリは含まない）。"""

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    document_id: Optional[str] = Field(None, alias="documentId")
    client_id: Optional[str] = Field(None, alias="clientId")
    period_key: Optional[str] = Field(None, alias="periodKey")
    slot_id: Optional[str] = Field(None, alias="slotId")
    files_by_id: dict[str, Any] = Field(alias="filesById")
    pages_by_id: dict[str, Any] = Field(alias="pagesById")
    highlights_by_id: dict[str, Any] = Field(alias="highlightsById")
    page_order: list[str] = Field(alias="pageOrder")
    file_order: list[str] = Field(alias="fileOrder")
    highlight_ids_by_page_id: dict[str, list[str]] = Field(alias="highlightIdsByPageId")
