"use client";

import type { AuditPhase } from "@/features/pdf-viewer/state/auto-vouch-bridge-store";
import { Check } from "lucide-react";

const STEPS: { phase: AuditPhase; label: string }[] = [
  { phase: "navigating", label: "資料を開く" },
  { phase: "viewer", label: "数値照合" },
  { phase: "preview", label: "位置確認" },
  { phase: "stamped", label: "スタンプ済" },
];

function phaseIndex(phase: AuditPhase): number {
  if (phase === "idle") return -1;
  if (phase === "navigating") return 0;
  if (phase === "viewer") return 1;
  if (phase === "preview") return 2;
  if (phase === "stamped") return 3;
  return -1;
}

type Props = {
  phase: AuditPhase;
  className?: string;
};

/** 監査チェックの進捗ステップ（コンパクト） */
export function AuditFlowSteps({ phase, className = "" }: Props) {
  const current = phaseIndex(phase);
  if (current < 0) return null;

  return (
    <ol
      className={`flex flex-wrap items-center gap-1 text-[9px] ${className}`}
      aria-label="監査チェックの進捗"
    >
      {STEPS.map((step, idx) => {
        const done = idx < current || (phase === "stamped" && idx <= 3);
        const active = idx === current;
        return (
          <li
            key={step.phase}
            className={[
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
              done
                ? "bg-emerald-600/30 text-emerald-200"
                : active
                  ? "bg-purple-500/40 text-white ring-1 ring-purple-400"
                  : "bg-slate-700/50 text-slate-500",
            ].join(" ")}
          >
            {done ? <Check className="h-2.5 w-2.5" aria-hidden /> : null}
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}
