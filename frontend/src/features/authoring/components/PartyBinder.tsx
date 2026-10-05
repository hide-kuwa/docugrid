"use client";

import { PARTY_ROLE_LABEL } from "@/features/authoring/lib/merge-fields";
import type { OrgClient } from "@/config/organization";
import { ClientSearchSelect, toClientSearchOption } from "@/components/ClientSearchSelect";

type Props = {
  clients: OrgClient[];
  partyCount: number;
  bindings: Record<number, string>;
  onChange: (slot: number, clientId: string) => void;
  primaryClientId?: string;
  layout?: "row" | "stack";
};

export function PartyBinder({
  clients,
  partyCount,
  bindings,
  onChange,
  primaryClientId,
  layout = "row",
}: Props) {
  const slots = Array.from({ length: Math.max(2, partyCount) }, (_, i) => i + 1);
  const options = clients.map(toClientSearchOption);
  const withPrimary =
    primaryClientId && !options.some((c) => c.id === primaryClientId)
      ? [{ id: primaryClientId, name: "（この顧問先）" }, ...options]
      : options;

  return (
    <div className={layout === "stack" ? "flex flex-col gap-3" : "flex flex-wrap gap-3"}>
      {slots.map((slot) => (
        <label key={slot} className="block w-full min-w-0 text-[11px] text-slate-600">
          <span className="font-bold text-slate-700">
            {PARTY_ROLE_LABEL[slot] ?? `当事者${slot}`}
          </span>
          {slot === 2 ? (
            <span className="mt-0.5 block text-[10px] font-normal text-slate-500">
              乙の会社でも、代表取締役個人でも可
            </span>
          ) : null}
          <ClientSearchSelect
            clients={withPrimary}
            value={bindings[slot] ?? ""}
            onChange={(clientId) => onChange(slot, clientId)}
            emptyLabel={
              slot === 1 ? "（この顧問先）" : slot === 2 ? "未選択（乙・代表取締役など）" : "未選択"
            }
            selectClassName="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            searchClassName="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
      ))}
    </div>
  );
}
