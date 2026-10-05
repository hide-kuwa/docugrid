"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type WheelEvent,
} from "react";
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
  /** 差し込みプレビューなど、編集不可 */
  readOnly?: boolean;
};

export type AuthoringPageEditorHandle = {
  insertText: (text: string) => void;
};

const ALIGN_CLASS: Record<AuthoringLineAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function normalizeDomText(raw: string): string {
  // contentEditable は末尾改行を足しがち。行モデルでは 1 行＝改行なし。
  return raw.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").replace(/\n$/, "");
}

function caretOffsetIn(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return normalizeDomText(el.innerText).length;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.endContainer)) return normalizeDomText(el.innerText).length;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

function setCaretOffset(el: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const clamped = Math.max(0, offset);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let remaining = clamped;
  let node = walker.nextNode();
  while (node) {
    const len = node.textContent?.length ?? 0;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
    node = walker.nextNode();
  }
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
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

function lineClassName(line: AuthoringLine): string {
  return `min-h-[1.75em] whitespace-pre-wrap break-words outline-none focus:bg-indigo-50/40 ${ALIGN_CLASS[line.align]} ${
    line.align === "center" ? "text-[14px] font-bold" : "text-[12px]"
  }`;
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
  const [isFocused, setIsFocused] = useState(false);
  const caretOnFocus = useRef<number | null>(null);
  /** この行から親へ最後に送った文言（外部差し込みとの差分検出用） */
  const lastEmitted = useRef(line.text);

  useLayoutEffect(() => {
    if (!isFocused) return;
    const el = ref.current;
    if (!el) return;
    // フォーカス開始時だけ DOM をシード
    el.innerText = line.text;
    lastEmitted.current = line.text;
    const want = caretOnFocus.current ?? line.text.length;
    caretOnFocus.current = null;
    setCaretOffset(el, want);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- フォーカス入場時のみ
  }, [isFocused]);

  useLayoutEffect(() => {
    if (!isFocused) return;
    const el = ref.current;
    if (!el) return;
    // パレット差し込みなど、親から来た外部更新だけ反映（入力中の上書き禁止）
    if (line.text === lastEmitted.current) return;
    const caret = caretOffsetIn(el);
    const delta = line.text.length - lastEmitted.current.length;
    el.innerText = line.text;
    lastEmitted.current = line.text;
    setCaretOffset(el, Math.max(0, caret + Math.max(0, delta)));
  }, [isFocused, line.text]);

  useEffect(() => {
    if (!isFocused) return;
    ref.current?.focus();
  }, [isFocused]);

  const beginEdit = () => {
    if (caretOnFocus.current == null) {
      caretOnFocus.current = line.text.length;
    }
    setIsFocused(true);
    onFocusLine();
  };

  if (!isFocused) {
    return (
      <div
        role="textbox"
        tabIndex={0}
        className={lineClassName(line)}
        onPointerDown={() => {
          caretOnFocus.current = line.text.length;
        }}
        onFocus={beginEdit}
      >
        <HighlightedLine text={line.text} />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      role="textbox"
      tabIndex={0}
      contentEditable
      suppressContentEditableWarning
      className={lineClassName(line)}
      onBlur={() => {
        const el = ref.current;
        if (el) {
          const next = normalizeDomText(el.innerText);
          lastEmitted.current = next;
          if (next !== line.text) onLineChange(next);
          onCaret(caretOffsetIn(el));
        }
        setIsFocused(false);
      }}
      onInput={(e) => {
        const next = normalizeDomText(e.currentTarget.innerText);
        lastEmitted.current = next;
        onLineChange(next);
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
    />
  );
}

function ReadOnlyPage({ value }: { value: string }) {
  const lines = parseAuthoringLines(value);
  return (
    <div
      className="w-full bg-white text-slate-900 shadow-lg ring-1 ring-slate-200/80"
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "20mm 18mm 22mm",
        fontFamily: '"Yu Mincho", "Hiragino Mincho ProN", "MS PMincho", serif',
        lineHeight: 1.9,
      }}
    >
      {lines.map((line, index) => (
        <div key={`ro-${index}`} className={lineClassName(line)}>
          <HighlightedLine text={line.text} />
        </div>
      ))}
    </div>
  );
}

const ZOOM_STEPS = [0.5, 0.6, 0.75, 0.85, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;
const PAGE_WIDTH_MM = 210;

function nearestZoomIndex(zoom: number): number {
  let best = 0;
  let bestDiff = Infinity;
  ZOOM_STEPS.forEach((step, i) => {
    const d = Math.abs(step - zoom);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  });
  return best;
}

function ZoomableSurface({
  zoom,
  children,
}: {
  zoom: number;
  children: ReactNode;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const [baseHeight, setBaseHeight] = useState(800);

  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const measure = () => setBaseHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoom]);

  return (
    <div
      className="mx-auto"
      style={{
        width: `calc(${PAGE_WIDTH_MM}mm * ${zoom})`,
        height: baseHeight * zoom,
      }}
    >
      <div
        ref={pageRef}
        style={{
          width: `${PAGE_WIDTH_MM}mm`,
          transform: `scale(${zoom})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export const AuthoringPageEditor = forwardRef<AuthoringPageEditorHandle, Props>(
  function AuthoringPageEditor({ value, onChange, readOnly = false }, ref) {
    const lines = parseAuthoringLines(value);
    const caretRef = useRef({ index: Math.max(0, lines.length - 1), offset: 0 });
    const [activeIndex, setActiveIndex] = useState(0);
    const historyRef = useRef<string[]>([value]);
    const futureRef = useRef<string[]>([]);
    const skipHistory = useRef(false);
    const typingTimer = useRef<number | null>(null);
    const [historyTick, setHistoryTick] = useState(0);
    const [zoom, setZoom] = useState(1);

    const canUndo = historyTick >= 0 && historyRef.current.length > 1;
    const canRedo = futureRef.current.length > 0;
    const zoomPercent = Math.round(zoom * 100);

    const zoomIn = useCallback(() => {
      setZoom((z) => ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, nearestZoomIndex(z) + 1)]!);
    }, []);
    const zoomOut = useCallback(() => {
      setZoom((z) => ZOOM_STEPS[Math.max(0, nearestZoomIndex(z) - 1)]!);
    }, []);
    const zoomReset = useCallback(() => setZoom(1), []);

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
        if (readOnly) return;
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
      [lines, commit, readOnly],
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

    const onShellKeyDown = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (meta && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoomIn();
        return;
      }
      if (meta && e.key === "-") {
        e.preventDefault();
        zoomOut();
        return;
      }
      if (meta && e.key === "0") {
        e.preventDefault();
        zoomReset();
        return;
      }
      if (readOnly) return;
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((meta && e.key.toLowerCase() === "y") || (meta && e.shiftKey && e.key.toLowerCase() === "z")) {
        e.preventDefault();
        redo();
      }
    };

    const onShellWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else if (e.deltaY > 0) zoomOut();
    };

    const pagePaper = readOnly ? (
      <ReadOnlyPage value={value} />
    ) : (
      <div
        className="bg-white text-slate-900 shadow-lg ring-1 ring-slate-200/80"
        style={{
          width: `${PAGE_WIDTH_MM}mm`,
          minHeight: "297mm",
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
    );

    return (
      <div
        className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-200/60"
        onKeyDown={onShellKeyDown}
        onWheel={onShellWheel}
      >
        <div className="shrink-0 px-2 pt-2 md:px-4">
          <AuthoringFormatToolbar
            canUndo={canUndo}
            canRedo={canRedo}
            align={lines[activeIndex]?.align ?? "left"}
            onUndo={undo}
            onRedo={redo}
            onAlign={applyAlign}
            onIndent={applyIndent}
            zoomPercent={zoomPercent}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onZoomReset={zoomReset}
            zoomOnly={readOnly}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3 md:p-5">
          <ZoomableSurface zoom={zoom}>{pagePaper}</ZoomableSurface>
          <p className="mx-auto mt-3 max-w-[210mm] text-center text-[10px] text-slate-500">
            {readOnly
              ? "差し込みプレビュー（編集は「かっこ書き」に戻ってください）· Ctrl+ホイールで拡大縮小"
              : "黄色は差し込み前の項目。【】や {{ }} のまま編集 · Ctrl+ホイール / Ctrl± で拡大縮小"}
          </p>
        </div>
      </div>
    );
  },
);
