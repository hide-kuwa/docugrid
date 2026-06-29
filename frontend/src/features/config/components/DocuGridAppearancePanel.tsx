"use client";

import { GridSlotTagsVisibilityControl } from "@/features/config/components/GridSlotTagsVisibilityControl";
import { useGridSlotTagsVisibility } from "@/features/config/hooks/use-grid-slot-tags-visibility";

export function DocuGridAppearancePanel() {
  const { mode, update } = useGridSlotTagsVisibility();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-violet-50 px-2 py-0.5 font-mono text-[10px] font-bold text-violet-700">
            UI
          </span>
          <span className="font-mono text-[10px] text-slate-400">appearance</span>
        </div>
        <h2 className="mt-1 text-lg font-bold text-slate-800">DocuGrid の見た目</h2>
        <p className="mt-1 text-xs text-slate-500">
          メイン画面（資料マトリクス）の表示に関する設定です。端末ごとに保存されます。
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800">資料枠のステータスタグ</h3>
        <p className="mt-1 text-xs text-slate-500">
          収納済み・版・共有状態などのタグ表示。デフォルトはホバー時のみ表示で、カードをすっきり見せます。
        </p>
        <div className="mt-4">
          <GridSlotTagsVisibilityControl value={mode} onChange={update} />
        </div>
      </section>
    </div>
  );
}
