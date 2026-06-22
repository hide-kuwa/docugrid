import { ORDER_PAYLOAD_VERSION } from "../schema/constants";
import type { DocugridNormalizedState } from "../schema/normalized-state";
import type {
  HighlightBatchItem,
  OrderPayload,
  OrderPayloadMeta,
  OrderedPageRef,
} from "../schema/order-payload";

/**
 * Zustand の正規化状態からバックエンド送信用 `OrderPayload` を組み立てる。
 * - `pageOrder` の各要素に対し `OrderedPageRef` を生成し、`fallback` に fileId / originalIndex を必ず入れる。
 * - ハイライトは `highlightIdsByPageId` → `highlightsById` を経由し、該当ページのみ `highlightsByPage` に含める。
 */
export function buildOrderPayloadFromDocugridState(
  state: DocugridNormalizedState,
  meta?: OrderPayloadMeta,
): OrderPayload {
  const orderedPages: OrderedPageRef[] = [];

  for (const pageId of state.pageOrder) {
    const page = state.pagesById[pageId];
    if (!page) {
      throw new Error(`buildOrderPayload: unknown pageId ${pageId}`);
    }
    orderedPages.push({
      pageId,
      fallback: {
        fileId: page.fileId,
        originalIndex: page.originalIndex,
      },
    });
  }

  const highlightsByPage: NonNullable<OrderPayload["highlightsByPage"]> = [];
  for (const pageId of state.pageOrder) {
    const hidList = state.highlightIdsByPageId[pageId];
    if (!hidList?.length) continue;

    const items: HighlightBatchItem[] = [];
    for (const hid of hidList) {
      const h = state.highlightsById[hid];
      if (!h) continue;
      items.push({
        highlightId: h.id,
        tool: h.tool,
        rect: {
          x: h.rect.x,
          y: h.rect.y,
          w: h.rect.w,
          h: h.rect.h,
        },
      });
    }
    if (items.length > 0) {
      highlightsByPage.push({ pageId, items });
    }
  }

  return {
    version: ORDER_PAYLOAD_VERSION,
    orderedPages,
    highlightsByPage: highlightsByPage.length > 0 ? highlightsByPage : undefined,
    meta,
  };
}
