import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import type { SupportTicketKind } from "@/features/support/support-types";

export type SupportChatCitation = {
  id: string;
  title: string;
  path: string;
  score: number;
};

export type SupportChatResponse = {
  role: "assistant";
  content: string;
  help_doc_id: string | null;
  tour_id: string | null;
  citations: SupportChatCitation[];
  engine: string;
  suggest_ticket?: boolean;
};

export type SupportTicket = {
  id: string;
  firm_id: string;
  kind: string;
  subject: string;
  body: string;
  surface_id: string;
  error_message: string;
  preferred_channel: string;
  status: string;
  email_status: string;
  email_detail: string;
  created_at: string;
  mailto?: string | null;
};

export async function postSupportChat(
  message: string,
  opts?: { surfaceId?: string },
): Promise<SupportChatResponse> {
  const res = await authFetch(`${API_BASE}/support/chat`, {
    method: "POST",
    headers: {
      ...buildAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      surface_id: opts?.surfaceId ?? null,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `support chat failed (${res.status})`);
  }
  return (await res.json()) as SupportChatResponse;
}

export async function createSupportTicket(body: {
  kind: SupportTicketKind;
  subject: string;
  body: string;
  surfaceId?: string;
  errorMessage?: string;
  preferredChannel?: "email" | "phone_request";
}): Promise<SupportTicket> {
  const res = await authFetch(`${API_BASE}/support/tickets`, {
    method: "POST",
    headers: {
      ...buildAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      kind: body.kind,
      subject: body.subject,
      body: body.body,
      surface_id: body.surfaceId ?? "support.assistant",
      error_message: body.errorMessage ?? "",
      preferred_channel: body.preferredChannel ?? "email",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `support ticket failed (${res.status})`);
  }
  const data = (await res.json()) as { ticket: SupportTicket };
  return data.ticket;
}

export type SupportFirmMetrics = {
  total_tickets: number;
  open_tickets?: number;
  resolved_tickets?: number;
  phone_requested?: number;
  resolution_rate: number;
  phone_rate: number;
};

/** Firm-wide roles only; returns null on 403/errors. */
export async function fetchSupportMetrics(): Promise<SupportFirmMetrics | null> {
  try {
    const res = await authFetch(`${API_BASE}/support/metrics`, {
      headers: buildAuthHeaders(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { metrics: SupportFirmMetrics };
    return data.metrics;
  } catch {
    return null;
  }
}

export async function listSupportTickets(limit = 8): Promise<SupportTicket[]> {
  try {
    const res = await authFetch(
      `${API_BASE}/support/tickets?limit=${encodeURIComponent(String(limit))}`,
      { headers: buildAuthHeaders() },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { tickets: SupportTicket[] };
    return data.tickets ?? [];
  } catch {
    return [];
  }
}
