"""Shared Pydantic schemas for DocuGrid API contracts."""

from .order_payload import (
    ORDER_PAYLOAD_VERSION,
    HighlightBatchItem,
    HighlightsByPageEntry,
    NormalizedCoord,
    OrderPayload,
    OrderPayloadMeta,
    OrderedPageRef,
    PageRefFallback,
)

__all__ = [
    "ORDER_PAYLOAD_VERSION",
    "HighlightBatchItem",
    "HighlightsByPageEntry",
    "NormalizedCoord",
    "OrderPayload",
    "OrderPayloadMeta",
    "OrderedPageRef",
    "PageRefFallback",
]
