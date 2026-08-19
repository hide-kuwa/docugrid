"use client";

import { useEffect, useRef } from "react";
import { Check, GripVertical, Minus, Plus, X } from "lucide-react";

export type PdfTextDraft = {
  slot: number;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fontSize: number;
  color: string;
  /** 編集時: 消す対象の元ボックス */
  origin?: { x: number; y: number; w: number; h: number };
};

type Props = {
  draft: PdfTextDraft;
  onChange: (next: PdfTextDraft) => void;
  onCommit: () => void;
  onCancel: () => void;
};

const COLORS = [
  { id: "blue", value: "#1e3a8a", label: "青" },
  { id: "black", value: "#0f172a", label: "黒" },
  { id: "red", value: "#b91c1c", label: "赤" },
] as const;

type DragState =
  | {
      kind: "move";
      startX: number;
      startY: number;
      origX: number;
      origY: number;
      pw: number;
      ph: number;
    }
  | {
      kind: "resize";
      startX: number;
      startY: number;
      origW: number;
      origH: number;
      pw: number;
      ph: number;
    };

/**
 * Adobe 風: PDF 上に直接テキストボックスを置いて入力する。
 * ツールバーは一列。ハンドルで移動・右下でサイズ変更。
 */
export function PdfTextComposer({ draft, onChange, onCommit, onCancel }: Props) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef(draft);
  const dragRef = useRef<DragState | null>(null);
  draftRef.current = draft;

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const pageSize = () => {
    const parent = rootRef.current?.offsetParent as HTMLElement | null;
    if (!parent) return { pw: 1, ph: 1 };
    const r = parent.getBoundingClientRect();
    return { pw: Math.max(1, r.width), ph: Math.max(1, r.height) };
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
  };

  const onDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    e.preventDefault();
    const cur = draftRef.current;
    if (d.kind === "move") {
      const dx = (e.clientX - d.startX) / d.pw;
      const dy = (e.clientY - d.startY) / d.ph;
      const nextX = Math.min(Math.max(0, d.origX + dx), Math.max(0, 1 - cur.w));
      const nextY = Math.min(Math.max(0, d.origY + dy), 0.92);
      onChange({ ...cur, x: nextX, y: nextY });
      return;
    }
    const dw = (e.clientX - d.startX) / d.pw;
    const dh = (e.clientY - d.startY) / d.ph;
    onChange({
      ...cur,
      w: Math.min(0.9, Math.max(0.12, d.origW + dw)),
      h: Math.min(0.5, Math.max(0.05, d.origH + dh)),
    });
  };

  const startMove = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { pw, ph } = pageSize();
    const cur = draftRef.current;
    dragRef.current = {
      kind: "move",
      startX: e.clientX,
      startY: e.clientY,
      origX: cur.x,
      origY: cur.y,
      pw,
      ph,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { pw, ph } = pageSize();
    const cur = draftRef.current;
    dragRef.current = {
      kind: "resize",
      startX: e.clientX,
      startY: e.clientY,
      origW: cur.w,
      origH: cur.h,
      pw,
      ph,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  return (
    <div
      ref={rootRef}
      className="absolute z-30"
      style={{
        left: `${draft.x * 100}%`,
        top: `${draft.y * 100}%`,
        width: `${draft.w * 100}%`,
        minWidth: 200,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      {/* ツールバーはボックス幅に縛られず一列 */}
      <div className="mb-1 inline-flex w-max max-w-none flex-nowrap items-center gap-0.5 rounded-lg border border-violet-300 bg-white/95 px-1 py-1 shadow-md">
        <button
          type="button"
          title="ドラッグで移動"
          aria-label="移動"
          className="cursor-grab touch-none rounded p-1 text-slate-500 hover:bg-slate-100 active:cursor-grabbing"
          onPointerDown={startMove}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="小さく"
          className="rounded p-1 text-slate-600 hover:bg-slate-100"
          onClick={() =>
            onChange({ ...draft, fontSize: Math.max(10, draft.fontSize - 2) })
          }
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-6 shrink-0 text-center text-[10px] font-bold tabular-nums text-slate-700">
          {draft.fontSize}
        </span>
        <button
          type="button"
          title="大きく"
          className="rounded p-1 text-slate-600 hover:bg-slate-100"
          onClick={() =>
            onChange({ ...draft, fontSize: Math.min(36, draft.fontSize + 2) })
          }
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <div className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-200" />
        {COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            title={c.label}
            aria-label={c.label}
            onClick={() => onChange({ ...draft, color: c.value })}
            className={`h-3.5 w-3.5 shrink-0 rounded-full border ${
              draft.color === c.value ? "ring-2 ring-violet-500 ring-offset-1" : "border-slate-300"
            }`}
            style={{ backgroundColor: c.value }}
          />
        ))}
        <div className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-200" />
        <button
          type="button"
          title="確定 (Ctrl+Enter)"
          className="shrink-0 rounded bg-violet-600 p-1 text-white hover:bg-violet-500"
          onClick={onCommit}
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="キャンセル (Esc)"
          className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100"
          onClick={onCancel}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="relative">
        <textarea
          ref={areaRef}
          value={draft.text}
          placeholder="ここに入力…"
          rows={3}
          className="w-full resize-none rounded border-2 border-violet-500 bg-amber-50/95 px-2 py-1.5 shadow-lg outline-none ring-2 ring-violet-300/40 placeholder:text-slate-400"
          style={{
            color: draft.color,
            fontSize: `${draft.fontSize}px`,
            lineHeight: 1.35,
            minHeight: Math.max(48, draft.h * 280),
          }}
          onChange={(e) => onChange({ ...draft, text: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
              return;
            }
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              onCommit();
            }
          }}
        />
        <button
          type="button"
          title="ドラッグでサイズ変更"
          aria-label="サイズ変更"
          className="absolute bottom-0.5 right-0.5 h-4 w-4 cursor-se-resize touch-none rounded-sm border border-violet-400 bg-white/90 shadow-sm"
          onPointerDown={startResize}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className="pointer-events-none absolute inset-0 flex items-end justify-end p-0.5">
            <span className="block h-2 w-2 border-b-2 border-r-2 border-violet-600" />
          </span>
        </button>
      </div>
      <p className="mt-0.5 whitespace-nowrap text-[9px] font-semibold text-violet-700/80">
        {draft.origin
          ? "編集中 · ハンドルで移動 · Ctrl+Enter で更新"
          : "ハンドルで移動 · Ctrl+Enter で確定 · Esc で取消"}
      </p>
    </div>
  );
}
