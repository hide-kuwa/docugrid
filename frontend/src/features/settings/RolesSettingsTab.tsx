"use client";

import { ConfigMatrixCard } from "@/features/config/components/ConfigMatrixCard";
import { ConfigSheetIntro } from "@/features/config/components/ConfigSheetIntro";
import { RolePermissionMatrix } from "@/features/config/components/RolePermissionMatrix";
import { formatConfigCellAddress } from "@/features/config/lib/cell-address";
import type { AppPermission, AppRole, AppRoleId } from "@/config/organization";

type RolesSettingsTabProps = {
  editableRoles: AppRole[];
  isLoadingRolePermissions: boolean;
  isSavingRolePermissions: boolean;
  rolePermissionsMessage: string;
  canEditPlatformSettings: boolean;
  onTogglePermission: (roleId: AppRoleId, permission: AppPermission) => void;
  onSave: () => void;
};

export function RolesSettingsTab({
  editableRoles,
  isLoadingRolePermissions,
  isSavingRolePermissions,
  rolePermissionsMessage,
  canEditPlatformSettings,
  onTogglePermission,
  onSave,
}: RolesSettingsTabProps) {
  return (
    <section className="fade-in-up space-y-4">
      <ConfigSheetIntro
        sheetId="roles"
        sheetLabel="ROLES"
        title="権限ロール"
        description="ロール（行）× 権限（列）。セルをクリックして権限を切り替え、保存すると API 認可に反映されます。"
        actions={
          canEditPlatformSettings ? (
            <button
              type="button"
              onClick={onSave}
              disabled={isSavingRolePermissions || isLoadingRolePermissions}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {isSavingRolePermissions ? "保存中…" : "権限マッピングを保存"}
            </button>
          ) : (
            <span className="text-xs text-slate-500">グローバル設定権限が必要です（閲覧のみ）</span>
          )
        }
      />
      {rolePermissionsMessage && (
        <p className="text-xs text-slate-600">{rolePermissionsMessage}</p>
      )}
      {isLoadingRolePermissions ? (
        <p className="text-xs text-slate-500">権限マッピングを読込中…</p>
      ) : (
        <RolePermissionMatrix
          roles={editableRoles}
          editable={canEditPlatformSettings}
          onTogglePermission={canEditPlatformSettings ? onTogglePermission : undefined}
        />
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {editableRoles.map((role) => (
          <ConfigMatrixCard key={role.id} cellAddress={formatConfigCellAddress("roles", role.id, "description")}>
            <div className="text-xs text-slate-500">{role.description}</div>
          </ConfigMatrixCard>
        ))}
      </div>
    </section>
  );
}
