import type { StakeholderKind } from "@/config/organization";
import type { SettingsCategoryId } from "@/lib/nav-policy";

export type ConfigCategory = {
  id: SettingsCategoryId;
  label: string;
  subLabel: string;
};

export const SETTINGS_CATEGORIES: ConfigCategory[] = [
  { id: "clients", label: "顧客マスタ", subLabel: "CLIENTS" },
  { id: "clientProfile", label: "顧客詳細", subLabel: "PROFILE" },
  { id: "stakeholders", label: "担当マスタ", subLabel: "STAKEHOLDERS" },
  { id: "roles", label: "権限ロール", subLabel: "ROLES" },
  { id: "documents", label: "書類種別", subLabel: "DOCS" },
  { id: "templates", label: "文書ひな形", subLabel: "TEMPLATES" },
  { id: "reviewChecklist", label: "監査チェックリスト", subLabel: "CHECKLIST" },
  { id: "shortcuts", label: "ショートカット", subLabel: "KEYS" },
  { id: "appearance", label: "見た目", subLabel: "UI" },
  { id: "featureSurfaces", label: "機能の公開", subLabel: "GATES" },
  { id: "addons", label: "アドオン", subLabel: "ADDONS" },
  { id: "billing", label: "プラン・決済", subLabel: "BILLING" },
  { id: "screens", label: "画面設計", subLabel: "SCREENS" },
  { id: "drive", label: "Google Drive", subLabel: "DRIVE" },
  { id: "integrations", label: "外部連携", subLabel: "INTEGRATIONS" },
  { id: "messaging", label: "通知連携", subLabel: "NOTIFY" },
  { id: "audit", label: "操作履歴", subLabel: "AUDIT" },
  { id: "mcp", label: "AI / MCP", subLabel: "MCP" },
];

export const stakeholderKindLabel: Record<StakeholderKind, string> = {
  staff: "スタッフ",
  supervisor: "上司",
  representative_tax_accountant: "代表税理士",
  client: "クライアント",
  bank: "銀行",
  third_party: "第三者",
  tax_office: "税務署",
};
