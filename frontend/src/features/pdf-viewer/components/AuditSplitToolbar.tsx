"use client";

import { ArrowLeftRight, Link2, PanelRight } from "lucide-react";
import type { ReactNode } from "react";
import type { AuditCheckPoint } from "../types";

type AuditSplitToolbarProps = {
  pendingCheckPoint: AuditCheckPoint | null;
  linksCount: number;
  linksRailOpen: boolean;
  onToggleLinksRail: () => void;
  onSwapSides: () => void;
  linkSaveStatus: "idle" | "saving" | "saved" | "error";
  autoVouchSlot?: ReactNode;
};

export const AuditSplitToolbar = ({
  pendingCheckPoint,
  linksCount,
  linksRailOpen,
  onToggleLinksRail,
  onSwapSides,
  linkSaveStatus,
  autoVouchSlot,
}: AuditSplitToolbarProps) => {
  const saveLabel =
    linkSaveStatus === "saving"
      ? "保存中"
      : linkSaveStatus === "saved"
        ? "保存済"
        : linkSaveStatus === "error"
          ? "保存失敗"
          : null;

  return (
    <div className="flex h-auto min-h-9 shrink-0 flex-wrap items-center gap-2 border-b border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200">
      <span className="hidden font-bold text-slate-400 sm:inline">2画面照合</span>
      <span className="hidden text-slate-500 sm:inline">|</span>
      {autoVouchSlot}
      <span className="min-w-0 truncate text-slate-300">
        {pendingCheckPoint
          ? `待ち: ${pendingCheckPoint.side === "left" ? "右" : "左"} P${pendingCheckPoint.page + 1}`
          : "チェック(✓) → 左クリック → 右クリック"}
      </span>
      <button
        type="button"
        onClick={onSwapSides}
        className="ml-auto inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-slate-300 hover:bg-slate-700"
        title="左右の PDF を入れ替え"
      >
        <ArrowLeftRight className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">入替</span>
      </button>
      <button
        type="button"
        onClick={onToggleLinksRail}
        className={`inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 ${
          linksRailOpen ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-700"
        }`}
        title="照合済みリスト"
      >
        {linksRailOpen ? <PanelRight className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
        照合 {linksCount > 0 ? `(${linksCount})` : ""}
      </button>
      {saveLabel ? (
        <span
          className={`shrink-0 text-[10px] ${
            linkSaveStatus === "error" ? "text-red-400" : "text-emerald-400"
          }`}
        >
          {saveLabel}
        </span>
      ) : null}
    </div>
  );
};
