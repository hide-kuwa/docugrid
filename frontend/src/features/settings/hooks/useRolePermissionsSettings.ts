"use client";

import { useCallback, useEffect, useState } from "react";
import { APP_ROLES, type AppPermission, type AppRole, type AppRoleId } from "@/config/organization";
import {
  fetchRolePermissions,
  permissionsPayloadFromRoles,
  rolesFromPermissionsPayload,
  saveRolePermissions,
} from "@/features/org/role-permissions-api";
import { toggleRolePermission } from "@/features/org/role-permissions-helpers";

export function useRolePermissionsSettings() {
  const [editableRoles, setEditableRoles] = useState<AppRole[]>(APP_ROLES);
  const [isLoadingRolePermissions, setIsLoadingRolePermissions] = useState(false);
  const [isSavingRolePermissions, setIsSavingRolePermissions] = useState(false);
  const [rolePermissionsMessage, setRolePermissionsMessage] = useState("");

  useEffect(() => {
    let active = true;
    const loadRolePermissionsData = async () => {
      setIsLoadingRolePermissions(true);
      try {
        const data = await fetchRolePermissions();
        if (!active) return;
        setEditableRoles(rolesFromPermissionsPayload(data.permissionsByRole));
      } catch {
        if (active) setEditableRoles(APP_ROLES);
      } finally {
        if (active) setIsLoadingRolePermissions(false);
      }
    };
    void loadRolePermissionsData();
    return () => {
      active = false;
    };
  }, []);

  const handleToggleRolePermission = useCallback((roleId: AppRoleId, permission: AppPermission) => {
    setEditableRoles((prev) => toggleRolePermission(prev, roleId, permission));
  }, []);

  const handleSaveRolePermissions = useCallback(async () => {
    setIsSavingRolePermissions(true);
    setRolePermissionsMessage("");
    try {
      await saveRolePermissions({
        permissionsByRole: permissionsPayloadFromRoles(editableRoles),
      });
      setRolePermissionsMessage("ロール権限マッピングを保存しました。");
    } catch (err) {
      setRolePermissionsMessage(
        err instanceof Error ? err.message : "ロール権限の保存に失敗しました。",
      );
    } finally {
      setIsSavingRolePermissions(false);
    }
  }, [editableRoles]);

  return {
    editableRoles,
    isLoadingRolePermissions,
    isSavingRolePermissions,
    rolePermissionsMessage,
    handleToggleRolePermission,
    handleSaveRolePermissions,
  };
}
