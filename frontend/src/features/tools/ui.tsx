"use client";

import { useEffect, useState, type ReactNode } from "react";
import { toolsTheme } from "@/features/tools/taxx-tools-theme";

// 数値入力：入力途中の空欄を許容し（バックスペースで全消去できる）、先頭ゼロを自動除去する。
export function NumInput({
  value,
  onValueChange,
  min = 0,
  className,
  id,
  formatWithCommas = false,
}: {
  value: number;
  onValueChange: (n: number) => void;
  min?: number;
  className?: string;
  id?: string;
  formatWithCommas?: boolean;
}) {
  const formatValue = (n: number) => (formatWithCommas ? n.toLocaleString("ja-JP") : String(n));
  const parseValue = (s: string) => Number(s.replace(/,/g, ""));
  const [text, setText] = useState(formatValue(value));

  useEffect(() => {
    setText((prev) => (parseValue(prev) === value ? prev : formatValue(value)));
  }, [value, formatWithCommas]);

  return (
    <input
      id={id}
      type={formatWithCommas ? "text" : "number"}
      inputMode="numeric"
      min={min}
      value={text}
      onChange={(e) => {
        const cleaned = e.target.value.replace(/,/g, "").replace(/^0+(?=\d)/, "");
        setText(cleaned);
        if (cleaned === "") return;
        const n = parseValue(cleaned);
        if (!Number.isNaN(n)) onValueChange(n);
      }}
      onBlur={() => {
        const n = parseValue(text);
        if (text === "" || Number.isNaN(n)) {
          setText(formatValue(min));
          onValueChange(min);
        } else {
          setText(formatValue(n));
        }
      }}
      className={
        className ??
        "w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
      }
    />
  );
}

export type ResultMetric = { label: string; value: string; sub?: string };

// 計算結果カード。ラベル付きの大きな数値ボックスを並べ、右側に内訳を添える。
export function ResultCard({
  metrics,
  breakdown,
  tone = "blue",
  placeholder = "上の値を入力すると自動で結果が表示されます。",
}: {
  metrics: ResultMetric[] | null;
  breakdown?: ReactNode;
  tone?: "blue" | "emerald" | "taxx" | "red";
  placeholder?: string;
}) {
  if (!metrics || metrics.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        {placeholder}
      </div>
    );
  }
  const toneCls =
    tone === "taxx" || tone === "emerald"
      ? `${toolsTheme.resultCard}`
      : tone === "red"
        ? "border-red-300 bg-red-50"
        : "border-blue-300 bg-blue-50";
  const valueCls =
    tone === "taxx" || tone === "emerald"
      ? toolsTheme.resultCardLabel
      : tone === "red"
        ? "text-red-700"
        : "text-blue-700";
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      {metrics.map((m, i) => (
        <div key={i} className={`rounded-xl border px-5 py-3 shadow-sm ${toneCls}`}>
          <div className="text-[11px] font-bold text-slate-500">{m.label}</div>
          <div className={`text-2xl font-black ${valueCls}`}>{m.value}</div>
          {m.sub ? <div className="text-[10px] font-medium text-slate-500">{m.sub}</div> : null}
        </div>
      ))}
      {breakdown ? <div className="text-xs text-slate-500">{breakdown}</div> : null}
    </div>
  );
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
      {label}
      {children}
    </label>
  );
}

export function yen(n: unknown): string {
  return `${Number(n).toLocaleString("ja-JP")}円`;
}

export function ratePct(n: unknown): string {
  const v = Number(n);
  if (Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(v * 100 === Math.round(v * 100) ? 0 : 1)}%`;
}
