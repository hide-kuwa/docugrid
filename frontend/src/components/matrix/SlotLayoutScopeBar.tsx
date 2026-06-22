"use client";

import {
  SLOT_LAYOUT_SCOPE_LABELS,
  type SlotLayoutScope,
} from "@/lib/slot-layout-scope";

type ClientOption = { id: string; name: string };

type Props = {
  scope: SlotLayoutScope;
  onScopeChange: (scope: SlotLayoutScope) => void;
  staffClients: ClientOption[];
  selectedClientIds: string[];
  onSelectedClientIdsChange: (ids: string[]) => void;
};

const SCOPES: SlotLayoutScope[] = ["current", "staff", "selected", "org"];

export function SlotLayoutScopeBar({
  scope,
  onScopeChange,
  staffClients,
  selectedClientIds,
  onSelectedClientIdsChange,
}: Props) {
  const toggleClient = (id: string) => {
    onSelectedClientIdsChange(
      selectedClientIds.includes(id)
        ? selectedClientIds.filter((x) => x !== id)
        : [...selectedClientIds, id],
    );
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white/95 px-2 py-2 shadow-lg backdrop-blur-sm">
        <span className="px-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          反映先
        </span>
        {SCOPES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onScopeChange(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
              scope === s
                ? "bg-amber-500 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {SLOT_LAYOUT_SCOPE_LABELS[s]}
          </button>
        ))}
      </div>

      {scope === "selected" ? (
        <div className="pointer-events-auto max-h-32 max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur-sm">
          <p className="mb-1 px-1 text-[10px] font-semibold text-slate-500">会社を選択</p>
          <div className="flex flex-wrap gap-1">
            {staffClients.map((c) => {
              const on = selectedClientIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleClient(c.id)}
                  className={`rounded-lg border px-2 py-1 text-[11px] font-medium ${
                    on
                      ? "border-amber-400 bg-amber-50 text-amber-900"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
