"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchDocumentStatus,
  type PeriodStatus,
} from "@/features/docugrid/lib/document-status";
import { listSlotDocuments, type SlotDocumentItem } from "@/features/docugrid/lib/slot-documents";
import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

/** Single-period status (includes missing slots even when nothing uploaded yet). */
async function fetchPeriodStatus(clientId: string, periodKey: string): Promise<PeriodStatus> {
  const url = new URL(`${API_BASE}/document-status`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("period_key", periodKey);
  const res = await authFetch(url.toString(), { headers: buildAuthHeaders(clientId) });
  if (!res.ok) throw new Error(`period-status-failed:${res.status}`);
  return (await res.json()) as PeriodStatus;
}

export function useClientPeriodStatus(clientId: string, periodKey: string) {
  const [periodStatus, setPeriodStatus] = useState<PeriodStatus | null>(null);
  const [slots, setSlots] = useState<SlotDocumentItem[]>([]);
  const [summaryMissing, setSummaryMissing] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const [period, slotList, summary] = await Promise.all([
        fetchPeriodStatus(clientId, periodKey),
        listSlotDocuments(clientId, periodKey),
        fetchDocumentStatus(clientId).catch(() => null),
      ]);
      setPeriodStatus(period);
      setSlots(slotList);
      setSummaryMissing(summary?.missing_total ?? null);
    } catch {
      setError("データの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [clientId, periodKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { periodStatus, slots, summaryMissing, loading, error, reload };
}
