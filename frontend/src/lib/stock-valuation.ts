/** 非上場株式評価 — 簡易試算（相続税評価の3方式を参考） */

export type ValuationMethodId = "net_asset" | "similar_industry" | "dividend" | "composite";

export type ValuationMethod = {
  id: ValuationMethodId;
  label: string;
  shortLabel: string;
  description: string;
};

export const VALUATION_METHODS: ValuationMethod[] = [
  {
    id: "net_asset",
    label: "純資産価額方式",
    shortLabel: "純資産",
    description: "純資産価額を発行済株式数で割った1株あたりの価額",
  },
  {
    id: "similar_industry",
    label: "類似業種比準方式",
    shortLabel: "類似業種",
    description: "類似業種の株価・配当・利益・純資産を比準（簡易係数で試算）",
  },
  {
    id: "dividend",
    label: "配当還元方式",
    shortLabel: "配当還元",
    description: "年配当額を還元利率で割り戻した1株あたりの価額",
  },
  {
    id: "composite",
    label: "総合評価（簡易）",
    shortLabel: "総合",
    description: "各方式のうち採用可能な方式の平均（大株主・会社規模は未考慮の試算）",
  },
];

export type ValuationInputs = {
  issuedShares: number;
  capitalYen: number;
  netAssetsYen: number;
  annualProfitYen: number;
  annualDividendYen: number;
};

export type ValuationResult = {
  methodId: ValuationMethodId;
  perShareYen: number | null;
  totalYen: number | null;
  note?: string;
};

function parseYen(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return fallback;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function valuationInputsFromClient(profile: Record<string, string> | undefined): ValuationInputs {
  const issuedShares = parseYen(profile?.issued_shares, 1000);
  const capitalYen = parseYen(profile?.capital, 10_000_000);
  const annualProfitYen = parseYen(profile?.profit_taxable_income, Math.round(capitalYen * 0.15));
  const netAssetsYen = Math.round(capitalYen * 2.5);

  return {
    issuedShares,
    capitalYen,
    netAssetsYen,
    annualProfitYen,
    annualDividendYen: 0,
  };
}

const DIVIDEND_CAP_RATE = 0.1;
const SIMILAR_INDUSTRY_MULTIPLE = 6;

export function computeValuation(
  inputs: ValuationInputs,
  methodId: ValuationMethodId,
): ValuationResult {
  const { issuedShares, netAssetsYen, annualProfitYen, annualDividendYen } = inputs;
  if (issuedShares <= 0) {
    return { methodId, perShareYen: null, totalYen: null, note: "発行済株式数を入力してください" };
  }

  if (methodId === "net_asset") {
    const perShare = Math.round(netAssetsYen / issuedShares);
    return {
      methodId,
      perShareYen: perShare,
      totalYen: perShare * issuedShares,
    };
  }

  if (methodId === "similar_industry") {
    const companyValue = Math.round(annualProfitYen * SIMILAR_INDUSTRY_MULTIPLE);
    const perShare = Math.round(companyValue / issuedShares);
    return {
      methodId,
      perShareYen: perShare,
      totalYen: perShare * issuedShares,
      note: `課税所得 × ${SIMILAR_INDUSTRY_MULTIPLE}倍で簡易試算`,
    };
  }

  if (methodId === "dividend") {
    if (annualDividendYen <= 0) {
      return {
        methodId,
        perShareYen: null,
        totalYen: null,
        note: "配当実績がないため本方式は採用困難（試算不可）",
      };
    }
    const companyValue = Math.round(annualDividendYen / DIVIDEND_CAP_RATE);
    const perShare = Math.round(companyValue / issuedShares);
    return {
      methodId,
      perShareYen: perShare,
      totalYen: perShare * issuedShares,
    };
  }

  const parts = [
    computeValuation(inputs, "net_asset"),
    computeValuation(inputs, "similar_industry"),
    computeValuation(inputs, "dividend"),
  ].filter((r) => r.perShareYen != null) as Array<ValuationResult & { perShareYen: number }>;

  if (parts.length === 0) {
    return { methodId, perShareYen: null, totalYen: null, note: "試算できる方式がありません" };
  }

  const avgPerShare = Math.round(
    parts.reduce((sum, p) => sum + p.perShareYen, 0) / parts.length,
  );
  return {
    methodId,
    perShareYen: avgPerShare,
    totalYen: avgPerShare * issuedShares,
    note: `${parts.length}方式の平均（簡易）`,
  };
}

export function formatYen(n: number | null): string {
  if (n == null) return "—";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}億円`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}万円`;
  return `${n.toLocaleString()}円`;
}

export function formatYenPerShare(n: number | null): string {
  if (n == null) return "—";
  return `${n.toLocaleString()}円/株`;
}
