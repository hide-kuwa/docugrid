/**
 * Support assistant (AI chat → CS) — types only until S1/S2 ship.
 * Vision: docs/help/support-bot-vision.md
 */

export type SupportIntent =
  | "howto"
  | "tutorial"
  | "bug_report"
  | "escalate_email"
  | "escalate_phone"
  | "unknown";

export type SupportMessageRole = "user" | "assistant" | "system";

export type SupportMessage = {
  id: string;
  role: SupportMessageRole;
  content: string;
  createdAt: string;
  /** Optional link into docs/help coverage / article */
  helpDocId?: string;
  /** Suggested FeatureTour id */
  tourId?: string;
};

export type SupportTicketKind = "bug" | "howto_unresolved" | "other";

export type SupportTicketDraft = {
  kind: SupportTicketKind;
  subject: string;
  body: string;
  /** UI surface hint, e.g. workspace.doc_matrix */
  surfaceId?: string;
  errorMessage?: string;
  /** Prefer email; phone only after CS policy */
  preferredChannel: "email" | "phone_request";
};

export type SupportAssistantStatus = "planned" | "preview" | "live";

/** Until backend RAG exists, UI is preview (local help matcher). */
export const SUPPORT_ASSISTANT_STATUS: SupportAssistantStatus = "preview";

export const SUPPORT_ESCALATION_COPY = {
  emailFirst:
    "解決できない場合はカスタマーサポートへメールでつなぎます。経緯が残るので、まずメール対応が基本です。",
  phoneOnlyWhenNeeded:
    "電話は、メールだけでは難しい場合（業務停止級など）に限ってご案内します。番号は CS からメールでお知らせします。",
} as const;
