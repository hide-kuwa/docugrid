"use client";

import { Loader2 } from "lucide-react";
import { DEMO_OCR_STAGES } from "./demo-scenario";

type Props = {
  progress: number;
  stageIndex: number;
};

export function DemoOcrOverlay({ progress, stageIndex }: Props) {
  const stage = DEMO_OCR_STAGES[Math.min(stageIndex, DEMO_OCR_STAGES.length - 1)];

  return (
    <div className="absolute inset-0 z-20 overflow-hidden rounded-xl bg-slate-900/85 backdrop-blur-[2px]">
      <div
        className="demo-ocr-scanline pointer-events-none absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_24px_rgba(34,211,238,0.9)]"
        aria-hidden
      />
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-white">
        <Loader2 className="h-7 w-7 animate-spin text-cyan-300" aria-hidden />
        <p className="text-xs font-bold uppercase tracking-widest text-cyan-200/90">OCR</p>
        <p className="text-sm font-semibold">{stage}</p>
        <div className="mt-1 h-1.5 w-full max-w-[140px] overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
        <p className="font-mono text-lg font-bold tabular-nums text-cyan-100">{Math.round(progress)}%</p>
      </div>
    </div>
  );
}
