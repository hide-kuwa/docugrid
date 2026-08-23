"use client";

import MatrixGrid from "@/components/MatrixGrid";
import { DocumentHistoryGrid } from "@/features/matrix/DocumentHistoryGrid";
import { OldYearArchiveGrid } from "@/features/matrix/OldYearArchiveGrid";
import { DocumentExtractionReview } from "@/features/client-data/components/DocumentExtractionReview";
import type { ExtractionReviewPayload } from "@/features/client-data/lib/extraction-api";
import type { DocumentStatusSummary } from "@/features/docugrid/lib/document-status";
import type { ReviewTimelineItem } from "@/features/pdf-viewer/lib/review-events";
import type { SlotDoc } from "@/features/matrix/types/slot-doc";
import type { NavClient } from "@/lib/client-nav";
import type { PeriodLists, YearDrumMeta } from "@/lib/fiscal-year-drum";
import { isOldPeriodKey } from "@/lib/fiscal-year-drum";
import { isDataPeriodIndex } from "@/lib/period-nav";
import type { SlotLayoutScope } from "@/lib/slot-layout-scope";
import type { MatrixViewMode } from "@/lib/matrix-view-mode";
import type { PendingReviewViewItem } from "@/features/matrix/hooks/useSlotClassify";

export type MatrixPeriodContentProps = {
  matrixViewMode: MatrixViewMode;
  activePeriodIdx: number;
  periodKey: string;
  activeMode: "year" | "month";
  currentClient: NavClient;
  docHistoryItems: Parameters<typeof DocumentHistoryGrid>[0]["items"];
  docHistoryLoading: boolean;
  activeDocCategoryLabel?: string;
  oldArchiveItems: Parameters<typeof OldYearArchiveGrid>[0]["items"];
  oldArchiveLoading: boolean;
  matrixPeriods: PeriodLists;
  yearDrumMeta: YearDrumMeta;
  extractionReviewCtx: {
    periodKey: string;
    slotId: string;
    slotLabel: string;
    review: ExtractionReviewPayload;
  } | null;
  onDismissExtractionReview: () => void;
  onExtractionApplied: () => void;
  slotLabels: string[];
  displayOrder: number[];
  layoutSlotIds: string[];
  onSlotLayoutChange: (layout: import("@/lib/slot-layout-storage").SlotLayout) => void;
  onClearSlot: (slotIndex: number) => void;
  onRemoveSlot: (slotIndex: number) => void;
  onAddCustomSlot: (label: string) => void;
  onAddPresetSlots: (presetIds: string[]) => void;
  unassignedDocsView: { docId: string; label: string; fileName: string }[];
  onOpenUnassigned: (docId: string) => void;
  onAssignUnassigned: (docId: string, slotIndex: number) => void;
  onDeleteUnassigned?: (docId: string) => void;
  deletedDocsView?: { docId: string; label: string; fileName: string }[];
  onOpenDeleted?: (docId: string) => void;
  onRestoreDeleted?: (docId: string) => void;
  onPurgeDeleted?: (docId: string) => void;
  slotDocs: Record<string, SlotDoc>;
  slotKeyFor: (index: number) => string;
  progressPercent: number;
  onFilesDroppedToSlot: (files: File[], slotIndex: number, slotLabel: string) => void;
  onOpenSlot: (slotIndex: number, mode: "preview" | "edit") => void;
  onOpenSlotForAudit?: (slotIndex: number) => void;
  canApproveAudit: boolean;
  slotNotice: string | null;
  onDismissSlotNotice: () => void;
  relatedClients: { id: string; name: string; relation: string }[];
  onSelectRelatedClient: (clientId: string) => void;
  canUpload: boolean;
  canShareWithClient: boolean;
  canView: boolean;
  onAutoSortFiles: (files: File[]) => void;
  isClassifying: boolean;
  classifyHint: string | null;
  pendingReview: PendingReviewViewItem[];
  onConfirmPending: (reviewId: string, slotIndex: number) => void;
  onDismissPending: (reviewId: string) => void;
  onOpenPendingPdf: (reviewId: string) => void;
  docStatus: DocumentStatusSummary | null;
  currentPeriodKey: string;
  onJumpToPeriod: (periodKey: string) => void;
  onSaveDocugridNow?: () => Promise<string | undefined>;
  onPdfExported: () => void;
  layoutEditScope: SlotLayoutScope;
  onLayoutEditScopeChange: (scope: SlotLayoutScope) => void;
  selectedLayoutClientIds: string[];
  onSelectedLayoutClientIdsChange: (ids: string[]) => void;
  layoutScopeStaffClients: { id: string; name: string }[];
  timelineEvents: ReviewTimelineItem[];
  timelineLoading: boolean;
  onAssignPackageToSlot: (file: File, slotId: string, label: string) => Promise<void>;
  onPackageNotice: (msg: string | null) => void;
  onAuthoringSave: (file: File, slotIndex: number, slotLabel: string) => Promise<{ persisted: boolean; docId?: string }>;
};

export function MatrixPeriodContent({
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
  ...gridProps
}: MatrixPeriodContentProps) {
  if (matrixViewMode === "document-client") {
    return (
      <DocumentHistoryGrid
        items={docHistoryItems}
        loading={docHistoryLoading}
        categoryLabel={activeDocCategoryLabel}
        clientName={currentClient.name}
        fiscalMonth={currentClient.fiscal}
        periodMode={activeMode}
        matrixPeriods={matrixPeriods}
        yearMeta={yearDrumMeta}
      />
    );
  }

  if (isOldPeriodKey(periodKey)) {
    return (
      <OldYearArchiveGrid
        items={oldArchiveItems}
        loading={oldArchiveLoading}
        clientName={currentClient.name}
        fiscalMonth={currentClient.fiscal}
        matrixPeriods={matrixPeriods}
        yearMeta={yearDrumMeta}
      />
    );
  }

  if (isDataPeriodIndex(activePeriodIdx)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
        <p className="text-sm font-bold text-slate-700">永続へ切り替えています…</p>
        <p className="max-w-sm text-xs text-slate-500">
          顧問先データはレールの <strong>カルテ</strong> から開きます。
        </p>
      </div>
    );
  }

  return (
    <>
      {extractionReviewCtx ? (
        <div className="shrink-0 border-b border-violet-100 bg-white px-4 py-3 md:px-6">
          <DocumentExtractionReview
            clientId={currentClient.id}
            periodKey={extractionReviewCtx.periodKey}
            slotId={extractionReviewCtx.slotId}
            slotLabel={extractionReviewCtx.slotLabel}
            review={extractionReviewCtx.review}
            onDismiss={onDismissExtractionReview}
            onApplied={onExtractionApplied}
          />
        </div>
      ) : null}
      <MatrixGrid
        currentClient={currentClient}
        activePeriodIdx={activePeriodIdx}
        activeMode={activeMode}
        {...gridProps}
        matrixPeriods={matrixPeriods}
      />
    </>
  );
}
