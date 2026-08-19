import { useCallback, useMemo } from "react";
import type { MatrixPeriodContentProps } from "@/features/matrix/MatrixPeriodContent";
import type { useSlotClassify } from "@/features/matrix/hooks/useSlotClassify";
import type { useMatrixSlotLayout } from "@/features/matrix/hooks/useMatrixSlotLayout";
import type { useMatrixClientStatus } from "@/features/matrix/hooks/useMatrixClientStatus";
import type { DocumentStatusSummary } from "@/features/docugrid/lib/document-status";
import type { ExtractionReviewPayload } from "@/features/client-data/lib/extraction-api";
import type { MatrixViewMode } from "@/lib/matrix-view-mode";
import type { PeriodLists, YearDrumMeta } from "@/lib/fiscal-year-drum";
import type { NavClient } from "@/lib/client-nav";
import type { SlotDoc } from "@/features/matrix/types/slot-doc";

type ClassifyApi = ReturnType<typeof useSlotClassify>;
type SlotLayoutApi = ReturnType<typeof useMatrixSlotLayout>;
type RelatedClients = { id: string; name: string; relation: string }[];

export type UseMatrixPeriodContentPropsInput = {
  matrixViewMode: MatrixViewMode;
  activePeriodIdx: number;
  periodKey: string;
  activeMode: "year" | "month";
  currentClient: NavClient;
  docHistoryItems: MatrixPeriodContentProps["docHistoryItems"];
  docHistoryLoading: boolean;
  activeDocCategoryLabel?: string;
  oldArchiveItems: MatrixPeriodContentProps["oldArchiveItems"];
  oldArchiveLoading: boolean;
  matrixPeriods: PeriodLists;
  yearDrumMeta: YearDrumMeta;
  extractionReviewCtx: {
    periodKey: string;
    slotId: string;
    slotLabel: string;
    review: ExtractionReviewPayload;
  } | null;
  setExtractionReviewCtx: React.Dispatch<
    React.SetStateAction<{
      periodKey: string;
      slotId: string;
      slotLabel: string;
      review: ExtractionReviewPayload;
    } | null>
  >;
  setStatusNonce: React.Dispatch<React.SetStateAction<number>>;
  slotLayout: SlotLayoutApi;
  canUploadDocument: boolean;
  canPurgeDocument: boolean;
  canShareWithClient: boolean;
  canViewDocument: boolean;
  canApproveAudit: boolean;
  slotDocs: Record<string, SlotDoc>;
  slotNotice: string | null;
  setSlotNotice: React.Dispatch<React.SetStateAction<string | null>>;
  handleClearSlot: (slotIndex: number) => void;
  handleRemoveSlot: (slotIndex: number) => void;
  handleAddCustomSlot: (label: string) => void;
  handleAddPresetSlots: (presetIds: string[]) => void;
  unassignedDocsView: { docId: string; label: string; fileName: string }[];
  handleOpenUnassigned: (docId: string) => void;
  handleAssignUnassigned: (docId: string, slotIndex: number) => void;
  handleSoftDeleteDocument: (docId: string) => void;
  deletedDocsView: { docId: string; label: string; fileName: string }[];
  handleOpenDeleted: (docId: string) => void;
  handleRestoreDocument: (docId: string) => void;
  handlePurgeDocument: (docId: string) => void;
  progressPercent: number;
  onOpenSlot: (slotIndex: number, mode: "preview" | "edit") => void;
  onOpenSlotForAudit: (slotIndex: number) => void;
  relatedClients: RelatedClients;
  onSelectRelatedClient: (clientId: string) => void;
  classify: ClassifyApi;
  docStatus: DocumentStatusSummary | null;
  onJumpToPeriod: (periodKey: string) => void;
  saveDocugridNow?: () => Promise<string | undefined>;
  onPdfExported: () => void;
  timelineEvents: ReturnType<typeof useMatrixClientStatus>["timelineEvents"];
  timelineLoading: boolean;
  onAssignPackageToSlot: (file: File, slotId: string, label: string) => Promise<void>;
  persistFileToSlot: (
    file: File,
    slotIndex: number,
    slotLabel: string,
    activate: boolean,
    classifyMeta?: import("@/features/docugrid/lib/classify").ClassifyPersistMetadata,
  ) => Promise<{ persisted: boolean }>;
};

export function useMatrixPeriodContentProps(
  input: UseMatrixPeriodContentPropsInput,
): MatrixPeriodContentProps {
  const {
    matrixViewMode,
    activePeriodIdx,
    periodKey,
    activeMode,
    currentClient,
    docHistoryItems,
    docHistoryLoading,
    activeDocCategoryLabel,
    oldArchiveItems,
    oldArchiveLoading,
    matrixPeriods,
    yearDrumMeta,
    extractionReviewCtx,
    setExtractionReviewCtx,
    setStatusNonce,
    slotLayout,
    canUploadDocument,
    canPurgeDocument,
    canShareWithClient,
    canViewDocument,
    canApproveAudit,
    slotDocs,
    slotNotice,
    setSlotNotice,
    handleClearSlot,
    handleRemoveSlot,
    handleAddCustomSlot,
    handleAddPresetSlots,
    unassignedDocsView,
    handleOpenUnassigned,
    handleAssignUnassigned,
    handleSoftDeleteDocument,
    deletedDocsView,
    handleOpenDeleted,
    handleRestoreDocument,
    handlePurgeDocument,
    progressPercent,
    onOpenSlot,
    onOpenSlotForAudit,
    relatedClients,
    onSelectRelatedClient,
    classify,
    docStatus,
    onJumpToPeriod,
    saveDocugridNow,
    onPdfExported,
    timelineEvents,
    timelineLoading,
    onAssignPackageToSlot,
    persistFileToSlot,
  } = input;

  const onDismissExtractionReview = useCallback(
    () => setExtractionReviewCtx(null),
    [setExtractionReviewCtx],
  );

  const onExtractionApplied = useCallback(() => {
    setExtractionReviewCtx(null);
    setStatusNonce((v) => v + 1);
  }, [setExtractionReviewCtx, setStatusNonce]);

  const onDeleteUnassigned = useMemo(
    () =>
      canUploadDocument
        ? (docId: string) => {
            const ok = window.confirm(
              "この未割当資料を削除します。所長のみ削除済み一覧から閲覧・復元できます。よろしいですか？",
            );
            if (ok) void handleSoftDeleteDocument(docId);
          }
        : undefined,
    [canUploadDocument, handleSoftDeleteDocument],
  );

  const onRestoreDeleted = useMemo(
    () =>
      canPurgeDocument
        ? (docId: string) => {
            const ok = window.confirm("この資料を元の枠に復元しますか？");
            if (ok) void handleRestoreDocument(docId);
          }
        : undefined,
    [canPurgeDocument, handleRestoreDocument],
  );

  const onPurgeDeleted = useMemo(
    () =>
      canPurgeDocument
        ? (docId: string) => {
            const ok = window.confirm(
              "完全削除します。PDF は表示できなくなりますが、誰がいつ削除したかの記録は残ります（元のファイル名は記録しません）。よろしいですか？",
            );
            if (ok) void handlePurgeDocument(docId);
          }
        : undefined,
    [canPurgeDocument, handlePurgeDocument],
  );

  const onDismissSlotNotice = useCallback(() => setSlotNotice(null), [setSlotNotice]);

  const onAuthoringSave = useCallback(
    async (f: File, slotIndex: number, slotLabel: string) =>
      persistFileToSlot(f, slotIndex, slotLabel, false),
    [persistFileToSlot],
  );

  return {
    matrixViewMode,
    activePeriodIdx,
    periodKey,
    activeMode,
    currentClient,
    docHistoryItems,
    docHistoryLoading,
    activeDocCategoryLabel,
    oldArchiveItems,
    oldArchiveLoading,
    matrixPeriods,
    yearDrumMeta,
    extractionReviewCtx,
    onDismissExtractionReview,
    onExtractionApplied,
    slotLabels: slotLayout.slotLabels,
    displayOrder: slotLayout.slotDisplayOrder,
    layoutSlotIds: slotLayout.layoutSlotIds,
    onSlotLayoutChange: slotLayout.applySlotLayout,
    onClearSlot: handleClearSlot,
    onRemoveSlot: handleRemoveSlot,
    onAddCustomSlot: handleAddCustomSlot,
    onAddPresetSlots: handleAddPresetSlots,
    unassignedDocsView,
    onOpenUnassigned: handleOpenUnassigned,
    onAssignUnassigned: handleAssignUnassigned,
    onDeleteUnassigned,
    deletedDocsView: canPurgeDocument ? deletedDocsView : undefined,
    onOpenDeleted: canPurgeDocument ? handleOpenDeleted : undefined,
    onRestoreDeleted,
    onPurgeDeleted,
    slotDocs,
    slotKeyFor: slotLayout.slotKeyFor,
    progressPercent,
    onFilesDroppedToSlot: classify.onFilesDroppedToSlot,
    onOpenSlot,
    onOpenSlotForAudit,
    canApproveAudit,
    slotNotice,
    onDismissSlotNotice,
    relatedClients,
    onSelectRelatedClient,
    canUpload: canUploadDocument,
    canShareWithClient,
    canView: canViewDocument,
    onAutoSortFiles: classify.onAutoSortFiles,
    isClassifying: classify.isClassifying,
    classifyHint: classify.classifyHint,
    pendingReview: classify.pendingReviewView,
    onConfirmPending: classify.onConfirmPending,
    onDismissPending: classify.onDismissPending,
    onOpenPendingPdf: classify.onOpenPendingPdf,
    docStatus,
    currentPeriodKey: periodKey,
    onJumpToPeriod,
    onSaveDocugridNow: saveDocugridNow,
    onPdfExported,
    layoutEditScope: slotLayout.layoutEditScope,
    onLayoutEditScopeChange: slotLayout.setLayoutEditScope,
    selectedLayoutClientIds: slotLayout.selectedLayoutClientIds,
    onSelectedLayoutClientIdsChange: slotLayout.setSelectedLayoutClientIds,
    layoutScopeStaffClients: slotLayout.layoutScopeStaffClients,
    timelineEvents,
    timelineLoading,
    onAssignPackageToSlot,
    onPackageNotice: setSlotNotice,
    onAuthoringSave,
  };
}
