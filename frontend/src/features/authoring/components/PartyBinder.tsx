"use client";

import { PARTY_ROLE_LABEL } from "@/features/authoring/lib/merge-fields";
import type { OrgClient } from "@/config/organization";

type Props = {
  clients: OrgClient[];
  partyCount: number;
  bindings: Record<number, string>;
  onChange: (slot: number, clientId: string) => void;
};

export function PartyBinder({ clients, partyCount, bindings, onChange }: Props) {
  const slots = Array.from({ length: Math.max(2, partyCount) }, (_, i) => i + 1);
  return (
    <div className="flex flex-wrap gap-3">
      {slots.map((slot) => (
        <label key={slot} className="min-w-[12rem] flex-1 text-[11px] text-slate-600">
          {PARTY_ROLE_LABEL[slot] ?? `当事者${slot}`}
          <select
            className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={bindings[slot] ?? ""}
            onChange={(e) => onChange(slot, e.target.value)}
          >
            <option value="">{slot === 1 ? "（この顧問先）" : "未選択"}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
