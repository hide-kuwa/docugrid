export type ResultOverride = "auto" | "taxable" | "exempt";

export type TaxableFact = {
  id: string;
  label: string;
  value: number | boolean | string;
  display: string;
  kind: "yen" | "flag" | "text";
  threshold?: number;
  comparison?: string;
};

export type TaxableDocumentRef = {
  period_key: string;
  slot_id: string;
  label: string;
};

export type TaxableCondition = {
  id: string;
  label: string;
  rule: string;
  kind: "flag" | "threshold";
  matched: boolean;
  facts: TaxableFact[];
  documents: TaxableDocumentRef[];
};

export type TaxableStatusInputs = {
  entity_type?: "individual" | "corporate" | null;
  base_period_sales?: number;
  specified_period_sales?: number;
  specified_period_salaries?: number;
  is_invoice_registered?: boolean;
  has_voluntary_election?: boolean;
  initial_capital?: number;
  is_special_new_corporate?: boolean;
  has_high_value_asset_restriction?: boolean;
  has_taxable_inheritance?: boolean;
};

export type TaxableStatusPayload = {
  is_taxable: boolean;
  matched_conditions: string[];
  message: string;
  auto_is_taxable: boolean;
  auto_matched_conditions: string[];
  result_override: ResultOverride;
  result_source: "auto" | "manual";
  conditions: TaxableCondition[];
  inputs: TaxableStatusInputs;
  input_override_keys: string[];
  auto_inputs?: TaxableStatusInputs;
  auto_sources?: Record<string, { origin?: string; field_id?: string; metric_key?: string; period_key?: string }>;
  updated_at?: string | null;
  updated_by?: string | null;
};

export const CONDITION_INPUT_KEYS: Record<string, (keyof TaxableStatusInputs)[]> = {
  invoice_registered: ["is_invoice_registered"],
  voluntary_election: ["has_voluntary_election"],
  base_period_sales_exceeded: ["base_period_sales"],
  specified_period_sales_and_salaries_exceeded: [
    "specified_period_sales",
    "specified_period_salaries",
  ],
  new_corporate_capital: ["entity_type", "initial_capital"],
  special_new_corporate: ["is_special_new_corporate"],
  high_value_asset_restriction: ["has_high_value_asset_restriction"],
  taxable_inheritance: ["has_taxable_inheritance"],
};

/** 条件を「該当」にするときの手動値。実額の上書きではなく判定用。 */
export const MATCH_OVERRIDE_VALUES: Record<string, TaxableStatusInputs> = {
  invoice_registered: { is_invoice_registered: true },
  voluntary_election: { has_voluntary_election: true },
  base_period_sales_exceeded: { base_period_sales: 10_000_001 },
  specified_period_sales_and_salaries_exceeded: {
    specified_period_sales: 10_000_001,
    specified_period_salaries: 10_000_001,
  },
  new_corporate_capital: { entity_type: "corporate", initial_capital: 10_000_000 },
  special_new_corporate: { is_special_new_corporate: true },
  high_value_asset_restriction: { has_high_value_asset_restriction: true },
  taxable_inheritance: { has_taxable_inheritance: true },
};
