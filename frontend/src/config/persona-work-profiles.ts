/**
 * ペルソナ別の業務プロファイル（docs/persona-work-requirements.md と同期）。
 * 実装の保留・再開リスト: docs/persona-ui-roadmap.md
 * ウィジェット実装・画面設計の優先順位の根拠。
 */

import type { PersonaId } from "./personas";

export type PersonaDataNeed = {
  id: string;
  label: string;
  /** 既存 API パス（未実装は future） */
  source: string;
  status: "ready" | "partial" | "future";
};

export type PersonaWidgetPlan = {
  id: string;
  label: string;
  priority: number;
  status: "implemented" | "planned";
};

export type PersonaWorkProfile = {
  personaId: PersonaId;
  primaryTasks: string[];
  dataNeeds: PersonaDataNeed[];
  widgets: PersonaWidgetPlan[];
};

export const PERSONA_WORK_PROFILES: PersonaWorkProfile[] = [
  {
    personaId: "firm_director",
    primaryTasks: ["全顧問先の進捗俯瞰", "承認判断", "リスク・期限の把握"],
    dataNeeds: [
      { id: "approval_queue", label: "承認待ち一覧", source: "GET /api/document-status", status: "ready" },
      { id: "client_progress", label: "顧問先別完了率", source: "GET /api/document-status", status: "ready" },
      { id: "timeline", label: "業務タイムライン", source: "GET /api/review-events/timeline", status: "ready" },
    ],
    widgets: [
      { id: "approval_queue", label: "承認キュー", priority: 1, status: "implemented" },
      { id: "firm_progress", label: "全社進捗サマリー", priority: 2, status: "implemented" },
      { id: "deadline_alerts", label: "期限アラート", priority: 3, status: "implemented" },
    ],
  },
  {
    personaId: "firm_staff_main",
    primaryTasks: ["資料収集・整理", "PDF アップロード", "OCR 振り分け", "DocuGrid 編集"],
    dataNeeds: [
      { id: "missing_slots", label: "未提出スロット", source: "GET /api/document-status", status: "ready" },
      { id: "classify_queue", label: "要確認（分類）", source: "POST /api/classify", status: "ready" },
      { id: "remands", label: "差戻し一覧", source: "GET /api/slots", status: "ready" },
    ],
    widgets: [
      { id: "today_tasks", label: "今日やること", priority: 1, status: "implemented" },
      { id: "classify_queue", label: "要確認キュー", priority: 2, status: "implemented" },
      { id: "remand_alerts", label: "差戻し対応", priority: 3, status: "implemented" },
    ],
  },
  {
    personaId: "firm_staff_support",
    primaryTasks: ["レビュー", "照合コメント", "差戻し提案"],
    dataNeeds: [
      { id: "review_pending", label: "レビュー待ち", source: "GET /api/firm-tasks", status: "ready" },
      { id: "remand_history", label: "差戻し履歴", source: "GET /api/review-events", status: "ready" },
    ],
    widgets: [
      { id: "review_queue", label: "レビュー待ち", priority: 1, status: "implemented" },
      { id: "remand_history", label: "差戻し履歴", priority: 2, status: "implemented" },
    ],
  },
  {
    personaId: "client_accounting",
    primaryTasks: ["資料提出", "差戻し修正の再提出", "提出状況確認"],
    dataNeeds: [
      { id: "checklist", label: "必須書類と不足", source: "GET /api/document-status", status: "ready" },
      { id: "remands", label: "差戻し理由", source: "GET /api/review-events", status: "ready" },
      { id: "upload", label: "スロットへアップロード", source: "POST /api/slots", status: "ready" },
    ],
    widgets: [
      { id: "submit_checklist", label: "提出チェックリスト", priority: 1, status: "implemented" },
      { id: "remand_alerts", label: "差戻しアラート", priority: 2, status: "implemented" },
      { id: "quick_upload", label: "簡易アップロード", priority: 3, status: "implemented" },
    ],
  },
  {
    personaId: "client_executive",
    primaryTasks: ["経営サマリー確認", "重要書類閲覧"],
    dataNeeds: [
      { id: "summary", label: "完了率・未提出数", source: "GET /api/document-status", status: "ready" },
      { id: "charts", label: "売上・利益指標", source: "GET /api/clients/{id}/metrics/charts", status: "ready" },
      { id: "risk", label: "税務リスク", source: "GET /api/clients/{id}/records", status: "ready" },
    ],
    widgets: [
      { id: "exec_summary", label: "経営サマリー", priority: 1, status: "implemented" },
      { id: "risk_highlights", label: "リスクハイライト", priority: 2, status: "implemented" },
    ],
  },
  {
    personaId: "client_sales_expense",
    primaryTasks: ["経費領収書提出", "精算ステータス確認"],
    dataNeeds: [
      { id: "monthly_slots", label: "月次スロット状況", source: "GET /api/document-status", status: "ready" },
      { id: "upload", label: "撮影アップロード", source: "POST /api/slots", status: "ready" },
    ],
    widgets: [
      { id: "expense_submit", label: "経費提出", priority: 1, status: "implemented" },
      { id: "expense_status", label: "精算ステータス", priority: 2, status: "implemented" },
    ],
  },
  {
    personaId: "client_controller",
    primaryTasks: ["管理会計資料の定期提出"],
    dataNeeds: [
      { id: "mgmt_docs", label: "管理会計スロット", source: "GET /api/document-status", status: "ready" },
    ],
    widgets: [{ id: "mgmt_submit", label: "管理会計提出リスト", priority: 1, status: "implemented" }],
  },
  {
    personaId: "bank",
    primaryTasks: ["共有資料の閲覧"],
    dataNeeds: [
      { id: "shared", label: "共有 PDF 一覧", source: "GET /api/slots", status: "future" },
      { id: "audit", label: "アクセスログ", source: "GET /api/audit-events", status: "future" },
    ],
    widgets: [
      { id: "shared_docs", label: "共有資料", priority: 1, status: "planned" },
      { id: "access_log", label: "アクセス履歴", priority: 2, status: "planned" },
    ],
  },
  {
    personaId: "tax_office",
    primaryTasks: ["申告関連資料の照会"],
    dataNeeds: [
      { id: "filings", label: "申告書スロット", source: "GET /api/slots", status: "future" },
    ],
    widgets: [{ id: "filing_docs", label: "申告関連資料", priority: 1, status: "planned" }],
  },
  {
    personaId: "platform_admin",
    primaryTasks: ["テナント運用", "グローバル設定"],
    dataNeeds: [
      { id: "audit_denied", label: "認可拒否ログ", source: "GET /api/audit-events", status: "ready" },
      { id: "settings", label: "プラットフォーム設定", source: "/settings", status: "ready" },
    ],
    widgets: [
      { id: "tenant_health", label: "テナント健全性", priority: 1, status: "planned" },
      { id: "settings_shortcut", label: "設定ショートカット", priority: 2, status: "planned" },
    ],
  },
];

export const getPersonaWorkProfile = (personaId: PersonaId | string): PersonaWorkProfile | undefined =>
  PERSONA_WORK_PROFILES.find((p) => p.personaId === personaId);
