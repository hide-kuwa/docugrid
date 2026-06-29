/**
 * 既定ではローカル `localPageOrder: number[]` でサムネ順（元 PDF のページ番号の並び）を保持する。
 * `syncWithDocugrid=true` のときは Zustand の pageOrder と `useDocugridPageOrderBridge` が単一の真実。
 */
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useDocugridPageOrderBridge } from "@/features/docugrid/hooks/useDocugridPageOrderBridge";
import { useDocugridStore } from "@/features/docugrid/state/docugrid-store";
import {
  appendPathPoint,
  boundsFromPath,
  isMeaningfulPath,
} from "../lib/annotation-geometry";
import { NormPoint, NormRect, ToolType } from "../types";

type AnnotatableTool = Exclude<ToolType, "none">;

interface UsePdfEditorProps {
  file: File | null;
  pdfUrl: string | null;
  viewerSession?: number;
  editorKey: string;
  pageCount: number | null;
  onRenderPage: (page: number, fileOverride?: File) => Promise<string | null>;
  onHighlight: (
    type: AnnotatableTool,
    page: number,
    rect: NormRect,
    options?: { path?: NormPoint[] },
  ) => Promise<File | { file: File; previewDataUrl: string } | void>;
  onReorder: (order: number[]) => Promise<File | void>;
  onMerge: (files: File[]) => Promise<File | void>;
  onGetThumbnails: () => Promise<string[]>;
  recordAction: (newFile: File, action: string) => void;
  /** Docugrid ストアの pageOrder とビューアを直結（ローカル pageOrder を使わない） */
  syncWithDocugrid?: boolean;
}

export const usePdfEditor = ({
  file,
  pdfUrl,
  viewerSession = 0,
  editorKey,
  pageCount,
  onRenderPage,
  onHighlight,
  onReorder,
  onMerge,
  onGetThumbnails,
  recordAction,
  syncWithDocugrid = false,
}: UsePdfEditorProps) => {

  // ========================================================================
  // 1. Ref戦略: 親から渡された関数や値をRefに閉じ込め、依存配列から排除する
  // ========================================================================
  const handlersRef = useRef({
    onRenderPage,
    onHighlight,
    onReorder,
    onMerge,
    onGetThumbnails,
    recordAction
  });

  // 常に最新のハンドラをRefに維持（レンダリングの影響を受けない）
  useEffect(() => {
    handlersRef.current = {
      onRenderPage,
      onHighlight,
      onReorder,
      onMerge,
      onGetThumbnails,
      recordAction
    };
  });

  // ファイルの実体もRefで持つ（非同期処理の中で参照するため）
  const fileRef = useRef<File | null>(file);
  useEffect(() => { fileRef.current = file; }, [file]);

  // ========================================================================
  // 2. State定義
  // ========================================================================
  const [editPageImage, setEditPageImage] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [thumbnailsReady, setThumbnailsReady] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  const currentPageRef = useRef(currentPage);
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);
  
  const [activeTool, setActiveTool] = useState<ToolType>("none");
  const [isReordering, setIsReordering] = useState(false);
  const [isSplitView, setIsSplitView] = useState(false);
  
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [comparePreviewUrl, setComparePreviewUrl] = useState<string | null>(null);
  const [localPageOrder, setLocalPageOrder] = useState<number[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);
  const [undoStack, setUndoStack] = useState<number[][]>([]);
  const [redoStack, setRedoStack] = useState<number[][]>([]);

  const docugridBridge = useDocugridPageOrderBridge(syncWithDocugrid);
  const { reorderSlots: reorderDocugridSlots } = docugridBridge;
  const docugridPageOrderLen = useDocugridStore((s) => s.pageOrder.length);
  const docugridOrderKey = docugridBridge.orderedOriginalIndices.join(",");
  /** サムネグリッド用: 各スロットが指す元 PDF の 0-based ページ番号（MainCanvas の thumbnails[pageIndex] と同型） */
  const pageOrder = syncWithDocugrid
    ? docugridBridge.orderedOriginalIndices
    : localPageOrder;

  const syncWithDocugridRef = useRef(syncWithDocugrid);
  useEffect(() => {
    syncWithDocugridRef.current = syncWithDocugrid;
  }, [syncWithDocugrid]);
  const bridgeOrderRef = useRef<number[]>([]);
  useEffect(() => {
    bridgeOrderRef.current = docugridBridge.orderedOriginalIndices;
  }, [docugridBridge.orderedOriginalIndices]);

  // 描画系State
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{x: number, y: number} | null>(null);
  const [currentRect, setCurrentRect] = useState<NormRect | null>(null);
  const [currentStrokePath, setCurrentStrokePath] = useState<NormPoint[] | null>(null);
  const rectDraftRef = useRef<NormRect | null>(null);
  const strokePathDraftRef = useRef<NormPoint[] | null>(null);
  useEffect(() => {
    rectDraftRef.current = currentRect;
  }, [currentRect]);
  useEffect(() => {
    strokePathDraftRef.current = currentStrokePath;
  }, [currentStrokePath]);
  /** API 応答待ちでも確定ストロークを重ねて見せる */
  const [pendingOverlay, setPendingOverlay] = useState<{
    tool: ToolType;
    rect: NormRect;
    path?: NormPoint[];
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const applyGenerationRef = useRef(0);

  // ========================================================================
  // 3. 統合初期化フロー (ここがループ防止の心臓部)
  // ========================================================================

  // ★統合useEffect: editorKeyが変わった時だけ、すべてのデータを読み直す
  useEffect(() => {
    let isMounted = true;

    const initializeEditor = async () => {
      // 1. ファイルがない場合のリセット
      if (!editorKey || !fileRef.current) {
        if (isMounted) {
          setEditPageImage(null);
          setThumbnails([]);
          setThumbnailsReady(false);
          setReferenceFile(null);
          setCurrentPage(0);
        }
        return;
      }

      setThumbnailsReady(false);
      // サムネイルはバックグラウンド取得（全ページ分の生成で初回表示が止まらないようにする）
      void handlersRef.current
        .onGetThumbnails()
        .then((imgs) => {
          if (!isMounted) return;
          setThumbnails(imgs);
          setThumbnailsReady(true);
          setCurrentPage((prev) => {
            const maxPage = Math.max(0, imgs.length - 1);
            return Math.min(prev, maxPage);
          });
        })
        .catch((error) => {
          console.error("Failed to load thumbnails:", error);
          if (isMounted) setThumbnailsReady(true);
        });
    };

    initializeEditor();

    return () => { isMounted = false; };
  }, [editorKey, pdfUrl]); // pdfUrl changes trigger re-init

  // 新規アップロード時のみページを先頭へ（注釈で pdfUrl だけ変わる場合は増やさない viewerSession）
  useLayoutEffect(() => {
    setCurrentPage(0);
  }, [viewerSession]);

  useEffect(() => {
    let isMounted = true;
    const loadCurrentPageImage = async () => {
      if (!fileRef.current) {
        setEditPageImage(null);
        return;
      }
      const slot = currentPage;
      const order = bridgeOrderRef.current;
      const renderPage =
        syncWithDocugridRef.current && order.length > 0 ? order[slot] ?? slot : slot;
      const img = await handlersRef.current.onRenderPage(renderPage);
      if (!isMounted) {
        if (img?.startsWith("blob:")) URL.revokeObjectURL(img);
        return;
      }
      setEditPageImage((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return img;
      });
    };
    void loadCurrentPageImage();
    return () => {
      isMounted = false;
    };
  }, [currentPage, editorKey, pdfUrl, pageCount, docugridOrderKey, docugridPageOrderLen]);

  // ページ数が変わった時だけローカルオーダーをリセット（Docugrid 同期時はストアが権威）
  useEffect(() => {
    if (pageCount && !syncWithDocugrid) {
      setLocalPageOrder(Array.from({ length: pageCount }, (_, i) => i));
      setSelectedSlots([]);
      setUndoStack([]);
      setRedoStack([]);
    }
  }, [pageCount, syncWithDocugrid]);

  const applyPageOrderChange = useCallback((updater: (current: number[]) => number[]) => {
    if (syncWithDocugrid) return;
    setLocalPageOrder((current) => {
      const next = updater(current);
      if (next.join(",") === current.join(",")) return current;
      setUndoStack((prev) => [...prev, current]);
      setRedoStack([]);
      return next;
    });
  }, [syncWithDocugrid]);

  // ========================================================================
  // 4. アクションハンドラー (依存配列は空にする)
  // ========================================================================

  const applyAnnotation = useCallback(
    async (type: ToolType, rect: NormRect, path?: NormPoint[]) => {
    const currentFile = fileRef.current;
    if (type === "none" || !currentFile) return;

    const slot = currentPageRef.current;
    const order = bridgeOrderRef.current;
    const page =
      syncWithDocugridRef.current && order.length > 0 ? order[slot] ?? slot : slot;
    const gen = ++applyGenerationRef.current;
    setPendingOverlay({
      tool: type,
      rect: { ...rect },
      path: path ? [...path] : undefined,
    });

    try {
      const result = await handlersRef.current.onHighlight(type, page, rect, {
        path,
      });
      if (!result) return;

      const newFile = result instanceof File ? result : result.file;
      const previewDataUrl = result instanceof File ? null : result.previewDataUrl;

      const actionName = {
        marker: "マーカー",
        box: "赤枠",
        line: "ライン",
        check: "チェック",
        eraser: "消しゴム",
        none: "編集",
      }[type] || "編集";

      handlersRef.current.recordAction(newFile, actionName);

      if (previewDataUrl) {
        setEditPageImage((prev) => {
          if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
          return previewDataUrl;
        });
      } else {
        const newImg = await handlersRef.current.onRenderPage(page, newFile);
        if (newImg) {
          setEditPageImage((prev) => {
            if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
            return newImg;
          });
        }
      }
    } catch (err) {
      console.error("Annotation failed:", err);
    } finally {
      if (gen === applyGenerationRef.current) {
        setPendingOverlay(null);
      }
    }
  },
  []);

  const isFreehandTool = (tool: ToolType) => tool === "marker" || tool === "eraser";

  const handleSaveReorder = useCallback(async () => {
    if (!fileRef.current) return;
    const order = syncWithDocugrid ? docugridBridge.orderedOriginalIndices : localPageOrder;
    const newFile = await handlersRef.current.onReorder(order);
    if (newFile) {
      handlersRef.current.recordAction(newFile as File, "ページ並べ替え");
      setIsReordering(false);
      setSelectedSlots([]);
      setUndoStack([]);
      setRedoStack([]);
    }
  }, [syncWithDocugrid, docugridBridge.orderedOriginalIndices, localPageOrder]);

  const onDropAppend = useCallback(async (acceptedFiles: File[]) => {
    const currentFile = fileRef.current;
    if (!currentFile || acceptedFiles.length === 0) return;
    const newFile = await handlersRef.current.onMerge([currentFile, ...acceptedFiles]);
    if (newFile) {
      handlersRef.current.recordAction(newFile as File, `PDF結合 (+${acceptedFiles.length}ファイル)`);
    }
  }, []);

  // Dropzone設定
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onDropAppend, 
    accept: { "application/pdf": [".pdf"] }, 
    multiple: true, 
    noClick: true
  });

  // ========================================================================
  // 5. その他のUIロジック (分割ビュー / 描画)
  // ========================================================================
  
  const toggleSplitView = useCallback(() => setIsSplitView(p => !p), []);

  useEffect(() => {
    if (isSplitView && referenceFile) {
      const url = URL.createObjectURL(referenceFile);
      setComparePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setComparePreviewUrl(null);
    }
  }, [isSplitView, referenceFile]);

  // Drawing Logic（Pointer + capture でドラッグが途切れにくい）
  const getNormalizedPos = (e: React.MouseEvent | React.PointerEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    return {
      x: (e.clientX - rect.left) / w,
      y: (e.clientY - rect.top) / h,
    };
  };

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (activeTool === "none" || activeTool === "check") return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsDrawing(true);
      const pos = getNormalizedPos(e);
      if (isFreehandTool(activeTool)) {
        setStartPos(pos);
        setCurrentStrokePath([pos]);
        setCurrentRect(null);
        return;
      }
      setStartPos(pos);
      setCurrentStrokePath(null);
      setCurrentRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
    },
    [activeTool],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDrawing) return;
      e.preventDefault();
      const pos = getNormalizedPos(e);
      if (isFreehandTool(activeTool)) {
        setCurrentStrokePath((prev) => appendPathPoint(prev ?? [], pos));
        return;
      }
      if (!startPos) return;
      setCurrentRect({
        x: Math.min(startPos.x, pos.x),
        y: Math.min(startPos.y, pos.y),
        w: Math.abs(pos.x - startPos.x),
        h: Math.abs(pos.y - startPos.y),
      });
    },
    [isDrawing, startPos, activeTool],
  );

  const releaseCaptureSafe = (el: HTMLDivElement, pointerId: number) => {
    try {
      if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
    } catch {
      /* ignore */
    }
  };

  const handlePointerUp = useCallback(
    async (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;

      if (activeTool === "check") {
        const pos = getNormalizedPos(e);
        const size = 0.05;
        await applyAnnotation("check", { x: pos.x - size / 2, y: pos.y - size / 2, w: size, h: size });
        return;
      }

      if (activeTool !== "none" && isDrawing) {
        releaseCaptureSafe(e.currentTarget, e.pointerId);
      }

      if (activeTool === "none" || !isDrawing) {
        setIsDrawing(false);
        setStartPos(null);
        setCurrentRect(null);
        setCurrentStrokePath(null);
        return;
      }

      const committedPath = strokePathDraftRef.current;
      const committedRect = rectDraftRef.current;
      setIsDrawing(false);
      setStartPos(null);
      setCurrentRect(null);
      setCurrentStrokePath(null);

      if (isFreehandTool(activeTool) && committedPath && isMeaningfulPath(committedPath)) {
        const rect = boundsFromPath(committedPath);
        await applyAnnotation(activeTool, rect, committedPath);
        return;
      }

      if (committedRect && (committedRect.w > 0.005 || committedRect.h > 0.005)) {
        await applyAnnotation(activeTool, committedRect);
      }
    },
    [activeTool, isDrawing, applyAnnotation],
  );

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    releaseCaptureSafe(e.currentTarget, e.pointerId);
    setIsDrawing(false);
    setStartPos(null);
    setCurrentRect(null);
    setCurrentStrokePath(null);
  }, []);

  // Drag & Drop Reordering
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const [draggingSlotIndex, setDraggingSlotIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, position: number) => {
    dragItem.current = position;
    setDraggingSlotIndex(position);
    e.dataTransfer.effectAllowed = "move";

    const card = e.currentTarget as HTMLElement;
    const thumb = card.querySelector("img");
    if (thumb) {
      const clone = thumb.cloneNode(true) as HTMLImageElement;
      clone.style.position = "fixed";
      clone.style.top = "-1000px";
      clone.style.left = "-1000px";
      clone.style.maxHeight = "140px";
      clone.style.maxWidth = "100px";
      clone.style.objectFit = "contain";
      clone.style.background = "white";
      clone.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
      document.body.appendChild(clone);
      e.dataTransfer.setDragImage(clone, clone.offsetWidth / 2, clone.offsetHeight / 2);
      requestAnimationFrame(() => clone.remove());
    } else {
      const ghost = document.createElement("div");
      ghost.style.width = "1px";
      ghost.style.height = "1px";
      ghost.style.opacity = "0";
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 0, 0);
      requestAnimationFrame(() => ghost.remove());
    }
  }, []);
  const handleDragOverSlot = useCallback((e: React.DragEvent, position: number) => {
    e.preventDefault();
    dragOverItem.current = position;
  }, []);
  const handleDropSlot = useCallback(
    (e: React.DragEvent, position: number) => {
      e.preventDefault();
      if (dragItem.current === null) return;
      const from = dragItem.current;
      const to = position;
      if (from === to) return;
      if (syncWithDocugrid) {
        reorderDocugridSlots(from, to);
      } else {
        applyPageOrderChange((prev) => {
          const next = [...prev];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          return next;
        });
      }
      setSelectedSlots((prev) => {
        if (prev.length === 0) return prev;
        return prev.map((slot) => {
          if (slot === from) return to;
          if (from < to && slot > from && slot <= to) return slot - 1;
          if (from > to && slot >= to && slot < from) return slot + 1;
          return slot;
        });
      });
      dragItem.current = to;
    },
    [syncWithDocugrid, reorderDocugridSlots, applyPageOrderChange],
  );
  const handleDragEnd = useCallback(() => {
    dragItem.current = null;
    dragOverItem.current = null;
    setDraggingSlotIndex(null);
  }, []);

  const toggleSlotSelection = useCallback((slotIndex: number) => {
    setSelectedSlots((prev) =>
      prev.includes(slotIndex) ? prev.filter((i) => i !== slotIndex) : [...prev, slotIndex]
    );
  }, []);
  const clearSlotSelection = useCallback(() => setSelectedSlots([]), []);
  const removeSelectedSlots = useCallback(() => {
    if (syncWithDocugrid) {
      useDocugridStore.getState().removePageSlotsAtIndices(selectedSlots);
    } else {
      applyPageOrderChange((prev) => prev.filter((_, idx) => !selectedSlots.includes(idx)));
    }
    setSelectedSlots([]);
  }, [syncWithDocugrid, selectedSlots, applyPageOrderChange]);
  const keepOnlySelectedSlots = useCallback(() => {
    if (syncWithDocugrid) {
      useDocugridStore.getState().keepOnlyPageSlotsAtIndices(selectedSlots);
    } else {
      applyPageOrderChange((prev) => prev.filter((_, idx) => selectedSlots.includes(idx)));
    }
    setSelectedSlots([]);
  }, [syncWithDocugrid, selectedSlots, applyPageOrderChange]);

  const canUndo = !syncWithDocugrid && undoStack.length > 0;
  const canRedo = !syncWithDocugrid && redoStack.length > 0;
  const undoPageOrder = useCallback(() => {
    if (syncWithDocugrid) return;
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const nextPrev = [...prev];
      const restored = nextPrev.pop()!;
      setRedoStack((redoPrev) => [...redoPrev, localPageOrder]);
      setLocalPageOrder(restored);
      setSelectedSlots([]);
      return nextPrev;
    });
  }, [syncWithDocugrid, localPageOrder]);
  const redoPageOrder = useCallback(() => {
    if (syncWithDocugrid) return;
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const nextPrev = [...prev];
      const restored = nextPrev.pop()!;
      setUndoStack((undoPrev) => [...undoPrev, localPageOrder]);
      setLocalPageOrder(restored);
      setSelectedSlots([]);
      return nextPrev;
    });
  }, [syncWithDocugrid, localPageOrder]);

  const pageCountSafe =
    pageCount ?? thumbnails.length ?? (syncWithDocugrid ? docugridPageOrderLen : 0);
  const canGoPrev = currentPage > 0;
  const canGoNext = pageCountSafe > 0 && currentPage < pageCountSafe - 1;
  const goPrevPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(0, prev - 1));
  }, []);
  const goNextPage = useCallback(() => {
    setCurrentPage((prev) => Math.min(Math.max(0, pageCountSafe - 1), prev + 1));
  }, [pageCountSafe]);
  const goFirstPage = useCallback(() => {
    setCurrentPage(0);
  }, []);
  const goLastPage = useCallback(() => {
    setCurrentPage(Math.max(0, pageCountSafe - 1));
  }, [pageCountSafe]);

  const selectAllSlots = useCallback(() => {
    setSelectedSlots(pageOrder.map((_, idx) => idx));
  }, [pageOrder]);

  useEffect(() => {
    setPendingOverlay(null);
  }, [currentPage]);

  return {
    editPageImage,
    activeTool,
    setActiveTool,
    isReordering,
    setIsReordering,
    isSplitView,
    toggleSplitView,
    referenceFile,
    setReferenceFile,
    comparePreviewUrl,
    pageOrder,
    selectedSlots,
    toggleSlotSelection,
    clearSlotSelection,
    removeSelectedSlots,
    keepOnlySelectedSlots,
    canUndo,
    canRedo,
    undoPageOrder,
    redoPageOrder,
    setPageOrder: setLocalPageOrder,
    thumbnails,
    thumbnailsReady,
    currentPage,
    pageCountSafe,
    canGoPrev,
    canGoNext,
    goPrevPage,
    goNextPage,
    goFirstPage,
    goLastPage,
    selectAllSlots,
    applyAnnotation,
    handleSaveReorder,
    draggingSlotIndex,
    handleDragStart,
    handleDragOverSlot,
    handleDropSlot,
    handleDragEnd,
    getRootProps,
    getInputProps,
    isDragActive,
    isDrawing,
    currentRect,
    currentStrokePath,
    pendingOverlay,
    canvasRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
};
