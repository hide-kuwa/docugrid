import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  Calculator,
  ClipboardList,
  Database,
  ListChecks,
  MessagesSquare,
  Wallet,
} from "lucide-react";

export type DataWorkspaceTabId =
  | "master"
  | "charts"
  | "progress"
  | "payroll"
  | "stockValuation"
  | "communications"
  | "investigations"
  | "special";

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
