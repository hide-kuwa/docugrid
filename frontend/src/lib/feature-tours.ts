import type { AppPermission } from "@/config/organization";
import type { PersonaId } from "@/config/personas";
import type { DocugridUser } from "./auth";
import { hasPermission } from "./authorization";
import { resolvePersonaId } from "./persona";

export type FeatureTourStep = {
  title: string;
  body: string;
  /** CSS selector for spotlight target */
  target: string;
};

export type FeatureTourDefinition = {
  id: string;
  label: string;
  steps: FeatureTourStep[];
  /** Optional permission gate */
  permission?: AppPermission;
  /** Show only for these personas (empty = all) */
  personaIds?: PersonaId[];
};

const STORAGE_PREFIX = "docugrid.tour.";

export const FEATURE_TOURS: FeatureTourDefinition[] = [
  {
    id: "auto_sort",
    label: "自動振り分け",
    permission: "document.upload",
    personaIds: ["firm_director", "firm_staff_main", "firm_staff_support"],
    steps: [
      {
        title: "PDF をまとめて投入",
        body: "複数の PDF をこのエリアにドロップすると、AI が書類種別を推定してスロットへ振り分けます。",
        target: '[data-tour="auto-sort"]',
      },
      {
        title: "高信頼は自動配置",
        body: "確信度が高いものはそのままスロットに収納されます。低いものは下の「要確認」キューへ送られます。",
        target: '[data-tour="auto-sort"]',
      },
    ],
  },
  {
    id: "pending_review",
    label: "要確認キュー",
    permission: "document.upload",
    personaIds: ["firm_director", "firm_staff_main", "firm_staff_support"],
    steps: [
      {
        title: "要確認キュー",
        body: "AI の推定が不確かな書類はここに並びます。正しいスロットを選んで確定してください。",
        target: '[data-tour="pending-review"]',
      },
    ],
  },
  {
    id: "tasks_nav",
    label: "今日やること",
    permission: "dashboard.view",
    personaIds: ["firm_director", "firm_staff_main", "firm_staff_support"],
    steps: [
      {
        title: "タスクボタン",
        body: "事務所全体の不足資料・承認待ちを一覧できます。マトリクス横断の「今日やること」です。",
        target: '[data-tour="tasks-nav"]',
      },
    ],
  },
];

export const tourStorageKey = (tourId: string): string => `${STORAGE_PREFIX}${tourId}.seen`;

export const isTourSeen = (tourId: string): boolean => {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(tourStorageKey(tourId)) === "1";
};

export const markTourSeen = (tourId: string): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(tourStorageKey(tourId), "1");
};

export const canUserSeeTour = (
  user: DocugridUser | null,
  tour: FeatureTourDefinition,
): boolean => {
  if (!user) return false;
  if (tour.permission && !hasPermission(user, tour.permission)) return false;
  if (tour.personaIds?.length) {
    const personaId = resolvePersonaId(user);
    if (!tour.personaIds.includes(personaId)) return false;
  }
  return true;
};

export const eligibleTours = (user: DocugridUser | null): FeatureTourDefinition[] =>
  FEATURE_TOURS.filter((t) => canUserSeeTour(user, t));

export const unseenTours = (user: DocugridUser | null): FeatureTourDefinition[] =>
  eligibleTours(user).filter((t) => !isTourSeen(t.id));

export const hasUnseenFeatures = (user: DocugridUser | null): boolean =>
  unseenTours(user).length > 0;

export const getTourById = (id: string): FeatureTourDefinition | undefined =>
  FEATURE_TOURS.find((t) => t.id === id);
