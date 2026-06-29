import { useMemo } from "react";
import { useKeyboardShortcuts, type KeyboardShortcutBinding } from "@/hooks/useKeyboardShortcuts";
import type { ToolType } from "../types";

type Args = {
  enabled: boolean;
  isReadOnly: boolean;
  canAnnotate: boolean;
  isLoading: boolean;
  isHistoryOpen: boolean;
  setIsHistoryOpen: (open: boolean) => void;
  isReordering: boolean;
  setIsReordering: (open: boolean) => void;
  isSplitView: boolean;
  setIsSplitView: (open: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  undoPageOrder: () => void;
  redoPageOrder: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  goPrevPage: () => void;
  goNextPage: () => void;
  goFirstPage: () => void;
  goLastPage: () => void;
  pageCountSafe: number;
  selectedSlots: number[];
  selectAllSlots: () => void;
  removeSelectedSlots: () => void;
  setActiveTool: (tool: ToolType) => void;
  handleWorkSave: () => void;
  onClose: () => void;
};

export function useViewerKeyboardShortcuts({
  enabled,
  isReadOnly,
  canAnnotate,
  isLoading,
  isHistoryOpen,
  setIsHistoryOpen,
  isReordering,
  setIsReordering,
  isSplitView,
  setIsSplitView,
  canUndo,
  canRedo,
  undoPageOrder,
  redoPageOrder,
  canGoPrev,
  canGoNext,
  goPrevPage,
  goNextPage,
  goFirstPage,
  goLastPage,
  pageCountSafe,
  selectedSlots,
  selectAllSlots,
  removeSelectedSlots,
  setActiveTool,
  handleWorkSave,
  onClose,
}: Args): void {
  const bindings = useMemo((): KeyboardShortcutBinding[] => {
    const canEdit = canAnnotate && !isReadOnly && !isLoading;
    const canNavigate = !isLoading && pageCountSafe > 0;

    return [
      {
        id: "escape",
        key: "Escape",
        handler: () => {
          if (isHistoryOpen) {
            setIsHistoryOpen(false);
            return;
          }
          if (isReordering) {
            setIsReordering(false);
            return;
          }
          if (isSplitView) {
            setIsSplitView(false);
            return;
          }
          onClose();
        },
      },
      {
        id: "save",
        key: "s",
        mod: true,
        when: () => canEdit && !isReordering,
        handler: handleWorkSave,
      },
      {
        id: "undo",
        key: "z",
        mod: true,
        when: () => isReordering && canUndo,
        handler: undoPageOrder,
      },
      {
        id: "redo",
        key: "z",
        mod: true,
        shift: true,
        when: () => isReordering && canRedo,
        handler: redoPageOrder,
      },
      {
        id: "redo-alt",
        key: "y",
        mod: true,
        when: () => isReordering && canRedo,
        handler: redoPageOrder,
      },
      {
        id: "prev-page",
        key: "ArrowLeft",
        when: () => canNavigate && !isReordering && canGoPrev,
        handler: goPrevPage,
      },
      {
        id: "prev-page-up",
        key: "PageUp",
        when: () => canNavigate && !isReordering && canGoPrev,
        handler: goPrevPage,
      },
      {
        id: "next-page",
        key: "ArrowRight",
        when: () => canNavigate && !isReordering && canGoNext,
        handler: goNextPage,
      },
      {
        id: "next-page-down",
        key: "PageDown",
        when: () => canNavigate && !isReordering && canGoNext,
        handler: goNextPage,
      },
      {
        id: "first-page",
        key: "Home",
        when: () => canNavigate && !isReordering,
        handler: goFirstPage,
      },
      {
        id: "last-page",
        key: "End",
        when: () => canNavigate && !isReordering,
        handler: goLastPage,
      },
      {
        id: "history",
        key: "h",
        mod: true,
        handler: () => setIsHistoryOpen(!isHistoryOpen),
      },
      {
        id: "reorder-mode",
        key: "o",
        mod: true,
        shift: true,
        when: () => canEdit,
        handler: () => setIsReordering(!isReordering),
      },
      {
        id: "split-view",
        key: "2",
        mod: true,
        shift: true,
        when: () => canAnnotate && !isReadOnly,
        handler: () => setIsSplitView(!isSplitView),
      },
      {
        id: "close",
        key: "w",
        mod: true,
        handler: onClose,
      },
      {
        id: "select-all",
        key: "a",
        mod: true,
        when: () => isReordering && pageCountSafe > 0,
        handler: selectAllSlots,
      },
      {
        id: "delete-selected",
        key: "Delete",
        when: () => isReordering && selectedSlots.length > 0,
        handler: removeSelectedSlots,
      },
      {
        id: "delete-selected-backspace",
        key: "Backspace",
        when: () => isReordering && selectedSlots.length > 0,
        handler: removeSelectedSlots,
      },
      {
        id: "tool-none-v",
        key: "v",
        when: () => canEdit && !isReordering,
        handler: () => setActiveTool("none"),
      },
      {
        id: "tool-none-0",
        key: "0",
        when: () => canEdit && !isReordering,
        handler: () => setActiveTool("none"),
      },
      {
        id: "tool-marker",
        key: "m",
        when: () => canEdit && !isReordering,
        handler: () => setActiveTool("marker"),
      },
      {
        id: "tool-box",
        key: "b",
        when: () => canEdit && !isReordering,
        handler: () => setActiveTool("box"),
      },
      {
        id: "tool-line",
        key: "l",
        when: () => canEdit && !isReordering,
        handler: () => setActiveTool("line"),
      },
      {
        id: "tool-check",
        key: "k",
        when: () => canEdit && !isReordering,
        handler: () => setActiveTool("check"),
      },
      {
        id: "tool-eraser",
        key: "e",
        when: () => canEdit && !isReordering,
        handler: () => setActiveTool("eraser"),
      },
    ];
  }, [
    isReadOnly,
    canAnnotate,
    isLoading,
    isHistoryOpen,
    setIsHistoryOpen,
    isReordering,
    setIsReordering,
    isSplitView,
    setIsSplitView,
    canUndo,
    canRedo,
    undoPageOrder,
    redoPageOrder,
    canGoPrev,
    canGoNext,
    goPrevPage,
    goNextPage,
    goFirstPage,
    goLastPage,
    pageCountSafe,
    selectedSlots.length,
    selectAllSlots,
    removeSelectedSlots,
    setActiveTool,
    handleWorkSave,
    onClose,
  ]);

  useKeyboardShortcuts(bindings, enabled);
}
