"use client";

import type { ReactNode } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  IndentDecrease,
  IndentIncrease,
  Redo2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { AuthoringLineAlign } from "@/features/authoring/lib/authoring-markup";

type Props = {
  canUndo: boolean;
  canRedo: boolean;
  align: AuthoringLineAlign;
  onUndo: () => void;
  onRedo: () => void;
  onAlign: (align: AuthoringLineAlign) => void;
  onIndent: (delta: 1 | -1) => void;
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  /** 差し込みプレビューなど編集不可時は揃え系を隠す */
  zoomOnly?: boolean;
};

function ToolBtn({
  label,
  disabled,
  pressed,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-bold hover:bg-slate-100 disabled:opacity-40 ${
        pressed ? "bg-indigo-50 text-indigo-800" : "text-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

export function AuthoringFormatToolbar({
  canUndo,
  canRedo,
  align,
  onUndo,
  onRedo,
  onAlign,
  onIndent,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  zoomOnly = false,
}: Props) {
  return (
    <div className="sticky top-0 z-10 mx-auto flex w-full max-w-[210mm] flex-wrap items-center gap-0.5 rounded-t-lg border border-slate-200 bg-white/95 px-1 py-0.5 shadow-sm backdrop-blur">
      {!zoomOnly ? (
        <>
          <ToolBtn label="元に戻す (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}>
            <Undo2 className="h-3.5 w-3.5" />
            戻す
          </ToolBtn>
          <ToolBtn label="やり直し (Ctrl+Y)" disabled={!canRedo} onClick={onRedo}>
            <Redo2 className="h-3.5 w-3.5" />
          </ToolBtn>
          <span className="mx-1 h-4 w-px bg-slate-200" />
          <ToolBtn label="左揃え" pressed={align === "left"} onClick={() => onAlign("left")}>
            <AlignLeft className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn label="中央揃え" pressed={align === "center"} onClick={() => onAlign("center")}>
            <AlignCenter className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn label="右揃え" pressed={align === "right"} onClick={() => onAlign("right")}>
            <AlignRight className="h-3.5 w-3.5" />
          </ToolBtn>
          <span className="mx-1 h-4 w-px bg-slate-200" />
          <ToolBtn label="字下げ (Tab)" onClick={() => onIndent(1)}>
            <IndentIncrease className="h-3.5 w-3.5" />
            字下げ
          </ToolBtn>
          <ToolBtn label="字下げを戻す (Shift+Tab)" onClick={() => onIndent(-1)}>
            <IndentDecrease className="h-3.5 w-3.5" />
          </ToolBtn>
          <span className="mx-1 h-4 w-px bg-slate-200" />
        </>
      ) : null}
      <ToolBtn label="縮小 (Ctrl+-)" onClick={onZoomOut}>
        <ZoomOut className="h-3.5 w-3.5" />
      </ToolBtn>
      <button
        type="button"
        title="100% に戻す (Ctrl+0)"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onZoomReset}
        className="min-w-[3.25rem] rounded-md px-1.5 py-1 text-center text-[11px] font-bold tabular-nums text-slate-700 hover:bg-slate-100"
      >
        {zoomPercent}%
      </button>
      <ToolBtn label="拡大 (Ctrl+=)" onClick={onZoomIn}>
        <ZoomIn className="h-3.5 w-3.5" />
      </ToolBtn>
    </div>
  );
}
