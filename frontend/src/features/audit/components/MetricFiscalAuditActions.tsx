"use client";

import { AuditCheckToggle } from "@/features/audit/components/AuditCheckToggle";
import { metricAuditLabel } from "@/features/audit/lib/metric-audit-labels";
import { useMetricAuditTrigger } from "@/features/audit/hooks/use-metric-audit-trigger";

type Props = {
  revenueYen?: number;
  profitYen?: number;
  consumptionYen?: number;
  layout?: "row" | "stack";
  onOpenMetricVouch?: (metricKey: string, valueYen: number) => void;
};

/** 年次指標（売上・所得・課税標準）の監査チェック群 */
export function MetricFiscalAuditActions({
  revenueYen = 0,
  profitYen = 0,
  consumptionYen = 0,
  layout = "row",
  onOpenMetricVouch,
}: Props) {
  const { pendingMetricKey, trigger, isStamped } = useMetricAuditTrigger(onOpenMetricVouch);

  if (!onOpenMetricVouch) return null;
  if (revenueYen <= 0 && profitYen <= 0 && consumptionYen <= 0) return null;

  const wrap = layout === "row" ? "flex flex-wrap items-center justify-center gap-1" : "flex flex-col items-center gap-1";

  return (
    <div className={wrap}>
      {revenueYen > 0 ? (
        <AuditCheckToggle
          tag="売上"
          metricLabel={metricAuditLabel("annual.revenue")}
          loading={pendingMetricKey === "annual.revenue"}
          active={pendingMetricKey === "annual.revenue"}
          completed={isStamped("annual.revenue")}
          onActivate={() => trigger("annual.revenue", revenueYen)}
        />
      ) : null}
      {profitYen > 0 ? (
        <AuditCheckToggle
          tag="所得"
          metricLabel={metricAuditLabel("annual.profit")}
          loading={pendingMetricKey === "annual.profit"}
          active={pendingMetricKey === "annual.profit"}
          completed={isStamped("annual.profit")}
          onActivate={() => trigger("annual.profit", profitYen)}
        />
      ) : null}
      {consumptionYen > 0 ? (
        <AuditCheckToggle
          tag="課税"
          metricLabel={metricAuditLabel("annual.consumption_taxable")}
          loading={pendingMetricKey === "annual.consumption_taxable"}
          active={pendingMetricKey === "annual.consumption_taxable"}
          completed={isStamped("annual.consumption_taxable")}
          onActivate={() => trigger("annual.consumption_taxable", consumptionYen)}
        />
      ) : null}
    </div>
  );
}
