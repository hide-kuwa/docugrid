/**
 * 業務画面（ユーザー向け）と開発コンソールの境界。
 * プロダクト優先スコープは lib/product-scope.ts（事務所・クライアント・開発）。
 */

import type { DocugridUser } from "./auth";
import { hasPermission } from "./authorization";
import { resolvePersonaId } from "./persona";

export type SettingsCategoryId =
  | "clients"
  | "clientProfile"
  | "stakeholders"
  | "roles"
  | "documents"
  | "templates"
  | "reviewChecklist"
  | "screens"
  | "integrations"
  | "billing"
  | "audit"
  | "mcp"
  | "shortcuts"
  | "appearance";

/** 日々の業務（マトリクス・ワークスペース・撮影・タスク） */
export const USER_ROUTE_PREFIXES = ["/", "/workspace", "/capture", "/tasks", "/checklist", "/account"] as const;

/** 開発・設計・横断ツール */
export const DEV_ROUTE_PREFIXES = ["/dev", "/catalog"] as const;

/** 事務所運用の設定（顧客・担当・ひな形など） */
export const FIRM_SETTINGS_CATEGORY_IDS: SettingsCategoryId[] = [
  "clients",
  "clientProfile",
  "stakeholders",
  "templates",
  "reviewChecklist",
  "billing",
  "audit",
  "mcp",
  "shortcuts",
  "appearance",
];

/** 開発・プラットフォーム設定（ロール設計・画面設計など） */
export const DEV_SETTINGS_CATEGORY_IDS: SettingsCategoryId[] = [
  "roles",
  "documents",
  "screens",
  "integrations",
];

export type SettingsConsole = "firm" | "dev";

export function isUserRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname.startsWith("/login")) return true;
  return USER_ROUTE_PREFIXES.some(
    (prefix) => prefix !== "/" && (pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
}

export function isDevRoute(pathname: string): boolean {
  return DEV_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function canViewSettingsCategoryById(user: DocugridUser | null, categoryId: SettingsCategoryId): boolean {
  if (!user) return false;
  if (categoryId === "shortcuts") return Boolean(user.email);
  if (categoryId === "appearance") return Boolean(user.email);
  if (categoryId === "mcp") return Boolean(user.email);
  if (categoryId === "roles" || categoryId === "integrations") {
    return hasPermission(user, "settings.platform");
  }
  return hasPermission(user, "settings.manage");
}

export function canAccessDevConsole(user: DocugridUser | null): boolean {
  if (!user) return false;
  if (user.appRoleId === "platform_admin" || user.appRoleId === "admin") return true;
  if (resolvePersonaId(user) === "platform_admin") return true;
  if (hasPermission(user, "settings.platform")) return true;
  return DEV_SETTINGS_CATEGORY_IDS.some((id) => canViewSettingsCategoryById(user, id));
}

/** 連携ポートカタログなど — settings.platform のみ（一般 dev より厳格） */
export function canAccessPlatformSettings(user: DocugridUser | null): boolean {
  if (!user) return false;
  if (user.appRoleId === "platform_admin" || user.appRoleId === "admin") return true;
  if (resolvePersonaId(user) === "platform_admin") return true;
  return hasPermission(user, "settings.platform");
}

export function canAccessFirmSettings(user: DocugridUser | null): boolean {
  if (!user) return false;
  return FIRM_SETTINGS_CATEGORY_IDS.some((id) => canViewSettingsCategoryById(user, id));
}

export function canAccessAnySettings(user: DocugridUser | null): boolean {
  return canAccessFirmSettings(user) || canAccessDevConsole(user);
}

export function visibleFirmSettingsCategories(user: DocugridUser | null): SettingsCategoryId[] {
  return FIRM_SETTINGS_CATEGORY_IDS.filter((id) => canViewSettingsCategoryById(user, id));
}

export function visibleDevSettingsCategories(user: DocugridUser | null): SettingsCategoryId[] {
  return DEV_SETTINGS_CATEGORY_IDS.filter((id) => canViewSettingsCategoryById(user, id));
}

export function resolveSettingsConsole(
  user: DocugridUser | null,
  consoleParam: string | null,
): SettingsConsole {
  if (consoleParam === "dev" && canAccessDevConsole(user)) return "dev";
  return "firm";
}

export function settingsHref(console: SettingsConsole, tab?: SettingsCategoryId): string {
  const base = console === "dev" ? "/settings?console=dev" : "/settings";
  if (!tab) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}tab=${tab}`;
}
