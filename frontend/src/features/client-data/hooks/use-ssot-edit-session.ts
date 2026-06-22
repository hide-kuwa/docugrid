import { useCallback, useEffect, useState } from "react";

/**
 * SSOT 編集セッション — 「変更」でドラフト、「決定」で API 保存、「キャンセル」で破棄。
 * 表示中は committed、編集中のみ draft を触る。
 */
export function useSsotEditSession<T>(committed: T) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<T>(committed);

  useEffect(() => {
    if (!isEditing) {
      setDraft(committed);
    }
  }, [committed, isEditing]);

  const startEdit = useCallback(() => {
    setDraft(committed);
    setIsEditing(true);
  }, [committed]);

  const cancelEdit = useCallback(() => {
    setDraft(committed);
    setIsEditing(false);
  }, [committed]);

  const finishEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  const patchDraft = useCallback((updater: Partial<T> | ((prev: T) => T)) => {
    setDraft((prev) =>
      typeof updater === "function" ? (updater as (p: T) => T)(prev) : { ...prev, ...updater },
    );
  }, []);

  const value = isEditing ? draft : committed;

  return {
    isEditing,
    draft,
    value,
    startEdit,
    cancelEdit,
    finishEdit,
    patchDraft,
    setDraft,
  };
}
