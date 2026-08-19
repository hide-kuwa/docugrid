"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { AlertCircle, Grip, Plus } from "lucide-react";
import { DropzoneInputProps, DropzoneRootProps } from "react-dropzone";
import { NormPoint, NormRect, ToolType } from "../types";
import { smoothMarkerPath } from "../lib/annotation-geometry";
import { PdfJsPagePreview } from "./PdfJsPagePreview";
import { PdfTextComposer, type PdfTextDraft } from "./PdfTextComposer";

type Rect = NormRect | null;

function pathToSvgD(points: NormPoint[], smooth: boolean): string {
  const path = smooth ? smoothMarkerPath(points) : points;
  return path
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
}

function FreehandStrokePreview({
  points,
  variant,
}: {
  points: NormPoint[];
  variant: "marker" | "eraser";
}) {
  if (points.length < 1) return null;
  const d = pathToSvgD(points, variant === "marker");
  const stroke =
    variant === "marker" ? "rgb(253, 224, 71)" : "rgb(148, 163, 184)";
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full overflow-visible"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={variant === "marker" ? 0.018 : 0.018}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={variant === "marker" ? 0.22 : 0.9}
        style={variant === "marker" ? { mixBlendMode: "multiply" } : undefined}
        strokeDasharray={variant === "eraser" ? "0.02 0.012" : undefined}
      />
    </svg>
  );
}

function AnnotationPreview({
  tool,
  rect,
  path,
}: {
  tool: ToolType;
  rect: NormRect;
  path?: NormPoint[];
}) {
  if ((tool === "marker" || tool === "eraser") && path && path.length > 0) {
    return <FreehandStrokePreview points={path} variant={tool} />;
  }
  const boxStyle: CSSProperties = {
    position: "absolute",
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.w * 100}%`,
    height: `${rect.h * 100}%`,
  };

  if (tool === "marker") {
    return null;
  }
  if (tool === "box") {
    return (
      <div
        className="pointer-events-none rounded-[1px] border-[3px] border-red-500 bg-transparent shadow-sm"
        style={boxStyle}
      />
    );
  }
  if (tool === "line") {
    return (
      <svg
        className="pointer-events-none absolute inset-0 z-[1] h-full w-full overflow-visible"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        <line
          x1={rect.x}
          y1={rect.y}
          x2={rect.x + rect.w}
          y2={rect.y + rect.h}
          stroke="rgb(37, 99, 235)"
          strokeWidth={0.004}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }
  if (tool === "check") {
    return (
      <div
        className="pointer-events-none rounded-md border-2 border-emerald-500 bg-emerald-400/20"
        style={boxStyle}
      />
    );
  }
  if (tool === "text") {
    return (
      <div
        className="pointer-events-none rounded border-2 border-dashed border-violet-500 bg-violet-100/40"
        style={boxStyle}
      />
    );
  }
  if (tool === "eraser") {
    return (
      <div
        className="pointer-events-none rounded-sm border-2 border-dashed border-slate-500 bg-white/80"
        style={boxStyle}
      />
    );
  }
  return null;
}

type MainCanvasProps = {
  file: File | null;
  pdfUrl: string | null;
  isSplitView: boolean;
  isReordering: boolean;
  isLoading: boolean;
  pageOrder: number[];
  selectedSlots: number[];
  toggleSlotSelection: (slotIndex: number) => void;
  currentPage: number;
  pageCountSafe: number;
  goToPage: (page: number) => void;
  thumbnails: string[];
  thumbnailsReady: boolean;
  getRootProps: <T extends DropzoneRootProps>(props?: T) => T;
  getInputProps: <T extends DropzoneInputProps>(props?: T) => T;
  /** ADD PDF 押下時にファイル選択ダイアログを開く */
  openFileDialog: () => void;
  isDragActive: boolean;
  draggingSlotIndex: number | null;
  handleDragStart: (e: React.DragEvent, position: number) => void;
  handleDragOverSlot: (e: React.DragEvent, position: number) => void;
  handleDropSlot: (e: React.DragEvent, position: number) => void;
  handleDragEnd: () => void;
  activeTool: ToolType;
  pageImages: Record<number, string>;
  ensurePageImage: (slot: number) => Promise<void>;
  preparePageForAnnotation: (slot: number, el: HTMLDivElement) => void;
  pendingOverlay: { tool: ToolType; rect: NormRect; path?: NormPoint[] } | null;
  currentStrokePath: NormPoint[] | null;
  textDraft?: PdfTextDraft | null;
  onTextDraftChange?: (next: PdfTextDraft) => void;
  onCommitTextDraft?: () => void;
  onCancelTextDraft?: () => void;
  handlePointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
  isDrawing: boolean;
  currentRect: Rect;
};

export const MainCanvas = ({
  file,
  pdfUrl,
  isSplitView,
  isReordering,
  isLoading,
  pageOrder,
  selectedSlots,
  toggleSlotSelection,
  currentPage,
  pageCountSafe,
  goToPage,
  thumbnails,
  thumbnailsReady,
  getRootProps,
  getInputProps,
  openFileDialog,
  isDragActive,
  draggingSlotIndex,
  handleDragStart,
  handleDragOverSlot,
  handleDropSlot,
  handleDragEnd,
  activeTool,
  pageImages,
  ensurePageImage,
  preparePageForAnnotation,
  pendingOverlay,
  currentStrokePath,
  textDraft = null,
  onTextDraftChange,
  onCommitTextDraft,
  onCancelTextDraft,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
  handlePointerCancel,
  isDrawing,
  currentRect,
}: MainCanvasProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageElsRef = useRef<Map<number, HTMLElement>>(new Map());
  const suppressScrollSyncRef = useRef(false);
  /** IntersectionObserver 由来のページ更新では scrollIntoView しない（往復ジャンプ防止） */
  const skipScrollIntoViewRef = useRef(false);
  const slotsKey = pageOrder.length > 0 ? pageOrder.join(",") : String(pageCountSafe);
  const slots =
    pageOrder.length > 0
      ? pageOrder.map((_, i) => i)
      : Array.from({ length: pageCountSafe }, (_, i) => i);

  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  // 新しい PDF / ページ構成になったら先頭へスクロールし、しばらく観測同期を止める
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || isReordering) return;
    suppressScrollSyncRef.current = true;
    skipScrollIntoViewRef.current = true;
    root.scrollTop = 0;
    const t = window.setTimeout(() => {
      suppressScrollSyncRef.current = false;
    }, 500);
    return () => window.clearTimeout(t);
  }, [slotsKey, isReordering]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || isReordering) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (suppressScrollSyncRef.current) return;
        let best: { slot: number; ratio: number } | null = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const slot = Number((entry.target as HTMLElement).dataset.pageSlot);
          if (!Number.isFinite(slot)) continue;
          void ensurePageImage(slot);
          if (!best || entry.intersectionRatio > best.ratio) {
            best = { slot, ratio: entry.intersectionRatio };
          }
        }
        if (best && best.slot !== currentPageRef.current) {
          skipScrollIntoViewRef.current = true;
          goToPage(best.slot);
        }
      },
      { root, threshold: [0.35, 0.55, 0.75], rootMargin: "-10% 0px -35% 0px" },
    );
    const frame = requestAnimationFrame(() => {
      pageElsRef.current.forEach((el) => observer.observe(el));
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [slotsKey, isReordering, ensurePageImage, goToPage]);

  useEffect(() => {
    if (isReordering) return;
    if (skipScrollIntoViewRef.current) {
      skipScrollIntoViewRef.current = false;
      return;
    }
    const el = pageElsRef.current.get(currentPage);
    if (!el || !scrollRef.current) return;
    const root = scrollRef.current;
    const rootRect = root.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const fullyVisible =
      elRect.top >= rootRect.top + 8 && elRect.bottom <= rootRect.bottom - 8;
    if (fullyVisible) return;
    suppressScrollSyncRef.current = true;
    el.scrollIntoView({ block: "start", behavior: "auto" });
    const t = window.setTimeout(() => {
      suppressScrollSyncRef.current = false;
    }, 280);
    return () => window.clearTimeout(t);
  }, [currentPage, isReordering]);

  useEffect(() => {
    for (const slot of slots.slice(0, 3)) {
      void ensurePageImage(slot);
    }
  }, [slotsKey, ensurePageImage, slots]);

  const toolCursor =
    activeTool === "check"
      ? "copy"
      : activeTool === "text"
        ? "text"
        : activeTool === "eraser"
        ? "cell"
        : activeTool === "marker"
          ? "crosshair"
          : activeTool !== "none"
            ? "crosshair"
            : "default";

  return (
    <div className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${isSplitView ? "w-1/2" : "w-full"}`}>
      {isReordering ? (
        <div className="flex-1 overflow-y-auto bg-slate-100 p-4 sm:p-6">
          <div className="mx-auto w-full max-w-[min(100%,1440px)]">
            <h3 className="mb-6 text-lg font-bold text-slate-700">ページ並べ替え・追加</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
              {pageOrder.map((pageIndex, i) => (
                <div
                  key={`reorder-slot-${i}-${pageIndex}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, i)}
                  onDragOver={(e) => handleDragOverSlot(e, i)}
                  onDrop={(e) => handleDropSlot(e, i)}
                  onDragEnd={handleDragEnd}
                  className={`relative flex cursor-grab flex-col overflow-hidden rounded-lg border-2 bg-white shadow-sm transition-[opacity,box-shadow,border-color] active:cursor-grabbing hover:border-blue-400 hover:shadow-md ${
                    draggingSlotIndex === i ? "opacity-40" : "opacity-100"
                  } ${
                    selectedSlots.includes(i) ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-300"
                  }`}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSlotSelection(i);
                    }}
                    className={`absolute top-1.5 right-1.5 z-10 h-5 w-5 rounded border text-[10px] font-bold ${
                      selectedSlots.includes(i) ? "bg-blue-600 text-white border-blue-600" : "bg-white/95 text-slate-500 border-slate-300"
                    }`}
                  >
                    {selectedSlots.includes(i) ? "✓" : ""}
                  </button>
                  <div className="absolute top-1.5 left-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-[10px] font-bold text-slate-600">
                    {i + 1}
                  </div>
                  <div className="flex w-full items-center justify-center bg-slate-100 p-1">
                    {thumbnails[pageIndex] ? (
                      <img
                        src={thumbnails[pageIndex]}
                        alt=""
                        className="pointer-events-none h-auto max-h-[min(42vh,420px)] w-full object-contain object-center"
                      />
                    ) : thumbnailsReady ? (
                      <span className="px-2 py-10 text-sm text-rose-400">プレビュー取得失敗</span>
                    ) : (
                      <span className="px-2 py-10 text-sm text-slate-400">読み込み中…</span>
                    )}
                  </div>
                  <Grip className="absolute bottom-1.5 right-1.5 z-10 h-3.5 w-3.5 text-slate-400" />
                </div>
              ))}
              <div
                {...getRootProps()}
                className={`flex min-h-[8rem] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
                  isDragActive ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-100 hover:border-blue-400 hover:bg-white"
                }`}
              >
                <input {...getInputProps()} />
                <Plus className={`mb-1 h-7 w-7 ${isDragActive ? "text-blue-600" : "text-slate-400"}`} />
                <span className={`text-xs font-bold ${isDragActive ? "text-blue-600" : "text-slate-400"}`}>
                  {isDragActive ? "Drop PDF" : "Add PDF"}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-200">
          <div className="pointer-events-none absolute right-4 top-3 z-20 rounded-full bg-slate-900/80 px-3 py-1 text-xs font-bold text-white shadow">
            {pageCountSafe > 0 ? `${currentPage + 1} / ${pageCountSafe}` : "- / -"}
          </div>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 pb-16">
              {slots.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-white px-12 py-16 shadow-sm">
                  <AlertCircle className="h-16 w-16 animate-pulse text-slate-300" />
                  <p className="text-sm font-medium text-slate-500">プレビューを読み込み中…</p>
                </div>
              ) : (
                slots.map((slot) => {
                  const originalPageIndex =
                    pageOrder.length > 0 ? (pageOrder[slot] ?? slot) : slot;
                  const image = pageImages[slot] ?? null;
                  const annotating = activeTool !== "none";
                  const showTextDraft = Boolean(textDraft && textDraft.slot === slot);
                  return (
                    <section
                      key={`${originalPageIndex}-${slot}`}
                      data-page-slot={slot}
                      ref={(node) => {
                        if (node) pageElsRef.current.set(slot, node);
                        else pageElsRef.current.delete(slot);
                      }}
                      className={[
                        "relative scroll-mt-4 rounded-sm bg-white shadow-lg ring-1 ring-slate-300/80",
                        slot === currentPage ? "ring-2 ring-teal-500/70" : "",
                      ].join(" ")}
                    >
                      <div className="absolute left-2 top-2 z-10 rounded bg-slate-900/75 px-2 py-0.5 text-[10px] font-bold text-white">
                        {slot + 1}
                      </div>
                      <div
                        className="relative mx-auto w-full touch-none"
                        style={{
                          cursor: showTextDraft
                            ? "default"
                            : annotating
                              ? toolCursor
                              : "default",
                        }}
                        onPointerDown={(e) => {
                          if (!annotating || showTextDraft) return;
                          preparePageForAnnotation(slot, e.currentTarget);
                          handlePointerDown(e);
                        }}
                        onPointerMove={annotating && !showTextDraft ? handlePointerMove : undefined}
                        onPointerUp={annotating && !showTextDraft ? handlePointerUp : undefined}
                        onPointerCancel={annotating && !showTextDraft ? handlePointerCancel : undefined}
                      >
                        {image ? (
                          <img
                            src={image}
                            alt={`ページ ${slot + 1}`}
                            className="pointer-events-none block h-auto w-full bg-white"
                            draggable={false}
                          />
                        ) : file ? (
                          <PdfJsPagePreview
                            file={file}
                            pageIndex={originalPageIndex}
                            className="pointer-events-none block h-auto w-full bg-white"
                          />
                        ) : (
                          <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-500">
                            ページを読み込み中…
                          </div>
                        )}
                        {annotating && slot === currentPage && !showTextDraft ? (
                          <div className="pointer-events-none absolute inset-0 z-[5]">
                            {isDrawing &&
                              (currentStrokePath &&
                              (activeTool === "marker" || activeTool === "eraser") ? (
                                <FreehandStrokePreview
                                  points={currentStrokePath}
                                  variant={activeTool}
                                />
                              ) : currentRect && activeTool !== "check" ? (
                                <AnnotationPreview tool={activeTool} rect={currentRect} />
                              ) : null)}
                            {pendingOverlay ? (
                              <AnnotationPreview
                                tool={pendingOverlay.tool}
                                rect={pendingOverlay.rect}
                                path={pendingOverlay.path}
                              />
                            ) : null}
                          </div>
                        ) : null}
                        {showTextDraft && textDraft && onTextDraftChange && onCommitTextDraft && onCancelTextDraft ? (
                          <PdfTextComposer
                            draft={textDraft}
                            onChange={onTextDraftChange}
                            onCommit={onCommitTextDraft}
                            onCancel={onCancelTextDraft}
                          />
                        ) : null}
                      </div>
                    </section>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
