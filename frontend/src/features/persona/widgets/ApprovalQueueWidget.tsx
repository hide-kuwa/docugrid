"use client";

import Link from "next/link";
import { ArrowRight, Circle, Loader2 } from "lucide-react";
import type { FirmTaskItem } from "@/features/docugrid/lib/firm-tasks";
import { formatAssigneeLabel } from "@/features/docugrid/lib/firm-tasks";
import { periodKeyLabel } from "@/features/persona/lib/period-keys";

type Props = {
  items: FirmTaskItem[];
  clientNameById: Record<string, string>;
  loading: boolean;
  error: string | null;
  onSelectItem?: (item: FirmTaskItem) => void;
  maxItems?: number;
};

export function ApprovalQueueWidget({
  items,
  clientNameById,
  loading,
  error,
  onSelectItem,
  maxItems = 10,
}: Props) {
  const queue = items.filter((i) => i.kind === "pending_approval");

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-amber-800">
        <Loader2 className="h-4 w-4 animate-spin" />
        承認待ちを読み込み中…
      </div>
    );
  }

  if (error) {
    return <p className="py-2 text-sm text-red-600">{error}</p>;
  }

  if (queue.length === 0) {
    return (
      <p className="py-2 text-sm text-amber-900/70">承認待ちの資料はありません。</p>
    );
  }

  const visible = queue.slice(0, maxItems);

  return (
    <ul className="space-y-2">
      {visible.map((item) => {
        const label = (
          <>
            <span className="font-bold text-amber-950">
              {clientNameById[item.client_id] ?? item.client_id}
            </span>
            <span className="text-amber-800">
              {" "}
              · {periodKeyLabel(item.period_key)} · {item.slot_label}
            </span>
            <span className="mt-0.5 block text-[10px] font-bold text-amber-700/90">
              担当: {formatAssigneeLabel(item.assignees)}
            </span>
          </>
        );
        return (
          <li key={`${item.client_id}-${item.period_key}-${item.slot_label}`}>
            {onSelectItem ? (
              <button
                type="button"
                onClick={() => onSelectItem(item)}
                className="flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-white/80 px-3 py-2 text-left text-sm hover:bg-amber-50"
              >
                <Circle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span className="min-w-0 flex-1">{label}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              </button>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-white/80 px-3 py-2 text-sm">
                <Circle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                {label}
              </div>
            )}
          </li>
        );
      })}
      {queue.length > maxItems && (
        <li className="text-center text-xs text-amber-800">
          <Link href="/tasks" className="font-bold underline hover:no-underline">
            他 {queue.length - maxItems} 件を一覧で見る
          </Link>
        </li>
      )}
    </ul>
  );
}
