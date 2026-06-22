"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  parseAuthoringLines,
  serializeAuthoringLines,
  type AuthoringLine,
  type AuthoringLineAlign,
} from "@/features/authoring/lib/authoring-markup";

type Props = {
  value: string;
  onChange: (next: string) => void;
};

const ALIGN_CLASS: Record<AuthoringLineAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function EditableLine({
  line,
  onLineChange,
  onMergeWithPrev,
  onSplitAtCursor,
}: {
  line: AuthoringLine;
  onLineChange: (text: string) => void;
  onMergeWithPrev: () => void;
  onSplitAtCursor: (before: string, after: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || focused.current) return;
    if (el.innerText !== line.text) {
      el.innerText = line.text;
    }
  }, [line.text]);

  return (
    <div
      ref={ref}
      role="textbox"
      tabIndex={0}
      contentEditable
      suppressContentEditableWarning
      className={`min-h-[1.65em] whitespace-pre-wrap break-words outline-none focus:bg-indigo-50/40 ${ALIGN_CLASS[line.align]} ${
        line.align === "center" ? "text-[13px] font-bold tracking-wide" : "text-[11px]"
      }`}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
      }}
      onInput={(e) => onLineChange(e.currentTarget.innerText)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return;
          const range = sel.getRangeAt(0);
          const el = ref.current;
          if (!el) return;
          const pre = range.cloneRange();
          pre.selectNodeContents(el);
          pre.setEnd(range.endContainer, range.endOffset);
          const before = pre.toString();
          const after = line.text.slice(before.length);
          onSplitAtCursor(before, after);
        }
        if (e.key === "Backspace" && !line.text) {
          e.preventDefault();
          onMergeWithPrev();
        }
      }}
    />
  );
}

export function AuthoringPageEditor({ value, onChange }: Props) {
  const lines = parseAuthoringLines(value);

  const commit = useCallback(
    (nextLines: AuthoringLine[]) => {
      onChange(serializeAuthoringLines(nextLines));
    },
    [onChange],
  );

  const updateLine = (index: number, text: string) => {
    const next = [...lines];
    next[index] = { ...next[index]!, text };
    commit(next);
  };

  const splitLine = (index: number, before: string, after: string) => {
    const next = [...lines];
    next[index] = { ...next[index]!, text: before };
    next.splice(index + 1, 0, { text: after, align: next[index]!.align });
    commit(next);
  };

  const mergeWithPrev = (index: number) => {
    if (index <= 0) return;
    const next = [...lines];
    const prev = next[index - 1]!;
    const cur = next[index]!;
    next[index - 1] = { ...prev, text: prev.text + cur.text };
    next.splice(index, 1);
    commit(next);
  };

  return (
    <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-200/60 p-3 md:p-5">
      <div
        className="mx-auto w-full max-w-[210mm] bg-white text-slate-900 shadow-lg ring-1 ring-slate-200/80"
        style={{
          minHeight: "min(297mm, 70vh)",
          padding: "20mm 18mm 22mm",
          fontFamily: '"Yu Mincho", "Hiragino Mincho ProN", "MS PMincho", serif',
          lineHeight: 1.75,
        }}
      >
        {lines.map((line, index) => (
          <EditableLine
            key={`line-${index}`}
            line={line}
            onLineChange={(text) => updateLine(index, text)}
            onMergeWithPrev={() => mergeWithPrev(index)}
            onSplitAtCursor={(before, after) => splitLine(index, before, after)}
          />
        ))}
      </div>
      <p className="mx-auto mt-2 max-w-[210mm] text-center text-[10px] text-slate-500">
        A4 プレビュー — 完成イメージのまま直接編集（Enter で改行）
      </p>
    </div>
  );
}
