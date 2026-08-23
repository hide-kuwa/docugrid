export type FlowchartOverride = "auto" | "yes" | "no" | string;

export type FlowchartFact = {
  id: string;
  label: string;
  value: number | boolean | string;
  display: string;
  kind: "yen" | "flag" | "text";
  threshold?: number;
  comparison?: string;
};

export type FlowchartDocumentRef = {
  period_key: string;
  slot_id: string;
  label: string;
};

export type FlowchartOutcomeOption = {
  id: string;
  label: string;
  message: string;
  order?: number;
};

export type FlowchartCondition = {
  id: string;
  label: string;
  rule: string;
  kind: "flag" | "threshold" | "decision";
  matched: boolean;
  answer?: boolean | null;
  yes?: string;
  no?: string;
  match_yes?: Record<string, unknown>;
  match_no?: Record<string, unknown>;
  facts: FlowchartFact[];
  documents: FlowchartDocumentRef[];
  match_inputs?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  on_path?: boolean;
  is_current?: boolean;
};

export type FlowchartBinding = {
  input_id: string;
  value: unknown;
  display: string;
  kind: string;
  origin?: string;
  field?: string;
  metric_key?: string;
};

export type FlowchartRunPayload = {
  template_id: string;
  template_title: string;
  template_version?: string;
  family_id?: string;
  as_of?: string;
  law_valid_from?: string | null;
  law_valid_to?: string | null;
  law_label?: string;
  law_range?: string;
  frozen?: boolean;
  mode?: "checklist" | "tree";
  start?: string;
  path?: string[];
  edges?: Array<{ from: string; to: string; branch: string }>;
  pending_node?: string | null;
  outcome_id?: string | null;
  outcome_options?: FlowchartOutcomeOption[];
  auto_outcome_id?: string | null;
  passed: boolean;
  is_taxable?: boolean;
  outcome_label: string;
  outcomes: {
    true: { label: string; message: string };
    false: { label: string; message: string };
    [key: string]: { label: string; message: string };
  };
  message: string;
  matched_conditions: string[];
  auto_passed: boolean;
  auto_is_taxable?: boolean;
  auto_matched_conditions: string[];
  result_override: FlowchartOverride;
  result_source: "auto" | "manual";
  conditions: FlowchartCondition[];
  inputs: Record<string, unknown>;
  auto_inputs?: Record<string, unknown>;
  input_override_keys: string[];
  bindings?: FlowchartBinding[];
  client_name?: string;
  client_id?: string;
};

export type FlowchartWhenClause = {
  input: string;
  eq?: unknown;
  op?: ">" | ">=" | "<" | "<=" | "==";
  value?: unknown;
};

export type FlowchartWhen =
  | FlowchartWhenClause
  | { all: FlowchartWhen[] }
  | { any: FlowchartWhen[] };

export type FlowchartBindingDraft = {
  input_id: string;
  source: "master" | "profile" | "metric" | "const";
  field?: string;
  metric_key?: string;
  pick?: string;
  value?: unknown;
  transform: "text" | "yen" | "truthy" | "bool" | "entity_type";
};

export type FlowchartNodeDraft = {
  id: string;
  label: string;
  rule: string;
  kind: "flag" | "threshold";
  when: FlowchartWhen;
  match_inputs?: Record<string, unknown>;
  facts: Array<{
    input_id: string;
    label: string;
    kind: string;
    threshold?: number;
    comparison?: string;
  }>;
  documents: FlowchartDocumentRef[];
};

export type FlowchartDefinitionDraft = {
  combine: "any" | "all";
  bindings: FlowchartBindingDraft[];
  nodes: FlowchartNodeDraft[];
  outcomes: {
    true: { label: string; message: string };
    false: { label: string; message: string };
  };
};

export type FlowchartTemplate = {
  id: string;
  scope: "global" | "local";
  title: string;
  description: string;
  category: string;
  family_id?: string;
  valid_from?: string | null;
  valid_to?: string | null;
  law_label?: string;
  law_range?: string;
  version: string;
  definition: Record<string, unknown>;
  updatedAt?: string;
};

export type FlowchartInstanceSummary = {
  id: string;
  template_id: string;
  family_id?: string;
  title: string;
  saved_at: string;
  saved_by?: string | null;
  outcome_label?: string;
  passed?: boolean;
  as_of?: string | null;
  law_label?: string;
  law_range?: string;
  frozen?: boolean;
};
