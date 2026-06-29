import type { SettingsCategoryId, SettingsConsole } from "@/lib/app-surface";

export type SettingsCategoryGroup = {
  title: string;
  ids: SettingsCategoryId[];
};

export const SETTINGS_CATEGORY_GROUPS: Record<SettingsConsole, SettingsCategoryGroup[]> = {
  firm: [
    { title: "マスタ", ids: ["clients", "clientProfile", "stakeholders"] },
    { title: "業務", ids: ["templates", "reviewChecklist", "shortcuts"] },
    { title: "表示", ids: ["appearance"] },
    { title: "課金・履歴", ids: ["billing", "audit"] },
    { title: "連携", ids: ["mcp"] },
  ],
  dev: [
    { title: "権限・書類", ids: ["roles", "documents"] },
    { title: "設計・インフラ", ids: ["screens", "integrations"] },
  ],
};

export function groupedSettingsCategories(
  console: SettingsConsole,
  allowedIds: SettingsCategoryId[],
): SettingsCategoryGroup[] {
  const allowed = new Set(allowedIds);
  return SETTINGS_CATEGORY_GROUPS[console]
    .map((group) => ({
      ...group,
      ids: group.ids.filter((id) => allowed.has(id)),
    }))
    .filter((group) => group.ids.length > 0);
}
