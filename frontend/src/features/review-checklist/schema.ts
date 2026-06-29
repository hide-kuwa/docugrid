/** HRE 様式 監査チェックリスト（schema v2） */

export type ChecklistItemKind = "question" | "group_header" | "adjustment_point";

export type ChecklistItemStatus = "ok" | "ng" | "na" | "pending" | "note";

export type ReviewChecklistHeaderField = {
  id: string;
  label: string;
  autoKey?: string;
  placeholder?: string;
};

export type ReviewChecklistSectionItem = {
  id: string;
  number?: string;
  label: string;
  indent?: number;
  kind: ChecklistItemKind;
  subgroup?: string;
};

export type ReviewChecklistSection = {
  id: string;
  title: string;
  sheetLabel?: string;
  kind: "checklist" | "adjustments";
  items: ReviewChecklistSectionItem[];
};

export type ReviewChecklistTemplateV2 = {
  schemaVersion: number;
  id: string;
  templateId: string;
  scope: "global" | "local" | string;
  title: string;
  description: string;
  periodTypes: string[];
  headerFields: ReviewChecklistHeaderField[];
  statusOptions: { value: string; label: string; symbol: string }[];
  sections: ReviewChecklistSection[];
  createdAt?: string;
  updatedAt?: string;
};

export type ReviewChecklistItemState = {
  status?: ChecklistItemStatus | string;
  comment?: string;
  reference?: string;
  answer?: string;
  result?: string;
  label?: string;
  note?: string;
  checkedBy?: string;
  checkedAt?: string;
};

export type ReviewChecklistInstanceV2 = {
  schemaVersion: number;
  templateId: string;
  clientId: string;
  periodKey: string;
  applicable: boolean;
  header: Record<string, string>;
  itemStates: Record<string, ReviewChecklistItemState>;
  workflowStatus: "draft" | "in_circulation" | "completed" | string;
  circulationMemo: string;
  progress: { total: number; checked: number };
  updatedAt?: string | null;
  completedAt?: string | null;
  exportedAt?: string | null;
};

export type ReviewChecklistAlertCode =
  | "return_missing"
  | "not_in_return"
  | "unchecked_with_return"
  | "unverified";

export type ReviewChecklistAlert = {
  itemId: string;
  label: string;
  severity: "warning" | "info";
  code: ReviewChecklistAlertCode;
  message: string;
};

export const WORKFLOW_LABELS: Record<string, string> = {
  draft: "作成中",
  in_circulation: "所内回覧中",
  completed: "完了",
};

export const STATUS_OPTIONS: { value: ChecklistItemStatus; label: string }[] = [
  { value: "pending", label: "未確認" },
  { value: "ok", label: "〇" },
  { value: "ng", label: "✖" },
  { value: "na", label: "ー" },
  { value: "note", label: "コメント" },
];

// legacy v1 types (widget compat)
export type ReviewChecklistItem = ReviewChecklistSectionItem & {
  description?: string;
  category?: string;
  returnAnchor?: { scheduleRef?: string };
};

export type ReviewChecklistCheckState = ReviewChecklistItemState & { checked?: boolean };

export type ReviewChecklistTemplate = ReviewChecklistTemplateV2 & {
  items?: ReviewChecklistItem[];
};

export type ReviewChecklistInstance = ReviewChecklistInstanceV2 & {
  checks?: Record<string, ReviewChecklistCheckState>;
};

export const ALERT_CODE_LABELS: Record<ReviewChecklistAlertCode, string> = {
  return_missing: "申告書未提出",
  not_in_return: "申告書に記載なし",
  unchecked_with_return: "未確認",
  unverified: "自動突合保留",
};
