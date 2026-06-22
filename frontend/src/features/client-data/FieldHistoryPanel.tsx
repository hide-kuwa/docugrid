"use client";

import { useState } from "react";
import { History } from "lucide-react";
import type { ProfileFieldChange } from "@/config/client-profile-fields";
import { PROFILE_FIELD_SOURCE_LABELS } from "@/config/client-profile-fields";

type Props = {
  fieldLabel: string;
  history: ProfileFieldChange[];
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function FieldHistoryPanel({ fieldLabel, history }: Props) {
  const [open, setOpen] = useState(false);
  if (history.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-50"
        title={`${fieldLabel}の変更履歴`}
      >
        <History className="h-3 w-3" />
        履歴 {history.length}
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 cursor-default"
            aria-label="閉じる"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-40 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
            <p className="mb-2 text-[10px] font-bold text-slate-500">{fieldLabel} — 変更履歴</p>
            <ul className="max-h-48 space-y-2 overflow-y-auto text-[11px]">
              {history.map((entry, index) => (
                <li
                  key={`${entry.updatedAt}-${index}`}
                  className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-semibold text-slate-700">
                      {entry.updatedBy ?? "不明"}
                    </span>
                    <span className="text-[10px] text-slate-400">{formatWhen(entry.updatedAt)}</span>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    {PROFILE_FIELD_SOURCE_LABELS[entry.source]}
                  </div>
                  {entry.previousValue !== undefined && entry.previousValue !== entry.value ? (
                    <div className="mt-1 space-y-0.5">
                      <div className="text-slate-400 line-through">{entry.previousValue || "（空）"}</div>
                      <div className="font-medium text-slate-800 whitespace-pre-wrap break-words">
                        {entry.value || "（空）"}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 font-medium text-slate-800 whitespace-pre-wrap break-words">
                      {entry.value || "（空）"}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
