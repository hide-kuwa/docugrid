import type { ClientRelationEdge, OrgClient, ClientFamilyGroup } from "@/config/organization";
import type { RelationLayoutsMap } from "@/features/client-data/lib/relation-diagram-manual-layout";
import { saveClientMaster } from "@/lib/client-master-api";
import { mergeClientHistoryOnSave } from "@/lib/client-field-mutations";

export type SaveClientMasterActor = {
  email: string;
  name: string;
  stakeholderId?: string;
};

/** 顧客マスタ PUT — relationLayouts を含む payload の唯一の組み立て箇所 */
export async function persistClientMaster(
  editableClients: OrgClient[],
  loadedClients: OrgClient[],
  editableGroups: ClientFamilyGroup[],
  editableRelations: ClientRelationEdge[],
  relationLayouts: RelationLayoutsMap,
  actor: SaveClientMasterActor,
) {
  const clientsToSave = editableClients.map((client) => {
    const loaded = loadedClients.find((item) => item.id === client.id);
    return loaded ? mergeClientHistoryOnSave(loaded, client, actor) : client;
  });
  return saveClientMaster(
    clientsToSave,
    editableGroups,
    editableRelations,
    relationLayouts,
  );
}
