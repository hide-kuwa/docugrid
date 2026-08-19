"use client";

import { useCallback, useEffect, useState } from "react";
import { STAKEHOLDER_MASTER } from "@/config/organization";
import {
  fetchStakeholderMaster,
  saveStakeholderMaster,
} from "@/features/org/stakeholder-master-api";

export function useStakeholderMasterSettings() {
  const [stakeholderRoles, setStakeholderRoles] = useState<Record<string, string>>({});
  const [stakeholderScopes, setStakeholderScopes] = useState<Record<string, string[]>>({});
  const [isSavingStakeholderMaster, setIsSavingStakeholderMaster] = useState(false);
  const [stakeholderMasterMessage, setStakeholderMasterMessage] = useState("");

  useEffect(() => {
    let active = true;
    const loadStakeholderMaster = async () => {
      try {
        const data = await fetchStakeholderMaster();
        if (!active) return;
        const roles: Record<string, string> = {};
        const scopes: Record<string, string[]> = {};
        for (const actor of STAKEHOLDER_MASTER) {
          roles[actor.id] = data.roleByStakeholderId[actor.id] ?? actor.appRoleId;
          scopes[actor.id] = data.clientScopesByStakeholderId[actor.id] ?? [...actor.scopedClientIds];
        }
        setStakeholderRoles(roles);
        setStakeholderScopes(scopes);
      } catch {
        if (!active) return;
        const roles: Record<string, string> = {};
        const scopes: Record<string, string[]> = {};
        for (const actor of STAKEHOLDER_MASTER) {
          roles[actor.id] = actor.appRoleId;
          scopes[actor.id] = [...actor.scopedClientIds];
        }
        setStakeholderRoles(roles);
        setStakeholderScopes(scopes);
      }
    };
    void loadStakeholderMaster();
    return () => {
      active = false;
    };
  }, []);

  const toggleStakeholderClientScope = useCallback((stakeholderId: string, clientId: string) => {
    setStakeholderScopes((prev) => {
      const current = prev[stakeholderId] ?? [];
      const next = current.includes(clientId)
        ? current.filter((id) => id !== clientId)
        : [...current, clientId];
      return { ...prev, [stakeholderId]: next.sort() };
    });
  }, []);

  const handleSaveStakeholderMaster = useCallback(async () => {
    setIsSavingStakeholderMaster(true);
    setStakeholderMasterMessage("");
    try {
      const roleByStakeholderId: Record<string, string> = {};
      const clientScopesByStakeholderId: Record<string, string[]> = {};
      for (const actor of STAKEHOLDER_MASTER) {
        roleByStakeholderId[actor.id] = stakeholderRoles[actor.id] ?? actor.appRoleId;
        clientScopesByStakeholderId[actor.id] = stakeholderScopes[actor.id] ?? actor.scopedClientIds;
      }
      await saveStakeholderMaster({ roleByStakeholderId, clientScopesByStakeholderId });
      setStakeholderMasterMessage("担当マスタ（ロール・顧問先スコープ）を保存しました。");
    } catch (err) {
      setStakeholderMasterMessage(
        err instanceof Error ? err.message : "担当マスタの保存に失敗しました。",
      );
    } finally {
      setIsSavingStakeholderMaster(false);
    }
  }, [stakeholderRoles, stakeholderScopes]);

  return {
    stakeholderRoles,
    setStakeholderRoles,
    stakeholderScopes,
    isSavingStakeholderMaster,
    stakeholderMasterMessage,
    toggleStakeholderClientScope,
    handleSaveStakeholderMaster,
  };
}
