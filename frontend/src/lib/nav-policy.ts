import type { AppPermission } from "@/config/organization";
import type { PersonaId } from "@/config/personas";
import type { DocugridUser } from "./auth";
import { hasPermission } from "./authorization";
import { resolvePersonaId } from "./persona";
import {
  canAccessAnySettings,
  canAccessDevConsole,
  canAccessFirmSettings,
  type SettingsCategoryId,
  visibleDevSettingsCategories,
  visibleFirmSettingsCategories,
} from "./app-surface";

export type { SettingsCategoryId } from "./app-surface";

const CATEGORY_PERMISSIONS: Record<SettingsCategoryId, AppPermission> = {
  clients: "settings.manage",
  clientProfile: "settings.manage",
  stakeholders: "settings.manage",
  documents: "settings.manage",
  templates: "settings.manage",
  screens: "settings.manage",
  audit: "settings.manage",
  roles: "settings.platform",
  integrations: "settings.platform",
};

const FIRM_PERSONA_IDS: PersonaId[] = [
  "firm_director",
  "firm_staff_main",
  "firm_staff_support",
];

/** 事務所運用の設定（顧客マスタ等） */
export const canShowFirmSettingsNav = (user: DocugridUser | null): boolean =>
  canAccessFirmSettings(user);

/** 開発コンソール（/dev） */
export const canShowDevConsoleNav = (user: DocugridUser | null): boolean =>
  canAccessDevConsole(user);

/** @deprecated use canShowFirmSettingsNav */
export const canShowSettingsNav = canShowFirmSettingsNav;

export const canShowTasksNav = (user: DocugridUser | null): boolean => {
  if (!user) return false;
  if (!hasPermission(user, "dashboard.view")) return false;
  const personaId = resolvePersonaId(user);
  return FIRM_PERSONA_IDS.includes(personaId);
};

/** 書類カタログは開発コンソール配下 */
export const canShowCatalogNav = (user: DocugridUser | null): boolean =>
  canAccessDevConsole(user);

export const canAccessSettingsPage = (user: DocugridUser | null): boolean =>
  canAccessAnySettings(user);

export const canViewSettingsCategory = (
  user: DocugridUser | null,
  categoryId: SettingsCategoryId,
): boolean => hasPermission(user, CATEGORY_PERMISSIONS[categoryId]);

export const visibleSettingsCategories = (
  user: DocugridUser | null,
): SettingsCategoryId[] =>
  (Object.keys(CATEGORY_PERMISSIONS) as SettingsCategoryId[]).filter((id) =>
    canViewSettingsCategory(user, id),
  );

export { visibleFirmSettingsCategories, visibleDevSettingsCategories };
