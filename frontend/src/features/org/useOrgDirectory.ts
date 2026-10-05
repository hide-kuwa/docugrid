import { useCallback, useEffect, useState } from "react";
import type { ClientFamilyGroup, OrgClient } from "@/config/organization";
import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import { ORG_DIRECTORY_RELOAD_EVENT } from "@/features/org/org-directory-events";

export type OrgDirectory = {
  clients: OrgClient[];
  groups: ClientFamilyGroup[];
  /** true once the backend client-master has been merged in. */
  loaded: boolean;
};

/**
 * 顧客マスタ（顧客・関係グループ）をバックエンドから取得する。
 * 取得前は空。他事務所のデモ顧客（config の CLIENTS）は混ぜない。
 * 設定画面（PUT /api/client-master）での編集がここに反映される。
 */
export function useOrgDirectory(): OrgDirectory {
  const [clients, setClients] = useState<OrgClient[]>([]);
  const [groups, setGroups] = useState<ClientFamilyGroup[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await authFetch(`${API_BASE}/client-master`, {
        headers: buildAuthHeaders(),
        signal,
      });
      if (res.ok) {
        const data = (await res.json()) as {
          clients?: OrgClient[];
          groups?: ClientFamilyGroup[];
        };
        if (Array.isArray(data.clients)) {
          setClients(data.clients);
        }
        if (Array.isArray(data.groups)) {
          setGroups(data.groups);
        }
      }
    } catch {
      // ネットワーク不通時は空のまま（デモ顧客で埋めない）
    } finally {
      if (!signal?.aborted) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    const onReload = () => {
      void reload();
    };
    window.addEventListener(ORG_DIRECTORY_RELOAD_EVENT, onReload);
    return () => {
      controller.abort();
      window.removeEventListener(ORG_DIRECTORY_RELOAD_EVENT, onReload);
    };
  }, [reload]);

  return { clients, groups, loaded };
}
