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
  category: OrgClient["category"];
  categoryLabel: string;
  /** 顧客詳細の顧客名かな（ひらがな検索用） */
  nameKana?: string;
  /** 設立年月日（第N期の算出用） */
  establishedDate?: string;
};

const FIRM_WIDE_ROLES = new Set(["admin", "firm_admin", "platform_admin", "approver"]);
const STORAGE_KEY = "docugrid.clientScopeMode";

export function loadClientScopeMode(): ClientScopeMode {
  // 既定は全体（全員に許可）。担当分に絞る人だけ localStorage で "assigned"
  if (typeof window === "undefined") return "all";
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "assigned") return "assigned";
  return "all";
}

export function saveClientScopeMode(mode: ClientScopeMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, mode);
}

export function isFirmWideRole(roleId?: string): boolean {
  return !!roleId && FIRM_WIDE_ROLES.has(roleId);
}

function idsInDirectory(ids: string[], orgClientIds: string[]): string[] {
  if (orgClientIds.length === 0) return [];
  const orgSet = new Set(orgClientIds);
  return ids.filter((id) => orgSet.has(id));
}

/**
 * 担当分の顧問先。assignedClientIds（割当そのもの）を優先。
 * 空／未設定のときは visibleClientIds（管理者は事務所全体）に落とす。
 */
export function resolveAssignedClientIds(
  user: DocugridUser | null,
  orgClientIds: string[] = [],
): string[] {
  if (Array.isArray(user?.assignedClientIds) && user.assignedClientIds.length > 0) {
    return idsInDirectory(user.assignedClientIds, orgClientIds);
  }
  if (Array.isArray(user?.visibleClientIds) && user.visibleClientIds.length > 0) {
    return idsInDirectory(user.visibleClientIds, orgClientIds);
  }
  const stakeholder = resolveStakeholder(user);
  if (!stakeholder) return [];
  const scoped = stakeholder.scopedClientIds.filter((id) =>
    canAccessClient(stakeholder, id),
  );
  return idsInDirectory(scoped, orgClientIds);
}

export function resolveAllVisibleClientIds(
  user: DocugridUser | null,
  orgClientIds: string[],
): string[] {
  if (Array.isArray(user?.visibleClientIds)) {
    return idsInDirectory(user.visibleClientIds, orgClientIds);
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
  // 権限設定（割当）は残すが、現状は誰でも全体⇔担当分を切り替え可
  if (!user) return false;
  return allIds.length > 0 && allIds.length !== assignedIds.length;
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
        category: client.category,
        categoryLabel: client.category === "individual" ? "個人" : "法人",
        nameKana: (client.profile?.customer_name_kana ?? "").trim() || undefined,
        establishedDate: (client.profile?.established_date ?? "").trim() || undefined,
      };
    })
    .filter((client): client is NavClient => client !== null);
}

export function formatClientSubtitle(
  client: Pick<NavClient, "fiscal" | "category" | "categoryLabel">,
): string {
  if (client.category === "individual") {
    return `3月申告 · ${client.categoryLabel}`;
  }
  return `${client.fiscal}月決算 · ${client.categoryLabel}`;
}

/** 担当顧問先がまだ無いときのプレースホルダ（デモ顧客は使わない） */
export const EMPTY_NAV_CLIENT: NavClient = {
  id: "unknown",
  name: "顧問先なし",
  fiscal: 3,
  role: "main",
  groupLabels: [],
  relationLabels: [],
  isAssigned: false,
  category: "corporate",
  categoryLabel: "—",
};

/** オフライン初期表示用（マトリクスドラムでは使わない） */
export const DEFAULT_NAV_CLIENTS: NavClient[] = buildNavClients(
  CLIENTS,
  CLIENT_FAMILY_GROUPS,
  CLIENTS.map((c) => c.id),
  new Set(CLIENTS.map((c) => c.id)),
);
