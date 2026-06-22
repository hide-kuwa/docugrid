"use client";

import { numDiffers } from "@/features/client-data/lib/sim-diff";

type Props = {
  canonical: number;
  simValue: number;
  editing: boolean;
  onSimChange: (value: number) => void;
  min?: number;
  className?: string;
  inputClassName?: string;
};

/** 編集中: 上段=正規値（グレー・読取専用）、下段=シミュレーション入力 */
export function CanonicalSimField({
  canonical,
  simValue,
  editing,
  onSimChange,
  min = 0,
  className = "",
  inputClassName = "",
}: Props) {
  if (!editing) return null;

  return (
    <div className={`flex w-full flex-col gap-0.5 ${className}`}>
      <input
        type="number"
        min={min}
        readOnly
        disabled
        tabIndex={-1}
        aria-label="正規値"
        className={`w-full cursor-not-allowed rounded border border-slate-200 bg-slate-100 px-1 py-0.5 text-[9px] text-slate-400 ${inputClassName}`}
        value={canonical || ""}
        title="正規値（DB・変更不可）"
      />
      <input
        type="number"
        min={min}
        aria-label="シミュレーション値"
        className={`w-full rounded border px-1 py-0.5 text-[9px] ${
          numDiffers(canonical, simValue)
            ? "border-amber-400 bg-amber-50/80 text-amber-900"
            : "border-violet-300 bg-violet-50 text-violet-900"
        } ${inputClassName}`}
        value={simValue || ""}
        onChange={(e) => onSimChange(Number(e.target.value) || 0)}
        title="シミュレーション（この画面のグラフのみ）"
        placeholder="シミュ"
      />
    </div>
  );
}

type LabeledProps = Props & {
  label: string;
  suffix?: string;
};

export function CanonicalSimLabeledField({
  label,
  suffix,
  canonical,
  simValue,
  editing,
  onSimChange,
}: LabeledProps) {
  if (!editing) return null;

  return (
    <div className="space-y-1">
      <span className="text-[10px] font-bold text-slate-600">{label}</span>
      <div className="mt-1 space-y-1">
        <div className="flex items-center gap-1">
          <span className="w-8 shrink-0 text-[9px] text-slate-400">正規</span>
          <input
            type="text"
            readOnly
            disabled
            className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-2 py-1.5 text-xs tabular-nums text-slate-400"
            value={canonical > 0 ? canonical.toLocaleString() : "—"}
          />
          {suffix ? <span className="shrink-0 text-[10px] text-slate-400">{suffix}</span> : null}
        </div>
        <div className="flex items-center gap-1">
          <span className="w-8 shrink-0 text-[9px] font-medium text-violet-600">シミュ</span>
          <input
            type="text"
            inputMode="numeric"
            className={`w-full rounded-lg border px-2.5 py-1.5 text-xs tabular-nums ${
              numDiffers(canonical, simValue)
                ? "border-amber-400 bg-amber-50/80 text-amber-900"
                : "border-violet-300 bg-violet-50 text-violet-900"
            }`}
            value={simValue > 0 ? simValue.toLocaleString() : ""}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value.replace(/[^\d]/g, ""), 10);
              onSimChange(Number.isFinite(n) ? n : 0);
            }}
            placeholder="試算用"
          />
          {suffix ? <span className="shrink-0 text-[10px] text-violet-400">{suffix}</span> : null}
        </div>
      </div>
    </div>
  );
}
