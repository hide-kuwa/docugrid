"use client";

import { Sparkles } from "lucide-react";

import {
  describeClassifyEngine,
  type ClassifyBanner,
  type ClassifyEngineTone,
} from "@/features/docugrid/lib/classify-display";

const BANNER_STYLES: Record<ClassifyEngineTone, string> = {
  gemini: "border-violet-200 bg-violet-50 text-violet-950",
  openai: "border-emerald-200 bg-emerald-50 text-emerald-950",
  rules: "border-slate-200 bg-slate-50 text-slate-700",
  warn: "border-amber-200 bg-amber-50 text-amber-950",
  neutral: "border-indigo-200 bg-indigo-50 text-indigo-950",
};

const ICON_STYLES: Record<ClassifyEngineTone, string> = {
  gemini: "text-violet-600",
  openai: "text-emerald-600",
  rules: "text-slate-500",
  warn: "text-amber-600",
  neutral: "text-indigo-600",
};

export function ClassifyFeedbackBanner({ banner }: { banner: ClassifyBanner }) {
  return (
    <div
      className={`mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 ${BANNER_STYLES[banner.tone]}`}
      role="status"
    >
      <Sparkles className={`mt-0.5 h-4 w-4 shrink-0 ${ICON_STYLES[banner.tone]}`} aria-hidden />
      <div className="min-w-0">
        <p className="text-xs font-bold leading-snug">{banner.title}</p>
        {banner.detail ? (
          <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">{banner.detail}</p>
        ) : null}
      </div>
    </div>
  );
}

export function ClassifyEngineBadge({ engine }: { engine: string }) {
  const info = describeClassifyEngine(engine);
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold leading-none ${info.badgeClass}`}
    >
      {info.shortLabel}
    </span>
  );
}
