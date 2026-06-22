/** マトリクス画面へのディープリンク（顧客 × 期 × スロット）。 */

export type MatrixDeepLinkParams = {
  clientId: string;
  periodKey: string;
  slotId: string;
  audit?: boolean;
  vouchMetric?: string;
  vouchYen?: number;
  vouchField?: string;
  vouchValue?: string;
  vouchHint?: string;
};

export function buildMatrixDeepLink(params: MatrixDeepLinkParams): string {
  const q = new URLSearchParams({
    client: params.clientId,
    period: params.periodKey,
    slot: params.slotId,
  });
  if (params.audit) q.set("audit", "1");
  if (params.vouchMetric) q.set("vouch_metric", params.vouchMetric);
  if (params.vouchYen != null) q.set("vouch_yen", String(params.vouchYen));
  if (params.vouchField) q.set("vouch_field", params.vouchField);
  if (params.vouchValue) q.set("vouch_value", params.vouchValue);
  if (params.vouchHint) q.set("vouch_hint", params.vouchHint);
  return `/?${q.toString()}`;
}

export function parseMatrixDeepLink(search: string): MatrixDeepLinkParams | null {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const clientId = q.get("client");
  const periodKey = q.get("period");
  const slotId = q.get("slot");
  if (!clientId || !periodKey || !slotId) return null;
  const vouchYenRaw = q.get("vouch_yen");
  return {
    clientId,
    periodKey,
    slotId,
    audit: q.get("audit") === "1",
    vouchMetric: q.get("vouch_metric") ?? undefined,
    vouchYen: vouchYenRaw ? Number(vouchYenRaw) : undefined,
    vouchField: q.get("vouch_field") ?? undefined,
    vouchValue: q.get("vouch_value") ?? undefined,
    vouchHint: q.get("vouch_hint") ?? undefined,
  };
}
