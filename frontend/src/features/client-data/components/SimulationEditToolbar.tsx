"use client";

import { SsotEditToolbar } from "@/features/client-data/components/SsotEditToolbar";

type Props = {
  isEditing: boolean;
  canEdit?: boolean;
  hasOverlay?: boolean;
  saving?: boolean;
  onStart: () => void;
  onCommit: () => void;
  onCancel: () => void;
  onClearOverlay?: () => void;
  className?: string;
};

/** シミュレーション編集用ツールバー（決定はローカル表示のみ更新） */
export function SimulationEditToolbar({
  isEditing,
  canEdit,
  hasOverlay,
  saving,
  onStart,
  onCommit,
  onCancel,
  onClearOverlay,
  className = "",
}: Props) {
  if (!canEdit) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <SsotEditToolbar
        isEditing={isEditing}
        canEdit={canEdit}
        saving={saving}
        onStart={onStart}
        onCommit={onCommit}
        onCancel={onCancel}
      />
      {!isEditing && hasOverlay && onClearOverlay ? (
        <button
          type="button"
          disabled={saving}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          onClick={onClearOverlay}
        >
          正規表示に戻す
        </button>
      ) : null}
    </div>
  );
}
