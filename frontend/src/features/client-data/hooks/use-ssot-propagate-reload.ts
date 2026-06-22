"use client";

import { useEffect } from "react";
import {
  SSOT_PROPAGATE_EVENT,
  type SsotPropagateDetail,
} from "@/features/org/org-directory-events";

export type SsotReloadFilter = (detail: SsotPropagateDetail) => boolean;

/** SSOT 正規化パイプライン適用後にコールバックを実行。 */
export function useSsotPropagateReload(
  clientId: string,
  onReload: () => void,
  filter?: SsotReloadFilter,
): void {
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<SsotPropagateDetail>).detail;
      if (!detail || detail.clientId !== clientId) return;
      if (filter && !filter(detail)) return;
      onReload();
    };
    window.addEventListener(SSOT_PROPAGATE_EVENT, handler);
    return () => window.removeEventListener(SSOT_PROPAGATE_EVENT, handler);
  }, [clientId, onReload, filter]);
}

export function ssotHasProfileChanges(detail: SsotPropagateDetail): boolean {
  return (detail.appliedFieldIds?.length ?? 0) > 0;
}

export function ssotHasMetricsChanges(detail: SsotPropagateDetail): boolean {
  return (detail.metricsApplied ?? 0) > 0;
}

export function ssotHasAnyChanges(detail: SsotPropagateDetail): boolean {
  return ssotHasProfileChanges(detail) || ssotHasMetricsChanges(detail);
}
