"use client";

import type { AppPermission, AppRole, AppRoleId } from "@/config/organization";
import { formatConfigCellAddress } from "../lib/cell-address";
import {
  ConfigMatrixHead,
  ConfigMatrixTable,
  ConfigMatrixTd,
  ConfigMatrixTh,
} from "./ConfigMatrixTable";

const PERMISSION_LABELS: Partial<Record<AppPermission, string>> = {
  "client.view": "顧客閲覧",
  "client.edit": "顧客編集",
  "document.view": "書類閲覧",
  "document.upload": "アップロード",
  "document.annotate": "注釈",
  "document.comment": "コメント",
  "audit.link": "監査リンク",
  "audit.approve": "承認",
  "dashboard.view": "ダッシュボード",
  "alert.view": "アラート閲覧",
  "alert.manage": "アラート管理",
  "settings.manage": "設定管理",
  "settings.platform": "グローバル設定",
};

function allPermissions(roles: AppRole[]): AppPermission[] {
  const set = new Set<AppPermission>();
  for (const role of roles) {
    for (const p of role.permissions) set.add(p);
  }
  return [...set].sort();
}

type Props = {
  roles: AppRole[];
  editable?: boolean;
  onTogglePermission?: (roleId: AppRoleId, permission: AppPermission) => void;
};

export function RolePermissionMatrix({ roles, editable = false, onTogglePermission }: Props) {
  const permissions = allPermissions(roles);

  return (
    <ConfigMatrixTable
      caption={editable ? "ロール × 権限（セルをクリックで切替）" : "ロール × 権限"}
    >
      <ConfigMatrixHead>
        <tr>
          <ConfigMatrixTh className="sticky left-0 z-20 min-w-[8rem] bg-slate-50">ロール</ConfigMatrixTh>
          {permissions.map((perm) => (
            <ConfigMatrixTh
              key={perm}
              className="min-w-[2.5rem] max-w-[3rem] text-center"
              title={PERMISSION_LABELS[perm] ?? perm}
            >
              <span className="block rotate-0 whitespace-normal text-[8px] font-semibold normal-case leading-tight">
                {(PERMISSION_LABELS[perm] ?? perm).replace(".", "\n")}
              </span>
            </ConfigMatrixTh>
          ))}
        </tr>
      </ConfigMatrixHead>
      <tbody>
        {roles.map((role) => (
          <tr key={role.id} className="hover:bg-slate-50/80">
            <ConfigMatrixTd
              className="sticky left-0 z-10 bg-white"
              cellAddress={formatConfigCellAddress("roles", role.id, "label")}
            >
              <div className="border-l-4 border-blue-600 pl-2">
                <div className="text-xs font-bold text-slate-800">{role.label}</div>
                <div className="font-mono text-[9px] text-slate-400">{role.id}</div>
              </div>
            </ConfigMatrixTd>
            {permissions.map((perm) => {
              const on = role.permissions.includes(perm);
              const locked =
                (role.id === "admin" || role.id === "platform_admin") && perm === "settings.manage";
              const cellClass = on
                ? "border-blue-400 bg-blue-50 text-blue-700"
                : "border-dashed border-slate-200 bg-slate-50 text-slate-300";
              return (
                <ConfigMatrixTd
                  key={perm}
                  className="text-center"
                  cellAddress={formatConfigCellAddress("roles", role.id, perm)}
                >
                  {editable && onTogglePermission && !locked ? (
                    <button
                      type="button"
                      onClick={() => onTogglePermission(role.id, perm)}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border text-[10px] font-black transition hover:ring-2 hover:ring-blue-200 ${cellClass}`}
                      title={PERMISSION_LABELS[perm] ?? perm}
                    >
                      {on ? "1" : "·"}
                    </button>
                  ) : (
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border text-[10px] font-black ${cellClass} ${
                        locked ? "opacity-80" : ""
                      }`}
                      title={locked ? "管理者は settings.manage を外せません" : undefined}
                    >
                      {on ? "1" : "·"}
                    </span>
                  )}
                </ConfigMatrixTd>
              );
            })}
          </tr>
        ))}
      </tbody>
    </ConfigMatrixTable>
  );
}
