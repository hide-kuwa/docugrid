/** 永続期の横ドラム（CRM 入口）— C0 骨格。NavBar 直下・横スクロール。 */

import type { LucideIcon } from "lucide-react";
import { Briefcase, FileStack, FileText, ShieldCheck } from "lucide-react";

export type PermCrmTabId = "docs" | "held" | "proposal" | "deals";

export type PermCrmTab = {
  id: PermCrmTabId;
  label: string;
  subLabel: string;
  hint: string;
  icon: LucideIcon;
};

export const PERM_CRM_TABS: PermCrmTab[] = [
  {
    id: "docs",
    label: "資料",
    subLabel: "DOCS",
    hint: "永続スロット（従来どおり）",
    icon: FileStack,
  },
  {
    id: "held",
    label: "保有",
    subLabel: "HELD",
    hint: "契約中の保険など",
    icon: ShieldCheck,
  },
  {
    id: "proposal",
    label: "提案",
    subLabel: "OFFER",
    hint: "提案中の見積・設計",
    icon: FileText,
  },
  {
    id: "deals",
    label: "案件",
    subLabel: "DEALS",
    hint: "進捗中の商談",
    icon: Briefcase,
  },
];

export const DEFAULT_PERM_CRM_TAB: PermCrmTabId = "docs";
