"use client";

import type { DemoMetric } from "./demo-scenario";

type Props = {
  metrics: DemoMetric[];
  visibleCount: number;
};

export function DemoMetricBurst({ metrics, visibleCount }: Props) {
  if (visibleCount <= 0) return null;

  return (
    <div className="absolute -bottom-2 left-1/2 z-30 flex w-[calc(100%+1rem)] -translate-x-1/2 flex-col gap-1.5">
      {metrics.slice(0, visibleCount).map((m, i) => (
        <div
          key={m.key}
          className="demo-metric-pop flex items-center justify-between gap-2 rounded-lg border border-emerald-200/80 bg-white px-2.5 py-1.5 shadow-lg shadow-emerald-500/10"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <span className="truncate text-[10px] font-bold text-slate-600">{m.label}</span>
          <span className="shrink-0 font-mono text-[11px] font-bold text-emerald-700">{m.formatted}</span>
        </div>
      ))}
    </div>
  );
}
