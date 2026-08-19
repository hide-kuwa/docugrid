"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ListTree,
  Loader2,
  Mail,
  Minus,
} from "lucide-react";

import { useDocumentSections } from "../hooks/useDocumentSections";
import {
  buildRequiredScheduleStatus,
  looksLikeCorpTaxPackage,
  type DocumentSection,
} from "../lib/document-sections";

type Props = {
  file: File | null;
  enabled: boolean;
  /** 注釈更新では変えず、開く／並べ替え／版切替で変えるキー */
  analysisKey?: string | number | null;
  currentPage: number;
  documentLabel?: string;
  onJumpToPage: (pageIndex: number) => void;
};

function sectionAccent(kind: DocumentSection["kind"]): string {
  switch (kind) {
    case "receipt":
      return "text-sky-700";
    case "beppyo":
      return "text-slate-800";
    default:
      return "text-slate-600";
  }
}

export function DocumentIndexRail({
  file,
  enabled,
  analysisKey,
  currentPage,
  documentLabel,
  onJumpToPage,
}: Props) {
  const [open, setOpen] = useState(false);
  /** この analysisKey では自動オープン済み（手動で閉じたあとに再開しない） */
  const autoOpenedKeyRef = useRef<string | null>(null);

  // 閉じたままでも読取は進める（開いたときだけ解析だと自動オープンできない）
  const { sections, loading, error, pageCount } = useDocumentSections(
    file,
    enabled,
    analysisKey,
  );

  useEffect(() => {
    const key = analysisKey != null ? String(analysisKey) : null;
    if (!key) return;
    if (autoOpenedKeyRef.current === key) return;
    // 新しい文書は閉じた状態から開始
    setOpen(false);
  }, [analysisKey]);

  useEffect(() => {
    if (!enabled || loading || error) return;
    const key = analysisKey != null ? String(analysisKey) : null;
    if (!key || autoOpenedKeyRef.current === key) return;
    autoOpenedKeyRef.current = key;
    // セクションが取れたときだけ自動で開く
    if (sections.length > 0) {
      setOpen(true);
    }
  }, [enabled, loading, error, sections.length, analysisKey]);

  const isCorpTax = useMemo(
    () => looksLikeCorpTaxPackage(documentLabel, sections),
    [documentLabel, sections],
  );

  const required = useMemo(
    () => (isCorpTax ? buildRequiredScheduleStatus(sections) : []),
    [isCorpTax, sections],
  );

  const missingCount = required.filter((r) => !r.present).length;

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 ${
        open ? "w-60" : "w-10"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center justify-between gap-2 border-b border-slate-100 px-2 py-2 text-left hover:bg-slate-50"
        title={open ? "索引を閉じる" : loading ? "帳票を解析中…" : "索引を開く"}
      >
        {open ? (
          <>
            <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-slate-800">
              <ListTree className="h-3.5 w-3.5 shrink-0 text-violet-700" />
              <span className="truncate">帳票索引</span>
            </span>
            <ChevronLeft className="h-4 w-4 shrink-0 text-slate-400" />
          </>
        ) : loading ? (
          <Loader2 className="mx-auto h-4 w-4 animate-spin text-violet-600" />
        ) : (
          <ChevronRight className="mx-auto h-4 w-4 text-slate-500" />
        )}
      </button>

      {open ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-4 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              解析中…
            </div>
          ) : error ? (
            <p className="px-3 py-4 text-xs text-rose-600">読取に失敗しました</p>
          ) : (
            <>
              {isCorpTax && required.length > 0 ? (
                <div className="border-b border-slate-100 px-3 py-2">
                  <p className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    <span>必須帳票</span>
                    {missingCount > 0 ? (
                      <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                        不足 {missingCount}
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                        全て有
                      </span>
                    )}
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {required.map((req) => (
                      <li key={req.id}>
                        <button
                          type="button"
                          disabled={!req.present}
                          onClick={() =>
                            req.pageIndex != null && onJumpToPage(req.pageIndex)
                          }
                          className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs ${
                            req.present
                              ? "text-slate-800 hover:bg-slate-100"
                              : "cursor-default text-slate-400"
                          }`}
                        >
                          {req.present ? (
                            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          ) : (
                            <Minus className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                          )}
                          <span className="truncate">{req.label}</span>
                          {req.present && req.pageIndex != null ? (
                            <span className="ml-auto font-mono text-[10px] text-slate-400">
                              p.{req.pageIndex + 1}
                            </span>
                          ) : (
                            <span className="ml-auto text-[10px] text-rose-500">
                              未添付
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="px-3 py-2">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  検出セクション（{sections.length}）
                </p>
                {sections.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    別表・受信通知は検出されませんでした
                  </p>
                ) : (
                  <ul className="flex flex-col gap-0.5">
                    {sections.map((section) => {
                      const active = section.pageIndex === currentPage;
                      return (
                        <li key={`${section.id}-${section.pageIndex}`}>
                          <button
                            type="button"
                            onClick={() => onJumpToPage(section.pageIndex)}
                            className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-slate-100 ${
                              active ? "bg-violet-50 ring-1 ring-violet-200" : ""
                            }`}
                          >
                            {section.kind === "receipt" ? (
                              <Mail className="h-3.5 w-3.5 shrink-0 text-sky-600" />
                            ) : (
                              <span className="ml-1 mr-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                            )}
                            <span
                              className={`truncate ${
                                active
                                  ? "font-semibold text-violet-800"
                                  : sectionAccent(section.kind)
                              }`}
                            >
                              {section.label}
                            </span>
                            <span className="ml-auto font-mono text-[10px] text-slate-400">
                              p.{section.pageIndex + 1}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {pageCount > 0 ? (
                <p className="mt-auto border-t border-slate-100 px-3 py-2 text-[10px] text-slate-400">
                  全 {pageCount} ページ
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </aside>
  );
}
