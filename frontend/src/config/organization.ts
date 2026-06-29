import type { ProfileFieldMeta, ProfileFieldChange } from "@/config/client-profile-fields";

export type AppPermission =
  | "client.view"
  | "client.edit"
  | "document.view"
  | "document.upload"
  | "document.purge"
  | "document.annotate"
  | "document.comment"
  | "audit.link"
  | "audit.approve"
  | "dashboard.view"
  | "alert.view"
  | "alert.manage"
  | "review_checklist.edit"
  | "settings.manage"
  | "settings.platform";

export type AppRoleId =
  | "viewer"
  | "client_uploader"
  | "operator"
  | "reviewer"
  | "approver"
  | "admin"
  | "firm_admin"
  | "platform_admin";

export type AppRole = {
  id: AppRoleId;
  label: string;
  description: string;
  permissions: AppPermission[];
};

export type OrgClient = {
  id: string;
  name: string;
  fiscalMonth: number;
  category: "corporate" | "individual";
  tags?: string[];
  profile?: Record<string, string>;
  profileMeta?: Record<string, ProfileFieldMeta>;
  profileHistory?: Record<string, ProfileFieldChange[]>;
};

export type ClientRelationType = "group_company" | "shareholder" | "relative_group";

export type ClientFamilyGroup = {
  id: string;
  name: string;
  relationType: ClientRelationType;
  clientIds: string[];
  note?: string;
};

export type StaffAssignmentRole = "main" | "sub";

export type StaffAssignment = {
  clientId: string;
  assignmentRole: StaffAssignmentRole;
};

export type OrgStaff = {
  id: string;
  name: string;
  team: string;
  appRoleId: AppRoleId;
  assignments: StaffAssignment[];
};

// 将来の外部公開を見据えた当事者マスタ
export type StakeholderKind =
  | "staff"
  | "supervisor"
  | "representative_tax_accountant"
  | "client"
  | "bank"
  | "third_party"
  | "tax_office";

export type StakeholderStatus = "active" | "inactive";

export type StakeholderMaster = {
  id: string;
  kind: StakeholderKind;
  displayName: string;
  organizationName?: string;
  appRoleId: AppRoleId;
  status: StakeholderStatus;
  // 関連先クライアント。空の場合は全社権限ではなく「割当なし」扱いで使う
  scopedClientIds: string[];
};

export type AccessAction = "view" | "upload" | "annotate" | "approve";

export type StakeholderAccessPolicy = {
  stakeholderKind: StakeholderKind;
  allowedActions: AccessAction[];
};

// OCR/ダッシュボードを将来接続するための入力書類カテゴリ定義
export type DocumentCategory =
  | "articles_of_incorporation"
  | "corporate_registry"
  | "tax_return_corporate"
  | "tax_return_consumption"
  | "ledger"
  | "bank_statement";

export type DocumentCategoryConfig = {
  id: DocumentCategory;
  label: string;
  ocrTarget: boolean;
  dashboardTarget: boolean;
  alertTarget: boolean;
};

export const APP_ROLES: AppRole[] = [
  {
    id: "viewer",
    label: "閲覧者",
    description: "顧客/書類の閲覧のみ",
    permissions: ["client.view", "document.view", "dashboard.view"],
  },
  {
    id: "client_uploader",
    label: "クライアント提出者",
    description: "自社資料の閲覧とアップロード",
    permissions: [
      "client.view",
      "document.view",
      "document.upload",
      "review_checklist.edit",
      "dashboard.view",
    ],
  },
  {
    id: "operator",
    label: "担当者",
    description: "書類アップロード・編集・注釈作業",
    permissions: [
      "client.view",
      "client.edit",
      "document.view",
      "document.upload",
      "document.annotate",
      "document.comment",
      "audit.link",
      "review_checklist.edit",
      "dashboard.view",
      "alert.view",
    ],
  },
  {
    id: "reviewer",
    label: "レビュアー",
    description: "監査リンク確認とレビュー中心",
    permissions: [
      "client.view",
      "document.view",
      "document.annotate",
      "document.comment",
      "audit.link",
      "review_checklist.edit",
      "dashboard.view",
      "alert.view",
    ],
  },
  {
    id: "approver",
    label: "承認者",
    description: "監査承認・差戻しを実施",
    permissions: [
      "client.view",
      "document.view",
      "audit.link",
      "audit.approve",
      "dashboard.view",
      "alert.view",
    ],
  },
  {
    id: "admin",
    label: "管理者（レガシー）",
    description: "開発用。本番では firm_admin / platform_admin を使用",
    permissions: [
      "client.view",
      "client.edit",
      "document.view",
      "document.upload",
      "document.annotate",
      "document.comment",
      "audit.link",
      "audit.approve",
      "dashboard.view",
      "alert.view",
      "alert.manage",
      "settings.manage",
      "document.purge",
    ],
  },
  {
    id: "firm_admin",
    label: "事務所管理者",
    description: "自事務所内の顧客・担当・監査（グローバル設定は不可）",
    permissions: [
      "client.view",
      "client.edit",
      "document.view",
      "document.upload",
      "document.annotate",
      "document.comment",
      "audit.link",
      "audit.approve",
      "dashboard.view",
      "alert.view",
      "alert.manage",
      "settings.manage",
      "document.purge",
    ],
  },
  {
    id: "platform_admin",
    label: "プラットフォーム管理者",
    description: "ロール権限・AI キー等のグローバル設定",
    permissions: [
      "client.view",
      "client.edit",
      "document.view",
      "document.upload",
      "document.annotate",
      "document.comment",
      "audit.link",
      "audit.approve",
      "dashboard.view",
      "alert.view",
      "alert.manage",
      "settings.manage",
      "settings.platform",
    ],
  },
];

export const CLIENTS: OrgClient[] = [
  { id: "c1", name: "株式会社 鈴木商店", fiscalMonth: 3, category: "corporate", tags: ["製造"] },
  { id: "c2", name: "合同会社 テック", fiscalMonth: 12, category: "corporate", tags: ["IT"] },
  { id: "c3", name: "佐藤商事", fiscalMonth: 9, category: "corporate", tags: ["卸売"] },
  { id: "c4", name: "鈴木 太郎 (個人)", fiscalMonth: 12, category: "individual", tags: ["個人事業"] },
  { id: "c5", name: "山田不動産", fiscalMonth: 12, category: "corporate", tags: ["不動産"] },
];

export const CLIENT_FAMILY_GROUPS: ClientFamilyGroup[] = [
  {
    id: "g1",
    name: "鈴木グループ",
    relationType: "group_company",
    clientIds: ["c1", "c2"],
    note: "グループ会社として連結管理",
  },
  {
    id: "g2",
    name: "鈴木家資産管理",
    relationType: "relative_group",
    clientIds: ["c1", "c4"],
    note: "親族保有資産・個人事業を含む",
  },
  {
    id: "g3",
    name: "山田不動産 株主関係",
    relationType: "shareholder",
    clientIds: ["c5", "c3"],
    note: "主要株主の関連先を監視",
  },
];

export const RELATION_TYPE_LABEL: Record<ClientRelationType, string> = {
  group_company: "グループ会社",
  shareholder: "株主関係",
  relative_group: "親戚グループ",
};

export const getClientGroups = (clientId: string): ClientFamilyGroup[] =>
  CLIENT_FAMILY_GROUPS.filter((group) => group.clientIds.includes(clientId));

export const STAFFS: OrgStaff[] = [
  {
    id: "s1",
    name: "田中 太郎",
    team: "第1課",
    appRoleId: "operator",
    assignments: [
      { clientId: "c1", assignmentRole: "main" },
      { clientId: "c2", assignmentRole: "main" },
      { clientId: "c3", assignmentRole: "main" },
    ],
  },
  {
    id: "s2",
    name: "佐藤 次郎",
    team: "第2課",
    appRoleId: "reviewer",
    assignments: [
      { clientId: "c4", assignmentRole: "sub" },
      { clientId: "c5", assignmentRole: "main" },
    ],
  },
];

// 担当マスタ（スタッフ/上司/代表税理士/顧客/銀行/第三者/税務署）
export const STAKEHOLDER_MASTER: StakeholderMaster[] = [
  {
    id: "actor-admin",
    kind: "staff",
    displayName: "システム管理者",
    organizationName: "DocuGrid税理士事務所",
    appRoleId: "platform_admin",
    status: "active",
    scopedClientIds: ["c1", "c2", "c3", "c4", "c5"],
  },
  {
    id: "actor-s1",
    kind: "staff",
    displayName: "田中 太郎",
    organizationName: "DocuGrid税理士事務所",
    appRoleId: "operator",
    status: "active",
    scopedClientIds: ["c1", "c2", "c3"],
  },
  {
    id: "actor-s2",
    kind: "supervisor",
    displayName: "佐藤 次郎",
    organizationName: "DocuGrid税理士事務所",
    appRoleId: "reviewer",
    status: "active",
    scopedClientIds: ["c4", "c5"],
  },
  {
    id: "actor-s3",
    kind: "representative_tax_accountant",
    displayName: "山本 花子",
    organizationName: "DocuGrid税理士事務所",
    appRoleId: "approver",
    status: "active",
    scopedClientIds: ["c1", "c2", "c3", "c4", "c5"],
  },
  {
    id: "actor-c1",
    kind: "client",
    displayName: "鈴木商店 経理担当",
    organizationName: "株式会社 鈴木商店",
    appRoleId: "client_uploader",
    status: "active",
    scopedClientIds: ["c1"],
  },
  {
    id: "actor-c-ceo",
    kind: "client",
    displayName: "鈴木商店 代表",
    organizationName: "株式会社 鈴木商店",
    appRoleId: "viewer",
    status: "active",
    scopedClientIds: ["c1"],
  },
  {
    id: "actor-c-sales",
    kind: "client",
    displayName: "鈴木商店 営業部",
    organizationName: "株式会社 鈴木商店",
    appRoleId: "client_uploader",
    status: "active",
    scopedClientIds: ["c1"],
  },
  {
    id: "actor-c-controller",
    kind: "client",
    displayName: "鈴木商店 管理会計",
    organizationName: "株式会社 鈴木商店",
    appRoleId: "client_uploader",
    status: "active",
    scopedClientIds: ["c1"],
  },
  {
    id: "actor-b1",
    kind: "bank",
    displayName: "第一銀行 融資担当",
    organizationName: "第一銀行",
    appRoleId: "viewer",
    status: "active",
    scopedClientIds: ["c1"],
  },
  {
    id: "actor-tp1",
    kind: "third_party",
    displayName: "監査法人A 担当者",
    organizationName: "監査法人A",
    appRoleId: "viewer",
    status: "active",
    scopedClientIds: ["c2"],
  },
  {
    id: "actor-tax1",
    kind: "tax_office",
    displayName: "税務署 連携窓口",
    organizationName: "○○税務署",
    appRoleId: "viewer",
    status: "active",
    scopedClientIds: ["c1", "c2", "c3", "c4", "c5"],
  },
];

export const STAKEHOLDER_ACCESS_POLICIES: StakeholderAccessPolicy[] = [
  { stakeholderKind: "staff", allowedActions: ["view", "upload", "annotate"] },
  { stakeholderKind: "supervisor", allowedActions: ["view", "annotate", "approve"] },
  { stakeholderKind: "representative_tax_accountant", allowedActions: ["view", "upload", "annotate", "approve"] },
  { stakeholderKind: "client", allowedActions: ["view", "upload"] },
  { stakeholderKind: "bank", allowedActions: ["view"] },
  { stakeholderKind: "third_party", allowedActions: ["view"] },
  { stakeholderKind: "tax_office", allowedActions: ["view"] },
];

export const getRoleById = (id: AppRoleId): AppRole | undefined => APP_ROLES.find((role) => role.id === id);

export const canStakeholderAction = (stakeholder: StakeholderMaster, action: AccessAction): boolean => {
  const policy = STAKEHOLDER_ACCESS_POLICIES.find((item) => item.stakeholderKind === stakeholder.kind);
  if (!policy) return false;
  return policy.allowedActions.includes(action);
};

export const DOCUMENT_CATEGORIES: DocumentCategoryConfig[] = [
  { id: "articles_of_incorporation", label: "定款", ocrTarget: true, dashboardTarget: true, alertTarget: false },
  { id: "corporate_registry", label: "履歴事項全部証明書", ocrTarget: true, dashboardTarget: true, alertTarget: false },
  { id: "tax_return_corporate", label: "法人税申告書", ocrTarget: true, dashboardTarget: true, alertTarget: true },
  { id: "tax_return_consumption", label: "消費税申告書", ocrTarget: true, dashboardTarget: true, alertTarget: true },
  { id: "ledger", label: "総勘定元帳", ocrTarget: true, dashboardTarget: true, alertTarget: false },
  { id: "bank_statement", label: "通帳コピー", ocrTarget: true, dashboardTarget: false, alertTarget: false },
];

export const PERIODS = {
  year: ["R7", "R6", "R5", "R4"],
  month: Array.from({ length: 12 }, (_, i) => `${12 - i}月`),
};
