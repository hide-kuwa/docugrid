"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/config/api";
import {
  CLIENTS,
  CLIENT_FAMILY_GROUPS,
  CLIENT_RELATIONS,
  type ClientRelationEdge,
} from "@/config/organization";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import {
  sanitizeClientProfile,
  sanitizeClientProfileHistory,
  sanitizeClientProfileMeta,
} from "@/config/client-profile-fields";
import { ORG_DIRECTORY_RELOAD_EVENT } from "@/features/org/org-directory-events";
import { persistClientMaster } from "@/features/settings/save-client-master";
import type { DocugridUser } from "@/lib/auth";

export type RelationLayoutState = Record<
  string,
  {
    nodes: Record<string, { x: number; y: number }>;
    labels: Record<string, { x: number; y: number }>;
    bends: Record<string, { x: number; y: number }>;
  }
>;

export function useClientMasterSettings() {
  const clientMasterEndpoint = `${API_BASE}/client-master`;

  const [isSavingClientMaster, setIsSavingClientMaster] = useState(false);
  const [clientMasterMessage, setClientMasterMessage] = useState("");
  const [editableClients, setEditableClients] = useState(CLIENTS);
  const [editableGroups, setEditableGroups] = useState(CLIENT_FAMILY_GROUPS);
  const [editableRelations, setEditableRelations] = useState<ClientRelationEdge[]>(CLIENT_RELATIONS);
  const [editableRelationLayouts, setEditableRelationLayouts] = useState<RelationLayoutState>({});
  const loadedClientsRef = useRef(CLIENTS);

  const applyClientMasterPayload = useCallback(
    (data: {
      clients?: typeof CLIENTS;
      groups?: typeof CLIENT_FAMILY_GROUPS;
      relations?: ClientRelationEdge[];
      relationLayouts?: RelationLayoutState;
    }) => {
      if (Array.isArray(data.clients)) {
        const clients = data.clients.map((client) => ({
          ...client,
          profile: sanitizeClientProfile(client.profile),
          profileMeta: sanitizeClientProfileMeta(client.profileMeta),
          profileHistory: sanitizeClientProfileHistory(client.profileHistory),
        }));
        setEditableClients(clients);
        loadedClientsRef.current = clients;
      }
      if (Array.isArray(data.groups)) setEditableGroups(data.groups);
      if (Array.isArray(data.relations)) setEditableRelations(data.relations);
      if (data.relationLayouts && typeof data.relationLayouts === "object") {
        setEditableRelationLayouts(data.relationLayouts);
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    const loadClientMaster = async () => {
      try {
        const res = await authFetch(clientMasterEndpoint, { headers: buildAuthHeaders() });
        if (!res.ok) return;
        const data = (await res.json()) as Parameters<typeof applyClientMasterPayload>[0];
        if (!active) return;
        applyClientMasterPayload(data);
      } catch {
        /* keep fallback */
      }
    };
    void loadClientMaster();
    return () => {
      active = false;
    };
  }, [clientMasterEndpoint, applyClientMasterPayload]);

  useEffect(() => {
    const reloadClientMaster = async () => {
      try {
        const res = await authFetch(clientMasterEndpoint, { headers: buildAuthHeaders() });
        if (!res.ok) return;
        const data = (await res.json()) as Parameters<typeof applyClientMasterPayload>[0];
        applyClientMasterPayload(data);
      } catch {
        /* ignore */
      }
    };
    const onReload = () => {
      void reloadClientMaster();
    };
    window.addEventListener(ORG_DIRECTORY_RELOAD_EVENT, onReload);
    return () => window.removeEventListener(ORG_DIRECTORY_RELOAD_EVENT, onReload);
  }, [clientMasterEndpoint, applyClientMasterPayload]);

  const handleSaveClientMaster = useCallback(
    async (currentUser: DocugridUser | null) => {
      if (!currentUser) return;
      setIsSavingClientMaster(true);
      setClientMasterMessage("");
      try {
        const actor = {
          email: currentUser.email,
          name: currentUser.name,
          stakeholderId: currentUser.stakeholderId,
        };
        const saved = await persistClientMaster(
          editableClients,
          loadedClientsRef.current,
          editableGroups,
          editableRelations,
          editableRelationLayouts,
          actor,
        );
        loadedClientsRef.current = saved.clients;
        setEditableClients(saved.clients);
        setEditableGroups(saved.groups);
        setEditableRelations(saved.relations);
        setEditableRelationLayouts(saved.relationLayouts ?? {});
        setClientMasterMessage("顧客マスタを保存しました。");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "顧客マスタ保存に失敗しました。";
        setClientMasterMessage(msg);
      } finally {
        setIsSavingClientMaster(false);
      }
    },
    [editableClients, editableGroups, editableRelations, editableRelationLayouts],
  );

  return {
    editableClients,
    setEditableClients,
    editableGroups,
    setEditableGroups,
    editableRelations,
    editableRelationLayouts,
    isSavingClientMaster,
    clientMasterMessage,
    handleSaveClientMaster,
  };
}
