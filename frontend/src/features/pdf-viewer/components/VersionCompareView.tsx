"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { buildPdfDocumentParams, loadPdfJs } from "../lib/pdfjs-config";
import { PdfJsPagePreview } from "./PdfJsPagePreview";

type Props = {
  leftFile: File;
  rightFile: File;
  leftLabel: string;
  rightLabel: string;
  onClose: () => void;
};

async function pageCountFor(file: File): Promise<number> {
  const pdfjs = await loadPdfJs();
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument(buildPdfDocumentParams(data, pdfjs.version)).promise;
  return pdf.numPages;
}

export function VersionCompareView({
  leftFile,
  rightFile,
  leftLabel,
  rightLabel,
  onClose,
}: Props) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [leftPages, rightPages] = await Promise.all([
          pageCountFor(leftFile),
          pageCountFor(rightFile),
        ]);
        if (!active) return;
        setPageCount(Math.max(leftPages, rightPages, 1));
        setPageIndex(0);
      } catch {
        if (active) setPageCount(1);
      }
    })();
    return () => {
      active = false;
    };
  }, [leftFile, rightFile]);

  const canPrev = pageIndex > 0;
  const canNext = pageIndex < pageCount - 1;

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-slate-900">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-700 px-4">
        <span className="text-sm font-bold text-white">版の比較（最新 vs 過去）</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          aria-label="比較を閉じる"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-1/2 min-w-0 flex-col border-r border-slate-700">
          <div className="shrink-0 bg-emerald-950/80 px-3 py-2 text-xs font-bold text-emerald-200">
            最新 · {leftLabel}
          </div>
          <div className="flex flex-1 justify-center overflow-auto bg-slate-800/50 p-3">
            <PdfJsPagePreview file={leftFile} pageIndex={pageIndex} />
          </div>
        </div>
        <div className="flex w-1/2 min-w-0 flex-col">
          <div className="shrink-0 bg-amber-950/80 px-3 py-2 text-xs font-bold text-amber-200">
            過去 · {rightLabel}
          </div>
          <div className="flex flex-1 justify-center overflow-auto bg-slate-800/50 p-3">
            <PdfJsPagePreview file={rightFile} pageIndex={pageIndex} />
          </div>
        </div>
      </div>

      <div className="flex h-12 shrink-0 items-center justify-center gap-4 border-t border-slate-700 bg-slate-800">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
          className="rounded p-1 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-xs tabular-nums text-slate-300">
          {pageIndex + 1} / {pageCount}
        </span>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
          className="rounded p-1 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
