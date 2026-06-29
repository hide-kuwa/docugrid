import { API_BASE } from "@/config/api";

import { authFetch, buildAuthHeaders } from "@/lib/api-auth";



export type BillingPlan = {

  id: string;

  label: string;

  description: string;

  available: boolean;

  priceConfigured: boolean;

  meterConfigured?: boolean;

};



export type BillingPricing = {

  firmBaseYen: number;

  firmPerClientYen: number;

  partnerCommissionPercent: number;

  partnerContractYearsMin: number;

  partnerContractYearsMax: number;

  aiYenPerPack: number;

  primaryPlanId: string;

};



export type BillingClientUsage = {

  clientCount: number;

  billableClients: number;

  perClientYen: number;

  meterConfigured: boolean;

  unitLabel: string;

};



export type BillingAiSummary = {

  periodKey: string;

  includedTokensPerClient: number;

  tokensPer100Yen: number;

  paygoEnabled: boolean;

  tokenBalance: number;

  yenPerPack: number;

};



export type BillingPartnerInfo = {

  id?: string;

  partnerId?: string;

  partnerName?: string;

  name?: string;

  commissionPercent?: number;

  contractYears?: number;

  commissionEndsAt?: string;

  onboardingComplete?: boolean;

};



export type BillingStatus = {

  configured: boolean;

  firmId: string;

  status: string;

  planId?: string | null;

  stripeCustomerId?: string | null;

  subscriptionId?: string | null;

  currentPeriodEnd?: string | null;

  cancelAtPeriodEnd?: boolean;

  clientCount: number;

  seatCount: number;

  plans: BillingPlan[];

  publishableKey?: string | null;

  pricing?: BillingPricing;

  estimatedMonthlyYen?: number;

  clientUsage?: BillingClientUsage;

  referralPartnerId?: string | null;

  partner?: BillingPartnerInfo | null;

  ai?: BillingAiSummary | null;

};



const STATUS_LABELS: Record<string, string> = {

  none: "未契約",

  active: "有効",

  trialing: "トライアル",

  past_due: "支払い遅延",

  canceled: "解約済み",

  incomplete: "手続き未完了",

  unpaid: "未払い",

};



export function billingStatusLabel(status: string): string {

  return STATUS_LABELS[status] ?? status;

}



export function formatYen(amount: number): string {

  return `¥${amount.toLocaleString("ja-JP")}`;

}



export async function fetchBillingStatus(signal?: AbortSignal): Promise<BillingStatus> {

  const res = await authFetch(`${API_BASE}/billing/status`, {

    headers: buildAuthHeaders(),

    signal,

  });

  if (!res.ok) throw new Error(`billing-status-failed:${res.status}`);

  return (await res.json()) as BillingStatus;

}



export async function startBillingCheckout(planId: string): Promise<string> {

  const res = await authFetch(`${API_BASE}/billing/checkout`, {

    method: "POST",

    headers: { ...buildAuthHeaders(), "Content-Type": "application/json" },

    body: JSON.stringify({ plan_id: planId }),

  });

  if (!res.ok) throw new Error(`billing-checkout-failed:${res.status}`);

  const data = (await res.json()) as { url: string };

  return data.url;

}



export async function openBillingPortal(returnPath = "/settings?tab=billing"): Promise<string> {

  const res = await authFetch(`${API_BASE}/billing/portal`, {

    method: "POST",

    headers: { ...buildAuthHeaders(), "Content-Type": "application/json" },

    body: JSON.stringify({ return_path: returnPath }),

  });

  if (!res.ok) throw new Error(`billing-portal-failed:${res.status}`);

  const data = (await res.json()) as { url: string };

  return data.url;

}



export async function syncBillingUsage(): Promise<{ synced?: boolean; billableClients?: number }> {

  const res = await authFetch(`${API_BASE}/billing/sync-usage`, {

    method: "POST",

    headers: buildAuthHeaders(),

  });

  if (!res.ok) throw new Error(`billing-sync-failed:${res.status}`);

  return (await res.json()) as { synced?: boolean; billableClients?: number };

}



export async function enableAiPaygo(): Promise<BillingAiSummary> {

  const res = await authFetch(`${API_BASE}/billing/ai/paygo`, {

    method: "POST",

    headers: buildAuthHeaders(),

  });

  if (!res.ok) throw new Error(`billing-paygo-failed:${res.status}`);

  return (await res.json()) as BillingAiSummary;

}



export async function startAiTopupCheckout(packs = 1): Promise<string> {

  const res = await authFetch(`${API_BASE}/billing/ai/topup`, {

    method: "POST",

    headers: { ...buildAuthHeaders(), "Content-Type": "application/json" },

    body: JSON.stringify({ packs }),

  });

  if (!res.ok) throw new Error(`billing-topup-failed:${res.status}`);

  const data = (await res.json()) as { url: string };

  return data.url;

}



export type SalesPartner = {

  id: string;

  name: string;

  email: string;

  commissionPercent: number;

  stripeAccountId?: string | null;

  onboardingComplete: boolean;

};



export async function fetchSalesPartners(): Promise<SalesPartner[]> {

  const res = await authFetch(`${API_BASE}/billing/partners`, {

    headers: buildAuthHeaders(),

  });

  if (!res.ok) throw new Error(`billing-partners-failed:${res.status}`);

  const data = (await res.json()) as { partners: SalesPartner[] };

  return data.partners;

}



export async function createSalesPartner(body: {

  name: string;

  email: string;

  commission_percent?: number;

}): Promise<SalesPartner> {

  const res = await authFetch(`${API_BASE}/billing/partners`, {

    method: "POST",

    headers: { ...buildAuthHeaders(), "Content-Type": "application/json" },

    body: JSON.stringify(body),

  });

  if (!res.ok) throw new Error(`billing-partner-create-failed:${res.status}`);

  return (await res.json()) as SalesPartner;

}



export async function startPartnerOnboarding(partnerId: string): Promise<string> {

  const res = await authFetch(`${API_BASE}/billing/partners/${partnerId}/onboard`, {

    method: "POST",

    headers: buildAuthHeaders(),

  });

  if (!res.ok) throw new Error(`billing-partner-onboard-failed:${res.status}`);

  const data = (await res.json()) as { url: string };

  return data.url;

}



export async function attachPartnerToFirm(body: {

  partner_id: string;

  contract_years: number;

}): Promise<unknown> {

  const res = await authFetch(`${API_BASE}/billing/partners/attach`, {

    method: "POST",

    headers: { ...buildAuthHeaders(), "Content-Type": "application/json" },

    body: JSON.stringify(body),

  });

  if (!res.ok) throw new Error(`billing-partner-attach-failed:${res.status}`);

  return res.json();

}

