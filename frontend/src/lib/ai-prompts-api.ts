import { API_BASE } from "@/config/api";
import { authFetch } from "@/lib/api-auth";

export type AiPromptScope = "firm" | "global";

export type AiPromptDefinition = {
  key: string;
  template: string;
  source: string;
  variables: string[];
  builtin_default: string;
};

export type AiPromptListResponse = {
  prompts: AiPromptDefinition[];
};

export type AiPromptTestResult = {
  key: string;
  engine: string;
  prompt_used: string;
  text_excerpt?: string;
  raw_response?: unknown;
  parsed?: unknown;
  error?: string | null;
};

const PROMPT_LABELS: Record<string, string> = {
  classify_text: "テキスト分類（スロット推定）",
  classify_vision: "Vision 分類（税務書類種別）",
};

export function aiPromptLabel(key: string): string {
  return PROMPT_LABELS[key] ?? key;
}

function basePath(scope: AiPromptScope): string {
  return scope === "global" ? `${API_BASE}/dev/ai-prompts` : `${API_BASE}/ai-prompts`;
}

export async function fetchAiPrompts(scope: AiPromptScope): Promise<AiPromptListResponse> {
  const res = await authFetch(basePath(scope));
  if (!res.ok) throw new Error(`ai-prompts-get-failed:${res.status}`);
  return (await res.json()) as AiPromptListResponse;
}

export async function saveAiPrompt(
  scope: AiPromptScope,
  key: string,
  template: string,
  saveScope: AiPromptScope = scope,
): Promise<AiPromptDefinition> {
  const res = await authFetch(`${basePath(scope)}/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template, scope: saveScope }),
  });
  if (!res.ok) throw new Error(`ai-prompts-put-failed:${res.status}`);
  return (await res.json()) as AiPromptDefinition;
}

export async function resetAiPrompt(
  scope: AiPromptScope,
  key: string,
  resetScope: AiPromptScope = scope,
): Promise<AiPromptDefinition> {
  const qs = scope === "global" ? `?scope=${encodeURIComponent(resetScope)}` : "";
  const res = await authFetch(`${basePath(scope)}/${encodeURIComponent(key)}/reset${qs}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`ai-prompts-reset-failed:${res.status}`);
  return (await res.json()) as AiPromptDefinition;
}

export async function testAiPrompt(
  scope: AiPromptScope,
  key: string,
  file: File,
  draftTemplate: string,
  candidatesJson = "",
): Promise<AiPromptTestResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("key", key);
  form.append("draft_template", draftTemplate);
  if (candidatesJson.trim()) {
    form.append("candidates", candidatesJson);
  }
  const res = await authFetch(`${basePath(scope)}/test`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      typeof body?.detail === "object" && body.detail?.message
        ? String(body.detail.message)
        : `ai-prompts-test-failed:${res.status}`;
    throw new Error(msg);
  }
  return (await res.json()) as AiPromptTestResult;
}
