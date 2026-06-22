import { create } from "zustand";

import type { ViewerMode } from "../types";

/** マトリクス「監査する」から開いたときの意図（消費後に null に戻す） */
export type ViewerOpenIntent = "audit-check" | "audit-start" | "audit-continue";

type ViewerUiState = {
  isOpen: boolean;
  mode: ViewerMode;
  sourceFile: File | null;
  openIntent: ViewerOpenIntent | null;
  open: (mode: ViewerMode, file: File, intent?: ViewerOpenIntent) => void;
  close: () => void;
  setMode: (mode: ViewerMode) => void;
  clearOpenIntent: () => void;
};

export const useViewerUiStore = create<ViewerUiState>((set) => ({
  isOpen: false,
  mode: "preview",
  sourceFile: null,
  openIntent: null,
  open: (mode, file, intent) =>
    set({ isOpen: true, mode, sourceFile: file, openIntent: intent ?? null }),
  close: () => set({ isOpen: false, mode: "preview", openIntent: null }),
  setMode: (mode) => set({ mode }),
  clearOpenIntent: () => set({ openIntent: null }),
}));
