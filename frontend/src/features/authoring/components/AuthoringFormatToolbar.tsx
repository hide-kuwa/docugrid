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
}: Props) {
  return (
    <div className="mx-auto flex w-full max-w-[210mm] flex-wrap items-center gap-0.5 rounded-t-lg border border-b-0 border-slate-200 bg-white px-1 py-0.5">
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
    </div>
  );
}
