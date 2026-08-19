import { create } from "zustand";
import {
  DEFAULT_PERM_CRM_TAB,
  type PermCrmTabId,
} from "@/features/crm/perm-crm-tabs";

type PermCrmUiState = {
  tab: PermCrmTabId;
  setTab: (tab: PermCrmTabId) => void;
  reset: () => void;
};

export const usePermCrmUiStore = create<PermCrmUiState>((set) => ({
  tab: DEFAULT_PERM_CRM_TAB,
  setTab: (tab) => set({ tab }),
  reset: () => set({ tab: DEFAULT_PERM_CRM_TAB }),
}));
