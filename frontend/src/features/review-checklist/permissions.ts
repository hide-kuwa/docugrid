import type { DocugridUser } from "@/lib/auth";
import { hasPermission } from "@/lib/authorization";

export function canViewReviewChecklist(user: DocugridUser | null): boolean {
  return hasPermission(user, "document.view");
}

/** チェック項目の入力・保存（クライアントは review_checklist.edit のみ） */
export function canEditReviewChecklist(user: DocugridUser | null): boolean {
  return (
    hasPermission(user, "document.annotate") || hasPermission(user, "review_checklist.edit")
  );
}

/** 所内回覧ステータス・PDF・完了操作（事務所スタッフ向け） */
export function canManageReviewChecklistWorkflow(user: DocugridUser | null): boolean {
  return hasPermission(user, "document.annotate");
}
