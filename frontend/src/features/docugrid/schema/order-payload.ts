import { ORDER_PAYLOAD_VERSION } from "./constants";
import type { FileId, HighlightId, PageId } from "./ids";
import type { HighlightTool, NormalizedCoord } from "./entities";

export type PageRefFallback = {
  fileId: FileId;
  originalIndex: number;
};
export type OrderedPageRef = {
  pageId: PageId;
  fallback?: PageRefFallback;
};

export type HighlightBatchItem = {
  highlightId: HighlightId;
  tool: HighlightTool;
  rect: NormalizedCoord;
};

export type OrderPayloadMeta = {
  clientId?: string;
  documentVersionId?: string;
  correlationId?: string;
} & Record<string, unknown>;

/**
 * FastAPI `schemas.order_payload.OrderPayload` と JSON 形を一致させる。
 * `extensions` は OCR / BYOS 等の任意キーを許容。
 */
export type OrderPayload = {
  version: typeof ORDER_PAYLOAD_VERSION;
  orderedPages: OrderedPageRef[];
  highlightsByPage?: Array<{
    pageId: PageId;
    items: HighlightBatchItem[];
  }>;
  meta?: OrderPayloadMeta;
  extensions?: Record<string, unknown>;
};
