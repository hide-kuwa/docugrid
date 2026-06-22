"use client";

import { useCallback, useEffect, useState } from "react";
import { listSlotDocuments, type SlotDocumentItem } from "@/features/docugrid/lib/slot-documents";

export function useFirmRemandedSlots(clientIds: string[]) {
  const [items, setItems] = useState<SlotDocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (clientIds.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const batches = await Promise.all(
        clientIds.slice(0, 20).map((clientId) => listSlotDocuments(clientId)),
      );
      const remanded = batches
        .flat()
        .filter((s) => s.logical_status === "remanded")
        .sort((a, b) => (b.uploaded_at || "").localeCompare(a.uploaded_at || ""));
      setItems(remanded);
    } catch {
      setError("差戻し一覧の取得に失敗しました");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [clientIds]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, loading, error, reload };
}
