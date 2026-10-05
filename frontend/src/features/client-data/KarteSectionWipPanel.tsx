"use client";

import { Construction } from "lucide-react";
import { WipBadge } from "@/components/work-in-progress";
import type { DataWorkspaceTab } from "@/features/client-data/data-workspace-tabs";

/** カルテ内の工事中セクション用プレースホルダ */
export function KarteSectionWipPanel({ tab }: { tab: DataWorkspaceTab }) {
  const Icon = tab.icon;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-slate-50 px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700">
        <Construction className="h-7 w-7" aria-hidden />
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <WipBadge kind="planned" />
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <Icon className="h-4 w-4 text-slate-500" aria-hidden />
            {tab.label}
          </span>
        </div>
        <p className="max-w-sm text-sm text-slate-600">
          「{tab.label}」は工事中です。いま使えるのは <strong className="font-bold">マスタ</strong>{" "}
          のみです。
        </p>
        <p className="text-[11px] text-slate-400">{tab.description}</p>
      </div>
    </div>
  );
}
