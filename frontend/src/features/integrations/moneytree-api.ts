import { API_BASE } from "@/config/api";
import { authFetch } from "@/lib/api-auth";

export type MoneytreeStatus = {
  configured: boolean;
  mock_mode: boolean;
  connected: boolean;
  guest_label?: string | null;
  connected_at?: string | null;
  last_sync_at?: string | null;
  accounts_count: number;
  environment: string;
  vault_url?: string | null;
  client_id_scope?: string | null;
};

export type MoneytreeAccount = {
  external_id: string;
  account_kind: string;
  institution_name?: string;
  account_name?: string;
  account_subtype?: string;
  currency?: string;
  balance?: number | null;
  synced_at?: string;
};

export type MoneytreeTransaction = {
  account_external_id: string;
  txn_date?: string;
  amount?: number;
  description?: string;
  synced_at?: string;
};

export type MoneytreeFirmClientStatus = {
  client_id: string;
  connected: boolean;
  guest_label?: string | null;
  connected_at?: string | null;
  last_sync_at?: string | null;
  accounts_count: number;
};

function clientQuery(clientId: string, extra?: Record<string, string>) {
  const params = new URLSearchParams({ client_id: clientId });
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
    }
  }
  return `?${params}`;
}

export async function fetchMoneytreeStatus(clientId: string): Promise<MoneytreeStatus> {
  const res = await authFetch(
    `${API_BASE}/api/integrations/moneytree/status${clientQuery(clientId)}`,
  );
  if (!res.ok) throw new Error("status_failed");
  return res.json();
}

export async function fetchMoneytreeFirmStatus(): Promise<MoneytreeFirmClientStatus[]> {
  const res = await authFetch(`${API_BASE}/api/integrations/moneytree/firm-status`);
  if (!res.ok) throw new Error("firm_status_failed");
  const body = await res.json();
  return body.clients ?? [];
}

export async function startMoneytreeConnect(
  clientId: string,
  returnPath?: string,
): Promise<{
  mock: boolean;
  authorize_url?: string | null;
}> {
  const extra: Record<string, string> = {};
  if (returnPath) extra.return_path = returnPath;
  const res = await authFetch(
    `${API_BASE}/api/integrations/moneytree/connect${clientQuery(clientId, extra)}`,
  );
  if (!res.ok) throw new Error("connect_failed");
  return res.json();
}

export async function mockMoneytreeConnect(clientId: string): Promise<void> {
  const res = await authFetch(
    `${API_BASE}/api/integrations/moneytree/mock-connect${clientQuery(clientId)}`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error("mock_connect_failed");
}

export async function syncMoneytree(clientId: string): Promise<void> {
  const res = await authFetch(
    `${API_BASE}/api/integrations/moneytree/sync${clientQuery(clientId)}`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error("sync_failed");
}

export async function fetchMoneytreeAccounts(clientId: string): Promise<MoneytreeAccount[]> {
  const res = await authFetch(
    `${API_BASE}/api/integrations/moneytree/accounts${clientQuery(clientId)}`,
  );
  if (!res.ok) throw new Error("accounts_failed");
  const body = await res.json();
  return body.accounts ?? [];
}

export async function fetchMoneytreeTransactions(
  clientId: string,
  accountExternalId?: string,
): Promise<MoneytreeTransaction[]> {
  const extra: Record<string, string> = {};
  if (accountExternalId) extra.account_external_id = accountExternalId;
  const res = await authFetch(
    `${API_BASE}/api/integrations/moneytree/transactions${clientQuery(clientId, extra)}`,
  );
  if (!res.ok) throw new Error("transactions_failed");
  const body = await res.json();
  return body.transactions ?? [];
}

export async function disconnectMoneytree(clientId: string): Promise<void> {
  const res = await authFetch(
    `${API_BASE}/api/integrations/moneytree/disconnect${clientQuery(clientId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error("disconnect_failed");
}

export async function fetchMoneytreeVaultUrl(clientId: string): Promise<string> {
  const res = await authFetch(
    `${API_BASE}/api/integrations/moneytree/vault-url${clientQuery(clientId)}`,
  );
  if (!res.ok) throw new Error("vault_failed");
  const body = await res.json();
  return body.vault_url as string;
}

export function formatYenAmount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

export function accountSubtypeLabel(subtype?: string): string {
  const map: Record<string, string> = {
    savings: "普通預金",
    checking: "当座預金",
    credit_card: "クレジットカード",
    loan: "ローン",
    term_deposit: "定期預金",
  };
  return (subtype && map[subtype]) || subtype || "口座";
}

export function readMoneytreeOauthFromLocation(): {
  result: string | null;
  detail: string | null;
} {
  if (typeof window === "undefined") return { result: null, detail: null };
  const params = new URLSearchParams(window.location.search);
  return {
    result: params.get("moneytree"),
    detail: params.get("moneytree_detail"),
  };
}

export function clearMoneytreeOauthFromLocation(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("moneytree");
  url.searchParams.delete("moneytree_detail");
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}
