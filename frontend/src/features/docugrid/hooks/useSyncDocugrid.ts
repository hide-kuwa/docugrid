import { useCallback } from "react";

import { API_ENDPOINTS } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

import type { DocugridHydratePayload } from "../state/docugrid-store";
import { useDocugridStore } from "../state/docugrid-store";
import type { DocugridSlotScope } from "../lib/slot-scope";

function buildSaveBody(scope?: DocugridSlotScope) {
  const s = useDocugridStore.getState();
  return {
    documentId: s.persistedDocumentId ?? undefined,
    filesById: s.filesById,
    pagesById: s.pagesById,
    highlightsById: s.highlightsById,
    pageOrder: s.pageOrder,
    fileOrder: s.fileOrder,
    highlightIdsByPageId: s.highlightIdsByPageId,
    ...(scope
      ? { clientId: scope.clientId, periodKey: scope.periodKey, slotId: scope.slotId }
      : {}),
  };
}

/**
 * Zustand の Docugrid 状態と POST/GET 永続化 API を接続する。
 */
export function useSyncDocugrid() {
  const saveToCloud = useCallback(async (scope?: DocugridSlotScope): Promise<string> => {
    useDocugridStore.getState().setSessionSyncStatus("saving");
    try {
      const res = await authFetch(API_ENDPOINTS.DOCUGRID_SAVE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders(scope?.clientId),
        },
        body: JSON.stringify(buildSaveBody(scope)),
      });
      if (!res.ok) {
        const msg = (await res.text()) || res.statusText;
        throw new Error(msg);
      }
      const data = (await res.json()) as { documentId?: string };
      const id = data.documentId;
      if (!id) {
        throw new Error("save response missing documentId");
      }
      useDocugridStore.getState().markRemotePersisted(id);
      return id;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      useDocugridStore.getState().setSessionSyncStatus("error", message);
      throw e;
    }
  }, []);

  const loadFromCloud = useCallback(async (documentId: string) => {
    useDocugridStore.getState().setSessionSyncStatus("saving");
    try {
      const res = await authFetch(API_ENDPOINTS.DOCUGRID_LOAD(documentId), {
        headers: buildAuthHeaders(),
      });
      if (!res.ok) {
        const msg = (await res.text()) || res.statusText;
        throw new Error(msg);
      }
      const data = (await res.json()) as DocugridHydratePayload;
      useDocugridStore.getState().hydrateFromServer(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      useDocugridStore.getState().setSessionSyncStatus("error", message);
      throw e;
    }
  }, []);

  return { saveToCloud, loadFromCloud };
}
