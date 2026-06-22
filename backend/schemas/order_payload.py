"""
OrderPayload — mirrors frontend `features/docugrid/schema/order-payload.ts`.

JSON uses camelCase; Python fields use snake_case with Field(alias=...).
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

# Must match frontend ORDER_PAYLOAD_VERSION (TypeScript).
ORDER_PAYLOAD_VERSION: Literal[1] = 1

HighlightToolType = Literal["marker", "box", "line", "check"]


class NormalizedCoord(BaseModel):
    """PDF page rectangle in normalized 0..1 coordinates (matches highlight API)."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    x: float
    y: float
    w: float
    h: float


class PageRefFallback(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    file_id: str = Field(alias="fileId")
    original_index: int = Field(alias="originalIndex")


class OrderedPageRef(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    page_id: str = Field(alias="pageId")
    fallback: Optional[PageRefFallback] = None


class HighlightBatchItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    highlight_id: str = Field(alias="highlightId")
    tool: HighlightToolType
    rect: NormalizedCoord


class HighlightsByPageEntry(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    page_id: str = Field(alias="pageId")
    items: list[HighlightBatchItem]


class OrderPayloadMeta(BaseModel):
    """Optional correlation metadata; unknown keys are preserved."""

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    client_id: Optional[str] = Field(default=None, alias="clientId")
    document_version_id: Optional[str] = Field(default=None, alias="documentVersionId")
    correlation_id: Optional[str] = Field(default=None, alias="correlationId")


class OrderPayload(BaseModel):
    """
    Front-end / back-end contract for merge, reorder, and batch highlight pipelines.
    `extensions` accepts arbitrary top-level keys for OCR, BYOS, etc.
    """

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    version: Literal[1]
    ordered_pages: list[OrderedPageRef] = Field(alias="orderedPages")
    highlights_by_page: Optional[list[HighlightsByPageEntry]] = Field(default=None, alias="highlightsByPage")
    meta: Optional[OrderPayloadMeta] = None
    extensions: Optional[dict[str, Any]] = None
