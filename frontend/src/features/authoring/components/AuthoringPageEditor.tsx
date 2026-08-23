"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { AuthoringFormatToolbar } from "@/features/authoring/components/AuthoringFormatToolbar";
import {
  indentLineText,
  parseAuthoringLines,
  serializeAuthoringLines,
  splitLineWithVariables,
  type AuthoringLine,
  type AuthoringLineAlign,
} from "@/features/authoring/lib/authoring-markup";

type Props = {
  value: string;
  onChange: (next: string) => void;
};

export type AuthoringPageEditorHandle = {
  insertText: (text: string) => void;
};

const ALIGN_CLASS: Record<AuthoringLineAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function caretOffsetIn(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return el.innerText.length;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.endContainer)) return el.innerText.length;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

function HighlightedLine({ text }: { text: string }) {
  const parts = splitLineWithVariables(text);
  if (parts.length === 1 && parts[0]?.kind === "text") {
    return <>{text || "\u00a0"}</>;
  }
  return (
    <>
      {parts.map((part, i) =>
        part.kind === "var" ? (
          <span
            key={`${part.value}-${i}`}
            className="rounded-sm bg-amber-100 px-0.5 text-amber-900 ring-1 ring-amber-200"
          >
            {part.value}
          </span>
        ) : (
          <span key={`t-${i}`}>{part.value}</span>
        ),
      )}
    </>
  );
}

function EditableLine({
  line,
  onLineChange,
  onMergeWithPrev,
  onSplitAtCursor,
  onCaret,
  onFocusLine,
  onIndent,
}: {
  line: AuthoringLine;
  onLineChange: (text: string) => void;
  onMergeWithPrev: () => void;
  onSplitAtCursor: (before: string, after: string) => void;
  onCaret: (offset: number) => void;
  onFocusLine: () => void;
  onIndent: (delta: 1 | -1) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !focused.current) return;
    if (el.innerText !== line.text) {
      el.innerText = line.text;
    }
  }, [line.text, isFocused]);

  return (
    <div
      ref={ref}
      role="textbox"
      tabIndex={0}
      contentEditable
      suppressContentEditableWarning
      className={`min-h-[1.75em] whitespace-pre-wrap break-words outline-none focus:bg-indigo-50/40 ${ALIGN_CLASS[line.align]} ${
        line.align === "center" ? "text-[14px] font-bold" : "text-[12px]"
      }`}
      onFocus={() => {
        focused.current = true;
        setIsFocused(true);
        onFocusLine();
        const el = ref.current;
        if (el) el.innerText = line.text;
      }}
      onBlur={() => {
        focused.current = false;
        setIsFocused(false);
        const el = ref.current;
        if (el) onCaret(caretOffsetIn(el));
      }}
      onInput={(e) => {
        onLineChange(e.currentTarget.innerText);
        onCaret(caretOffsetIn(e.currentTarget));
      }}
      onKeyUp={(e) => onCaret(caretOffsetIn(e.currentTarget))}
      onClick={(e) => {
        onFocusLine();
        onCaret(caretOffsetIn(e.currentTarget));
      }}
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
        if (e.key === "Tab") {
          e.preventDefault();
          onIndent(e.shiftKey ? -1 : 1);
        }
        if (e.key === "Backspace" && !line.text) {
          e.preventDefault();
          onMergeWithPrev();
        }
      }}
    >
      {!isFocused ? <HighlightedLine text={line.text} /> : null}
    </div>
  );
}

export const AuthoringPageEditor = forwardRef<AuthoringPageEditorHandle, Props>(
  function AuthoringPageEditor({ value, onChange }, ref) {
    const lines = parseAuthoringLines(value);
    const caretRef = useRef({ index: Math.max(0, lines.length - 1), offset: 0 });
    const [activeIndex, setActiveIndex] = useState(0);
    const historyRef = useRef<string[]>([value]);
    const futureRef = useRef<string[]>([]);
    const skipHistory = useRef(false);
    const typingTimer = useRef<number | null>(null);
    const [historyTick, setHistoryTick] = useState(0);

    const canUndo = historyTick >= 0 && historyRef.current.length > 1;
    const canRedo = futureRef.current.length > 0;

    const commit = useCallback(
      (nextLines: AuthoringLine[], recordHistory = true) => {
        const serialized = serializeAuthoringLines(nextLines);
        if (recordHistory && !skipHistory.current && serialized !== value) {
          historyRef.current = [...historyRef.current.slice(-79), value];
          futureRef.current = [];
          setHistoryTick((n) => n + 1);
        }
        skipHistory.current = false;
        onChange(serialized);
      },
      [onChange, value],
    );

    const updateLine = (index: number, text: string) => {
      const next = [...lines];
      next[index] = { ...next[index]!, text };
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      typingTimer.current = window.setTimeout(() => {
        historyRef.current = [...historyRef.current.slice(-79), value];
        futureRef.current = [];
        setHistoryTick((n) => n + 1);
      }, 700);
      skipHistory.current = true;
      commit(next, false);
    };

    const splitLine = (index: number, before: string, after: string) => {
      const next = [...lines];
      next[index] = { ...next[index]!, text: before };
      next.splice(index + 1, 0, { text: after, align: next[index]!.align });
      caretRef.current = { index: index + 1, offset: 0 };
      setActiveIndex(index + 1);
      commit(next);
    };

    const mergeWithPrev = (index: number) => {
      if (index <= 0) return;
      const next = [...lines];
      const prev = next[index - 1]!;
      const cur = next[index]!;
      next[index - 1] = { ...prev, text: prev.text + cur.text };
      next.splice(index, 1);
      caretRef.current = { index: index - 1, offset: prev.text.length };
      setActiveIndex(index - 1);
      commit(next);
    };

    const insertText = useCallback(
      (text: string) => {
        const index = Math.min(caretRef.current.index, Math.max(0, lines.length - 1));
        const current = lines[index] ?? { text: "", align: "left" as const };
        const offset = Math.min(Math.max(0, caretRef.current.offset), current.text.length);
        const nextText = current.text.slice(0, offset) + text + current.text.slice(offset);
        const next = [...lines];
        if (next.length === 0) {
          commit([{ text, align: "left" }]);
        } else {
          next[index] = { ...current, text: nextText };
          commit(next);
        }
        caretRef.current = { index, offset: offset + text.length };
      },
      [lines, commit],
    );

    const undo = () => {
      if (historyRef.current.length <= 1) return;
      const current = value;
      const prev = historyRef.current[historyRef.current.length - 1]!;
      historyRef.current = historyRef.current.slice(0, -1);
      futureRef.current = [...futureRef.current, current];
      skipHistory.current = true;
      setHistoryTick((n) => n + 1);
      onChange(prev);
    };

    const redo = () => {
      if (futureRef.current.length === 0) return;
      const next = futureRef.current[futureRef.current.length - 1]!;
      futureRef.current = futureRef.current.slice(0, -1);
      historyRef.current = [...historyRef.current, value];
      skipHistory.current = true;
      setHistoryTick((n) => n + 1);
      onChange(next);
    };

    const applyAlign = (align: AuthoringLineAlign) => {
      const index = Math.min(activeIndex, Math.max(0, lines.length - 1));
      const next = [...lines];
      if (!next[index]) return;
      next[index] = { ...next[index], align };
      commit(next);
    };

    const applyIndent = (delta: 1 | -1) => {
      const index = Math.min(activeIndex, Math.max(0, lines.length - 1));
      const next = [...lines];
      if (!next[index]) return;
      next[index] = { ...next[index], text: indentLineText(next[index].text, delta) };
      caretRef.current = {
        index,
        offset: Math.max(0, caretRef.current.offset + (delta === 1 ? 1 : -1)),
      };
      commit(next);
    };

    useImperativeHandle(ref, () => ({ insertText }), [insertText]);

    return (
      <div
        className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-200/60 p-3 md:p-5"
        onKeyDown={(e) => {
          const meta = e.ctrlKey || e.metaKey;
          if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
            e.preventDefault();
            undo();
          }
          if ((meta && e.key.toLowerCase() === "y") || (meta && e.shiftKey && e.key.toLowerCase() === "z")) {
            e.preventDefault();
            redo();
          }
        }}
      >
        <AuthoringFormatToolbar
          canUndo={canUndo}
          canRedo={canRedo}
          align={lines[activeIndex]?.align ?? "left"}
          onUndo={undo}
          onRedo={redo}
          onAlign={applyAlign}
          onIndent={applyIndent}
        />
        <div
          className="mx-auto w-full max-w-[210mm] bg-white text-slate-900 shadow-lg ring-1 ring-slate-200/80"
          style={{
            minHeight: "min(297mm, 68vh)",
            padding: "20mm 18mm 22mm",
            fontFamily: '"Yu Mincho", "Hiragino Mincho ProN", "MS PMincho", serif',
            lineHeight: 1.9,
          }}
        >
          {lines.map((line, index) => (
            <EditableLine
              key={`line-${index}`}
              line={line}
              onLineChange={(text) => updateLine(index, text)}
              onMergeWithPrev={() => mergeWithPrev(index)}
              onSplitAtCursor={(before, after) => splitLine(index, before, after)}
              onFocusLine={() => setActiveIndex(index)}
              onIndent={applyIndent}
              onCaret={(offset) => {
                caretRef.current = { index, offset };
                setActiveIndex(index);
              }}
            />
          ))}
        </div>
        <p className="mx-auto mt-2 max-w-[210mm] text-center text-[10px] text-slate-500">
          黄色は未差し込み。保存すると枠に入り、PDF をお客さんへ渡せます。
        </p>
      </div>
    );
  },
);
