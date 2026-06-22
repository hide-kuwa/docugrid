/** Firm (tenant) display labels — mirrors backend services.tenancy.FIRM_LABELS */
export const FIRM_LABELS: Record<string, string> = {
  firm_default: "デフォルト事務所",
  firm_beta: "ベータ事務所",
};

export function firmLabel(firmId: string | undefined | null): string {
  if (!firmId) return FIRM_LABELS.firm_default ?? "デフォルト事務所";
  return FIRM_LABELS[firmId] ?? firmId;
}
