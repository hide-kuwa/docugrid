import {
  AppPermission,
  STAKEHOLDER_MASTER,
  StakeholderMaster,
  getRoleById,
} from "@/config/organization";
import { DocugridUser } from "./auth";

export const resolveStakeholder = (user: DocugridUser | null): StakeholderMaster | null => {
  if (!user) return null;
  if (user.stakeholderId) {
    return STAKEHOLDER_MASTER.find((item) => item.id === user.stakeholderId) ?? null;
  }
  return (
    STAKEHOLDER_MASTER.find((item) => item.displayName === user.name || item.displayName.includes(user.name)) ?? null
  );
};

export const hasPermission = (user: DocugridUser | null, permission: AppPermission): boolean => {
  if (!user) return false;
  // Server-synced list is authoritative (including empty = no grants).
  // Only fall back to static APP_ROLES when permissions were never synced.
  if (Array.isArray(user.permissions)) {
    return user.permissions.includes(permission);
  }
  if (!user.appRoleId) return false;
  const role = getRoleById(user.appRoleId);
  if (!role) return false;
  return role.permissions.includes(permission);
};

export const canAccessClient = (
  stakeholder: StakeholderMaster | null,
  clientId: string | undefined,
  visibleClientIds?: string[],
): boolean => {
  if (!clientId) return false;
  if (visibleClientIds?.length) {
    return visibleClientIds.includes(clientId);
  }
  if (!stakeholder) return false;
  return stakeholder.scopedClientIds.includes(clientId);
};
