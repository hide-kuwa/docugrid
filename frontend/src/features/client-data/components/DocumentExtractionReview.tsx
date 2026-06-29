"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, FileSearch, Loader2 } from "lucide-react";
import {
  applyExtractionFields,
  appliedExtractionFields,
  pendingExtractionFields,
  type ExtractionReviewPayload,
} from "@/features/client-data/lib/extraction-api";
import { propagateSlotNormalizeResult } from "@/features/org/org-directory-events";
import type { NormalizeResultPayload } from "@/features/docugrid/lib/slot-documents";

type Props = {
  clientId: string;
  periodKey: string;
  slotId: string;
  slotLabel: string;
  review: ExtractionReviewPayload;
  onApplied?: (result: NormalizeResultPayload) => void;
  onDismiss?: () => void;
};

function statusLabel(status: string, required: boolean): string {
  if (status === "extracted") return "読取済";
  if (status === "low_confidence") return "要確認";
  if (required) return "未読取（必須）";
  return "未読取";
}

function statusClass(status: string): string {
  if (status === "extracted") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === "low_confidence") return "bg-amber-50 text-amber-900 border-amber-200";
  return "bg-rose-50 text-rose-900 border-rose-200";
}

export function DocumentExtractionReview({
  clientId,
  periodKey,
  slotId,
  slotLabel,
  review,
  onApplied,
  onDismiss,
}: Props) {
  const pending = useMemo(() => pendingExtractionFields(review), [review]);
  const applied = useMemo(() => appliedExtractionFields(review), [review]);
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of pending) {
      if (f.value) init[f.field_id] = f.value;
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () =>
      pending.some((f) => {
        const v = (draft[f.field_id] ?? f.value ?? "").trim();
        return v.length > 0;
      }),
    [pending, draft],
  );

  const handleApply = useCallback(async () => {
    const fields: Record<string, string> = {};
    for (const f of pending) {
      const v = (draft[f.field_id] ?? "").trim();
      if (v) fields[f.field_id] = v;
    }
    if (Object.keys(fields).length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const result = await applyExtractionFields({
        clientId,
        periodKey,
        slotId,
        slotLabel,
        fields,
      });
      propagateSlotNormalizeResult(clientId, result);
      onApplied?.(result);
    } catch {
      setError("マスタへの反映に失敗しました");
    } finally {
      setSaving(false);
    }
  }, [clientId, draft, onApplied, pending, periodKey, slotId, slotLabel]);

  if (review.review_status === "complete" && pending.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <FileSearch className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
          <div>
            <p className="text-sm font-bold text-violet-950">
              {review.document_label} — 抽出結果
            </p>
            <p className="mt-0.5 text-[11px] text-violet-700">
              読取済 {applied.length} 項目
              {pending.length > 0 ? ` · 要入力 ${pending.length} 項目` : ""}
            </p>
          </div>
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="text-[11px] font-semibold text-violet-600 hover:text-violet-900"
          >
            閉じる
          </button>
        ) : null}
      </div>

      {applied.length > 0 ? (
        <ul className="mb-3 space-y-1.5">
          {applied.map((f) => (
            <li
              key={f.field_id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-white/80 bg-white/70 px-3 py-2 text-xs"
            >
              <span className="font-semibold text-slate-600">{f.label}</span>
              <span className="min-w-0 flex-1 truncate text-slate-900">{f.value}</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClass(f.status)}`}
              >
                {statusLabel(f.status, f.required)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {pending.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-violet-800">
            PDF を見ながら未読取項目を入力
          </p>
          {pending.map((f) => (
            <label key={f.field_id} className="block">
              <span className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                {f.label}
                {f.required ? (
                  <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] text-rose-700">
                    必須
                  </span>
                ) : null}
              </span>
              <input
                type="text"
                value={draft[f.field_id] ?? f.value ?? ""}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, [f.field_id]: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder={`${f.label}を入力`}
              />
            </label>
          ))}
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
          <button
            type="button"
            disabled={!canSubmit || saving}
            onClick={() => void handleApply()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            確定してマスタへ反映
          </button>
        </div>
      ) : null}
    </div>
  );
}
