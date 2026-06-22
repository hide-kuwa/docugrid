# -*- coding: utf-8 -*-
"""Restore MatrixGrid.tsx with correct UTF-8 Japanese (P0 UX)."""
from pathlib import Path

TARGET = Path(__file__).resolve().parents[1] / "src" / "components" / "MatrixGrid.tsx"

CONTENT = '''"use client";

import { useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  FileText,
  CheckCircle,
  Loader2,
  Pencil,
  Plus,
  UploadCloud,
  X,
} from "lucide-react";
import { PageGrid } from "@/features/docugrid/components/Grid/PageGrid";
import { SyncStatusBadge } from "@/features/docugrid/components/SyncStatusBadge";
import { useMergePdf } from "@/features/docugrid/hooks/useMergePdf";
import { useDocugridStore } from "@/features/docugrid/state/docugrid-store";
import { Client } from "./types";
import { PERIODS } from "./mockData";

interface MatrixGridProps {
  currentClient: Client;
  activePeriodIdx: number;
  activeMode: "year" | "month";
  file: File | null;
  pageCount: number | null;
  progressPercent: number;
  onFilesDropped: (files: File[]) => void;
  onPreview: () => void;
  onEdit: () => void;
  slotNotice: string | null;
  onDismissSlotNotice: () => void;
  relatedClients: Array<{ id: string; name: string; relation: string }>;
  onSelectRelatedClient: (clientId: string) => void;
  canUpload: boolean;
  canView: boolean;
}

export default function MatrixGrid({
  currentClient,
  activePeriodIdx,
  activeMode,
  file,
  pageCount,
  progressPercent,
  onFilesDropped,
  onPreview,
  onEdit,
  slotNotice,
  onDismissSlotNotice,
  relatedClients,
  onSelectRelatedClient,
  canUpload,
  canView,
}: MatrixGridProps) {
  const [pagePanelOpen, setPagePanelOpen] = useState(false);

  const items =
    activePeriodIdx === 0
      ? ["定款", "履歴事項全部証明書", "株主名簿", "設立届出書"]
      : activeMode === "year"
        ? ["決算報告書", "総勘定元帳", "法人税申告書", "消費税申告書"]
        : ["月次試算表", "通帳コピー", "請求書綴り", "給与台帳"];

  const pageOrderLen = useDocugridStore((s) => s.pageOrder.length);
  const sessionSyncStatus = useDocugridStore((s) => s.sessionSyncStatus);
  const { mergeFromStore, isMerging } = useMergePdf();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => {
      if (!canUpload) return;
      void Promise.resolve(onFilesDropped(files)).catch((err) => {
        console.error("File drop failed:", err);
        alert("ファイルの取り込みに失敗しました。");
      });
    },
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
    noClick: !!file || !canUpload,
  });

  return (
    <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-slate-100 transition-opacity duration-300 select-none">
      {slotNotice ? (
        <motion.div
          role="status"
          className="mx-4 mt-3 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-sm md:mx-8"
        >
          <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
          <p className="min-w-0 flex-1 font-medium leading-snug">{slotNotice}</p>
          <button
            type="button"
            onClick={onDismissSlotNotice}
            className="shrink-0 rounded p-1 text-emerald-700 hover:bg-emerald-100"
            aria-label="通知を閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      ) : null}

      <header className="z-10 flex flex-wrap items-start gap-x-4 gap-y-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur md:px-8">
        <div className="min-w-0 max-w-full flex-1 basis-[min(100%,18rem)]">
          <div className="flex flex-wrap items-center gap-2">
            <div className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">CLIENT</div>
            <span
              className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${
                currentClient.fiscal === 3
                  ? "border-red-200 bg-red-100 text-red-500"
                  : "border-slate-200 bg-slate-100 text-slate-500"
              }`}
            >
              {currentClient.fiscal}月決算
            </span>
          </div>
          <motion.div className="break-words text-xl font-bold leading-snug text-slate-800">
            {activePeriodIdx === 0 ? (
              <span className="text-yellow-500">永久保存ドキュメント</span>
            ) : (
              <span>
                <span
                  className={`mr-2 inline ${
                    activeMode === "year" ? "text-blue-600" : "text-green-500"
                  }`}
                >
                  {activeMode === "year"
                    ? PERIODS.year[activePeriodIdx - 1]
                    : PERIODS.month[activePeriodIdx - 1]}
                </span>
                {activeMode === "year" ? "決算資料" : "月次監査"}
              </span>
            )}
          </motion.div>
        </div>
        <div className="flex w-full min-w-[12rem] shrink-0 flex-wrap items-center justify-end gap-3 sm:ml-auto sm:w-auto">
          {relatedClients.length > 0 && (
            <div className="w-full min-w-0 max-w-full shrink-0 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 sm:max-w-[min(100%,380px)]">
              <div className="mb-1 whitespace-normal text-[10px] font-bold uppercase tracking-wider text-slate-500">
                関係先クライアント
              </div>
              <div className="flex flex-wrap gap-1.5">
                {relatedClients.slice(0, 4).map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => onSelectRelatedClient(client.id)}
                    className="max-w-full break-words rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-left text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
                    title={client.relation}
                  >
                    {client.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="ml-auto shrink-0 text-right sm:ml-0">
            <span className="text-2xl font-black text-brand-600">{progressPercent}%</span>
          </div>
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
            <svg className="h-12 w-12 -rotate-90 transform">
              <circle cx="24" cy="24" r="20" stroke="#e2e8f0" strokeWidth="4" fill="transparent" />
              <circle
                cx="24"
                cy="24"
                r="20"
                stroke="#3b82f6"
                strokeWidth="4"
                fill="transparent"
                strokeDasharray="125"
                strokeDashoffset={125 - (125 * progressPercent) / 100}
                className="transition-all duration-700"
              />
            </svg>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="grid min-w-0 grid-cols-2 gap-4 fade-in-up md:grid-cols-3 lg:grid-cols-4 [&>*]:min-w-[9rem]">
          {items.map((title, i) => {
            const isStaticUploaded = activePeriodIdx !== 0 && i < 2;
            const isActiveSlot = activePeriodIdx !== 0 && i === 2;
            const uploadedCardClass =
              "bg-white min-h-[8.5rem] rounded-xl border-l-4 border-blue-600 shadow-sm p-4 flex flex-col justify-between";

            if (isStaticUploaded) {
              return (
                <div key={i} className={uploadedCardClass}>
                  <div className="flex items-start justify-between">
                    <FileText className="text-xl text-blue-600" />
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  </div>
                  <div className="break-words text-sm font-bold leading-tight text-slate-700">{title}</div>
                </div>
              );
            }

            if (isActiveSlot && file) {
              return (
                <motion.div key={i} className={`${uploadedCardClass} shadow-md ring-2 ring-blue-100`}>
                  <div>
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <FileText className="shrink-0 text-xl text-blue-600" />
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        収納済み
                      </span>
                    </div>
                    <div className="line-clamp-1 text-xs font-bold text-slate-400">{file.name}</div>
                    <div className="break-words text-sm font-bold leading-tight text-slate-700">{title}</div>
                    {pageCount != null && pageCount > 0 && (
                      <p className="mt-1 text-[11px] text-slate-500">{pageCount} ページ</p>
                    )}
                  </div>
                  {canView && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPreview();
                        }}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                        プレビュー
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit();
                        }}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-2 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-500"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        編集する
                      </button>
                    </div>
                  )}
                  <p className="mt-2 hidden text-[10px] leading-snug text-slate-400 sm:block">
                    ハイライト・並べ替えは「編集する」から
                  </p>
                </motion.div>
              );
            }

            return (
              <div
                key={i}
                {...getRootProps()}
                className={`flex h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-2 text-center transition-colors group ${
                  isDragActive
                    ? "scale-105 border-blue-500 bg-blue-50"
                    : "border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-white"
                } ${canUpload ? "" : "cursor-not-allowed opacity-60 hover:border-slate-300 hover:bg-slate-50"}`}
              >
                <input {...getInputProps()} />
                {!canUpload ? (
                  <motion.div className="text-xs font-bold text-slate-500">アップロード権限なし</motion.div>
                ) : isDragActive ? (
                  <>
                    <UploadCloud className="mb-2 h-8 w-8 animate-bounce text-blue-600" />
                    <div className="text-sm font-black text-blue-600">ここにドロップ</div>
                  </>
                ) : (
                  <>
                    <Plus className="mb-2 text-slate-300 group-hover:text-blue-500" />
                    <div className="text-xs font-bold text-slate-400 group-hover:text-blue-500">{title}</div>
                    {isActiveSlot && (
                      <div className="mt-1 text-[10px] font-medium text-slate-400">PDFをドロップ</div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {canView && pageOrderLen > 0 && (
        <section className="border-t border-slate-200 bg-white/90">
          <button
            type="button"
            onClick={() => setPagePanelOpen((o: boolean) => !o)}
            className="flex w-full items-center justify-between px-4 py-3 text-left md:px-8 hover:bg-slate-50"
          >
            <span className="text-sm font-bold text-slate-700">
              ページの並び
              <span className="ml-2 text-xs font-normal text-slate-500">（任意・編集しなくても提出可）</span>
            </span>
            {pagePanelOpen ? (
              <ChevronUp className="h-4 w-4 text-slate-500" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden />
            )}
          </button>
          {pagePanelOpen && <PageGrid />}
        </section>
      )}

      {canUpload && pageOrderLen > 0 && (
        <div className="sticky bottom-0 z-30 flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.06)] backdrop-blur md:px-8">
          <div className="mr-auto flex items-center gap-2">
            <p className="hidden text-[11px] text-slate-500 sm:block">
              必要なときだけ編集し、PDF を出力できます。
            </p>
            <SyncStatusBadge status={sessionSyncStatus} variant="inline" />
            <span className="text-[10px] text-slate-400">セッション同期</span>
          </div>
          <button
            type="button"
            disabled={isMerging}
            onClick={async () => {
              const r = await mergeFromStore(true);
              if (!r.ok) {
                alert(r.error);
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isMerging ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                出力中…
              </>
            ) : (
              <>PDF を出力</>
            )}
          </button>
        </div>
      )}
    </main>
  );
}
'''


def main() -> None:
    text = CONTENT.replace("motion.div", "div")
    TARGET.write_text(text, encoding="utf-8", newline="\n")
    assert "法人税申告書" in text
    assert "????" not in text
    print("OK", TARGET)


if __name__ == "__main__":
    main()
