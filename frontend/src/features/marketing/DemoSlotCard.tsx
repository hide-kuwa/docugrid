"use client";

import { useRef } from "react";
import { UploadCloud } from "lucide-react";
import type { DemoSlotDef } from "./demo-scenario";
import { DemoOcrOverlay } from "./DemoOcrOverlay";
import { DemoMetricBurst } from "./DemoMetricBurst";
import { DemoFileOrb } from "./DemoFileOrb";
import type { DemoMetric } from "./demo-scenario";

export type DemoSlotState =
  | { phase: "empty" }
  | { phase: "drag-over" }
  | { phase: "processing"; progress: number; stageIndex: number }
  | { phase: "filled"; fileName: string; pageCount: number; metrics: DemoMetric[]; visibleMetrics: number };

type DropHint = "none" | "accept" | "reject";

type Props = {
  slot: DemoSlotDef;
  state: DemoSlotState;
  dropHint?: DropHint;
  clickable?: boolean;
  onEmptyClick?: () => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
};

export function DemoSlotCard({
  slot,
  state,
  dropHint = "none",
  clickable = false,
  onEmptyClick,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
}: Props) {
  const dragDepthRef = useRef(0);

  const filled = state.phase === "filled";
  const processing = state.phase === "processing";
  const dragOver = state.phase === "drag-over" || dropHint === "accept";
  const dragReject = dropHint === "reject";

  if (filled) {
    return (
      <div className="relative pb-14">
        <div className="flex h-[168px] flex-col items-center justify-center rounded-xl border-2 border-blue-200 bg-white px-3 py-4 shadow-md ring-2 ring-blue-100">
          <DemoFileOrb label={slot.title} sublabel={`${state.pageCount}p · 正規化済`} size="md" variant="filled" />
          <p className="mt-2 max-w-full truncate text-center text-[10px] text-slate-400">{state.fileName}</p>
        </div>
        <DemoMetricBurst metrics={state.metrics} visibleCount={state.visibleMetrics} />
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={() => {
          if (clickable) onEmptyClick?.();
        }}
        onKeyDown={(e) => {
          if (clickable && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onEmptyClick?.();
          }
        }}
        className={`flex h-[168px] flex-col items-center justify-center rounded-xl border-2 border-dashed p-3 text-center transition-all duration-200 ${
          dragOver
            ? "scale-[1.02] border-blue-500 bg-blue-50 shadow-[0_0_28px_rgba(59,130,246,0.35)]"
            : dragReject
              ? "border-slate-200 bg-slate-50 opacity-60"
              : clickable
                ? "cursor-pointer border-blue-400 bg-blue-50/50 ring-2 ring-blue-200 animate-pulse"
                : processing
                  ? "border-cyan-400 bg-slate-900/5"
                  : "border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-white"
        }`}
        onDragEnter={(e) => {
          dragDepthRef.current += 1;
          onDragEnter(e);
        }}
        onDragOver={onDragOver}
        onDragLeave={() => {
          dragDepthRef.current -= 1;
          if (dragDepthRef.current <= 0) {
            dragDepthRef.current = 0;
            onDragLeave();
          }
        }}
        onDrop={(e) => {
          dragDepthRef.current = 0;
          onDrop(e);
        }}
      >
        {processing ? (
          <DemoOcrOverlay progress={state.progress} stageIndex={state.stageIndex} />
        ) : (
          <>
            <div
              className={`mb-2 flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed transition-colors ${
                dragOver
                  ? "border-blue-400 bg-blue-100/60"
                  : clickable
                    ? "border-blue-400 bg-blue-100/40"
                    : "border-slate-300 bg-white"
              }`}
            >
              <UploadCloud
                className={`h-7 w-7 ${dragOver || clickable ? "text-blue-500" : "text-slate-400"}`}
                aria-hidden
              />
            </div>
            <p className="text-sm font-bold text-slate-700">{slot.title}</p>
            <p className="mt-1 text-[10px] text-slate-500">
              {clickable ? "クリックで配置" : dragReject ? "別の枠へ" : "ここにドロップ"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
