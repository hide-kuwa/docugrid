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
  Network,
  Wallet,
} from "lucide-react";

export type DataWorkspaceTabId =
  | "master"
  | "relations"
  | "familyTree"
  | "charts"
  | "progress"
  | "payroll"
  | "stockValuation"
  | "communications"
  | "investigations"
  | "special"
  | "karte";

/** live = 利用可 / planned = 工事中（枠のみ） */
export type DataWorkspaceTabStatus = "live" | "planned";

export type DataWorkspaceTab = {
  id: DataWorkspaceTabId;
  label: string;
  subLabel: string;
  description: string;
  icon: LucideIcon;
  status?: DataWorkspaceTabStatus;
};

export function isDataWorkspaceTabLive(tab: DataWorkspaceTab): boolean {
  return (tab.status ?? "live") === "live";
}

export const DATA_WORKSPACE_TABS: DataWorkspaceTab[] = [
  {
    id: "master",
    label: "マスタ",
    subLabel: "MASTER",
    description: "顧客マスタ・正規化データ",
    icon: Database,
    status: "live",
  },
  {
    id: "relations",
    label: "関係",
    subLabel: "KIN",
    description: "家系・出資・紹介の関係図",
    icon: GitBranch,
    status: "planned",
  },
  {
    id: "familyTree",
    label: "家系図",
    subLabel: "FAMILY",
    description: "世代別の家族表・法定相続人",
    icon: Network,
    status: "live",
  },
  {
    id: "karte",
    label: "カルテ",
    subLabel: "KARTE",
    description: "打合せ宿題・期末メモ・永続注意点",
    icon: BookOpen,
    status: "planned",
  },
  {
    id: "charts",
    label: "グラフ",
    subLabel: "CHARTS",
    description: "売上・利益のダッシュボード",
    icon: BarChart3,
    status: "planned",
  },
  {
    id: "progress",
    label: "進捗",
    subLabel: "PROGRESS",
    description: "申告進捗・税務アラート・納税カレンダー",
    icon: ListChecks,
    status: "planned",
  },
  {
    id: "payroll",
    label: "給与・源泉",
    subLabel: "PAYROLL",
    description: "源泉徴収簿・従業員マスタ",
    icon: Wallet,
    status: "planned",
  },
  {
    id: "stockValuation",
    label: "自社株評価",
    subLabel: "VALUATION",
    description: "非上場株式の評価試算",
    icon: Calculator,
    status: "planned",
  },
  {
    id: "communications",
    label: "コミュニケーション",
    subLabel: "COMMS",
    description: "チャット・メールのやり取り",
    icon: MessagesSquare,
    status: "planned",
  },
  {
    id: "investigations",
    label: "調査事項",
    subLabel: "AUDIT",
    description: "税務調査・過去の調査履歴",
    icon: ClipboardList,
    status: "planned",
  },
  {
    id: "special",
    label: "特殊事項",
    subLabel: "SPECIAL",
    description: "対応上の注意・特例",
    icon: AlertTriangle,
    status: "planned",
  },
];

export function dataWorkspaceTabIndex(id: DataWorkspaceTabId): number {
  return DATA_WORKSPACE_TABS.findIndex((tab) => tab.id === id);
}

/**
 * カルテ画面内のセクション（レールは「カルテ」一本。中で切り替える）。
 * 現状はマスタのみ本番利用。それ以外は工事中。
 */
export const KARTE_SECTION_TABS: DataWorkspaceTab[] = [
  {
    id: "master",
    label: "マスタ",
    subLabel: "MASTER",
    description: "顧客マスタ・正規化データ",
    icon: Database,
    status: "live",
  },
  {
    id: "karte",
    label: "メモ",
    subLabel: "NOTES",
    description: "打合せ宿題・期末メモ・永続注意点",
    icon: BookOpen,
    status: "planned",
  },
  {
    id: "relations",
    label: "関係",
    subLabel: "KIN",
    description: "家系・出資・紹介の関係図",
    icon: GitBranch,
    status: "planned",
  },
  {
    id: "familyTree",
    label: "家系図",
    subLabel: "FAMILY",
    description: "世代別の家族表・法定相続人",
    icon: Network,
    status: "live",
  },
  {
    id: "charts",
    label: "グラフ",
    subLabel: "CHARTS",
    description: "売上・利益のダッシュボード",
    icon: BarChart3,
    status: "planned",
  },
  {
    id: "progress",
    label: "進捗",
    subLabel: "PROGRESS",
    description: "申告進捗・税務アラート・納税カレンダー",
    icon: ListChecks,
    status: "planned",
  },
  {
    id: "payroll",
    label: "給与",
    subLabel: "PAYROLL",
    description: "源泉徴収簿・従業員マスタ",
    icon: Wallet,
    status: "planned",
  },
  {
    id: "stockValuation",
    label: "株評",
    subLabel: "STOCK",
    description: "非上場株式の評価試算",
    icon: Calculator,
    status: "planned",
  },
  {
    id: "special",
    label: "特殊",
    subLabel: "SPECIAL",
    description: "対応上の注意・特例",
    icon: AlertTriangle,
    status: "planned",
  },
  {
    id: "communications",
    label: "連絡",
    subLabel: "COMMS",
    description: "チャット・メールのやり取り",
    icon: MessagesSquare,
    status: "planned",
  },
  {
    id: "investigations",
    label: "調査",
    subLabel: "AUDIT",
    description: "税務調査・過去の調査履歴",
    icon: ClipboardList,
    status: "planned",
  },
];

const KARTE_SECTION_IDS = new Set(KARTE_SECTION_TABS.map((t) => t.id));
const KARTE_SECTION_BY_ID = new Map(KARTE_SECTION_TABS.map((t) => [t.id, t]));

export function isKarteSectionTabId(id: string): id is DataWorkspaceTabId {
  return KARTE_SECTION_IDS.has(id as DataWorkspaceTabId);
}

export function isKarteSectionLive(id: DataWorkspaceTabId): boolean {
  const tab = KARTE_SECTION_BY_ID.get(id);
  return tab ? isDataWorkspaceTabLive(tab) : false;
}

export function normalizeKarteSectionTab(id: string | null | undefined): DataWorkspaceTabId {
  if (id && isKarteSectionTabId(id)) return id;
  return "master";
}
