import type { RelatedDocumentRef } from "@/config/client-field-sources";
import type { ViewerOpenIntent } from "@/features/pdf-viewer/state/viewer-ui-store";

/** RelatedDocumentRef からビューア openIntent を決定 */
export function resolveAuditOpenIntent(
  ref: Pick<RelatedDocumentRef, "audit" | "auditMode">,
  workflowStatus?: string,
): ViewerOpenIntent | undefined {
  const mode =
    ref.auditMode ?? (ref.audit ? "formal" : undefined);
  if (!mode) return undefined;
  if (mode === "check") return "audit-check";
  return workflowStatus === "auditing" ? "audit-continue" : "audit-start";
}

/** 編集モードで開くべきか（照合・監査系） */
export function shouldOpenAuditEdit(
  ref: Pick<RelatedDocumentRef, "audit" | "auditMode">,
): boolean {
  return Boolean(ref.auditMode ?? ref.audit);
}
