import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import type {
  CaptureCategory,
  CaptureItem,
  CaptureItemPatch,
  CaptureRouteResult,
} from "@/features/capture/types";

export async function listCaptureItems(
  clientId: string,
  opts?: { status?: string; category?: CaptureCategory; signal?: AbortSignal },
): Promise<CaptureItem[]> {
  const url = new URL(`${API_BASE}/capture/items`);
  url.searchParams.set("client_id", clientId);
  if (opts?.status) url.searchParams.set("status", opts.status);
  if (opts?.category) url.searchParams.set("category", opts.category);
  const res = await authFetch(url.toString(), {
    headers: buildAuthHeaders(clientId),
    signal: opts?.signal,
  });
  if (!res.ok) throw new Error(`list-capture-failed:${res.status}`);
  return (await res.json()) as CaptureItem[];
}

export async function uploadCaptureItem(args: {
  clientId: string;
  file: File;
  category?: CaptureCategory;
  periodKey?: string;
  slotId?: string;
}): Promise<CaptureItem> {
  const form = new FormData();
  form.append("file", args.file, args.file.name);
  form.append("client_id", args.clientId);
  form.append("category", args.category ?? "general");
  if (args.periodKey) form.append("period_key", args.periodKey);
  if (args.slotId) form.append("slot_id", args.slotId);
  const res = await authFetch(`${API_BASE}/capture/items`, {
    method: "POST",
    headers: buildAuthHeaders(args.clientId),
    body: form,
  });
  if (!res.ok) throw new Error(`upload-capture-failed:${res.status}`);
  return (await res.json()) as CaptureItem;
}

export function captureItemImageUrl(itemId: string): string {
  return `${API_BASE}/capture/items/${encodeURIComponent(itemId)}/file`;
}

export async function patchCaptureItem(
  itemId: string,
  patch: CaptureItemPatch,
  clientId?: string,
): Promise<CaptureItem> {
  const res = await authFetch(`${API_BASE}/capture/items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(clientId),
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`patch-capture-failed:${res.status}`);
  return (await res.json()) as CaptureItem;
}

export async function deleteCaptureItem(itemId: string, clientId?: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/capture/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
    headers: buildAuthHeaders(clientId),
  });
  if (!res.ok) throw new Error(`delete-capture-failed:${res.status}`);
}

export type CaptureManualHints = {
  total_yen?: number;
  proof_yen?: number;
  declared_yen?: number;
  dependent_count?: number;
  life_insurance_yen?: number;
  spouse_deduction?: boolean;
  attendees?: number;
  registration_number?: string;
};

export async function analyzeCaptureItem(
  itemId: string,
  clientId?: string,
  hints?: CaptureManualHints,
): Promise<CaptureItem> {
  const res = await authFetch(`${API_BASE}/capture/items/${encodeURIComponent(itemId)}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(clientId),
    },
    body: JSON.stringify(hints ?? {}),
  });
  if (!res.ok) throw new Error(`analyze-capture-failed:${res.status}`);
  return (await res.json()) as CaptureItem;
}

export async function reauditCaptureItem(
  itemId: string,
  overrides: CaptureManualHints,
  clientId?: string,
): Promise<CaptureItem> {
  const res = await authFetch(`${API_BASE}/capture/items/${encodeURIComponent(itemId)}/reaudit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(clientId),
    },
    body: JSON.stringify(overrides),
  });
  if (!res.ok) throw new Error(`reaudit-capture-failed:${res.status}`);
  return (await res.json()) as CaptureItem;
}

export type InvoiceVerifyResult = {
  registration_number?: string;
  normalized?: string | null;
  format_valid?: boolean;
  checksum_valid?: boolean;
  registration_status?: string;
  issuer_name?: string | null;
  issues?: string[];
  suggestions?: string[];
};

export async function verifyInvoiceNumber(
  registrationNumber: string,
  clientId?: string,
): Promise<InvoiceVerifyResult> {
  const res = await authFetch(`${API_BASE}/invoice/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(clientId),
    },
    body: JSON.stringify({ registration_number: registrationNumber }),
  });
  if (!res.ok) throw new Error(`invoice-verify-failed:${res.status}`);
  return (await res.json()) as InvoiceVerifyResult;
}

export async function routeCaptureToMatrix(
  itemId: string,
  clientId: string,
  opts?: { periodKey?: string; slotId?: string; slotLabel?: string },
): Promise<CaptureRouteResult> {
  const res = await authFetch(`${API_BASE}/capture/items/${encodeURIComponent(itemId)}/route`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(clientId),
    },
    body: JSON.stringify({
      period_key: opts?.periodKey,
      slot_id: opts?.slotId,
      slot_label: opts?.slotLabel,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail =
      typeof body === "object" && body && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : `route-capture-failed:${res.status}`;
    throw new Error(detail);
  }
  return (await res.json()) as CaptureRouteResult;
}

export async function applyCaptureToPayroll(
  itemId: string,
  clientId: string,
  employeeId?: string,
): Promise<{ capture: CaptureItem; employee: unknown; submission_id: string }> {
  const res = await authFetch(
    `${API_BASE}/capture/items/${encodeURIComponent(itemId)}/apply-payroll`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(clientId),
      },
      body: JSON.stringify({ employee_id: employeeId ?? null }),
    },
  );
  if (!res.ok) throw new Error(`apply-payroll-failed:${res.status}`);
  return (await res.json()) as { capture: CaptureItem; employee: unknown; submission_id: string };
}
