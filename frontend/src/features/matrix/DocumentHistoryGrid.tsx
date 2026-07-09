"use client";

import { useMemo, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import type { PeriodLists, YearDrumMeta } from "@/lib/fiscal-year-drum";
import { CatalogSlotPreview } from "@/features/docugrid/components/CatalogSlotPreview";
import type { CatalogRow } from "@/features/docugrid/lib/document-catalog-api";
import type { SlotDocumentItem } from "@/features/docugrid/lib/slot-documents";
import { arrangeDocumentHistory, formatFiscalPeriodDisplay } from "@/lib/fiscal-period-label";

type Props = {
  items: SlotDocumentItem[];
  loading?: boolean;
  categoryLabel?: string;
  clientName?: string;
  fiscalMonth?: number;
  periodMode?: "year" | "month";
  matrixPeriods: PeriodLists;
  yearMeta: YearDrumMeta;
};

function slotToCatalogRow(item: SlotDocumentItem): CatalogRow {
  return {
    client_id: item.client_id,
    client_name: "",
    period_key: item.period_key,
    category_id: item.slot_id,
    submitted: true,
    slot_document_id: item.id,
    slot_label: item.slot_label,
    original_name: item.original_name,
    page_count: item.page_count,
    uploaded_at: item.uploaded_at,
    current_version_id: item.current_version_id ?? null,
    fields: {},
  };
}

function formatUploadedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function DocumentHistoryGrid({
  items,
  loading = false,
  categoryLabel,
  clientName,
  fiscalMonth = 3,
  periodMode = "year",
  matrixPeriods,
  yearMeta,
}: Props) {
  const [previewRow, setPreviewRow] = useState<CatalogRow | null>(null);

  const sorted = useMemo(
    () => arrangeDocumentHistory(items, periodMode, fiscalMonth, matrixPeriods, yearMeta),
    [items, periodMode, fiscalMonth, matrixPeriods, yearMeta],
  );

  const modeLabel = periodMode === "year" ? "決算期" : "月次";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-100 p-4 md:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-black text-slate-800">
          {categoryLabel ?? "書類"} — {clientName ?? "—"}
        </h2>
        <p className="text-xs text-slate-500">
          {modeLabel}の新しい順に表示（{sorted.length}件）
        </p>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          読み込み中…
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-12 text-sm text-slate-500">
          この{modeLabel}の提出履歴はありません
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {sorted.map((item) => {
            const period = formatFiscalPeriodDisplay(
              item.period_key,
              fiscalMonth,
              matrixPeriods,
              item.uploaded_at,
              periodMode,
              yearMeta,
            );
            const title = item.slot_label || item.original_name || item.slot_id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPreviewRow(slotToCatalogRow(item))}
                className="group flex flex-col rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"
              >
                {item.page_count ? (
                  <span className="mb-1 self-end text-[10px] text-slate-400">{item.page_count}p</span>
                ) : (
                  <span className="mb-1 self-end text-[10px] text-transparent select-none">—</span>
                )}
                <div className="mb-2 flex min-h-[5.5rem] flex-col items-center justify-center rounded-lg bg-gradient-to-b from-slate-50 to-blue-50/40 px-2 py-3 text-center group-hover:from-blue-50 group-hover:to-indigo-50/50">
                  <p className="text-sm font-black leading-snug tracking-tight text-slate-800 group-hover:text-blue-900">
                    {period.headline}
                  </p>
                  {period.subline ? (
                    <p className="mt-1 text-[10px] font-bold text-slate-500">{period.subline}</p>
                  ) : null}
                  <FileText className="mt-2 h-5 w-5 text-slate-300 group-hover:text-blue-400" />
                </div>
                <p className="line-clamp-2 text-xs font-bold leading-snug text-slate-700">{title}</p>
                <p className="mt-1 text-[10px] text-slate-500">{formatUploadedAt(item.uploaded_at)}</p>
                {item.current_version_label ? (
                  <p className="mt-0.5 truncate text-[10px] text-slate-400">{item.current_version_label}</p>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <CatalogSlotPreview row={previewRow} onClose={() => setPreviewRow(null)} />
    </div>
  );
}
