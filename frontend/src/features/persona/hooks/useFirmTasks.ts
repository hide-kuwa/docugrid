"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchFirmTasks, type FirmTasksSummary } from "@/features/docugrid/lib/firm-tasks";

export function useFirmTasks(enabled = true) {
  const [firmTasks, setFirmTasks] = useState<FirmTasksSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const summary = await fetchFirmTasks();
      setFirmTasks(summary);
    } catch {
      setError("事務所タスクの取得に失敗しました。");
      setFirmTasks(null);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { firmTasks, loading, error, reload };
}
