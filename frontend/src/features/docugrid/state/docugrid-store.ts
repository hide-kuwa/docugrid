import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type { FileEntity, HighlightEntity, PageEntity } from "../schema/entities";
import type { DocugridNormalizedState } from "../schema/normalized-state";
import type { FileId, HighlightId, PageId } from "../schema/ids";
import type { SyncStatus } from "../schema/sync";

export const initialDocugridState: DocugridNormalizedState = {
  filesById: {},
  pagesById: {},
  highlightsById: {},
  pageOrder: [],
  fileOrder: [],
  highlightIdsByPageId: {},
  localFilesById: {},
  sessionSyncStatus: "idle",
  lastSyncError: undefined,
  persistedDocumentId: null,
};

function markFileSync(draft: DocugridNormalizedState, fileId: FileId, status: SyncStatus) {
  const f = draft.filesById[fileId];
  if (f) {
    f.syncStatus = status;
  }
}

export type DocugridHydratePayload = {
  documentId: string;
  filesById: Record<FileId, FileEntity>;
  pagesById: Record<PageId, PageEntity>;
  highlightsById: Record<string, HighlightEntity>;
  pageOrder: PageId[];
  fileOrder: FileId[];
  highlightIdsByPageId: Record<PageId, HighlightId[]>;
};

type DocugridActions = {
  resetDocugrid: () => void;
  addFile: (file: FileEntity, pages: PageEntity[], localFile?: File) => void;
  reorderPages: (activeId: PageId, overId: PageId) => void;
  addHighlight: (pageId: PageId, highlight: HighlightEntity) => void;
  setFileSyncStatus: (fileId: FileId, status: SyncStatus) => void;
  setSessionSyncStatus: (status: SyncStatus, errorMessage?: string) => void;
  /** GET /api/docugrid/load の応答でストアを上書き（localFilesById は維持しない） */
  hydrateFromServer: (data: DocugridHydratePayload) => void;
  /** POST /api/docugrid/save 成功後: リモート ID を覚え、セッション・全ファイルを saved に */
  markRemotePersisted: (documentId: string) => void;
  /** ビューア並べ替え UI: 指定スロットのページを pageOrder から除去 */
  removePageSlotsAtIndices: (slotIndices: number[]) => void;
  /** ビューア並べ替え UI: 選択スロットだけ pageOrder を残す */
  keepOnlyPageSlotsAtIndices: (slotIndices: number[]) => void;
};

export type DocugridStore = DocugridNormalizedState & DocugridActions;

function movePageIdInPlace(order: PageId[], activeId: PageId, overId: PageId): void {
  if (activeId === overId) return;
  const oldIndex = order.indexOf(activeId);
  const newIndex = order.indexOf(overId);
  if (oldIndex === -1 || newIndex === -1) return;
  const [removed] = order.splice(oldIndex, 1);
  order.splice(newIndex, 0, removed);
}

export const useDocugridStore = create<DocugridStore>()(
  immer((set) => ({
    ...initialDocugridState,

    resetDocugrid: () => {
      set(() => ({ ...initialDocugridState }));
    },

    hydrateFromServer: (data: DocugridHydratePayload) => {
      set((draft) => {
        draft.persistedDocumentId = data.documentId;
        draft.filesById = { ...data.filesById };
        draft.pagesById = { ...data.pagesById };
        draft.highlightsById = { ...data.highlightsById };
        draft.pageOrder = [...data.pageOrder];
        draft.fileOrder = [...data.fileOrder];
        draft.highlightIdsByPageId = { ...data.highlightIdsByPageId };
        draft.localFilesById = {};
        for (const f of Object.values(draft.filesById)) {
          f.syncStatus = f.syncStatus ?? "saved";
        }
        draft.sessionSyncStatus = "saved";
        draft.lastSyncError = undefined;
      });
    },

    markRemotePersisted: (documentId: string) => {
      set((draft) => {
        draft.persistedDocumentId = documentId;
        for (const fid of Object.keys(draft.filesById)) {
          markFileSync(draft, fid as FileId, "saved");
        }
        draft.sessionSyncStatus = "saved";
        draft.lastSyncError = undefined;
      });
    },

    removePageSlotsAtIndices: (slotIndices: number[]) => {
      set((draft) => {
        const sorted = [...new Set(slotIndices)].sort((a, b) => b - a);
        const touched = new Set<FileId>();
        for (const i of sorted) {
          if (i < 0 || i >= draft.pageOrder.length) continue;
          const pid = draft.pageOrder[i];
          const p = draft.pagesById[pid];
          if (p) touched.add(p.fileId);
          draft.pageOrder.splice(i, 1);
        }
        for (const fid of touched) {
          markFileSync(draft, fid, "dirty");
        }
        draft.sessionSyncStatus = "dirty";
        draft.lastSyncError = undefined;
      });
    },

    keepOnlyPageSlotsAtIndices: (slotIndices: number[]) => {
      set((draft) => {
        const keep = new Set(slotIndices);
        const touched = new Set<FileId>();
        draft.pageOrder = draft.pageOrder.filter((pid, i) => {
          if (keep.has(i)) {
            const p = draft.pagesById[pid];
            if (p) touched.add(p.fileId);
            return true;
          }
          return false;
        });
        for (const fid of touched) {
          markFileSync(draft, fid, "dirty");
        }
        draft.sessionSyncStatus = "dirty";
        draft.lastSyncError = undefined;
      });
    },

    addFile: (file: FileEntity, pages: PageEntity[], localFile?: File) => {
      set((draft) => {
        const nextFile: FileEntity = {
          ...file,
          syncStatus: file.syncStatus ?? "dirty",
        };
        draft.filesById[nextFile.id] = nextFile;
        if (localFile) {
          draft.localFilesById[nextFile.id] = localFile;
        }
        for (const p of pages) {
          draft.pagesById[p.id] = p;
          if (!draft.highlightIdsByPageId[p.id]) {
            draft.highlightIdsByPageId[p.id] = [];
          }
        }
        if (!draft.fileOrder.includes(nextFile.id)) {
          draft.fileOrder.push(nextFile.id);
        }
        for (const p of pages) {
          if (!draft.pageOrder.includes(p.id)) {
            draft.pageOrder.push(p.id);
          }
        }
        draft.sessionSyncStatus = "dirty";
        draft.lastSyncError = undefined;
      });
    },

    reorderPages: (activeId: PageId, overId: PageId) => {
      set((draft) => {
        movePageIdInPlace(draft.pageOrder, activeId, overId);
        const pa = draft.pagesById[activeId];
        const pb = draft.pagesById[overId];
        if (pa) markFileSync(draft, pa.fileId, "dirty");
        if (pb) markFileSync(draft, pb.fileId, "dirty");
        draft.sessionSyncStatus = "dirty";
        draft.lastSyncError = undefined;
      });
    },

    addHighlight: (pageId: PageId, highlight: HighlightEntity) => {
      set((draft) => {
        const page = draft.pagesById[pageId];
        if (!page) {
          return;
        }
        const merged: HighlightEntity = { ...highlight, pageId };
        draft.highlightsById[merged.id] = merged;
        if (!draft.highlightIdsByPageId[pageId]) {
          draft.highlightIdsByPageId[pageId] = [];
        }
        const list = draft.highlightIdsByPageId[pageId]!;
        if (!list.includes(merged.id)) {
          list.push(merged.id);
        }
        markFileSync(draft, page.fileId, "dirty");
        draft.sessionSyncStatus = "dirty";
        draft.lastSyncError = undefined;
      });
    },

    setFileSyncStatus: (fileId: FileId, status: SyncStatus) => {
      set((draft) => {
        markFileSync(draft, fileId, status);
      });
    },

    setSessionSyncStatus: (status: SyncStatus, errorMessage?: string) => {
      set((draft) => {
        draft.sessionSyncStatus = status;
        draft.lastSyncError = errorMessage;
      });
    },
  })),
);
