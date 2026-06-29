"use client";

import type { SlotTagsVisibility } from "@/lib/grid-display-preferences";

type Props = {
  value: SlotTagsVisibility;
  onChange: (value: SlotTagsVisibility) => void;
};

const OPTIONS: { id: SlotTagsVisibility; label: string; hint: string }[] = [
  { id: "hover", label: "ホバー", hint: "マウスを乗せたときだけ表示" },
  { id: "always", label: "常時", hint: "タグを常に表示" },
];

export function GridSlotTagsVisibilityControl({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
      {OPTIONS.map((opt) => (
        <label
          key={opt.id}
          className={`flex flex-1 cursor-pointer items-start gap-2 rounded-xl border px-4 py-3 transition-colors ${
            value === opt.id
              ? "border-blue-300 bg-blue-50/80 ring-1 ring-blue-200"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <input
            type="radio"
            name="grid-slot-tags-visibility"
            checked={value === opt.id}
            onChange={() => onChange(opt.id)}
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm font-bold text-slate-800">{opt.label}</span>
            <span className="mt-0.5 block text-xs text-slate-500">{opt.hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
