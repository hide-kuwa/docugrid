import { useCallback, useEffect, useState } from "react";
import {
  deleteSimulationOverlay,
  fetchSimulationOverlay,
  saveSimulationOverlay,
  type SimulationPanelKey,
} from "@/features/client-data/lib/client-simulation-api";

/**
 * 正規値（SSOT）の上にシミュレーション用オーバーレイを載せる。
 * 「決定」でシミュレーション専用 DB に保存（正規 metrics には書かない）。
 */
export function useSimulationOverlay<T>(options: {
  clientId: string;
  panelKey: SimulationPanelKey;
  canonical: T;
  clone: (value: T) => T;
}) {
  const { clientId, panelKey, canonical, clone } = options;

  const [overlay, setOverlay] = useState<T | null>(null);
  const [overlayReady, setOverlayReady] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<T | null>(null);
  const [persisting, setPersisting] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOverlayReady(false);
    setOverlay(null);
    setIsEditing(false);
    setDraft(null);
    setPersistError(null);

    void (async () => {
      try {
        const row = await fetchSimulationOverlay<T>(clientId, panelKey);
        if (!cancelled && row?.payload) {
          setOverlay(row.payload);
        }
      } catch {
        if (!cancelled) setPersistError("シミュレーションの読み込みに失敗しました");
      } finally {
        if (!cancelled) setOverlayReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientId, panelKey]);

  const display = overlay ?? canonical;
  const hasOverlay = overlay != null;

  const startEdit = useCallback(() => {
    setDraft(clone(overlay ?? canonical));
    setIsEditing(true);
    setPersistError(null);
  }, [canonical, clone, overlay]);

  const cancelEdit = useCallback(() => {
    setDraft(null);
    setIsEditing(false);
  }, []);

  const commitEdit = useCallback(async () => {
    if (!draft) return;
    setPersisting(true);
    setPersistError(null);
    try {
      await saveSimulationOverlay(clientId, panelKey, draft);
      setOverlay(draft);
      setDraft(null);
      setIsEditing(false);
    } catch {
      setPersistError("シミュレーションの保存に失敗しました");
    } finally {
      setPersisting(false);
    }
  }, [clientId, draft, panelKey]);

  const clearOverlay = useCallback(async () => {
    setPersisting(true);
    setPersistError(null);
    try {
      await deleteSimulationOverlay(clientId, panelKey);
      setOverlay(null);
      setDraft(null);
      setIsEditing(false);
    } catch {
      setPersistError("シミュレーションの削除に失敗しました");
    } finally {
      setPersisting(false);
    }
  }, [clientId, panelKey]);

  const patchDraft = useCallback(
    (updater: (prev: T) => T) => {
      setDraft((prev) => updater(prev ?? clone(overlay ?? canonical)));
    },
    [canonical, clone, overlay],
  );

  return {
    canonical,
    display,
    overlay,
    hasOverlay,
    overlayReady,
    isEditing,
    draft,
    persisting,
    persistError,
    startEdit,
    cancelEdit,
    commitEdit,
    clearOverlay,
    patchDraft,
    setDraft,
  };
}
