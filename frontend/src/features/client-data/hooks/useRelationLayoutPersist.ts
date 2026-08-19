import { useCallback, useRef, useState } from "react";
import {
  fetchClientMaster,
  saveClientMaster,
} from "@/lib/client-master-api";
import {
  emptyManualLayout,
  isManualLayoutEmpty,
  relationLayoutKey,
  type RelationDiagramManualLayout,
  type RelationLayoutsMap,
} from "@/features/client-data/lib/relation-diagram-manual-layout";

/** 関係図の手動レイアウトを debounce 保存 */
export function useRelationLayoutPersist(canEdit: boolean | undefined) {
  const layoutSaveTimer = useRef<number | undefined>(undefined);
  const [relationLayouts, setRelationLayouts] = useState<RelationLayoutsMap>({});

  const scheduleLayoutPersist = useCallback(
    (key: string, nextManual: RelationDiagramManualLayout) => {
      if (!canEdit) return;
      if (layoutSaveTimer.current !== undefined) {
        window.clearTimeout(layoutSaveTimer.current);
      }
      layoutSaveTimer.current = window.setTimeout(() => {
        void (async () => {
          try {
            const master = await fetchClientMaster();
            const next = { ...(master.relationLayouts ?? {}) };
            if (isManualLayoutEmpty(nextManual)) delete next[key];
            else next[key] = nextManual;
            const saved = await saveClientMaster(
              master.clients,
              master.groups,
              master.relations,
              next,
            );
            setRelationLayouts(saved.relationLayouts ?? {});
          } catch {
            /* 配置保存失敗は画面上の配置は維持 */
          }
        })();
      }, 700);
    },
    [canEdit],
  );

  const handleManualChange = useCallback(
    (layoutKey: string, next: RelationDiagramManualLayout) => {
      setRelationLayouts((prev) => {
        const updated = { ...prev };
        if (isManualLayoutEmpty(next)) delete updated[layoutKey];
        else updated[layoutKey] = next;
        return updated;
      });
      scheduleLayoutPersist(layoutKey, next);
    },
    [scheduleLayoutPersist],
  );

  return {
    relationLayouts,
    setRelationLayouts,
    scheduleLayoutPersist,
    handleManualChange,
    emptyManual: emptyManualLayout,
    layoutKeyFor: relationLayoutKey,
  };
}
