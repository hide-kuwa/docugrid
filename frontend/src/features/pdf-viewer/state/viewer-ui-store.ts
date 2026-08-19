import { create } from "zustand";

import type { ViewerMode } from "../types";

/** マトリクス「監査する」から開いたときの意図（消費後に null に戻す） */
export type ViewerOpenIntent = "audit-check" | "audit-start" | "audit-continue";

/** PDF ワークスペースから開いたときの顧問先・枠の紐付け */
export type ViewerPdfWorkspaceBind = {
  fromPdfWorkspace: true;
  /** null = 顧問先なし（端末上のみ編集、サーバー保存しない） */
  clientId: string | null;
  periodKey?: string;
  slotId?: string;
  docId?: string;
  slotLabel?: string;
};

type ViewerUiState = {
  isOpen: boolean;
  mode: ViewerMode;
  /** 作業中 PDF。注釈後も更新し、戻る後も保持する */
  sourceFile: File | null;
  openIntent: ViewerOpenIntent | null;
  pdfWorkspaceBind: ViewerPdfWorkspaceBind | null;
  open: (
    mode: ViewerMode,
    file: File,
    intent?: ViewerOpenIntent,
    pdfWorkspaceBind?: ViewerPdfWorkspaceBind | null,
  ) => void;
  /** 注釈・並べ替え後に作業中ファイルを差し替える（ビューアは開いたまま） */
  setSourceFile: (file: File | null) => void;
  close: () => void;
  setMode: (mode: ViewerMode) => void;
  clearOpenIntent: () => void;
};

export const useViewerUiStore = create<ViewerUiState>((set) => ({
  isOpen: false,
  mode: "preview",
  sourceFile: null,
  openIntent: null,
  pdfWorkspaceBind: null,
  open: (mode, file, intent, pdfWorkspaceBind) =>
    set({
      isOpen: true,
      mode,
      sourceFile: file,
      openIntent: intent ?? null,
      pdfWorkspaceBind: pdfWorkspaceBind ?? null,
    }),
  setSourceFile: (file) => set({ sourceFile: file }),
  close: () =>
    set({
      isOpen: false,
      openIntent: null,
      // sourceFile / pdfWorkspaceBind / mode は作業下書きとして残す
    }),
  setMode: (mode) => set({ mode }),
  clearOpenIntent: () => set({ openIntent: null }),
}));

export const PDF_WORKSPACE_SLOT_ID = "pdf_workspace";
export const PDF_WORKSPACE_SLOT_LABEL = "PDF 作業";
