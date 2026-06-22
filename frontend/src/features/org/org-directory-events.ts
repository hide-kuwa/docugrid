/** 顧客マスタ保存後に useOrgDirectory 等へ再取得を促す。 */
export const ORG_DIRECTORY_RELOAD_EVENT = "docugrid:org-directory-reload";

/** SSOT 正規化パイプライン適用後 — clientId と反映フィールドを載せる。 */
export const SSOT_PROPAGATE_EVENT = "docugrid:ssot-propagate";

export type SsotPropagateDetail = {
  clientId: string;
  appliedFieldIds: string[];
  metricsApplied: number;
  taxAlertsCreated?: number;
};

export function dispatchOrgDirectoryReload(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ORG_DIRECTORY_RELOAD_EVENT));
}

export function dispatchSsotPropagate(detail: SsotPropagateDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SSOT_PROPAGATE_EVENT, { detail }));
  dispatchOrgDirectoryReload();
}

/** POST /api/slots レスポンスの normalize_result を UI へ反映。 */
export function propagateSlotNormalizeResult(
  clientId: string,
  normalizeResult: import("@/features/docugrid/lib/slot-documents").NormalizeResultPayload | null | undefined,
): boolean {
  if (!normalizeResult?.propagate) return false;
  dispatchSsotPropagate({
    clientId,
    appliedFieldIds: (normalizeResult.applied ?? []).map((a) => a.field_id),
    metricsApplied: normalizeResult.metrics_applied?.length ?? 0,
    taxAlertsCreated: normalizeResult.tax_alerts_created?.length ?? 0,
  });
  return true;
}
