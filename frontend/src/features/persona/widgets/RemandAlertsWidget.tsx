"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import type { SlotDocumentItem } from "@/features/docugrid/lib/slot-documents";

type Props = {
  items: SlotDocumentItem[];
  loading: boolean;
  onReupload?: (slot: SlotDocumentItem) => void;
};

export function RemandAlertsWidget({ items, loading, onReupload }: Props) {
  const remanded = items.filter((s) => s.logical_status === "remanded");

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        差戻しを確認中…
      </div>
    );
  }

  if (remanded.length === 0) {
    return (
      <p className="py-2 text-sm text-slate-500">差戻し中の資料はありません。</p>
    );
  }

  return (
    <ul className="space-y-2">
      {remanded.map((slot) => (
        <li
          key={slot.id}
          className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-red-900">
              {slot.slot_label || slot.original_name || `スロット ${slot.slot_id}`}
            </p>
            <p className="text-xs text-red-700">修正して再提出してください</p>
          </div>
          {onReupload && (
            <button
              type="button"
              onClick={() => onReupload(slot)}
              className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-500"
            >
              再提出
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
