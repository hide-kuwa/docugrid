"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  fetchSlotDocumentFile,
  listSlotDocuments,
  type SlotDocumentItem,
} from "@/features/docugrid/lib/slot-documents";
import type { AuditSide } from "../types";

type Props = {
  clientId: string;
  currentDocId?: string | null;
  leftDocId?: string | null;
  rightDocId?: string | null;
  onLoadDoc: (file: File, docId: string, side: AuditSide) => void;
};

function sortDocs(a: SlotDocumentItem, b: SlotDocumentItem): number {
  const pk = a.period_key.localeCompare(b.period_key);
  if (pk !== 0) return pk;
  const la = (a.slot_label ?? a.slot_id).localeCompare(b.slot_label ?? b.slot_id, "ja");
  if (la !== 0) return la;
  return a.original_name.localeCompare(b.original_name, "ja");
}

export function ClientSlotDocsRail({
  clientId,
  currentDocId,
  leftDocId,
  rightDocId,
  onLoadDoc,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [docs, setDocs] = useState<SlotDocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) {
      setDocs([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const items = await listSlotDocuments(clientId, undefined, controller.signal);
        const visible = items.filter((d) => !d.deleted_at).sort(sortDocs);
        setDocs(visible);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          setError("資料一覧の取得に失敗しました");
          setDocs([]);
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [clientId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !currentDocId) return;
    el.querySelector(`[data-doc-id="${currentDocId}"]`)?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [currentDocId, docs.length]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    el.scrollLeft += e.deltaY;
    e.preventDefault();
  }, []);

  const pickDoc = useCallback(
    async (item: SlotDocumentItem, side: AuditSide) => {
      if (loadingDocId) return;
      setLoadingDocId(item.id);
      setError(null);
      try {
        const file = await fetchSlotDocumentFile(item);
        onLoadDoc(file, item.id, side);
      } catch {
        setError(`「${item.slot_label ?? item.original_name}」の読み込みに失敗しました`);
      } finally {
        setLoadingDocId(null);
      }
    },
    [loadingDocId, onLoadDoc],
  );

  return (
    <div className="shrink-0 border-b border-slate-700/80 bg-slate-900">
      <div className="flex h-8 items-stretch gap-2 px-2">
        <span className="flex shrink-0 items-center text-[9px] font-bold text-slate-500">資料</span>

        <div
          ref={scrollRef}
          onWheel={handleWheel}
          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-500" aria-label="読み込み中" />
          ) : error && docs.length === 0 ? (
            <span className="text-[10px] text-red-300">{error}</span>
          ) : docs.length === 0 ? (
            <span className="text-[10px] text-slate-500">資料なし</span>
          ) : (
            docs.map((item) => {
              const isCurrent = item.id === currentDocId;
              const onLeft = item.id === leftDocId;
              const onRight = item.id === rightDocId;
              const isLoading = loadingDocId === item.id;
              const title = item.slot_label?.trim() || item.original_name;

              return (
                <div
                  key={item.id}
                  data-doc-id={item.id}
                  title={`${title} — 左半分: 左画面 / 右半分: 右画面`}
                  className={`relative h-7 shrink-0 overflow-hidden rounded border bg-slate-800 ${
                    isCurrent ? "border-blue-500/80 ring-1 ring-blue-500/25" : "border-slate-600/70"
                  }`}
                  style={{ minWidth: "4.5rem", maxWidth: "11rem", width: "max-content" }}
                >
                  {isLoading ? (
                    <div className="flex h-full min-w-[4.5rem] items-center justify-center px-2">
                      <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                    </div>
                  ) : (
                    <>
                      <div
                        className="pointer-events-none absolute inset-0 flex items-center justify-center px-2"
                        aria-hidden
                      >
                        <span className="whitespace-nowrap text-[10px] font-bold text-slate-100">{title}</span>
                      </div>

                      {onLeft ? (
                        <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-red-500/50" />
                      ) : null}
                      {onRight ? (
                        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-emerald-500/50" />
                      ) : null}

                      <button
                        type="button"
                        onClick={() => void pickDoc(item, "left")}
                        className="absolute inset-y-0 left-0 w-1/2 bg-red-500/0 transition-colors hover:bg-red-500/25 focus-visible:bg-red-500/30 focus-visible:outline-none"
                        aria-label={`${title} を左画面で開く`}
                      />
                      <button
                        type="button"
                        onClick={() => void pickDoc(item, "right")}
                        className="absolute inset-y-0 right-0 w-1/2 bg-emerald-500/0 transition-colors hover:bg-emerald-500/25 focus-visible:bg-emerald-500/30 focus-visible:outline-none"
                        aria-label={`${title} を右画面で開く`}
                      />
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
      {error && docs.length > 0 ? (
        <p className="truncate px-2 pb-0.5 text-[9px] text-red-300">{error}</p>
      ) : null}
    </div>
  );
}
