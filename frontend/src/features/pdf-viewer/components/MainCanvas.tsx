import type { CSSProperties } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, FileUp, Grip, Plus } from "lucide-react";
import { DropzoneInputProps, DropzoneRootProps } from "react-dropzone";
import { NormPoint, NormRect, ToolType } from "../types";
import { PdfJsPagePreview } from "./PdfJsPagePreview";

type Rect = NormRect | null;

function pathToSvgD(points: NormPoint[]): string {
  return points
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
  const d = pathToSvgD(points);
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
        strokeWidth={variant === "marker" ? 0.014 : 0.018}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity={variant === "marker" ? 0.85 : 0.9}
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

/** Blob URL を iframe で表示（pdf.js が使えない場合の予備） */
function PdfBlobFallback({ pdfUrl, className }: { pdfUrl: string; className?: string }) {
  return (
    <iframe
      src={pdfUrl}
      className={className}
      title="PDFプレビュー"
    />
  );
}

function PagePreview({
  editPageImage,
  file,
  originalPageIndex,
  pdfUrl,
  imgClassName,
  iframeClassName,
}: {
  editPageImage: string | null;
  file: File | null;
  originalPageIndex: number;
  pdfUrl: string | null;
  imgClassName: string;
  iframeClassName: string;
}) {
  if (editPageImage) {
    return <img src={editPageImage} alt="" className={imgClassName} />;
  }
  if (file) {
    return (
      <PdfJsPagePreview
        file={file}
        pageIndex={originalPageIndex}
        className={imgClassName}
      />
    );
  }
  if (pdfUrl) {
    return <PdfBlobFallback pdfUrl={pdfUrl} className={iframeClassName} />;
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
  clearSlotSelection: () => void;
  removeSelectedSlots: () => void;
  keepOnlySelectedSlots: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoPageOrder: () => void;
  redoPageOrder: () => void;
  currentPage: number;
  pageCountSafe: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  goPrevPage: () => void;
  goNextPage: () => void;
  thumbnails: string[];
  thumbnailsReady: boolean;
  getRootProps: <T extends DropzoneRootProps>(props?: T) => T;
  getInputProps: <T extends DropzoneInputProps>(props?: T) => T;
  isDragActive: boolean;
  handleSaveReorder: () => void;
  draggingSlotIndex: number | null;
  handleDragStart: (e: React.DragEvent, position: number) => void;
  handleDragOverSlot: (e: React.DragEvent, position: number) => void;
  handleDropSlot: (e: React.DragEvent, position: number) => void;
  handleDragEnd: () => void;
  activeTool: ToolType;
  editPageImage: string | null;
  pendingOverlay: { tool: ToolType; rect: NormRect; path?: NormPoint[] } | null;
  currentStrokePath: NormPoint[] | null;
  canvasRef: React.RefObject<HTMLDivElement>;
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
  clearSlotSelection,
  removeSelectedSlots,
  keepOnlySelectedSlots,
  canUndo,
  canRedo,
  undoPageOrder,
  redoPageOrder,
  currentPage,
  pageCountSafe,
  canGoPrev,
  canGoNext,
  goPrevPage,
  goNextPage,
  thumbnails,
  thumbnailsReady,
  getRootProps,
  getInputProps,
  isDragActive,
  handleSaveReorder,
  draggingSlotIndex,
  handleDragStart,
  handleDragOverSlot,
  handleDropSlot,
  handleDragEnd,
  activeTool,
  editPageImage,
  pendingOverlay,
  currentStrokePath,
  canvasRef,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
  handlePointerCancel,
  isDrawing,
  currentRect,
}: MainCanvasProps) => {
  const originalPageIndex =
    pageOrder.length > 0 ? (pageOrder[currentPage] ?? currentPage) : currentPage;
  const imgClassName =
    "max-h-[min(80vh,85dvh)] w-auto max-w-full object-contain pointer-events-none bg-white";
  const iframeClassName =
    "max-h-[min(80vh,85dvh)] w-full min-h-[min(60vh,400px)] min-w-[min(100%,480px)] rounded-sm bg-white shadow-2xl";

  const hasPreview = Boolean(editPageImage || file || pdfUrl);

  return (
    <div className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${isSplitView ? "w-1/2" : "w-full"}`}>
      {isReordering ? (
        <div className="flex-1 overflow-y-auto bg-slate-100 p-4 sm:p-6">
          <div className="mx-auto w-full max-w-[min(100%,1440px)]">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <h3 className="text-lg font-bold text-slate-700">ページ並べ替え・追加</h3>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={removeSelectedSlots}
                  disabled={selectedSlots.length === 0 || isLoading}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  選択を削除
                </button>
                <button
                  onClick={keepOnlySelectedSlots}
                  disabled={selectedSlots.length === 0 || isLoading}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  選択だけ残す(分割)
                </button>
                <button
                  onClick={clearSlotSelection}
                  disabled={selectedSlots.length === 0 || isLoading}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  選択解除
                </button>
                <button
                  onClick={undoPageOrder}
                  disabled={!canUndo || isLoading}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  Undo
                </button>
                <button
                  onClick={redoPageOrder}
                  disabled={!canRedo || isLoading}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  Redo
                </button>
                <button
                  onClick={handleSaveReorder}
                  disabled={isLoading}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-500 shadow-lg"
                >
                  {isLoading ? "処理中..." : <><FileUp className="h-4 w-4" /> 確定</>}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {pageOrder.map((pageIndex, i) => (
                <div
                  key={pageIndex}
                  draggable
                  onDragStart={(e) => handleDragStart(e, i)}
                  onDragOver={(e) => handleDragOverSlot(e, i)}
                  onDrop={(e) => handleDropSlot(e, i)}
                  onDragEnd={handleDragEnd}
                  className={`relative flex min-h-0 cursor-grab flex-col overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-[opacity,box-shadow,border-color] active:cursor-grabbing hover:border-blue-400 hover:shadow-md ${
                    draggingSlotIndex === i ? "opacity-40" : "opacity-100"
                  } ${
                    selectedSlots.includes(i) ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-300"
                  }`}
                  style={{ aspectRatio: "1 / 1.35", maxHeight: "min(72vh, 560px)" }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSlotSelection(i);
                    }}
                    className={`absolute top-2 right-2 z-10 h-5 w-5 rounded border text-[10px] font-bold ${
                      selectedSlots.includes(i) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-500 border-slate-300"
                    }`}
                  >
                    {selectedSlots.includes(i) ? "✓" : ""}
                  </button>
                  <div className="absolute top-2 left-2 w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-500 border border-slate-200 z-10">
                    {i + 1}
                  </div>
                  <div className="flex min-h-0 w-full flex-1 items-center justify-center bg-slate-50 p-3">
                    {thumbnails[pageIndex] ? (
                      <img
                        src={thumbnails[pageIndex]}
                        alt=""
                        className="max-h-full max-w-full object-contain object-center pointer-events-none"
                      />
                    ) : thumbnailsReady ? (
                      <span className="text-sm text-rose-400">プレビュー取得失敗</span>
                    ) : (
                      <span className="text-sm text-slate-400">読み込み中…</span>
                    )}
                  </div>
                  <Grip className="absolute bottom-2 right-2 h-4 w-4 text-slate-400 z-10" />
                </div>
              ))}
              <div
                {...getRootProps()}
                className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors sm:min-h-[280px] ${
                  isDragActive ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-100 hover:border-blue-400 hover:bg-white"
                }`}
                style={{ aspectRatio: "1 / 1.35", maxHeight: "min(72vh, 560px)" }}
              >
                <input {...getInputProps()} />
                <Plus className={`h-8 w-8 mb-2 ${isDragActive ? "text-blue-600" : "text-slate-400"}`} />
                <span className={`text-xs font-bold ${isDragActive ? "text-blue-600" : "text-slate-400"}`}>
                  {isDragActive ? "Drop PDF" : "Add PDF"}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative isolate flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-slate-200 p-4">
          <div className="absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full bg-slate-900/80 px-3 py-1 text-xs text-white shadow">
            <button
              type="button"
              onClick={goPrevPage}
              disabled={!canGoPrev}
              className="rounded p-1 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span>{pageCountSafe > 0 ? `${currentPage + 1} / ${pageCountSafe}` : "- / -"}</span>
            <button
              type="button"
              onClick={goNextPage}
              disabled={!canGoNext}
              className="rounded p-1 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {activeTool !== "none" ? (
            <div className="relative mt-10 flex max-h-[min(85vh,calc(100%-2.5rem))] w-full max-w-full flex-col items-center justify-center">
              <div
                ref={canvasRef}
                className="relative inline-block max-w-full touch-none shadow-2xl"
                style={{
                  cursor:
                    activeTool === "check"
                      ? "copy"
                      : activeTool === "eraser"
                        ? "cell"
                        : activeTool === "marker"
                          ? "crosshair"
                          : "crosshair",
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
              >
                {hasPreview ? (
                  <PagePreview
                    editPageImage={editPageImage}
                    file={file}
                    originalPageIndex={originalPageIndex}
                    pdfUrl={pdfUrl}
                    imgClassName={imgClassName}
                    iframeClassName={iframeClassName}
                  />
                ) : (
                  <div className="flex min-h-[min(60vh,400px)] min-w-[min(100%,480px)] items-center justify-center rounded-sm bg-white px-8 py-16 text-sm font-medium text-slate-500">
                    ページを読み込み中…
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 z-[5]">
                  {isDrawing &&
                    hasPreview &&
                    activeTool !== "check" &&
                    (currentStrokePath && (activeTool === "marker" || activeTool === "eraser") ? (
                      <FreehandStrokePreview
                        points={currentStrokePath}
                        variant={activeTool}
                      />
                    ) : currentRect ? (
                      <AnnotationPreview tool={activeTool} rect={currentRect} />
                    ) : null)}
                  {pendingOverlay && hasPreview && (
                    <AnnotationPreview
                      tool={pendingOverlay.tool}
                      rect={pendingOverlay.rect}
                      path={pendingOverlay.path}
                    />
                  )}
                </div>
                <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 max-w-[calc(100%-1rem)] -translate-x-1/2 truncate rounded-full bg-black/75 px-3 py-1.5 text-center text-[11px] font-bold text-white">
                  {activeTool === "eraser" ? "消しゴム" : activeTool.toUpperCase()} · P.
                  {currentPage + 1}
                </div>
              </div>
            </div>
          ) : hasPreview ? (
            <div className="relative mt-10 w-full max-w-5xl px-2">
              <PagePreview
                editPageImage={editPageImage}
                file={file}
                originalPageIndex={originalPageIndex}
                pdfUrl={pdfUrl}
                imgClassName={`mt-0 ${imgClassName} shadow-2xl`}
                iframeClassName={iframeClassName}
              />
              {!editPageImage && file ? (
                <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/75 px-3 py-1 text-[11px] font-medium text-white">
                  高画質プレビューを読み込み中…
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mt-10 flex w-full max-w-3xl flex-col items-center justify-center gap-3 rounded-xl bg-white px-12 py-16 shadow-sm">
              <AlertCircle className="h-16 w-16 animate-pulse text-slate-300" />
              <p className="text-sm font-medium text-slate-500">プレビューを読み込み中…</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
