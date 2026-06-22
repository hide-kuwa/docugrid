import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type FiscalYearMetric = {
  label: string;
  revenue_yen: number;
  profit_yen: number;
  consumption_taxable_yen?: number;
  consumption_taxable_source?: string | null;
};

export type MonthlyIndexMetric = {
  month: number;
  index: number;
};

export type MonthlyRevenueMetric = {
  month: number;
  revenue_yen: number;
  source_type?: string | null;
};

export type ClientChartsPayload = {
  client_id: string;
  fiscal_years: FiscalYearMetric[];
  monthly_sales_index: MonthlyIndexMetric[];
  monthly_revenue_yen?: MonthlyRevenueMetric[];
  monthly_ytd_index: number;
};

export async function fetchClientChartsMetrics(
  clientId: string,
  signal?: AbortSignal,
): Promise<ClientChartsPayload> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/metrics/charts`,
    { headers: buildAuthHeaders(clientId), signal },
  );
  if (!res.ok) throw new Error(`charts-metrics-fetch-failed:${res.status}`);
  return (await res.json()) as ClientChartsPayload;
}

export async function upsertClientMetricFact(
  clientId: string,
  fact: {
    metric_key: string;
    period_key: string;
    value_yen?: number | null;
    value_num?: number | null;
  },
): Promise<unknown> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/metrics/facts`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(clientId),
      },
      body: JSON.stringify(fact),
    },
  );
  if (!res.ok) throw new Error(`metrics-upsert-failed:${res.status}`);
  return await res.json();
}
