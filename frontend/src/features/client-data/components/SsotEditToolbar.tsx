"use client";

import { Loader2 } from "lucide-react";

type Props = {
  isEditing: boolean;
  canEdit?: boolean;
  saving?: boolean;
  onStart: () => void;
  onCommit: () => void;
  onCancel: () => void;
  className?: string;
};

export function SsotEditToolbar({
  isEditing,
  canEdit,
  saving,
  onStart,
  onCommit,
  onCancel,
  className = "",
}: Props) {
  if (!canEdit) return null;

  if (!isEditing) {
    return (
      <button
        type="button"
        className={`rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 ${className}`}
        onClick={onStart}
      >
        変更
      </button>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button
        type="button"
        disabled={saving}
        className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        onClick={onCommit}
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        決定
      </button>
      <button
        type="button"
        disabled={saving}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        onClick={onCancel}
      >
        キャンセル
      </button>
    </div>
  );
}
