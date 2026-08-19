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
  constrainPointToAxis,
  isMeaningfulPath,
  smoothMarkerPath,
} from "../lib/annotation-geometry";
import { extendPageOrderAfterAppend } from "../lib/page-order-append";
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
    options?: {
      path?: NormPoint[];
      text?: string;
      fontSize?: number;
      textColor?: string;
      probeOnly?: boolean;
      replaceText?: boolean;
      originRect?: NormRect;
    },
  ) => Promise<
    | File
    | { file: File; previewDataUrl: string }
    | { hit: { x: number; y: number; w: number; h: number; text: string; fontSize: number; color: string } | null }
    | void
  >;
  onReorder: (order: number[]) => Promise<File | void>;
  onMerge: (files: File[]) => Promise<File | void>;
  onGetThumbnails: (fileOverride?: File) => Promise<string[]>;
  recordAction: (newFile: File, action: string) => void;
  popLastAction?: () => void;
  /** 親の file state を差し替え（Undo/Redo 用） */
  onReplaceFile?: (file: File) => void;
  /** Docugrid ストアの pageOrder とビューアを直結（ローカル pageOrder を使わない） */
  syncWithDocugrid?: boolean;
}

type EditSnapshot = {
  before: File;
  after: File;
  action: string;
};

const EDIT_UNDO_LIMIT = 5;
const PAGE_ORDER_UNDO_LIMIT = 5;

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
  popLastAction,
  onReplaceFile,
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
    recordAction,
    popLastAction,
    onReplaceFile,
  });

  // 常に最新のハンドラをRefに維持（レンダリングの影響を受けない）
  useEffect(() => {
    handlersRef.current = {
      onRenderPage,
      onHighlight,
      onReorder,
      onMerge,
      onGetThumbnails,
      recordAction,
      popLastAction,
      onReplaceFile,
    };
  });

  // ファイルの実体もRefで持つ（非同期処理の中で参照するため）
  const fileRef = useRef<File | null>(file);
  useEffect(() => { fileRef.current = file; }, [file]);

  // ========================================================================
  // 2. State定義
  // ========================================================================
  const [editPageImage, setEditPageImage] = useState<string | null>(null);
  const [pageImages, setPageImages] = useState<Record<number, string>>({});
  const pageImagesRef = useRef<Record<number, string>>({});
  const pageLoadInflightRef = useRef<Set<number>>(new Set());
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const thumbnailsRef = useRef<string[]>([]);
  const [thumbnailsReady, setThumbnailsReady] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  const currentPageRef = useRef(currentPage);
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    pageImagesRef.current = pageImages;
  }, [pageImages]);

  const revokePageImages = useCallback((images: Record<number, string>) => {
    for (const url of Object.values(images)) {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    }
  }, []);

  const setPageImageAt = useCallback((slot: number, img: string | null) => {
    setPageImages((prev) => {
      const existing = prev[slot];
      if (existing === img) return prev;
      if (existing?.startsWith("blob:") && existing !== img) URL.revokeObjectURL(existing);
      if (!img) {
        if (!(slot in prev)) return prev;
        const next = { ...prev };
        delete next[slot];
        return next;
      }
      return { ...prev, [slot]: img };
    });
    if (currentPageRef.current === slot) {
      setEditPageImage((prev) => {
        if (prev?.startsWith("blob:") && prev !== img) URL.revokeObjectURL(prev);
        return img;
      });
    }
  }, []);

  const ensurePageImage = useCallback(
    async (slot: number) => {
      if (slot < 0) return;
      if (pageImagesRef.current[slot]) return;
      if (pageLoadInflightRef.current.has(slot)) return;
      if (!fileRef.current) return;
      pageLoadInflightRef.current.add(slot);
      try {
        const order = bridgeOrderRef.current;
        const renderPage =
          syncWithDocugridRef.current && order.length > 0 ? order[slot] ?? slot : slot;
        const img = await handlersRef.current.onRenderPage(renderPage);
        if (!img) return;
        if (pageImagesRef.current[slot]) {
          if (img.startsWith("blob:")) URL.revokeObjectURL(img);
          return;
        }
        setPageImageAt(slot, img);
      } finally {
        pageLoadInflightRef.current.delete(slot);
      }
    },
    [setPageImageAt],
  );
  
  const [activeTool, setActiveToolState] = useState<ToolType>("none");
  const [textDraft, setTextDraft] = useState<{
    slot: number;
    x: number;
    y: number;
    w: number;
    h: number;
    text: string;
    fontSize: number;
    color: string;
    origin?: { x: number; y: number; w: number; h: number };
  } | null>(null);

  const setActiveTool = useCallback((tool: ToolType) => {
    if (tool !== "text") setTextDraft(null);
    setActiveToolState(tool);
  }, []);

  const [isReordering, setIsReordering] = useState(false);
  const isReorderingRef = useRef(false);
  const thumbGenRef = useRef(0);
  const mergeInflightRef = useRef(false);
  useEffect(() => {
    isReorderingRef.current = isReordering;
  }, [isReordering]);
  const [isSplitView, setIsSplitView] = useState(false);
  
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [comparePreviewUrl, setComparePreviewUrl] = useState<string | null>(null);
  const [localPageOrder, setLocalPageOrder] = useState<number[]>([]);
  const localPageOrderRef = useRef<number[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);
  const [undoStack, setUndoStack] = useState<number[][]>([]);
  const [redoStack, setRedoStack] = useState<number[][]>([]);
  const [editUndoStack, setEditUndoStack] = useState<EditSnapshot[]>([]);
  const [editRedoStack, setEditRedoStack] = useState<EditSnapshot[]>([]);
  const editUndoStackRef = useRef(editUndoStack);
  const editRedoStackRef = useRef(editRedoStack);
  useEffect(() => {
    editUndoStackRef.current = editUndoStack;
  }, [editUndoStack]);
  useEffect(() => {
    editRedoStackRef.current = editRedoStack;
  }, [editRedoStack]);

  const docugridBridge = useDocugridPageOrderBridge(syncWithDocugrid);
  const docugridPageOrderLen = useDocugridStore((s) => s.pageOrder.length);
  const docugridOrderKey = docugridBridge.orderedOriginalIndices.join(",");
  /** サムネグリッド用: 各スロットが指す元 PDF の 0-based ページ番号（MainCanvas の thumbnails[pageIndex] と同型） */
  const pageOrder = syncWithDocugrid
    ? docugridBridge.orderedOriginalIndices
    : localPageOrder;

  useEffect(() => {
    thumbnailsRef.current = thumbnails;
  }, [thumbnails]);
  useEffect(() => {
    localPageOrderRef.current = localPageOrder;
  }, [localPageOrder]);
  const pageCountRef = useRef(pageCount);
  useEffect(() => {
    pageCountRef.current = pageCount;
  }, [pageCount]);

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
  const canvasElRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = canvasElRef;

  /** 注釈開始前に対象ページと描画面を同期（縦スクロール用） */
  const preparePageForAnnotation = useCallback((slot: number, el: HTMLDivElement) => {
    currentPageRef.current = slot;
    setCurrentPage(slot);
    canvasElRef.current = el;
  }, []);
  const applyGenerationRef = useRef(0);

  const applyThumbnails = useCallback(
    (imgs: string[], oldPageCount: number, prevOrder: number[]) => {
      if (imgs.length === 0) return;
      const nextOrder = extendPageOrderAfterAppend(prevOrder, oldPageCount, imgs.length);
      setThumbnails(imgs);
      setThumbnailsReady(true);
      if (syncWithDocugridRef.current) {
        useDocugridStore.getState().replacePrimaryPageOrder(nextOrder);
      } else {
        setLocalPageOrder(nextOrder);
      }
      setCurrentPage((prev) => Math.min(prev, Math.max(0, imgs.length - 1)));
    },
    [],
  );

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
      const gen = ++thumbGenRef.current;
      // サムネイルはバックグラウンド取得（全ページ分の生成で初回表示が止まらないようにする）
      void handlersRef.current
        .onGetThumbnails()
        .then((imgs) => {
          if (!isMounted || gen !== thumbGenRef.current) return;
          if (imgs.length === 0) {
            setThumbnailsReady(true);
            return;
          }
          if (isReorderingRef.current) {
            setThumbnails(imgs);
            setThumbnailsReady(true);
            setCurrentPage((prev) => {
              const maxPage = Math.max(0, imgs.length - 1);
              return Math.min(prev, maxPage);
            });
            return;
          }
          setThumbnails(imgs);
          setThumbnailsReady(true);
          if (syncWithDocugridRef.current) {
            useDocugridStore.getState().replacePrimaryPageOrder(
              Array.from({ length: imgs.length }, (_, i) => i),
            );
          } else {
            setLocalPageOrder((prev) => {
              if (prev.length === imgs.length) return prev;
              return Array.from({ length: imgs.length }, (_, i) => i);
            });
          }
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
  }, [editorKey, pdfUrl, applyThumbnails]); // pdfUrl changes trigger re-init

  // 別資料を開いたときだけ編集 Undo をリセット（merge 等の viewerSession では消さない）
  useLayoutEffect(() => {
    setEditUndoStack([]);
    setEditRedoStack([]);
  }, [editorKey]);

  // ページ画像キャッシュは viewerSession / editorKey 変更時にクリア
  useLayoutEffect(() => {
    setCurrentPage(0);
    setPageImages((prev) => {
      revokePageImages(prev);
      return {};
    });
    setEditPageImage((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    pageLoadInflightRef.current.clear();
  }, [viewerSession, editorKey, revokePageImages]);

  const resolveRenderPage = useCallback(() => {
    const slot = currentPageRef.current;
    const order = bridgeOrderRef.current;
    return syncWithDocugridRef.current && order.length > 0 ? order[slot] ?? slot : slot;
  }, []);

  const refreshViewForFile = useCallback(async (target: File) => {
    fileRef.current = target;
    const page = resolveRenderPage();
    const img = await handlersRef.current.onRenderPage(page, target);
    if (img) {
      setPageImageAt(currentPageRef.current, img);
    }
    const gen = ++thumbGenRef.current;
    const prevOrder = syncWithDocugridRef.current
      ? [...bridgeOrderRef.current]
      : [...localPageOrderRef.current];
    const oldPageCount = Math.max(
      prevOrder.length,
      thumbnailsRef.current.length,
      pageCountRef.current ?? 0,
    );
    void handlersRef.current.onGetThumbnails(target).then((imgs) => {
      if (gen !== thumbGenRef.current) return;
      if (imgs.length === 0) {
        setThumbnailsReady(true);
        return;
      }
      applyThumbnails(imgs, oldPageCount, prevOrder);
    });
  }, [resolveRenderPage, setPageImageAt, applyThumbnails]);

  const pushEditSnapshot = useCallback((before: File, after: File, action: string) => {
    setEditUndoStack((prev) => {
      const next = [...prev, { before, after, action }];
      return next.length > EDIT_UNDO_LIMIT ? next.slice(-EDIT_UNDO_LIMIT) : next;
    });
    setEditRedoStack([]);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadCurrentPageImage = async () => {
      if (!fileRef.current) {
        setEditPageImage(null);
        return;
      }
      const slot = currentPage;
      if (pageImagesRef.current[slot]) {
        setEditPageImage(pageImagesRef.current[slot] ?? null);
        return;
      }
      await ensurePageImage(slot);
      if (!isMounted) return;
      setEditPageImage(pageImagesRef.current[slot] ?? null);
    };
    void loadCurrentPageImage();
    return () => {
      isMounted = false;
    };
  }, [currentPage, editorKey, pdfUrl, pageCount, docugridOrderKey, docugridPageOrderLen, ensurePageImage]);

  // ページ数が変わった時だけローカルオーダーをリセット（並べ替え中の追加は onDropAppend が担当）
  useEffect(() => {
    if (pageCount && !syncWithDocugrid && !isReordering) {
      setLocalPageOrder(Array.from({ length: pageCount }, (_, i) => i));
      setSelectedSlots([]);
      setUndoStack([]);
      setRedoStack([]);
    }
  }, [pageCount, syncWithDocugrid, isReordering]);

  const wasReorderingRef = useRef(false);
  useEffect(() => {
    if (isReordering && !wasReorderingRef.current) {
      setUndoStack([]);
      setRedoStack([]);
    }
    wasReorderingRef.current = isReordering;
  }, [isReordering]);

  const snapshotPageOrder = useCallback((): number[] => {
    if (syncWithDocugridRef.current) {
      return [...bridgeOrderRef.current];
    }
    return [...localPageOrderRef.current];
  }, []);

  const restorePageOrder = useCallback((indices: number[]) => {
    if (syncWithDocugridRef.current) {
      useDocugridStore.getState().replacePrimaryPageOrder(indices);
    } else {
      setLocalPageOrder(indices);
    }
    setSelectedSlots([]);
  }, []);

  const pushPageOrderUndo = useCallback(() => {
    const snap = snapshotPageOrder();
    setUndoStack((prev) => {
      const next = [...prev, snap];
      return next.length > PAGE_ORDER_UNDO_LIMIT
        ? next.slice(-PAGE_ORDER_UNDO_LIMIT)
        : next;
    });
    setRedoStack([]);
  }, [snapshotPageOrder]);

  const applyPageOrderChange = useCallback((updater: (current: number[]) => number[]) => {
    const current = snapshotPageOrder();
    const next = updater(current);
    if (next.join(",") === current.join(",")) return;
    pushPageOrderUndo();
    restorePageOrder(next);
  }, [snapshotPageOrder, pushPageOrderUndo, restorePageOrder]);

  // ========================================================================
  // 4. アクションハンドラー (依存配列は空にする)
  // ========================================================================

  const applyAnnotation = useCallback(
    async (
      type: ToolType,
      rect: NormRect,
      path?: NormPoint[],
      text?: string,
      style?: {
        fontSize?: number;
        textColor?: string;
        replaceText?: boolean;
        originRect?: NormRect;
      },
    ) => {
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
        text,
        fontSize: style?.fontSize,
        textColor: style?.textColor,
        replaceText: style?.replaceText,
        originRect: style?.originRect,
      });
      if (!result || !("file" in result || result instanceof File)) return;

      const newFile = result instanceof File ? result : result.file;
      const previewDataUrl = result instanceof File ? null : result.previewDataUrl;

      const actionName = {
        marker: "マーカー",
        box: "赤枠",
        line: "ライン",
        check: "チェック",
        text: style?.replaceText ? "テキスト編集" : "テキスト",
        eraser: "消しゴム",
        none: "編集",
      }[type] || "編集";

      handlersRef.current.recordAction(newFile, actionName);
      pushEditSnapshot(currentFile, newFile, actionName);

      if (previewDataUrl) {
        setPageImageAt(slot, previewDataUrl);
      } else {
        const newImg = await handlersRef.current.onRenderPage(page, newFile);
        if (newImg) {
          setPageImageAt(slot, newImg);
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
  [pushEditSnapshot, setPageImageAt]);

  const isFreehandTool = (tool: ToolType) => tool === "marker" || tool === "eraser";

  const handleSaveReorder = useCallback(async () => {
    const currentFile = fileRef.current;
    if (!currentFile) return;
    const order = syncWithDocugrid ? docugridBridge.orderedOriginalIndices : localPageOrder;
    const newFile = await handlersRef.current.onReorder(order);
    if (newFile) {
      handlersRef.current.recordAction(newFile as File, "ページ並べ替え");
      pushEditSnapshot(currentFile, newFile as File, "ページ並べ替え");
      setIsReordering(false);
      setSelectedSlots([]);
      setUndoStack([]);
      setRedoStack([]);
    }
  }, [syncWithDocugrid, docugridBridge.orderedOriginalIndices, localPageOrder, pushEditSnapshot]);

  const onDropAppend = useCallback(async (acceptedFiles: File[]) => {
    const currentFile = fileRef.current;
    if (!currentFile || acceptedFiles.length === 0 || mergeInflightRef.current) return;
    mergeInflightRef.current = true;
    const prevOrder = syncWithDocugridRef.current
      ? [...bridgeOrderRef.current]
      : [...localPageOrderRef.current];
    const oldPageCount = Math.max(
      prevOrder.length,
      thumbnailsRef.current.length,
      pageCountRef.current ?? 0,
    );
    try {
      const newFile = await handlersRef.current.onMerge([currentFile, ...acceptedFiles]);
      if (!newFile) return;

      const gen = ++thumbGenRef.current;
      const imgs = await handlersRef.current.onGetThumbnails(newFile);
      if (gen !== thumbGenRef.current) return;

      applyThumbnails(imgs, oldPageCount, prevOrder);

      mergeInflightRef.current = false;
      fileRef.current = newFile;
      handlersRef.current.onReplaceFile?.(newFile);

      const actionName = `PDF結合 (+${acceptedFiles.length}ファイル)`;
      handlersRef.current.recordAction(newFile as File, actionName);
      pushEditSnapshot(currentFile, newFile as File, actionName);
    } finally {
      mergeInflightRef.current = false;
    }
  }, [pushEditSnapshot, applyThumbnails]);

  // Dropzone設定
  const { getRootProps, getInputProps, isDragActive, open: openDropzone } = useDropzone({
    onDrop: onDropAppend, 
    accept: { "application/pdf": [".pdf"] }, 
    multiple: true, 
    noClick: false
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
  const getNormalizedPos = (e: { clientX: number; clientY: number }) => {
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
      // テキスト入力中は新しいドラッグを始めない
      if (activeTool === "text" && textDraft) return;
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
    [activeTool, textDraft],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDrawing) return;
      e.preventDefault();
      const pos = getNormalizedPos(e);
      if (isFreehandTool(activeTool)) {
        if (activeTool === "marker" && e.shiftKey && startPos) {
          setCurrentStrokePath([startPos, constrainPointToAxis(startPos, pos)]);
          return;
        }
        const nativeEvent = e.nativeEvent;
        const samples =
          typeof nativeEvent.getCoalescedEvents === "function"
            ? nativeEvent.getCoalescedEvents()
            : [nativeEvent];
        setCurrentStrokePath((prev) =>
          samples.reduce(
            (path, sample) => appendPathPoint(path, getNormalizedPos(sample)),
            prev ?? [],
          ),
        );
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

      if (activeTool === "text") {
        if (textDraft) return;
        if (isDrawing) {
          releaseCaptureSafe(e.currentTarget, e.pointerId);
        }
        const committedRect = rectDraftRef.current;
        const clickPos = getNormalizedPos(e);
        setIsDrawing(false);
        setStartPos(null);
        setCurrentRect(null);
        setCurrentStrokePath(null);

        const dragged =
          committedRect && (committedRect.w > 0.04 || committedRect.h > 0.025);
        if (!dragged) {
          // クリック: 既存テキストがあれば編集モードへ
          const probeRect = {
            x: Math.max(0, clickPos.x - 0.01),
            y: Math.max(0, clickPos.y - 0.01),
            w: 0.02,
            h: 0.02,
          };
          const slot = currentPageRef.current;
          const order = bridgeOrderRef.current;
          const page =
            syncWithDocugridRef.current && order.length > 0 ? order[slot] ?? slot : slot;
          try {
            const probed = await handlersRef.current.onHighlight("text", page, probeRect, {
              probeOnly: true,
            });
            if (probed && typeof probed === "object" && "hit" in probed && probed.hit) {
              const hit = probed.hit;
              setTextDraft({
                slot,
                x: hit.x,
                y: hit.y,
                w: Math.max(0.12, hit.w),
                h: Math.max(0.05, hit.h),
                text: hit.text,
                fontSize: Math.round(hit.fontSize) || 14,
                color: hit.color || "#1e3a8a",
                origin: { x: hit.x, y: hit.y, w: hit.w, h: hit.h },
              });
              return;
            }
          } catch (err) {
            console.warn("text probe failed:", err);
          }
        }

        const box = dragged
          ? {
              x: Math.min(0.92, Math.max(0, committedRect.x)),
              y: Math.min(0.92, Math.max(0, committedRect.y)),
              w: Math.min(0.9, Math.max(0.12, committedRect.w)),
              h: Math.min(0.4, Math.max(0.05, committedRect.h)),
            }
          : {
              x: Math.min(0.7, Math.max(0, clickPos.x)),
              y: Math.min(0.88, Math.max(0, clickPos.y)),
              w: 0.28,
              h: 0.08,
            };
        setTextDraft({
          slot: currentPageRef.current,
          ...box,
          text: "",
          fontSize: 14,
          color: "#1e3a8a",
        });
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

      let committedPath = strokePathDraftRef.current;
      const committedRect = rectDraftRef.current;
      if (activeTool === "marker" && e.shiftKey && startPos) {
        committedPath = [
          startPos,
          constrainPointToAxis(startPos, getNormalizedPos(e)),
        ];
      }
      setIsDrawing(false);
      setStartPos(null);
      setCurrentRect(null);
      setCurrentStrokePath(null);

      if (isFreehandTool(activeTool) && committedPath && isMeaningfulPath(committedPath)) {
        const finalPath =
          activeTool === "marker" ? smoothMarkerPath(committedPath) : committedPath;
        const rect = boundsFromPath(finalPath);
        await applyAnnotation(activeTool, rect, finalPath);
        return;
      }

      if (committedRect && (committedRect.w > 0.005 || committedRect.h > 0.005)) {
        await applyAnnotation(activeTool, committedRect);
      }
    },
    [activeTool, isDrawing, startPos, applyAnnotation, textDraft],
  );

  const commitTextDraft = useCallback(async () => {
    if (!textDraft) return;
    const content = textDraft.text.trim();
    if (!content) {
      setTextDraft(null);
      return;
    }
    const draft = textDraft;
    setTextDraft(null);
    // 確定時に対象ページへ切替（スロットがずれないように）
    if (draft.slot !== currentPageRef.current) {
      currentPageRef.current = draft.slot;
      setCurrentPage(draft.slot);
    }
    await applyAnnotation(
      "text",
      { x: draft.x, y: draft.y, w: draft.w, h: draft.h },
      undefined,
      draft.text,
      {
        fontSize: draft.fontSize,
        textColor: draft.color,
        replaceText: Boolean(draft.origin),
        originRect: draft.origin,
      },
    );
  }, [textDraft, applyAnnotation]);

  const cancelTextDraft = useCallback(() => {
    setTextDraft(null);
  }, []);

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
      applyPageOrderChange((prev) => {
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      });
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
    [applyPageOrderChange],
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
    applyPageOrderChange((prev) => prev.filter((_, idx) => !selectedSlots.includes(idx)));
    setSelectedSlots([]);
  }, [selectedSlots, applyPageOrderChange]);
  const keepOnlySelectedSlots = useCallback(() => {
    applyPageOrderChange((prev) => prev.filter((_, idx) => selectedSlots.includes(idx)));
    setSelectedSlots([]);
  }, [selectedSlots, applyPageOrderChange]);

  const canUndoPageOrder = undoStack.length > 0;
  const canRedoPageOrder = redoStack.length > 0;
  const canUndoEdit = editUndoStack.length > 0;
  const canRedoEdit = editRedoStack.length > 0;
  /** 並べ替えモード中はページ順 Undo、通常は PDF 編集 Undo */
  const canUndo = isReordering ? canUndoPageOrder || canUndoEdit : canUndoEdit;
  const canRedo = isReordering ? canRedoPageOrder || canRedoEdit : canRedoEdit;

  const undoPageOrder = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const nextPrev = [...prev];
      const restored = nextPrev.pop()!;
      const current = snapshotPageOrder();
      setRedoStack((redoPrev) => {
        const next = [...redoPrev, current];
        return next.length > PAGE_ORDER_UNDO_LIMIT
          ? next.slice(-PAGE_ORDER_UNDO_LIMIT)
          : next;
      });
      restorePageOrder(restored);
      return nextPrev;
    });
  }, [snapshotPageOrder, restorePageOrder]);
  const redoPageOrder = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const nextPrev = [...prev];
      const restored = nextPrev.pop()!;
      const current = snapshotPageOrder();
      setUndoStack((undoPrev) => {
        const next = [...undoPrev, current];
        return next.length > PAGE_ORDER_UNDO_LIMIT
          ? next.slice(-PAGE_ORDER_UNDO_LIMIT)
          : next;
      });
      restorePageOrder(restored);
      return nextPrev;
    });
  }, [snapshotPageOrder, restorePageOrder]);

  const undoEdit = useCallback(async () => {
    const stack = editUndoStackRef.current;
    if (stack.length === 0) return;
    const entry = stack[stack.length - 1]!;
    setEditUndoStack((prev) => prev.slice(0, -1));
    setEditRedoStack((prev) => [...prev, entry]);
    handlersRef.current.popLastAction?.();
    handlersRef.current.onReplaceFile?.(entry.before);
    await refreshViewForFile(entry.before);
  }, [refreshViewForFile]);

  const redoEdit = useCallback(async () => {
    const stack = editRedoStackRef.current;
    if (stack.length === 0) return;
    const entry = stack[stack.length - 1]!;
    setEditRedoStack((prev) => prev.slice(0, -1));
    setEditUndoStack((prev) => [...prev, entry]);
    handlersRef.current.recordAction(entry.after, entry.action);
    handlersRef.current.onReplaceFile?.(entry.after);
    await refreshViewForFile(entry.after);
  }, [refreshViewForFile]);

  const undo = useCallback(() => {
    if (isReordering && canUndoPageOrder) {
      undoPageOrder();
      return;
    }
    if (canUndoEdit) {
      void undoEdit();
    }
  }, [isReordering, canUndoPageOrder, canUndoEdit, undoPageOrder, undoEdit]);

  const redo = useCallback(() => {
    if (isReordering && canRedoPageOrder) {
      redoPageOrder();
      return;
    }
    if (canRedoEdit) {
      void redoEdit();
    }
  }, [isReordering, canRedoPageOrder, canRedoEdit, redoPageOrder, redoEdit]);

  const pageCountSafe = Math.max(
    pageCount ?? 0,
    thumbnailsReady ? thumbnails.length : 0,
    pageOrder.length,
  );
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
  const goToPage = useCallback(
    (page: number) => {
      const max = Math.max(0, pageCountSafe - 1);
      setCurrentPage(Math.min(Math.max(0, page), max));
    },
    [pageCountSafe],
  );

  const selectAllSlots = useCallback(() => {
    setSelectedSlots(pageOrder.map((_, idx) => idx));
  }, [pageOrder]);

  useEffect(() => {
    setPendingOverlay(null);
  }, [currentPage]);

  return {
    editPageImage,
    pageImages,
    ensurePageImage,
    preparePageForAnnotation,
    activeTool,
    setActiveTool,
    textDraft,
    setTextDraft,
    commitTextDraft,
    cancelTextDraft,
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
    canUndoEdit,
    canRedoEdit,
    undo,
    redo,
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
    goToPage,
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
    openDropzone,
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
