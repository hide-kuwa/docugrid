"use client";

import { numDiffers } from "@/features/client-data/lib/sim-diff";

type Props = {
  canonical: number;
  display: number;
  format: (n: number) => string;
  className?: string;
  size?: "xs" | "sm" | "base";
};

/** 正規DBと異なるときだけ、さりげなく ~ と点線下線＋ツールチップで正規値を示す */
export function SimDisplayValue({
  canonical,
  display,
  format,
  className = "",
  size = "xs",
}: Props) {
  const differs = numDiffers(canonical, display);
  const sizeClass =
    size === "base" ? "text-base" : size === "sm" ? "text-sm" : "text-[10px]";

  if (!differs) {
    return (
      <span className={`tabular-nums text-slate-500 ${sizeClass} ${className}`}>
        {format(display)}
      </span>
    );
  }

  return (
    <span
      className={`group/sim relative inline-flex cursor-help items-baseline gap-0.5 tabular-nums ${sizeClass} ${className}`}
      title={`正規 DB: ${format(canonical)}`}
    >
      <span className="text-[8px] font-normal leading-none text-amber-500" aria-hidden>
        ~
      </span>
      <span className="border-b border-dotted border-amber-400/70 text-amber-800">
        {format(display)}
      </span>
    </span>
  );
}

type LegendProps = {
  show?: boolean;
  className?: string;
};

export function SimDiffLegend({ show, className = "" }: LegendProps) {
  if (!show) return null;
  return (
    <p className={`text-[10px] text-slate-400 ${className}`}>
      <span className="text-amber-600">~</span>
      <span className="border-b border-dotted border-amber-400/70">点線</span>
      は正規 DB と異なるシミュレーション値（ホバーで正規値）
    </p>
  );
}
