"use client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import type { PeriodStatus } from "@/features/docugrid/lib/document-status";

type Props = {
  periodKey: string;
  periodLabel: string;
  status: PeriodStatus | null;
  loading: boolean;
  error: string | null;
  onSelectMissing?: (slotIndex: number, label: string) => void;
};

export function SubmissionChecklistWidget({
  periodKey,
  periodLabel,
  status,
  loading,
  error,
  onSelectMissing,
}: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        提出状況を読み込み中…
      </div>
    );
  }

  if (error) {
    return <p className="py-4 text-sm text-red-600">{error}</p>;
  }

  if (!status) {
    return <p className="py-4 text-sm text-slate-500">提出状況を取得できませんでした。</p>;
  }

  const required = status.required_count;
  const filled = status.filled_count;
  const missing = status.missing ?? [];
  const pendingApproval = status.pending_approval ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{periodLabel}</p>
          <p className="text-lg font-black text-slate-800">
            {filled} / {required} 点 提出済み
          </p>
        </div>
        {status.complete ? (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
            提出完了
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
            あと {missing.length} 点
          </span>
        )}
      </div>

      <ul className="space-y-2">
        {missing.map((label) => (
          <li key={`missing-${periodKey}-${label}`}>
            <button
              type="button"
              onClick={() => {
                const idx = (status.missing ?? []).indexOf(label);
                if (idx >= 0) onSelectMissing?.(idx, label);
              }}
              className="flex w-full items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-left text-sm hover:bg-amber-100"
            >
              <Circle className="h-4 w-4 shrink-0 text-amber-600" />
              <span className="font-medium text-slate-800">{label}</span>
              <span className="ml-auto text-xs text-amber-700">未提出</span>
            </button>
          </li>
        ))}
        {pendingApproval.map((label) => (
          <li
            key={`pending-${periodKey}-${label}`}
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-500" />
            <span className="font-medium text-slate-700">{label}</span>
            <span className="ml-auto text-xs text-blue-600">確認中</span>
          </li>
        ))}
        {required === 0 && (
          <li className="text-sm text-slate-500">この期間の必須書類は定義されていません。</li>
        )}
        {required > 0 && missing.length === 0 && pendingApproval.length === 0 && status.complete && (
          <li className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="font-medium text-emerald-800">すべて提出済みです</span>
          </li>
        )}
      </ul>
      {missing.length > 0 && (
        <p className="text-xs text-slate-500">
          未提出の行をタップすると、下の「簡易アップロード」でその書類を選べます。
        </p>
      )}
    </div>
  );
}
