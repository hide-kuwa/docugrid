import type { DocugridConfig } from "./config.js";
import { McpAuthError, UserSession } from "./session.js";
import { assertTokenNotExpired } from "./jwt.js";

export type ClientMasterClient = {
  id: string;
  name: string;
  fiscalMonth: number;
  category: string;
  tags: string[];
  firmId?: string | null;
};

export type ClientMasterPayload = {
  clients: ClientMasterClient[];
  groups: Array<{
    id: string;
    name: string;
    relationType: string;
    clientIds: string[];
    note?: string | null;
  }>;
  updated_at?: string | null;
};

export type SlotDocumentItem = {
  id: string;
  client_id: string;
  period_key: string;
  slot_id: string;
  slot_label: string;
  original_name: string;
  page_count?: number | null;
  uploaded_at?: string | null;
  workflow_status?: string | null;
  logical_status?: string | null;
  current_version_label?: string | null;
};

export type CatalogRow = {
  client_id: string;
  client_name: string;
  period_key: string;
  category_id: string;
  submitted: boolean;
  logical_status?: string | null;
  slot_label?: string | null;
  original_name?: string | null;
  uploaded_at?: string | null;
  fields?: Record<string, unknown>;
};

export type CatalogPayload = {
  category_id: string;
  period_key: string;
  rows: CatalogRow[];
};

export class DocugridApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "DocugridApiError";
  }
}

export class DocugridApiClient {
  private token: string;
  private readonly config: DocugridConfig;
  readonly session: UserSession;

  constructor(config: DocugridConfig) {
    this.config = config;
    this.token = config.accessToken;
    this.session = new UserSession(() => this.getMeRaw());
  }

  async ensureAuthenticated(): Promise<void> {
    if (this.token) {
      assertTokenNotExpired(this.token);
      return;
    }
    if (!this.config.allowDevLogin && this.config.strictAuth) {
      throw new McpAuthError(
        "パスワードログインは無効です。DOCUGRID_ACCESS_TOKEN を設定してください。",
      );
    }
    const res = await fetch(`${this.config.apiBase}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: this.config.email,
        password: this.config.password,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new DocugridApiError(
        `Login failed: ${extractErrorMessage(body) || res.statusText}`,
        res.status,
        body,
      );
    }
    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) {
      throw new DocugridApiError("Login response missing access_token", res.status, data);
    }
    this.token = data.access_token;
    assertTokenNotExpired(this.token);
  }

  private async getMeRaw(): Promise<Record<string, unknown>> {
    await this.ensureAuthenticated();
    const res = await fetch(`${this.config.apiBase}/auth/me`, {
      headers: this.buildHeaders(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new DocugridApiError(
        extractErrorMessage(body) || res.statusText,
        res.status,
        body,
      );
    }
    return (await res.json()) as Record<string, unknown>;
  }

  private buildHeaders(scopeClientId?: string): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
      "User-Agent": "docugrid-mcp/1.0",
      "X-Docugrid-MCP": "1",
    };
    if (scopeClientId) {
      h["X-Docugrid-Client"] = scopeClientId;
    }
    return h;
  }

  private resolveScopeHeader(explicitClientId?: string): string | undefined {
    const profile = this.session.peek();
    if (!profile) {
      if (explicitClientId) return explicitClientId;
      const envClient = this.config.clientId;
      if (envClient && this.config.strictAuth) {
        throw new McpAuthError(
          "DOCUGRID_CLIENT_ID は認証前に使用できません。先に get_me を実行してください。",
        );
      }
      return envClient || undefined;
    }

    if (explicitClientId) {
      this.session.assertClientAccess(profile, explicitClientId);
      return explicitClientId;
    }

    if (this.config.clientId) {
      if (!this.session.canAccessClient(profile, this.config.clientId)) {
        throw new McpAuthError(
          `DOCUGRID_CLIENT_ID=${this.config.clientId} はこのユーザーの担当外です。ヘッダは無視されます。`,
        );
      }
      return this.config.clientId;
    }

    return this.session.resolveScopeClient(profile);
  }

  private async request<T>(
    path: string,
    init?: RequestInit & { scopeClientId?: string },
  ): Promise<T> {
    await this.ensureAuthenticated();
    const { scopeClientId, ...fetchInit } = init ?? {};
    const headerClient = this.resolveScopeHeader(scopeClientId);
    const res = await fetch(`${this.config.apiBase}${path}`, {
      ...fetchInit,
      headers: {
        ...this.buildHeaders(headerClient),
        ...(fetchInit.headers as Record<string, string> | undefined),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new DocugridApiError(
        extractErrorMessage(body) || res.statusText,
        res.status,
        body,
      );
    }
    return (await res.json()) as T;
  }

  getMe() {
    return this.session.require();
  }

  getClientMaster() {
    return this.request<ClientMasterPayload>("/client-master");
  }

  putClientMaster(payload: ClientMasterPayload) {
    return this.request<ClientMasterPayload>("/client-master", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  listSlots(clientId: string, periodKey?: string) {
    const q = new URLSearchParams({ client_id: clientId });
    if (periodKey) q.set("period_key", periodKey);
    return this.request<SlotDocumentItem[]>(`/slots?${q}`, { scopeClientId: clientId });
  }

  getDocumentStatus(clientId: string, periodKey?: string) {
    const q = new URLSearchParams({ client_id: clientId });
    if (periodKey) q.set("period_key", periodKey);
    return this.request<Record<string, unknown>>(`/document-status?${q}`, {
      scopeClientId: clientId,
    });
  }

  getDocumentCatalog(params: {
    categoryId: string;
    periodKey?: string;
    clientId?: string;
    sort?: string;
    order?: "asc" | "desc";
    metadataStatus?: string;
  }) {
    const q = new URLSearchParams({ category_id: params.categoryId });
    if (params.periodKey) q.set("period_key", params.periodKey);
    if (params.clientId) q.set("client_id", params.clientId);
    if (params.sort) q.set("sort", params.sort);
    if (params.order) q.set("order", params.order);
    if (params.metadataStatus) q.set("metadata_status", params.metadataStatus);
    return this.request<CatalogPayload>(`/document-catalog?${q}`, {
      scopeClientId: params.clientId,
    });
  }

  listCatalogCategories(scopeClientId?: string) {
    return this.request<{ categories: Array<Record<string, unknown>> }>(
      "/document-catalog/fields",
      { scopeClientId },
    );
  }

  getFirmTasks() {
    return this.request<Record<string, unknown>>("/firm-tasks");
  }

  listPendingClassify(clientId: string, periodKey: string) {
    const q = new URLSearchParams({ client_id: clientId, period_key: periodKey });
    return this.request<unknown[]>(`/classify/pending?${q}`, { scopeClientId: clientId });
  }
}

function extractErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const o = body as Record<string, unknown>;
  if (typeof o.message === "string") return o.message;
  if (typeof o.detail === "string") return o.detail;
  return undefined;
}
