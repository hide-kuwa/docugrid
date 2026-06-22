import type { Client } from "@/components/types";
import {
  CLIENT_FAMILY_GROUPS,
  CLIENTS,
  RELATION_TYPE_LABEL,
  type ClientFamilyGroup,
  type OrgClient,
} from "@/config/organization";
import type { DocugridUser } from "./auth";
import { canAccessClient, resolveStakeholder } from "./authorization";

export type ClientScopeMode = "assigned" | "all";

export type NavClient = Client & {
  isAssigned: boolean;
  categoryLabel: string;
};

const FIRM_WIDE_ROLES = new Set(["admin", "firm_admin", "platform_admin", "approver"]);
const STORAGE_KEY = "docugrid.clientScopeMode";

export function loadClientScopeMode(): ClientScopeMode {
  if (typeof window === "undefined") return "assigned";
  return localStorage.getItem(STORAGE_KEY) === "all" ? "all" : "assigned";
}

export function saveClientScopeMode(mode: ClientScopeMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, mode);
}

export function isFirmWideRole(roleId?: string): boolean {
  return !!roleId && FIRM_WIDE_ROLES.has(roleId);
}

export function resolveAssignedClientIds(user: DocugridUser | null): string[] {
  const stakeholder = resolveStakeholder(user);
  if (!stakeholder) return [];
  return stakeholder.scopedClientIds.filter((id) =>
    canAccessClient(stakeholder, id, user?.visibleClientIds),
  );
}

export function resolveAllVisibleClientIds(
  user: DocugridUser | null,
  orgClientIds: string[],
): string[] {
  if (user?.visibleClientIds?.length) {
    return user.visibleClientIds.filter((id) => orgClientIds.includes(id));
  }
  const stakeholder = resolveStakeholder(user);
  if (!stakeholder) return [];
  return orgClientIds.filter((id) => canAccessClient(stakeholder, id));
}

export function canToggleClientScope(
  user: DocugridUser | null,
  assignedIds: string[],
  allIds: string[],
): boolean {
  if (!isFirmWideRole(user?.appRoleId)) return false;
  return allIds.length > assignedIds.length;
}

function groupsOf(clientId: string, groups: ClientFamilyGroup[]) {
  return groups.filter((group) => group.clientIds.includes(clientId));
}

export function buildNavClients(
  clients: OrgClient[],
  groups: ClientFamilyGroup[],
  clientIds: string[],
  assignedIdSet: Set<string>,
): NavClient[] {
  const clientMap = new Map(clients.map((client) => [client.id, client]));

  return clientIds
    .map((id): NavClient | null => {
      const client = clientMap.get(id);
      if (!client) return null;
      const clientGroups = groupsOf(client.id, groups);
      const isAssigned = assignedIdSet.has(id);
      return {
        id: client.id,
        name: client.name,
        fiscal: client.fiscalMonth,
        role: isAssigned ? "main" : "sub",
        groupLabels: clientGroups.map((group) => group.name),
        relationLabels: clientGroups.map((group) => RELATION_TYPE_LABEL[group.relationType]),
        isAssigned,
        categoryLabel: client.category === "individual" ? "個人" : "法人",
      };
    })
    .filter((client): client is NavClient => client !== null);
}

export function formatClientSubtitle(client: Pick<NavClient, "fiscal" | "categoryLabel">): string {
  return `${client.fiscal}月決算 · ${client.categoryLabel}`;
}

/** オフライン初期表示用 */
export const DEFAULT_NAV_CLIENTS: NavClient[] = buildNavClients(
  CLIENTS,
  CLIENT_FAMILY_GROUPS,
  CLIENTS.map((c) => c.id),
  new Set(CLIENTS.map((c) => c.id)),
);
