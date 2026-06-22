"use client";

import { useCallback } from "react";
import { useAutoVouchBridgeStore } from "@/features/pdf-viewer/state/auto-vouch-bridge-store";

/** CHARTS / 正規指標から監査チェックを起動する共通フック */
export function useMetricAuditTrigger(
  onOpenMetricVouch?: (metricKey: string, valueYen: number) => void,
) {
  const pendingMetricKey = useAutoVouchBridgeStore((s) => s.pendingMetricKey);
  const stampedKeys = useAutoVouchBridgeStore((s) => s.stampedKeys);

  const isStamped = useCallback(
    (pendingKey: string) => {
      const ts = stampedKeys[pendingKey];
      if (!ts) return false;
      return Date.now() - ts < 60 * 60 * 1000;
    },
    [stampedKeys],
  );

  const trigger = useCallback(
    (metricKey: string, valueYen: number, pendingKey?: string) => {
      if (!onOpenMetricVouch || valueYen <= 0) return;
      const key = pendingKey ?? metricKey;
      const store = useAutoVouchBridgeStore.getState();
      store.setPendingMetricKey(key);
      store.setAuditPhase("navigating");
      onOpenMetricVouch(metricKey, valueYen);
    },
    [onOpenMetricVouch],
  );

  return { pendingMetricKey, trigger, isStamped };
}

export function monthlyRevenuePendingKey(month: number): string {
  return `monthly.revenue:${month}`;
}
