"use client";

import {
  ArrowUpDown,
  CheckCircle2,
  Eraser,
  Highlighter,
  Minus,
  MousePointer2,
  Redo2,
  Square,
  Type,
  Undo2,
} from "lucide-react";
import type { ToolType } from "../types";

type Props = {
  activeTool: ToolType;
  isReordering: boolean;
  isLoading: boolean;
  canAnnotate: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  setActiveTool: (tool: ToolType) => void;
  setIsReordering: (next: boolean) => void;
};

const TOOLS: {
  id: ToolType;
  label: string;
  hint: string;
  icon: typeof Highlighter;
  activeClass: string;
  idleClass: string;
}[] = [
  {
    id: "marker",
    label: "マーカー",
    hint: "ドラッグして蛍光マーカー",
    icon: Highlighter,
    activeClass: "bg-amber-100 text-amber-800 ring-2 ring-amber-400",
    idleClass: "text-amber-700 hover:bg-amber-50",
  },
  {
    id: "box",
    label: "枠線",
    hint: "ドラッグして矩形を描く",
    icon: Square,
    activeClass: "bg-rose-100 text-rose-800 ring-2 ring-rose-400",
    idleClass: "text-rose-700 hover:bg-rose-50",
  },
  {
    id: "line",
    label: "線",
    hint: "ドラッグして下線・取り消し線",
    icon: Minus,
    activeClass: "bg-sky-100 text-sky-800 ring-2 ring-sky-400",
    idleClass: "text-sky-700 hover:bg-sky-50",
  },
  {
    id: "check",
    label: "チェック",
    hint: "クリック位置にチェック",
    icon: CheckCircle2,
    activeClass: "bg-emerald-100 text-emerald-800 ring-2 ring-emerald-400",
    idleClass: "text-emerald-700 hover:bg-emerald-50",
  },
  {
    id: "text",
    label: "テキスト",
    hint: "クリックまたはドラッグで文字ボックスを置き、直接入力",
    icon: Type,
    activeClass: "bg-violet-100 text-violet-800 ring-2 ring-violet-400",
    idleClass: "text-violet-700 hover:bg-violet-50",
  },
  {
    id: "eraser",
    label: "消しゴム",
    hint: "範囲ドラッグで注釈を消す",
    icon: Eraser,
    activeClass: "bg-slate-200 text-slate-900 ring-2 ring-slate-500",
    idleClass: "text-slate-600 hover:bg-slate-100",
  },
];

/**
 * Adobe 風の縦ツールレール — アイコン＋ラベルで操作を主張する。
 */
export function ViewerToolsRail({
  activeTool,
  isReordering,
  isLoading,
  canAnnotate,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  setActiveTool,
  setIsReordering,
}: Props) {
  const activeMeta = !isReordering
    ? TOOLS.find((t) => t.id === activeTool)
    : undefined;
  const hint = isReordering
    ? "ページをドラッグして並べ替え"
    : activeMeta?.hint ?? "ツールを選んで PDF 上を操作";

  return (
    <aside className="flex w-[5.5rem] shrink-0 flex-col border-r border-slate-300 bg-white shadow-[2px_0_8px_rgba(15,23,42,0.06)]">
      <div className="border-b border-slate-200 px-2 py-2.5">
        <p className="text-center text-[10px] font-black uppercase tracking-wider text-slate-500">
          ツール
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-1.5">
        <button
          type="button"
          disabled={isLoading || isReordering}
          onClick={() => setActiveTool("none")}
          className={[
            "flex flex-col items-center gap-1 rounded-xl px-1 py-2 transition",
            !isReordering && activeTool === "none"
              ? "bg-teal-100 text-teal-900 ring-2 ring-teal-500"
              : "text-slate-600 hover:bg-slate-100",
            isLoading || isReordering ? "opacity-40" : "",
          ].join(" ")}
          title="選択（注釈オフ）"
        >
          <MousePointer2 className="h-5 w-5" />
          <span className="text-[10px] font-bold leading-tight">選択</span>
        </button>

        {!isReordering
          ? TOOLS.map((tool) => {
              const Icon = tool.icon;
              const active = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  disabled={isLoading || !canAnnotate}
                  onClick={() => setActiveTool(active ? "none" : tool.id)}
                  title={tool.hint}
                  className={[
                    "flex flex-col items-center gap-1 rounded-xl px-1 py-2 transition",
                    active ? tool.activeClass : tool.idleClass,
                    isLoading || !canAnnotate ? "opacity-40" : "",
                  ].join(" ")}
                >
                  <Icon className={`h-5 w-5 ${tool.id === "line" ? "-rotate-45" : ""}`} />
                  <span className="text-[10px] font-bold leading-tight">{tool.label}</span>
                </button>
              );
            })
          : null}

        <div className="my-1 border-t border-slate-200" />

        <button
          type="button"
          disabled={isLoading || !canAnnotate || !canUndo || !onUndo}
          onClick={onUndo}
          title="元に戻す (Ctrl+Z)"
          className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
        >
          <Undo2 className="h-5 w-5" />
          <span className="text-[10px] font-bold leading-tight">戻す</span>
        </button>
        <button
          type="button"
          disabled={isLoading || !canAnnotate || !canRedo || !onRedo}
          onClick={onRedo}
          title="やり直す (Ctrl+Y)"
          className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
        >
          <Redo2 className="h-5 w-5" />
          <span className="text-[10px] font-bold leading-tight">進む</span>
        </button>

        <div className="my-1 border-t border-slate-200" />

        <button
          type="button"
          disabled={isLoading}
          onClick={() => {
            if (!isReordering) setActiveTool("none");
            setIsReordering(!isReordering);
          }}
          title="ページを並べ替える"
          className={[
            "flex flex-col items-center gap-1 rounded-xl px-1 py-2 transition",
            isReordering
              ? "bg-blue-600 text-white ring-2 ring-blue-400"
              : "text-blue-700 hover:bg-blue-50",
            isLoading ? "opacity-40" : "",
          ].join(" ")}
        >
          <ArrowUpDown className="h-5 w-5" />
          <span className="text-[10px] font-bold leading-tight">並べ替え</span>
        </button>
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-2 py-2.5">
        <p className="text-center text-[10px] font-semibold leading-snug text-slate-600">{hint}</p>
      </div>
    </aside>
  );
}
