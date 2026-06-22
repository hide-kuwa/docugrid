/**
 * UI ペルソナ定義 — RBAC（AppRole）とは別軸。
 * 各ペルソナごとにホーム画面・ナビ・レイアウトを差し替えるためのレジストリ。
 */

export type PersonaId =
  | "firm_director"
  | "firm_staff_main"
  | "firm_staff_support"
  | "client_accounting"
  | "client_executive"
  | "client_sales_expense"
  | "client_controller"
  | "bank"
  | "tax_office"
  | "platform_admin";

export type PersonaAudience = "firm" | "client" | "external" | "platform";

/** matrix = 既存の資料マトリクス（/）、workspace = 専用ホームシェル */
export type PersonaShell = "matrix" | "workspace";

export type PersonaNavItem = {
  id: string;
  label: string;
  href: string;
  /** 将来: permission でフィルタ */
  permission?: string;
};

export type PersonaDefinition = {
  id: PersonaId;
  label: string;
  shortLabel: string;
  description: string;
  audience: PersonaAudience;
  shell: PersonaShell;
  homePath: string;
  navItems: PersonaNavItem[];
  /** プレースホルダー画面に表示する予定機能 */
  plannedFeatures: string[];
};

export const PERSONAS: PersonaDefinition[] = [
  {
    id: "firm_director",
    label: "税理士事務所・所長",
    shortLabel: "所長",
    description: "事務所全体の進捗・承認・リスク俯瞰",
    audience: "firm",
    shell: "matrix",
    homePath: "/",
    navItems: [
      { id: "matrix", label: "資料マトリクス", href: "/" },
      { id: "capture", label: "撮影", href: "/capture" },
      { id: "tasks", label: "承認待ち", href: "/tasks" },
    ],
    plannedFeatures: ["全顧問先ダッシュボード", "承認キュー", "アラート一覧", "担当別進捗"],
  },
  {
    id: "firm_staff_main",
    label: "税理士事務所・担当スタッフ",
    shortLabel: "担当",
    description: "割当顧問先の資料収集・整理・監査リンク",
    audience: "firm",
    shell: "matrix",
    homePath: "/",
    navItems: [
      { id: "matrix", label: "資料マトリクス", href: "/" },
      { id: "capture", label: "撮影", href: "/capture" },
      { id: "tasks", label: "今日やること", href: "/tasks" },
    ],
    plannedFeatures: ["担当顧問先マトリクス", "未提出スロット", "OCR 振り分け", "DocuGrid 編集"],
  },
  {
    id: "firm_staff_support",
    label: "税理士事務所・補佐スタッフ",
    shortLabel: "補佐",
    description: "サブ担当としてのレビュー・差戻し・補助作業",
    audience: "firm",
    shell: "matrix",
    homePath: "/",
    navItems: [
      { id: "matrix", label: "資料マトリクス", href: "/" },
      { id: "capture", label: "撮影", href: "/capture" },
      { id: "tasks", label: "レビュー待ち", href: "/tasks" },
    ],
    plannedFeatures: ["サブ担当顧問先のみ", "レビューコメント", "差戻し履歴"],
  },
  {
    id: "client_accounting",
    label: "クライアント・担当経理",
    shortLabel: "経理",
    description: "自社の提出資料アップロードと進捗確認",
    audience: "client",
    shell: "workspace",
    homePath: "/workspace/client_accounting",
    navItems: [
      { id: "upload", label: "資料提出", href: "/workspace/client_accounting" },
      { id: "capture", label: "撮影", href: "/capture" },
      { id: "status", label: "提出状況", href: "/workspace/client_accounting#status" },
    ],
    plannedFeatures: ["提出チェックリスト", "期限アラート", "差戻し対応", "過去提出の参照"],
  },
  {
    id: "client_executive",
    label: "クライアント・社長",
    shortLabel: "社長",
    description: "経営向けサマリーと重要書類の確認",
    audience: "client",
    shell: "workspace",
    homePath: "/workspace/client_executive",
    navItems: [{ id: "summary", label: "経営サマリー", href: "/workspace/client_executive" }],
    plannedFeatures: ["決算・申告サマリー", "税務リスクハイライト", "承認待ちの一覧"],
  },
  {
    id: "client_sales_expense",
    label: "クライアント・営業（経費精算）",
    shortLabel: "営業",
    description: "経費領収書の提出と精算ステータス",
    audience: "client",
    shell: "workspace",
    homePath: "/workspace/client_sales_expense",
    navItems: [
      { id: "capture", label: "経費撮影", href: "/capture" },
      { id: "history", label: "精算履歴", href: "/workspace/client_sales_expense#history" },
    ],
    plannedFeatures: ["モバイル撮影アップロード", "経費カテゴリ", "承認フロー追跡"],
  },
  {
    id: "client_controller",
    label: "クライアント・管理会計",
    shortLabel: "管理会計",
    description: "管理会計資料・予実・部門別レポートの提出",
    audience: "client",
    shell: "workspace",
    homePath: "/workspace/client_controller",
    navItems: [{ id: "mgmt", label: "管理会計資料", href: "/workspace/client_controller" }],
    plannedFeatures: ["部門別 PL", "予実管理表", "KPI ダッシュボード連携"],
  },
  {
    id: "bank",
    label: "銀行",
    shortLabel: "銀行",
    description: "融資・与信審査向けの限定資料閲覧（プロダクトスコープ外・保留）",
    audience: "external",
    shell: "workspace",
    homePath: "/workspace/bank",
    navItems: [{ id: "shared", label: "共有資料", href: "/workspace/bank" }],
    plannedFeatures: ["共有フォルダ閲覧", "期間限定アクセス", "ダウンロード監査"],
  },
  {
    id: "tax_office",
    label: "税務署",
    shortLabel: "税務署",
    description: "提出・照会用の限定資料アクセス（プロダクトスコープ外・保留）",
    audience: "external",
    shell: "workspace",
    homePath: "/workspace/tax_office",
    navItems: [{ id: "filings", label: "申告関連", href: "/workspace/tax_office" }],
    plannedFeatures: ["申告書・添付資料", "照会対応ログ", "期間限定 URL"],
  },
  {
    id: "platform_admin",
    label: "プラットフォーム管理者",
    shortLabel: "運営",
    description: "全テナント横断の運用・設定",
    audience: "platform",
    shell: "matrix",
    homePath: "/",
    navItems: [{ id: "dev", label: "開発コンソール", href: "/dev", permission: "settings.platform" }],
    plannedFeatures: ["テナント管理", "ロール権限", "AI キー", "監査ログ"],
  },
];

/** 開発用 stakeholder_id → persona（サーバーと同期） */
export const STAKEHOLDER_PERSONA_BY_ID: Record<string, PersonaId> = {
  "actor-admin": "platform_admin",
  "actor-s1": "firm_staff_main",
  "actor-s2": "firm_staff_support",
  "actor-s3": "firm_director",
  "actor-c1": "client_accounting",
  "actor-c-ceo": "client_executive",
  "actor-c-sales": "client_sales_expense",
  "actor-c-controller": "client_controller",
  "actor-b1": "bank",
  "actor-tp1": "client_accounting",
  "actor-tax1": "tax_office",
  "actor-beta-admin": "firm_director",
  "actor-beta-staff": "firm_staff_main",
};

export const getPersonaById = (id: PersonaId | string | undefined): PersonaDefinition | undefined =>
  PERSONAS.find((p) => p.id === id);

export const DEFAULT_PERSONA_ID: PersonaId = "firm_staff_main";
