/** 文書ひな形（Global / Local）— document-templates（並び順）とは別 */

export type AuthoringTemplateScope = "global" | "local";

export type AuthoringTemplate = {
  id: string;
  scope: AuthoringTemplateScope;
  title: string;
  description: string;
  category: string;
  body: string;
  variables: string[];
  version: string;
  targetSlotLabel?: string;
  updatedAt?: string;
  firmId?: string;
};

export type AuthoringTemplateListResponse = {
  global: AuthoringTemplate[];
  local: AuthoringTemplate[];
};

export type AuthoringRenderResult = {
  renderedBody: string;
  resolvedValues: Record<string, string>;
  missingVariables: string[];
  templateId: string;
  templateTitle?: string;
  templateBody?: string;
  targetSlotLabel?: string;
};

export const BUILTIN_VARIABLE_LABELS: Record<string, string> = {
  client_name: "顧問先名",
  client_id: "顧問先ID",
  fiscal_month: "決算月",
  today: "作成日",
  minutes_date: "議事録作成日",
  meeting_date: "開催日",
  meeting_weekday: "曜日",
  meeting_time_start: "開始時刻",
  meeting_time_end: "終了時刻",
  meeting_number: "株主総会回数",
  representative_name: "代表取締役氏名",
  shareholder_total: "株主の総数",
  shares_issued: "発行済株式数",
  shareholders_with_voting_rights: "議決権を有する株主数",
  voting_rights_total: "議決権の総数",
  proxy_count: "議決権代理行使者数",
  shareholders_attending: "出席株主数",
  voting_rights_attending: "出席議決権数",
  attendance_ratio: "出席議決権割合",
  compensation_effective_date: "報酬改定適用日",
  representative_monthly_salary: "代表取締役・月額報酬",
  director1_name: "取締役1・氏名",
  director1_monthly_salary: "取締役1・月額報酬",
  director2_name: "取締役2・氏名",
  director2_monthly_salary: "取締役2・月額報酬",
  director_count_total: "役員数（計）",
  total_monthly_salary: "役員報酬合計（月額）",
};

export function labelForVariable(name: string): string {
  return BUILTIN_VARIABLE_LABELS[name] ?? name;
}

export function isBuiltinVariable(name: string): boolean {
  return name in BUILTIN_VARIABLE_LABELS;
}
