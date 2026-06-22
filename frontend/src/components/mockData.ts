import {
  CLIENTS,
  CLIENT_FAMILY_GROUPS,
  PERIODS,
  RELATION_TYPE_LABEL,
  STAFFS,
  type ClientFamilyGroup,
  type OrgClient,
} from "@/config/organization";
import { Staff } from "./types";

/**
 * 担当者（STAFFS）と、ランタイムで取得した顧客マスタ（顧客・関係グループ）を結合して
 * UI 用の Staff[] を生成する。顧客名・決算月・関係グループはバックエンド由来の値を反映する。
 */
export function buildStaffData(
  clients: OrgClient[],
  groups: ClientFamilyGroup[],
): Staff[] {
  const clientMap = new Map(clients.map((client) => [client.id, client]));
  const groupsOf = (clientId: string) =>
    groups.filter((group) => group.clientIds.includes(clientId));

  return STAFFS.map((staff) => ({
    id: staff.id,
    name: `${staff.name} (${staff.team})`,
    clients: staff.assignments
      .map((assignment) => {
        const client = clientMap.get(assignment.clientId);
        if (!client) return null;
        return {
          id: client.id,
          name: client.name,
          fiscal: client.fiscalMonth,
          role: assignment.assignmentRole,
          groupLabels: groupsOf(client.id).map((group) => group.name),
          relationLabels: groupsOf(client.id).map(
            (group) => RELATION_TYPE_LABEL[group.relationType],
          ),
        };
      })
      .filter((client): client is NonNullable<typeof client> => client !== null),
  }));
}

/** 既定（オフライン/初期表示用）の担当データ。設定の編集が届くまでの fallback。 */
export const STAFF_DATA: Staff[] = buildStaffData(CLIENTS, CLIENT_FAMILY_GROUPS);

export { PERIODS };
