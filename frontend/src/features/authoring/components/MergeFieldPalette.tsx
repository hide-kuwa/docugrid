"use client";

import { DOCUMENT_FIELD_INSERTS, MERGE_FIELD_INSERTS } from "@/features/authoring/lib/merge-fields";

type Props = {
  onInsert: (token: string) => void;
};

export function MergeFieldPalette({ onInsert }: Props) {
  return (
    <div>
      <p className="text-[11px] font-bold text-slate-600">差し込み項目</p>
      <p className="mt-0.5 text-[10px] text-slate-500">
        クリックで本文に 【項目名】 を挿入。顧問先を割り当てて差し込みます。
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[...DOCUMENT_FIELD_INSERTS, ...MERGE_FIELD_INSERTS].map((item) => (
          <button
            key={item.token}
            type="button"
            onClick={() => onInsert(item.token)}
            className="rounded-full border border-indigo-100 bg-indigo-50/80 px-2 py-0.5 text-[10px] font-bold text-indigo-800 hover:bg-indigo-100"
            title={item.token}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
