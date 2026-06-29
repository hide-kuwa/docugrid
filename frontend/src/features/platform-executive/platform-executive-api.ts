import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type PlatformKpis = {
  mrrYen: number;
  arrYen: number;
  netMrrYen: number;
  partnerCommissionYen: number;
  baseMrrYen: number;
  clientMeterMrrYen: number;
  firmCount: number;
  payingFirms: number;
  activeFirms: number;
  churnedFirms: number;
  atRiskFirms: number;
  totalClients: number;
  churnRate: number;
  logoChurnRate: number;
  arpcYen: number;
  arpfYen: number;
  partnerCount: number;
  onboardedPartners: number;
  generatedAt: string;
};

export type PlatformAccounting = {
  grossMrrYen: number;
  partnerPayoutYen: number;
  netMrrYen: number;
  annualizedGrossArrYen: number;
  annualizedNetArrYen: number;
  basePlanRevenueYen: number;
  usageRevenueYen: number;
  usageSharePercent: number;
};

export type PlatformFirmRow = {
  firmId: string;
  label: string;
  billingStatus: string;
  clientCount: number;
  activeMemberCount: number;
  mrrYen: number;
  arrYen: number;
  netMrrYen: number;
  partnerCommissionYen: number;
  cancelAtPeriodEnd: boolean;
  referralPartnerName?: string | null;
  isPaying: boolean;
  isAtRisk: boolean;
  isChurned: boolean;
};

export type PlatformClientRow = {
  id: string;
  name: string;
  firmId: string;
  firmLabel: string;
  category: string;
  fiscalMonth?: number | null;
  tags: string[];
};

export type PlatformExecutiveDashboard = {
  kpis: PlatformKpis;
  accounting: PlatformAccounting;
  charts: {
    mrrByFirm: { firmId: string; label: string; mrrYen: number; clientCount: number }[];
    clientsByFirm: { firmId: string; label: string; clientCount: number }[];
    statusBreakdown: { status: string; count: number }[];
    revenueMix: {
      baseYen: number;
      clientMeterYen: number;
      partnerCommissionYen: number;
      netMrrYen: number;
    };
    mrrTrend: {
      date: string;
      mrrYen: number;
      arrYen: number;
      totalClients: number;
      netMrrYen: number;
      payingFirms: number;
    }[];
  };
  firms: PlatformFirmRow[];
  clients: PlatformClientRow[];
};

export function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

export function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function billingStatusJa(status: string): string {
  const map: Record<string, string> = {
    none: "未契約",
    active: "有効",
    trialing: "トライアル",
    past_due: "支払い遅延",
    canceled: "解約済み",
    incomplete: "未完了",
    unpaid: "未払い",
  };
  return map[status] ?? status;
}

export async function fetchPlatformExecutiveDashboard(
  signal?: AbortSignal,
): Promise<PlatformExecutiveDashboard> {
  const res = await authFetch(`${API_BASE}/platform/executive/dashboard`, {
    headers: buildAuthHeaders(),
    signal,
  });
  if (!res.ok) throw new Error(`platform-executive-failed:${res.status}`);
  return (await res.json()) as PlatformExecutiveDashboard;
}

export async function fetchPlatformFirmDetail(firmId: string): Promise<unknown> {
  const res = await authFetch(`${API_BASE}/platform/executive/firms/${encodeURIComponent(firmId)}`, {
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(`platform-firm-failed:${res.status}`);
  return res.json();
}

export type MaGoalsPayload = {
  assumptions: {
    planningAvgClientsPerFirm: number;
    avgClientsMode: "planning" | "actual" | "auto";
    minFirmsForActualAvg: number;
    updatedAt?: string | null;
  };
  target: {
    arrYen: number;
    arrLabel?: string | null;
    horizonMonths: number;
    horizonYears: number;
    annualLogoChurnTarget: number;
    avgClientsPerFirm: number;
    avgClientsPerFirmIsOverride?: boolean;
    avgClientsMode?: "planning" | "actual" | "auto";
    avgClientsSource?: string;
    avgClientsSourceLabel?: string;
    actualReady?: boolean;
    partnerAttachRate: number;
  };
  avgClientsActual: {
    avgClientsPerFirm: number;
    source: string;
    sourceLabel: string;
    totalClients: number;
    firmCount: number;
    firmsWithClients: number;
    payingFirmCount: number;
    avgAllFirms: number | null;
    avgFirmsWithClients: number | null;
    avgPayingFirms: number | null;
    medianClientsPerFirm: number | null;
    minClientsPerFirm: number;
    maxClientsPerFirm: number;
  };
  current: {
    arrYen: number;
    mrrYen: number;
    payingFirms: number;
    totalClients: number;
    logoChurnRate: number;
    arpfYen: number;
    arpcYen: number;
  };
  gap: {
    arrYen: number;
    payingFirms: number;
    totalClients: number;
    monthlyMrrGrowthYen: number;
    progressPercent: number;
  };
  recommendations: {
    targetArrYen: number;
    targetAnnualLogoChurnMax: number;
    targetAnnualLogoChurnStretch: number;
    targetPayingFirms: number;
    targetTotalClients: number;
    monthlyGrossAcquisitions: number;
    weeklyGrossAcquisitions: number;
    monthlyNewClients: number;
    monthlyNetNewFirms: number;
    monthlyChurnReplacement: number;
    arrPerFirmYen: number;
    netArrPerFirmYen: number;
    valuationAt10xArrYen: number;
    valuationMultipleNote: string;
  };
  churnBenchmarks: Record<string, { annual: number; label: string; note: string }>;
  pricing: {
    firmBaseYenMonthly: number;
    firmPerClientYenMonthly: number;
    partnerCommissionPercent: number;
  };
  milestones: {
    ratio: number;
    label: string;
    arrYen: number;
    payingFirms: number;
    monthIndex: number;
  }[];
  horizonScenarios: {
    horizonMonths: number;
    horizonYears: number;
    monthlyGrossAcquisitions: number;
    weeklyGrossAcquisitions: number;
    monthlyNewClients: number;
  }[];
  clientAssumptionScenarios: {
    avgClientsPerFirm: number;
    targetPayingFirms: number;
    targetTotalClients: number;
    arrPerFirmYen: number;
    monthlyGrossAcquisitions: number;
    isActual?: boolean;
    isPlanning?: boolean;
  }[];
  churnScenarios: {
    tier: string;
    label: string;
    annualChurn: number;
    note: string;
    monthlyGrossAcquisitions: number;
  }[];
};

export type MaGoalsParams = {
  target_arr_yen?: number;
  horizon_months?: number;
  annual_logo_churn?: number;
  avg_clients_per_firm?: number;
  avg_clients_mode?: "planning" | "actual" | "auto";
  partner_attach_rate?: number;
};

export type MaAssumptionsPayload = {
  planningAvgClientsPerFirm: number;
  avgClientsMode: "planning" | "actual" | "auto";
  updated_at?: string | null;
};

const DEFAULT_MA_ASSUMPTIONS: MaGoalsPayload["assumptions"] = {
  planningAvgClientsPerFirm: 80,
  avgClientsMode: "auto",
  minFirmsForActualAvg: 5,
};

/** バックエンド再起動前の古いレスポンスでも落ちないよう正規化 */
export function normalizeMaGoalsPayload(raw: MaGoalsPayload): MaGoalsPayload {
  const assumptions = raw.assumptions ?? {
    ...DEFAULT_MA_ASSUMPTIONS,
    planningAvgClientsPerFirm:
      raw.target?.avgClientsPerFirm ??
      raw.avgClientsActual?.avgClientsPerFirm ??
      DEFAULT_MA_ASSUMPTIONS.planningAvgClientsPerFirm,
    avgClientsMode: raw.target?.avgClientsMode ?? DEFAULT_MA_ASSUMPTIONS.avgClientsMode,
  };
  return {
    ...raw,
    assumptions,
    target: {
      ...raw.target,
      avgClientsSourceLabel:
        raw.target?.avgClientsSourceLabel ??
        raw.avgClientsActual?.sourceLabel ??
        "実績ベース",
      avgClientsMode: raw.target?.avgClientsMode ?? assumptions.avgClientsMode,
      actualReady: raw.target?.actualReady ?? false,
    },
  };
}

export async function fetchMaGoals(
  params: MaGoalsParams = {},
  signal?: AbortSignal,
): Promise<MaGoalsPayload> {
  const qs = new URLSearchParams();
  if (params.target_arr_yen != null) qs.set("target_arr_yen", String(params.target_arr_yen));
  if (params.horizon_months != null) qs.set("horizon_months", String(params.horizon_months));
  if (params.annual_logo_churn != null) qs.set("annual_logo_churn", String(params.annual_logo_churn));
  if (params.avg_clients_per_firm != null) {
    qs.set("avg_clients_per_firm", String(params.avg_clients_per_firm));
  }
  if (params.avg_clients_mode) {
    qs.set("avg_clients_mode", params.avg_clients_mode);
  }
  if (params.partner_attach_rate != null) {
    qs.set("partner_attach_rate", String(params.partner_attach_rate));
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await authFetch(`${API_BASE}/platform/executive/ma-goals${suffix}`, {
    headers: buildAuthHeaders(),
    signal,
  });
  if (!res.ok) {
    let detail = String(res.status);
    try {
      const err = (await res.json()) as { detail?: string };
      if (err.detail) detail = `${res.status}: ${err.detail}`;
    } catch {
      /* ignore */
    }
    throw new Error(`ma-goals-failed:${detail}`);
  }
  return normalizeMaGoalsPayload((await res.json()) as MaGoalsPayload);
}

export async function saveMaAssumptions(body: {
  planning_avg_clients_per_firm?: number;
  avg_clients_mode?: "planning" | "actual" | "auto";
}): Promise<MaAssumptionsPayload> {
  const res = await authFetch(`${API_BASE}/platform/executive/ma-assumptions`, {
    method: "PUT",
    headers: {
      ...buildAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      planning_avg_clients_per_firm: body.planning_avg_clients_per_firm,
      avg_clients_mode: body.avg_clients_mode,
    }),
  });
  if (!res.ok) throw new Error(`ma-assumptions-save-failed:${res.status}`);
  const raw = (await res.json()) as {
    planningAvgClientsPerFirm: number;
    avgClientsMode: "planning" | "actual" | "auto";
    updated_at?: string | null;
  };
  return {
    planningAvgClientsPerFirm: raw.planningAvgClientsPerFirm,
    avgClientsMode: raw.avgClientsMode,
    updated_at: raw.updated_at,
  };
}
