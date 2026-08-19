"use client";

import type { AppRole, OrgClient, StakeholderKind, StakeholderMaster } from "@/config/organization";
import { ConfigSheetIntro } from "@/features/config/components/ConfigSheetIntro";
import { StakeholderScopeMatrix } from "@/features/config/components/StakeholderScopeMatrix";
import { FirmMembersPanel } from "@/features/org/FirmMembersPanel";

type Props = {
  stakeholders: StakeholderMaster[];
  clients: OrgClient[];
  stakeholderRoles: Record<string, string>;
  stakeholderScopes: Record<string, string[]>;
  appRoles: AppRole[];
  kindLabel: Record<StakeholderKind, string>;
  onToggleScope: (stakeholderId: string, clientId: string) => void;
  onRoleChange: (stakeholderId: string, roleId: string) => void;
  onSave: () => void;
  isSaving: boolean;
  message: string;
};

export function StakeholderSettingsTab({
  stakeholders,
  clients,
  stakeholderRoles,
  stakeholderScopes,
  appRoles,
  kindLabel,
  onToggleScope,
  onRoleChange,
  onSave,
  isSaving,
  message,
}: Props) {
  return (
    <>
      <FirmMembersPanel />
      <section className="fade-in-up space-y-4">
        <ConfigSheetIntro
          sheetId="stakeholders"
          sheetLabel="STAKEHOLDERS"
          title="担当マスタ"
          description="担当（行）× 顧問先（列）の割当表。1/· でスコープを切り替えます。"
          actions={
            <button
              type="button"
              disabled={isSaving}
              onClick={onSave}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {isSaving ? "保存中…" : "スコープを保存"}
            </button>
          }
        />
        {message && <p className="text-xs text-slate-600">{message}</p>}
        <StakeholderScopeMatrix
          stakeholders={stakeholders}
          clients={clients}
          rolesByStakeholderId={stakeholderRoles}
          scopesByStakeholderId={stakeholderScopes}
          appRoles={appRoles}
          kindLabel={kindLabel}
          onToggleScope={onToggleScope}
          onRoleChange={onRoleChange}
        />
      </section>
    </>
  );
}
