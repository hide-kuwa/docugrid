"use client";

import { useEffect, useRef, useState } from "react";
import { LayoutTemplate, Plus, X } from "lucide-react";
import type { SlotPresetGroup } from "@/lib/slot-layout-presets";

type Props = {
  presetGroups: SlotPresetGroup[];
  existingLabels: string[];
  onAddCustom: (label: string) => void;
  onAddPresets: (presetIds: string[]) => void;
  /** toolbar = ヘッダー横のボタン / grid = グリッド内の追加枠カード */
  variant?: "toolbar" | "grid";
};

function suggestCustomSlotLabel(existingLabels: string[]): string {
  const taken = new Set(existingLabels.map((l) => l.trim()));
  const base = "新しい枠";
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export function SlotAddPanel({
  presetGroups,
  existingLabels,
  onAddCustom,
  onAddPresets,
  variant = "toolbar",
}: Props) {
  const [open, setOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [selectedPresetIds, setSelectedPresetIds] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const existing = new Set(existingLabels.map((l) => l.trim()));

  const togglePreset = (id: string) => {
    setSelectedPresetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const commitCustom = () => {
    const label = customLabel.trim();
    if (!label || existing.has(label)) return;
    onAddCustom(label);
    setCustomLabel("");
    setOpen(false);
  };

  const commitPresets = () => {
    if (selectedPresetIds.size === 0) return;
    onAddPresets([...selectedPresetIds]);
    setSelectedPresetIds(new Set());
    setOpen(false);
  };

  const quickAdd = () => {
    onAddCustom(suggestCustomSlotLabel(existingLabels));
    setOpen(false);
  };

  const openPanel = () => {
    setCustomLabel(suggestCustomSlotLabel(existingLabels));
    setOpen(true);
  };

  const popover = open ? (
    <div
      className={`absolute z-50 mt-2 w-[min(100vw-2rem,22rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl ${
        variant === "grid" ? "left-0 top-full sm:left-auto sm:right-0" : "left-0 top-full"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700">枠を追加</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="閉じる"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={quickAdd}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          すぐ追加（名前は後から変更）
        </button>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            名前を指定
          </label>
          <div className="mt-1 flex gap-1.5">
            <input
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitCustom();
              }}
              placeholder="枠の名前"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            />
            <button
              type="button"
              onClick={commitCustom}
              disabled={!customLabel.trim() || existing.has(customLabel.trim())}
              className="shrink-0 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              追加
            </button>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <div className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <LayoutTemplate className="h-3 w-3" aria-hidden />
            定型から追加
          </div>
          <div className="max-h-48 space-y-2 overflow-y-auto pr-0.5">
            {presetGroups.map((group) => (
              <div key={group.id}>
                <div className="mb-1 text-[10px] font-semibold text-slate-400">{group.title}</div>
                <div className="flex flex-wrap gap-1">
                  {group.items.map((item) => {
                    const taken = existing.has(item.label);
                    const selected = selectedPresetIds.has(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={taken}
                        onClick={() => togglePreset(item.id)}
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition ${
                          taken
                            ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
                            : selected
                              ? "border-amber-400 bg-amber-50 text-amber-900"
                              : "border-slate-200 bg-white text-slate-600 hover:border-amber-300"
                        }`}
                      >
                        {item.label}
                        {taken ? " ✓" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={commitPresets}
            disabled={selectedPresetIds.size === 0}
            className="mt-2 w-full rounded-lg border border-amber-300 bg-amber-50 py-1.5 text-xs font-bold text-amber-900 disabled:opacity-40"
          >
            選択した定型を追加 ({selectedPresetIds.size})
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (variant === "grid") {
    return (
      <div ref={panelRef} className="relative h-full min-w-0">
        <button
          type="button"
          onClick={openPanel}
          className="flex h-full w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/40 p-3 text-center transition-colors hover:border-amber-400 hover:bg-amber-50"
        >
          <Plus className="mb-2 h-8 w-8 text-amber-600" aria-hidden />
          <div className="text-xs font-black text-amber-800">枠を追加</div>
          <div className="mt-1 px-1 text-[10px] font-medium leading-snug text-amber-700/90">
            クリックで追加
            <br />
            名前・定型も選べます
          </div>
        </button>
        {popover}
      </div>
    );
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 shadow-sm hover:bg-amber-100"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        枠を追加
      </button>
      {popover}
    </div>
  );
}
