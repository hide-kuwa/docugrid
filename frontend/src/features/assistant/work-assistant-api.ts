import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type AssistantExpectedSlot = {
  slotId: string;
  label: string;
};

export type AssistantCoverageItem = {
  slotId: string;
  slotLabel: string;
  originalName?: string;
  pageCount?: number | null;
  docId?: string;
};

export type AssistantCoverage = {
  clientId: string;
  periodKey: string;
  filled: AssistantCoverageItem[];
  missing: AssistantCoverageItem[];
  extra: AssistantCoverageItem[];
  filledCount: number;
  missingCount: number;
  expectedCount: number;
  error?: string;
};

export type AssistantExtractionField = {
  fieldId: string;
  label: string;
  value: string;
  confidence: number;
  status: string;
};

export type AssistantExtractionProposal = {
  clientId: string;
  periodKey: string;
  slotId: string;
  slotLabel: string;
  docId: string;
  originalName: string;
  fields: AssistantExtractionField[];
  needsConfirm: boolean;
};

export type AssistantRagHit = {
  versionId?: string | null;
  docId?: string | null;
  source?: string | null;
  excerpt: string;
  score?: number | null;
  match?: string | null;
  chunkIndex?: number | null;
  legacyIndex?: boolean;
};

export type AssistantRagResult = {
  query: string;
  mode: string;
  items: AssistantRagHit[];
  count: number;
  error?: string;
};

export type WorkAssistantChatResponse = {
  role: "assistant";
  intent: string;
  content: string;
  help_doc_id: string | null;
  tour_id: string | null;
  citations: { id: string; title: string; path: string; score: number }[];
  engine: string;
  coverage: AssistantCoverage | null;
  extraction_proposal: AssistantExtractionProposal | null;
  rag: AssistantRagResult | null;
  suggest_ticket?: boolean;
};

export async function postWorkAssistantChat(args: {
  message: string;
  clientId?: string | null;
  periodKey?: string | null;
  clientLabel?: string | null;
  expectedSlots?: AssistantExpectedSlot[];
  surfaceId?: string;
}): Promise<WorkAssistantChatResponse> {
  const res = await authFetch(`${API_BASE}/assistant/chat`, {
    method: "POST",
    headers: {
      ...buildAuthHeaders(args.clientId ?? undefined),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: args.message,
      client_id: args.clientId ?? null,
      period_key: args.periodKey ?? null,
      client_label: args.clientLabel ?? null,
      surface_id: args.surfaceId ?? "work.assistant",
      expected_slots: (args.expectedSlots ?? []).map((s) => ({
        slotId: s.slotId,
        label: s.label,
      })),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `assistant chat failed (${res.status})`);
  }
  return (await res.json()) as WorkAssistantChatResponse;
}
