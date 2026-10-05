"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Eye, Search, Trash2, X } from "lucide-react";
import { ClassifyEngineBadge } from "@/features/docugrid/components/ClassifyFeedback";

export type SortTrayPendingItem = {
  id: string;
  fileName: string;
  confidence: number;
  engine: string;
  suggestedIndex: number | null;
};

export type SortTrayUnassignedItem = {
  docId: string;
  label: string;
  fileName: string;
};

type Props = {
  slotLabels: string[];
  pendingReview: SortTrayPendingItem[];
  unassignedDocs: SortTrayUnassignedItem[];
  onConfirmPending: (reviewId: string, slotIndex: number) => void;
  onDismissPending: (reviewId: string) => void;
  onOpenPendingPdf?: (reviewId: string) => void;
  onAssignUnassigned: (docId: string, slotIndex: number) => void;
  onOpenUnassigned?: (docId: string) => void;
  onDeleteUnassigned?: (docId: string) => void;
};

type Selection =
  | { kind: "pending"; id: string }
  | { kind: "unassigned"; id: string };

export function MatrixSortTray({
  slotLabels,
  pendingReview,
  unassignedDocs,
  onConfirmPending,
  onDismissPending,
  onOpenPendingPdf,
  onAssignUnassigned,
  onOpenUnassigned,
  onDeleteUnassigned,
}: Props) {
  const total = pendingReview.length + unassignedDocs.length;
  const trayRef = useRef<HTMLDivElement>(null);
  const [slotQuery, setSlotQuery] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);

  useEffect(() => {
    if (total === 0) {
      setSelection(null);
      return;
    }
    setSelection((prev) => {
      if (prev?.kind === "pending" && pendingReview.some((p) => p.id === prev.id)) return prev;
      if (prev?.kind === "unassigned" && unassignedDocs.some((u) => u.docId === prev.id)) return prev;
      if (pendingReview[0]) return { kind: "pending", id: pendingReview[0].id };
      if (unassignedDocs[0]) return { kind: "unassigned", id: unassignedDocs[0].docId };
      return null;
    });
  }, [total, pendingReview, unassignedDocs]);

  const selectedPending =
    selection?.kind === "pending"
      ? pendingReview.find((p) => p.id === selection.id) ?? null
      : null;
  const selectedUnassigned =
    selection?.kind === "unassigned"
      ? unassignedDocs.find((u) => u.docId === selection.id) ?? null
      : null;

  const queueItems = useMemo(() => {
    const pending = pendingReview.map((p) => ({
      key: `pending:${p.id}`,
      kind: "pending" as const,
      id: p.id,
      title: p.fileName,
      meta: `確信度 ${Math.round(p.confidence * 100)}%`,
    }));
    const unas = unassignedDocs.map((u) => ({
      key: `unassigned:${u.docId}`,
      kind: "unassigned" as const,
      id: u.docId,
      title: u.fileName,
      meta: u.label,
    }));
    return [...pending, ...unas];
  }, [pendingReview, unassignedDocs]);

  const filteredSlots = useMemo(() => {
    const q = slotQuery.trim().toLowerCase();
    return slotLabels
      .map((label, index) => ({ label, index }))
      .filter(({ label }) => !q || label.toLowerCase().includes(q));
  }, [slotLabels, slotQuery]);

  const assignToSlot = (slotIndex: number) => {
    if (selectedPending) {
      onConfirmPending(selectedPending.id, slotIndex);
      return;
    }
    if (selectedUnassigned) {
      onAssignUnassigned(selectedUnassigned.docId, slotIndex);
    }
  };

  const acceptSuggested = () => {
    if (selectedPending?.suggestedIndex == null) return;
    onConfirmPending(selectedPending.id, selectedPending.suggestedIndex);
  };

  useEffect(() => {
    const el = trayRef.current;
    if (!el || total === 0) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!el.contains(document.activeElement) && document.activeElement !== el) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        if (e.key !== "Escape") return;
      }

      if (e.key === "Enter" && selectedPending?.suggestedIndex != null) {
        e.preventDefault();
        onConfirmPending(selectedPending.id, selectedPending.suggestedIndex);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = queueItems.findIndex(
          (item) => item.kind === selection?.kind && item.id === selection.id,
        );
        if (idx < 0) return;
        const next =
          e.key === "ArrowDown"
            ? queueItems[Math.min(queueItems.length - 1, idx + 1)]
            : queueItems[Math.max(0, idx - 1)];
        if (next) setSelection({ kind: next.kind, id: next.id });
      }
    };

    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [total, selectedPending, queueItems, selection, onConfirmPending]);

  if (total === 0) return null;

  const suggestedLabel =
    selectedPending?.suggestedIndex != null
      ? slotLabels[selectedPending.suggestedIndex]
      : null;

  return (
    <section
      ref={trayRef}
      tabIndex={0}
      data-tour="matrix-sort-tray"
      aria-label="整理トレイ（要確認・未割当）"
      className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/80 outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/80 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-black text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          整理トレイ
          <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold text-amber-950">
            {total} 件
          </span>
        </div>
        <p className="text-[10px] text-amber-800/80">
          ↑↓ で選択 · Enter で提案どおり（要確認）
        </p>
      </div>

      <div className="grid gap-0 md:grid-cols-[minmax(12rem,16rem)_1fr]">
        <ul className="max-h-56 space-y-0.5 overflow-y-auto border-b border-amber-200/60 p-2 md:border-b-0 md:border-r">
          {pendingReview.length > 0 ? (
            <li className="px-2 py-1 text-[9px] font-black uppercase tracking-wider text-amber-700/80">
              要確認 {pendingReview.length}
            </li>
          ) : null}
          {pendingReview.map((p) => {
            const active = selection?.kind === "pending" && selection.id === p.id;
            return (
              <li key={`pending:${p.id}`}>
                <button
                  type="button"
                  onClick={() => setSelection({ kind: "pending", id: p.id })}
                  className={`w-full rounded-lg px-2.5 py-2 text-left transition-colors ${
                    active
                      ? "bg-white shadow-sm ring-1 ring-amber-300"
                      : "hover:bg-white/70"
                  }`}
                >
                  <div className="line-clamp-1 text-xs font-bold text-slate-800">{p.fileName}</div>
                  <div className="mt-0.5 text-[10px] text-slate-500">
                    確信度 {Math.round(p.confidence * 100)}%
                  </div>
                </button>
              </li>
            );
          })}
          {unassignedDocs.length > 0 ? (
            <li className="px-2 py-1 text-[9px] font-black uppercase tracking-wider text-amber-700/80">
              未割当 {unassignedDocs.length}
            </li>
          ) : null}
          {unassignedDocs.map((u) => {
            const active = selection?.kind === "unassigned" && selection.id === u.docId;
            return (
              <li key={`unassigned:${u.docId}`}>
                <button
                  type="button"
                  onClick={() => setSelection({ kind: "unassigned", id: u.docId })}
                  className={`w-full rounded-lg px-2.5 py-2 text-left transition-colors ${
                    active
                      ? "bg-white shadow-sm ring-1 ring-amber-300"
                      : "hover:bg-white/70"
                  }`}
                >
                  <div className="line-clamp-1 text-xs font-bold text-slate-800">{u.fileName}</div>
                  <div className="mt-0.5 text-[10px] text-slate-500">{u.label}</div>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="space-y-3 p-3 md:p-4">
          {selectedPending || selectedUnassigned ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {selectedPending ? "要確認" : "未割当"}
                  </p>
                  <h3 className="mt-0.5 line-clamp-2 text-sm font-black text-slate-900">
                    {selectedPending?.fileName ?? selectedUnassigned?.fileName}
                  </h3>
                  {selectedPending ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <ClassifyEngineBadge engine={selectedPending.engine} />
                      <span className="text-[11px] text-slate-500">
                        確信度 {Math.round(selectedPending.confidence * 100)}%
                      </span>
                    </div>
                  ) : selectedUnassigned ? (
                    <p className="mt-1 text-[11px] text-slate-500">{selectedUnassigned.label}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {selectedPending && onOpenPendingPdf ? (
                    <button
                      type="button"
                      onClick={() => onOpenPendingPdf(selectedPending.id)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                        開く
                      </span>
                    </button>
                  ) : null}
                  {selectedUnassigned && onOpenUnassigned ? (
                    <button
                      type="button"
                      onClick={() => onOpenUnassigned(selectedUnassigned.docId)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                        開く
                      </span>
                    </button>
                  ) : null}
                  {selectedPending ? (
                    <button
                      type="button"
                      onClick={() => onDismissPending(selectedPending.id)}
                      className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                      aria-label="破棄"
                      title="破棄"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                  {selectedUnassigned && onDeleteUnassigned ? (
                    <button
                      type="button"
                      onClick={() => onDeleteUnassigned(selectedUnassigned.docId)}
                      className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 hover:bg-red-100"
                      aria-label="削除"
                      title="削除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>

              {selectedPending && suggestedLabel != null ? (
                <button
                  type="button"
                  onClick={acceptSuggested}
                  className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700"
                >
                  提案どおり確定：{suggestedLabel}
                </button>
              ) : null}

              <div>
                <label className="relative block">
                  <span className="sr-only">枠を検索</span>
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={slotQuery}
                    onChange={(e) => setSlotQuery(e.target.value)}
                    placeholder="枠名で検索"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
                  />
                </label>
                <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                  {filteredSlots.length === 0 ? (
                    <p className="px-1 py-2 text-[11px] text-slate-500">一致する枠がありません</p>
                  ) : (
                    filteredSlots.map(({ label, index }) => {
                      const isSuggested = selectedPending?.suggestedIndex === index;
                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => assignToSlot(index)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                            isSuggested
                              ? "border-indigo-400 bg-indigo-100 text-indigo-800 hover:bg-indigo-200"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {isSuggested ? "★ " : ""}
                          {label}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="py-6 text-center text-xs text-slate-500">左の一覧からファイルを選んでください</p>
          )}
        </div>
      </div>
    </section>
  );
}
