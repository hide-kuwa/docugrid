import { useCallback, useMemo } from "react";

import type { PageId } from "../schema/ids";
import { useDocugridStore } from "../state/docugrid-store";

/**
 * PDF ビューア（0..n-1 のスロットインデックス）と Zustand の pageOrder（PageId[]）を橋渡しする。
 * usePdfEditor のローカル number[] pageOrder を廃止し、enabled=true のときだけこのフックを単一の真実にする想定。
 */
export function useDocugridPageOrderBridge(enabled: boolean) {
  const pageOrder = useDocugridStore((s) => s.pageOrder);
  const pagesById = useDocugridStore((s) => s.pagesById);
  const reorderPages = useDocugridStore((s) => s.reorderPages);

  /** 表示スロット順の「元 PDF 内ページ番号」（API /edit/reorder の order 文字列と同型） */
  const orderedOriginalIndices = useMemo(() => {
    if (!enabled || pageOrder.length === 0) return [];
    return pageOrder.map((pid) => pagesById[pid]?.originalIndex ?? 0);
  }, [enabled, pageOrder, pagesById]);

  /** スロット from → to の HTML5 DnD / サムネ並べ替えに対応（PageId 経由で reorderPages） */
  const reorderSlots = useCallback(
    (fromSlot: number, toSlot: number) => {
      if (!enabled || fromSlot === toSlot) return;
      const a = pageOrder[fromSlot];
      const b = pageOrder[toSlot];
      if (a && b) {
        reorderPages(a, b);
      }
    },
    [enabled, pageOrder, reorderPages],
  );

  /** 現在の並びで /api/edit/reorder に渡す comma 区切り */
  const getReorderApiOrderString = useCallback(() => {
    return orderedOriginalIndices.join(",");
  }, [orderedOriginalIndices]);

  /** 単一ファイル前提: currentPage スロット → PageId */
  const getPageIdAtSlot = useCallback(
    (slotIndex: number): PageId | undefined => {
      if (!enabled) return undefined;
      return pageOrder[slotIndex];
    },
    [enabled, pageOrder],
  );

  return {
    enabled,
    pageOrderIds: pageOrder,
    orderedOriginalIndices,
    reorderSlots,
    getReorderApiOrderString,
    getPageIdAtSlot,
  };
}
