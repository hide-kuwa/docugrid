export type SlotTagsVisibility = "hover" | "always";

const STORAGE_KEY = "docugrid.gridSlotTagsVisibility";

export const GRID_DISPLAY_PREFERENCES_CHANGED = "docugrid:grid-display-preferences-changed";

export function loadGridSlotTagsVisibility(): SlotTagsVisibility {
  if (typeof window === "undefined") return "hover";
  return localStorage.getItem(STORAGE_KEY) === "always" ? "always" : "hover";
}

export function saveGridSlotTagsVisibility(mode: SlotTagsVisibility): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent(GRID_DISPLAY_PREFERENCES_CHANGED, { detail: mode }));
}
