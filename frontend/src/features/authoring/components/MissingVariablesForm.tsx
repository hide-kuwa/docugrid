"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { labelForVariable } from "@/features/authoring/types";

type Props = {
  fields: string[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** マスタに無い／空の差し込み項目。折りたたみ＋枠内スクロールで書類を隠さない */
export function MissingVariablesForm({
  fields,
  values,
  onChange,
  open,
  onOpenChange,
}: Props) {
  if (fields.length === 0) return null;
  const filled = fields.filter((name) => (values[name] ?? "").trim() !== "").length;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div>
          <p className="text-[11px] font-bold text-amber-900">
            マスタに無い項目（手入力）
            <span className="ml-1 font-normal text-amber-800/80">
              · {filled}/{fields.length} 入力済
            </span>
          </p>
          <p className="mt-0.5 text-[10px] text-amber-800/80">
            {open
              ? "枠内をスクロール。下に書類本文があります"
              : "開いて入力。閉じたまま下の書類を読めます"}
          </p>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-amber-800" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-amber-800" />
        )}
      </button>
      {open ? (
        <div className="max-h-[min(36vh,16rem)] overflow-y-auto overscroll-contain border-t border-amber-200/80 px-3 py-2 md:max-h-[min(50vh,22rem)]">
          <div className="grid gap-2 sm:grid-cols-2">
            {fields.map((name) => (
              <label key={name} className="block text-[11px] text-slate-700">
                <span className="font-bold">{labelForVariable(name)}</span>
                <span className="ml-1 font-mono text-[9px] text-slate-400">{name}</span>
                <input
                  type="text"
                  className="mt-1 block w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-sm text-slate-800"
                  value={values[name] ?? ""}
                  onChange={(e) => onChange(name, e.target.value)}
                  placeholder="入力…"
                />
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
