import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import type { ResultOverride, TaxableStatusInputs, TaxableStatusPayload } from "./types";

export async function postCheckTaxableStatus(
  body: TaxableStatusInputs & { result_override?: ResultOverride },
): Promise<TaxableStatusPayload> {
  const res = await fetch(`${API_BASE}/check-taxable-status`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`check-taxable-status:${res.status}`);
  }
  return (await res.json()) as TaxableStatusPayload;
}

export async function fetchClientTaxableStatus(
  clientId: string,
  signal?: AbortSignal,
): Promise<TaxableStatusPayload> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/consumption-taxable-status`,
    { headers: buildAuthHeaders(clientId), signal },
  );
  if (!res.ok) throw new Error(`consumption-taxable-fetch:${res.status}`);
  return (await res.json()) as TaxableStatusPayload;
}

export async function saveClientTaxableStatus(
  clientId: string,
  body: { result_override: ResultOverride; input_overrides: TaxableStatusInputs },
): Promise<TaxableStatusPayload> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/consumption-taxable-status`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(clientId),
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`consumption-taxable-save:${res.status}`);
  return (await res.json()) as TaxableStatusPayload;
}
