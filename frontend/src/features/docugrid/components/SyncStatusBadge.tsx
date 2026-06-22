"use client";

import { Check, CloudOff, Loader2, Save } from "lucide-react";

import type { SyncStatus } from "../schema/sync";

type Props = {
  status: SyncStatus;
  className?: string;
  /** overlay: サムネ右上に重ねる（既定）。inline: フッター等でインライン表示 */
  variant?: "overlay" | "inline";
};

/**
 * ファイル／セッションの同期状態をサムネ右上などに小さく表示する。
 */
export function SyncStatusBadge({ status, className = "", variant = "overlay" }: Props) {
  const position =
    variant === "overlay"
      ? "pointer-events-none absolute right-0.5 top-0.5"
      : "pointer-events-none relative inline-flex";
  const base = `${position} flex h-5 w-5 items-center justify-center rounded-full border text-[10px] shadow-sm`;

  switch (status) {
    case "saved":
      return (
        <span
          className={`${base} border-emerald-200 bg-emerald-50 text-emerald-600 ${className}`}
          title="クラウド保存済み"
          aria-label="保存済み"
        >
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      );
    case "dirty":
      return (
        <span
          className={`${base} border-amber-300 bg-amber-50 text-amber-700 ${className}`}
          title="未保存の変更あり"
          aria-label="未保存"
        >
          <span className="h-2 w-2 rounded-full bg-amber-500" />
        </span>
      );
    case "saving":
      return (
        <span
          className={`${base} border-slate-200 bg-white text-slate-600 ${className}`}
          title="保存中"
          aria-label="保存中"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
        </span>
      );
    case "error":
      return (
        <span
          className={`${base} border-red-200 bg-red-50 text-red-600 ${className}`}
          title="同期エラー"
          aria-label="エラー"
        >
          <CloudOff className="h-3 w-3" />
        </span>
      );
    case "idle":
    default:
      return (
        <span
          className={`${base} border-slate-200 bg-slate-50 text-slate-400 ${className}`}
          title="未アップロード"
          aria-label="待機"
        >
          <Save className="h-3 w-3 opacity-70" />
        </span>
      );
  }
}
