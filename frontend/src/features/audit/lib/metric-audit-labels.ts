/** client_metrics の metric_key → 監査 UI 表示ラベル */

export const METRIC_AUDIT_LABELS: Record<string, string> = {
  "annual.revenue": "売上高",
  "annual.profit": "課税所得",
  "annual.consumption_taxable": "課税売上",
  "monthly.revenue": "月次売上",
};

export function metricAuditLabel(metricKey: string): string {
  return METRIC_AUDIT_LABELS[metricKey] ?? "数値";
}
