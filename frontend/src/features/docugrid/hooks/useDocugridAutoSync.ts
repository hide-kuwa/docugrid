import { useCallback, useEffect } from "react";

import { useDocugridStore } from "../state/docugrid-store";
import type { DocugridSlotScope } from "../lib/slot-scope";
import { useSyncDocugrid } from "./useSyncDocugrid";

const AUTO_SAVE_DELAY_MS = 2000;

type Options = {
  enabled?: boolean;
  onSaved?: (documentId: string) => void;
};

/**
 * Docugrid ストアが dirty になったらデバウンス付きでクラウドへ自動保存する。
 */
export function useDocugridAutoSync(scope: DocugridSlotScope | null, options?: Options) {
  const enabled = options?.enabled ?? true;
  const onSaved = options?.onSaved;
  const sessionSyncStatus = useDocugridStore((s) => s.sessionSyncStatus);
  const { saveToCloud } = useSyncDocugrid();

  useEffect(() => {
    if (!enabled || !scope || sessionSyncStatus !== "dirty") return;
    const timer = window.setTimeout(() => {
      void saveToCloud(scope)
        .then((documentId) => {
          onSaved?.(documentId);
        })
        .catch(() => {
          /* store に error がセットされる */
        });
    }, AUTO_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, scope, sessionSyncStatus, saveToCloud, onSaved]);

  // スロット/期切替時に未保存分をフラッシュ
  useEffect(() => {
    return () => {
      if (!scope) return;
      const status = useDocugridStore.getState().sessionSyncStatus;
      if (status === "dirty") {
        void saveToCloud(scope).then((id) => onSaved?.(id)).catch(() => {});
      }
    };
  }, [scope, saveToCloud, onSaved]);

  const saveNow = useCallback(async () => {
    if (!scope) return undefined;
    const documentId = await saveToCloud(scope);
    onSaved?.(documentId);
    return documentId;
  }, [scope, saveToCloud, onSaved]);

  return { saveNow };
}
