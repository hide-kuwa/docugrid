"use client";

import { Circle, Loader2 } from "lucide-react";
import type { FirmTaskItem } from "@/features/docugrid/lib/firm-tasks";
import { periodKeyLabel } from "@/features/persona/lib/period-keys";

type Props = {
  items: FirmTaskItem[];
  clientNameById: Record<string, string>;
  loading: boolean;
  error: string | null;
  maxItems?: number;
  onSelect?: (item: FirmTaskItem) => void;
};

export function TodayTasksWidget({
  items,
  clientNameById,
  loading,
  error,
  maxItems = 12,
  onSelect,
}: Props) {
  const missing = items.filter((i) => i.kind === "missing").slice(0, maxItems);

  if (loading) {
    return (
      <p className="flex items-center gap-2 py-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        タスクを読み込み中…
      </p>
    );
  }

  if (error) {
    return <p className="py-2 text-sm text-red-600">{error}</p>;
  }

  if (missing.length === 0) {
    return (
      <p className="py-2 text-sm text-emerald-700">
        担当顧問先に不足資料はありません。
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {missing.map((item, idx) => (
        <li key={`${item.client_id}-${item.period_key}-${item.slot_label}-${idx}`}>
          <button
            type="button"
            onClick={() => onSelect?.(item)}
            className="flex w-full items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-blue-300 hover:bg-blue-50/50"
          >
            <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="font-bold text-slate-800">
                {clientNameById[item.client_id] ?? item.client_id}
              </span>
              <span className="mx-1 text-slate-300">·</span>
              <span className="text-slate-600">{item.slot_label}</span>
              <br />
              <span className="font-mono text-[10px] text-slate-500">
                {periodKeyLabel(item.period_key)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
