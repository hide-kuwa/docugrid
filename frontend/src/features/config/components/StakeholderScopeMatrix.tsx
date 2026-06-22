"use client";

import type { AppRole, OrgClient, StakeholderMaster } from "@/config/organization";
import { formatConfigCellAddress } from "../lib/cell-address";
import {
  ConfigMatrixHead,
  ConfigMatrixTable,
  ConfigMatrixTd,
  ConfigMatrixTh,
} from "./ConfigMatrixTable";

type Props = {
  stakeholders: StakeholderMaster[];
  clients: OrgClient[];
  rolesByStakeholderId: Record<string, string>;
  scopesByStakeholderId: Record<string, string[]>;
  appRoles: AppRole[];
  kindLabel: Record<StakeholderMaster["kind"], string>;
  onToggleScope: (stakeholderId: string, clientId: string) => void;
  onRoleChange: (stakeholderId: string, roleId: string) => void;
};

export function StakeholderScopeMatrix({
  stakeholders,
  clients,
  rolesByStakeholderId,
  scopesByStakeholderId,
  appRoles,
  kindLabel,
  onToggleScope,
  onRoleChange,
}: Props) {
  return (
    <ConfigMatrixTable caption="担当 × 顧問先（1 = スコープに含める）">
      <ConfigMatrixHead>
        <tr>
          <ConfigMatrixTh className="sticky left-0 z-20 min-w-[11rem] bg-slate-50">
            担当（行）
          </ConfigMatrixTh>
          <ConfigMatrixTh className="min-w-[8rem]">ロール</ConfigMatrixTh>
          {clients.map((client) => (
            <ConfigMatrixTh
              key={client.id}
              className="min-w-[3.25rem] text-center"
              title={formatConfigCellAddress("stakeholders", client.id, "scope")}
            >
              <span className="block font-mono text-[9px] text-slate-400">{client.id}</span>
              <span className="block max-w-[4.5rem] truncate text-[9px] font-semibold normal-case text-slate-600">
                {client.name}
              </span>
            </ConfigMatrixTh>
          ))}
        </tr>
      </ConfigMatrixHead>
      <tbody>
        {stakeholders.map((actor) => {
          const scope = scopesByStakeholderId[actor.id] ?? [];
          return (
            <tr key={actor.id} className="hover:bg-slate-50/80">
              <ConfigMatrixTd
                className="sticky left-0 z-10 bg-white"
                cellAddress={formatConfigCellAddress("stakeholders", actor.id, "displayName")}
              >
                <div className="border-l-4 border-blue-600 pl-2">
                  <div className="text-xs font-bold text-slate-800">{actor.displayName}</div>
                  <div className="font-mono text-[9px] text-slate-400">{actor.id}</div>
                  <div className="text-[9px] text-slate-500">{kindLabel[actor.kind]}</div>
                </div>
              </ConfigMatrixTd>
              <ConfigMatrixTd cellAddress={formatConfigCellAddress("stakeholders", actor.id, "appRoleId")}>
                <select
                  className="w-full min-w-[7rem] rounded border border-slate-200 px-1.5 py-1 text-[10px]"
                  value={rolesByStakeholderId[actor.id] ?? actor.appRoleId}
                  onChange={(e) => onRoleChange(actor.id, e.target.value)}
                >
                  {appRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </ConfigMatrixTd>
              {clients.map((client) => {
                const checked = scope.includes(client.id);
                const addr = formatConfigCellAddress("stakeholders", actor.id, `scope.${client.id}`);
                return (
                  <ConfigMatrixTd key={client.id} className="text-center" cellAddress={addr}>
                    <button
                      type="button"
                      aria-pressed={checked}
                      aria-label={`${actor.displayName} → ${client.name}`}
                      onClick={() => onToggleScope(actor.id, client.id)}
                      className={`mx-auto flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-black transition-colors ${
                        checked
                          ? "border-blue-400 bg-blue-50 text-blue-700"
                          : "border-dashed border-slate-200 bg-slate-50 text-slate-300 hover:border-slate-300 hover:text-slate-500"
                      }`}
                    >
                      {checked ? "1" : "·"}
                    </button>
                  </ConfigMatrixTd>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </ConfigMatrixTable>
  );
}
