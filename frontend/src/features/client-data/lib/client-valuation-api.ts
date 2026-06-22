import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import { upsertClientMetricFact } from "@/features/client-data/lib/client-metrics-api";

export type ValuationInputsPayload = {
  issued_shares: number;
  capital_yen: number;
  net_assets_yen: number;
  annual_profit_yen: number;
  annual_dividend_yen: number;
};

export type ValuationMethodResult = {
  per_share_yen: number;
  total_yen: number;
};

export type ValuationPayload = {
  client_id: string;
  inputs: ValuationInputsPayload;
  methods: Record<string, ValuationMethodResult>;
};

const VALUATION_METRIC_KEYS: Record<keyof ValuationInputsPayload, string> = {
  issued_shares: "valuation.issued_shares",
  capital_yen: "valuation.capital_yen",
  net_assets_yen: "valuation.net_assets_yen",
  annual_profit_yen: "valuation.annual_profit_yen",
  annual_dividend_yen: "valuation.annual_dividend_yen",
};

export async function fetchValuationPayload(
  clientId: string,
  signal?: AbortSignal,
): Promise<ValuationPayload> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/metrics/valuation`,
    { headers: buildAuthHeaders(clientId), signal },
  );
  if (!res.ok) throw new Error(`valuation-fetch-failed:${res.status}`);
  return (await res.json()) as ValuationPayload;
}

export async function upsertValuationInput(
  clientId: string,
  field: keyof ValuationInputsPayload,
  value: number,
): Promise<void> {
  await upsertClientMetricFact(clientId, {
    metric_key: VALUATION_METRIC_KEYS[field],
    period_key: "current",
    value_yen: value,
  });
}
