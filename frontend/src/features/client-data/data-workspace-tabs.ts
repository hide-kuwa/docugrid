import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Calculator,
  ClipboardList,
  Database,
  GitBranch,
  ListChecks,
  MessagesSquare,
  Wallet,
} from "lucide-react";

export type DataWorkspaceTabId =
  | "master"
  | "relations"
  | "charts"
  | "progress"
  | "payroll"
  | "stockValuation"
  | "communications"
  | "investigations"
  | "special"
  | "karte";

export type DataWorkspaceTab = {
  id: DataWorkspaceTabId;
  label: string;
  subLabel: string;
  description: string;
  icon: LucideIcon;
};

export const DATA_WORKSPACE_TABS: DataWorkspaceTab[] = [
  {
    id: "master",
    label: "マスタ",
    subLabel: "MASTER",
    description: "顧客マスタ・正規化データ",
    icon: Database,
  },
  {
    id: "relations",
    label: "関係",
    subLabel: "KIN",
    description: "家系・出資・紹介の関係図",
    icon: GitBranch,
  },
  {
    id: "karte",
    label: "カルテ",
    subLabel: "KARTE",
    description: "打合せ宿題・期末メモ・永続注意点",
    icon: BookOpen,
  },
  {
    id: "charts",
    label: "グラフ",
    subLabel: "CHARTS",
    description: "売上・利益のダッシュボード",
    icon: BarChart3,
  },
  {
    id: "progress",
    label: "進捗",
    subLabel: "PROGRESS",
    description: "申告進捗・税務アラート・納税カレンダー",
    icon: ListChecks,
  },
  {
    id: "payroll",
    label: "給与・源泉",
    subLabel: "PAYROLL",
    description: "源泉徴収簿・従業員マスタ",
    icon: Wallet,
  },
  {
    id: "stockValuation",
    label: "自社株評価",
    subLabel: "VALUATION",
    description: "非上場株式の評価試算",
    icon: Calculator,
  },
  {
    id: "communications",
    label: "コミュニケーション",
    subLabel: "COMMS",
    description: "チャット・メールのやり取り",
    icon: MessagesSquare,
  },
  {
    id: "investigations",
    label: "調査事項",
    subLabel: "AUDIT",
    description: "税務調査・過去の調査履歴",
    icon: ClipboardList,
  },
  {
    id: "special",
    label: "特殊事項",
    subLabel: "SPECIAL",
    description: "対応上の注意・特例",
    icon: AlertTriangle,
  },
];

export function dataWorkspaceTabIndex(id: DataWorkspaceTabId): number {
  return DATA_WORKSPACE_TABS.findIndex((tab) => tab.id === id);
}

/**
 * カルテ画面内のセクション（レールは「カルテ」一本。中で切り替える）。
 * Doc の期カラム（R8 年など）と併用する想定。
 */
export const KARTE_SECTION_TABS: DataWorkspaceTab[] = [
  {
    id: "karte",
    label: "メモ",
    subLabel: "NOTES",
    description: "打合せ宿題・期末メモ・永続注意点",
    icon: BookOpen,
  },
  {
    id: "master",
    label: "マスタ",
    subLabel: "MASTER",
    description: "顧客マスタ・正規化データ",
    icon: Database,
  },
  {
    id: "relations",
    label: "関係",
    subLabel: "KIN",
    description: "家系・出資・紹介の関係図",
    icon: GitBranch,
  },
  {
    id: "charts",
    label: "グラフ",
    subLabel: "CHARTS",
    description: "売上・利益のダッシュボード",
    icon: BarChart3,
  },
  {
    id: "progress",
    label: "進捗",
    subLabel: "PROGRESS",
    description: "申告進捗・税務アラート・納税カレンダー",
    icon: ListChecks,
  },
  {
    id: "payroll",
    label: "給与",
    subLabel: "PAYROLL",
    description: "源泉徴収簿・従業員マスタ",
    icon: Wallet,
  },
  {
    id: "stockValuation",
    label: "株評",
    subLabel: "STOCK",
    description: "非上場株式の評価試算",
    icon: Calculator,
  },
  {
    id: "special",
    label: "特殊",
    subLabel: "SPECIAL",
    description: "対応上の注意・特例",
    icon: AlertTriangle,
  },
  {
    id: "communications",
    label: "連絡",
    subLabel: "COMMS",
    description: "チャット・メールのやり取り",
    icon: MessagesSquare,
  },
  {
    id: "investigations",
    label: "調査",
    subLabel: "AUDIT",
    description: "税務調査・過去の調査履歴",
    icon: ClipboardList,
  },
];

const KARTE_SECTION_IDS = new Set(KARTE_SECTION_TABS.map((t) => t.id));

export function isKarteSectionTabId(id: string): id is DataWorkspaceTabId {
  return KARTE_SECTION_IDS.has(id as DataWorkspaceTabId);
}

export function normalizeKarteSectionTab(id: string | null | undefined): DataWorkspaceTabId {
  if (id && isKarteSectionTabId(id)) return id;
  return "karte";
}
