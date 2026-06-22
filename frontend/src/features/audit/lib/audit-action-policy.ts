/** 監査関連操作の承認要否（UI ラベル・色分け用） */

export type AuditApprovalRequirement = "none" | "required";

export type AuditActionSpec = {
  id: string;
  label: string;
  description: string;
  approval: AuditApprovalRequirement;
};

/** 承認不要 — 担当者が単独で進められる照合・下準備 */
export const AUDIT_ACTIONS_NO_APPROVAL: AuditActionSpec[] = [
  {
    id: "metric_check",
    label: "監査チェック",
    description: "指標の数値を PDF 上で自動検索・照合（承認フローは進みません）",
    approval: "none",
  },
  {
    id: "position_preview",
    label: "位置確認",
    description: "マッチ位置のプレビュー（PDF への刻印なし）",
    approval: "none",
  },
  {
    id: "auto_stamp",
    label: "スタンプ",
    description: "照合結果を PDF に刻印（新版登録は任意・承認確定とは別）",
    approval: "none",
  },
  {
    id: "manual_link",
    label: "手動照合",
    description: "チェックツールで左右ペインを紐づけ（下書き保存）",
    approval: "none",
  },
];

/** 承認必要 — 承認者の操作または承認キューに載る */
export const AUDIT_ACTIONS_REQUIRE_APPROVAL: AuditActionSpec[] = [
  {
    id: "request_review",
    label: "承認依頼",
    description: "レビュー待ちにし、承認者に回す",
    approval: "required",
  },
  {
    id: "start_audit",
    label: "監査開始",
    description: "承認者が 2 画面照合の正式監査を開始",
    approval: "required",
  },
  {
    id: "approve",
    label: "承認",
    description: "照合結果を確定し、資料を承認済みにする",
    approval: "required",
  },
  {
    id: "remand",
    label: "差戻し",
    description: "担当者へ修正を依頼",
    approval: "required",
  },
  {
    id: "matrix_audit",
    label: "監査する",
    description: "マトリクスから正式な監査フローへ（承認依頼〜確定）",
    approval: "required",
  },
];

export function approvalLabel(requirement: AuditApprovalRequirement): string {
  return requirement === "none" ? "承認不要" : "承認必要";
}
