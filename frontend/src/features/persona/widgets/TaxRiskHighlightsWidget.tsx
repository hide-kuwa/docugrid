"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { OrgClient } from "@/config/organization";
import { fetchDocumentStatus } from "@/features/docugrid/lib/document-status";
import { fetchClientRecords } from "@/features/client-data/lib/client-records-api";

type AlertRow = {
  id: string;
  severity: "urgent" | "warning" | "info";
  title: string;
  body: string;
};

function filingDeadlineLabel(fiscalMonth: number): string {
  const filingMonth = ((fiscalMonth + 1) % 12) + 1;
  return `${filingMonth}月頃（${fiscalMonth}月決算想定）`;
}

type Props = {
  client: OrgClient;
};

export function TaxRiskHighlightsWidget({ client }: Props) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<AlertRow[]>([]);
  const [docAlerts, setDocAlerts] = useState<AlertRow[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const [items, docStatus] = await Promise.all([
          fetchClientRecords(client.id, "tax_alert", controller.signal),
          fetchDocumentStatus(client.id, controller.signal),
        ]);
        const manual: AlertRow[] = items.map((item) => ({
          id: item.id,
          severity: (item.meta?.severity as AlertRow["severity"]) || "info",
          title: item.title || "税務アラート",
          body: item.body,
        }));
        setRecords(manual);

        const taxMissing: string[] = [];
        for (const period of docStatus.periods ?? []) {
          if (!period.period_key.startsWith("year:")) continue;
          for (const label of period.missing) {
            if (
              label.includes("法人税") ||
              label.includes("消費税") ||
              label.includes("申告")
            ) {
              taxMissing.push(`${period.period_key}: ${label}`);
            }
          }
        }
        if (taxMissing.length > 0) {
          setDocAlerts([
            {
              id: "doc-missing",
              severity: "urgent",
              title: "申告資料の不足",
              body: taxMissing.slice(0, 4).join(" / "),
            },
          ]);
        } else {
          setDocAlerts([]);
        }
      } catch {
        setRecords([]);
        setDocAlerts([]);
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [client.id]);

  const alerts = useMemo(() => {
    const merged = [...records, ...docAlerts];
    const order = { urgent: 0, warning: 1, info: 2 };
    return merged.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 6);
  }, [records, docAlerts]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        リスクを確認中…
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <p className="py-2 text-sm text-slate-500">
        直近の税務リスクはありません（{filingDeadlineLabel(client.fiscalMonth)}を参照）。
      </p>
    );
  }

  const tone = {
    urgent: "border-red-200 bg-red-50 text-red-900",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
    info: "border-slate-200 bg-slate-50 text-slate-800",
  };

  return (
    <ul className="space-y-2">
      {alerts.map((alert) => (
        <li
          key={alert.id}
          className={`flex gap-2 rounded-lg border px-3 py-2.5 ${tone[alert.severity]}`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
          <div className="min-w-0">
            <p className="text-sm font-bold">{alert.title}</p>
            <p className="mt-0.5 text-xs opacity-90">{alert.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
