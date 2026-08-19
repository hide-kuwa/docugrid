"use client";

import ViewerModal from "@/features/pdf-viewer";
import { useViewerUiStore } from "@/features/pdf-viewer/state/viewer-ui-store";
import type { UploadStatus } from "@/features/pdf-viewer/types";
import type { ClassifyPersistMetadata } from "@/features/docugrid/lib/classify";
import type { OrgClient } from "@/config/organization";

type MatrixViewerHostProps = {
  isOpen: boolean;
  onClose: () => void;
  viewerMode: "preview" | "edit";
  file: File;
  pdfUrl: string | null;
  viewerSession: number;
  pageCount: number | null;
  uploadStatus: UploadStatus;
  isLoading: boolean;
  operationError: string | null;
  onDismissOperationError: () => void;
  canAnnotate: boolean;
  canApprove: boolean;
  syncWithDocugrid: boolean;
  slotIdentity?: { clientId: string; slotId: string; periodKey: string };
  slotLabel?: string;
  slotWorkflowStatus?: string;
  persistedDocId?: string;
  activeSlotKey: string | null;
  activeClientSharedAt: string | null;
  canUploadDocument: boolean;
  canPurgeDocument: boolean;
  canShareWithClient: boolean;
  classifyMeta: ClassifyPersistMetadata | null;
  clientProfile?: OrgClient["profile"];
  clientProfileMeta?: OrgClient["profileMeta"];
  historyRevision: number;
  onHighlight: Parameters<typeof ViewerModal>[0]["onHighlight"];
  onReorder: Parameters<typeof ViewerModal>[0]["onReorder"];
  onMerge: Parameters<typeof ViewerModal>[0]["onMerge"];
  onGetThumbnails: Parameters<typeof ViewerModal>[0]["onGetThumbnails"];
  onRenderPage: Parameters<typeof ViewerModal>[0]["onRenderPage"];
  onReplaceFile: Parameters<typeof ViewerModal>[0]["onReplaceFile"];
  onVersionCreated: Parameters<typeof ViewerModal>[0]["onVersionCreated"];
  onVersionDeleted: Parameters<typeof ViewerModal>[0]["onVersionDeleted"];
  onAuditStateChange: () => void;
  onSoftDeleteDocument: (docId: string) => void | Promise<void>;
  onPurgeDocument: (docId: string) => void | Promise<void>;
  onRestoreDocument: (docId: string) => void | Promise<void>;
  onShareWithClient: (docId: string) => void | Promise<void>;
  onUnshareWithClient: (docId: string) => void | Promise<void>;
};

export function MatrixViewerHost({
  isOpen,
  onClose,
  viewerMode,
  file,
  pdfUrl,
  viewerSession,
  pageCount,
  uploadStatus,
  isLoading,
  operationError,
  onDismissOperationError,
  canAnnotate,
  canApprove,
  syncWithDocugrid,
  slotIdentity,
  slotLabel,
  slotWorkflowStatus,
  persistedDocId,
  activeSlotKey,
  activeClientSharedAt,
  canUploadDocument,
  canPurgeDocument,
  canShareWithClient,
  classifyMeta,
  clientProfile,
  clientProfileMeta,
  historyRevision,
  onHighlight,
  onReorder,
  onMerge,
  onGetThumbnails,
  onRenderPage,
  onReplaceFile,
  onVersionCreated,
  onVersionDeleted,
  onAuditStateChange,
  onSoftDeleteDocument,
  onPurgeDocument,
  onRestoreDocument,
  onShareWithClient,
  onUnshareWithClient,
}: MatrixViewerHostProps) {
  if (!isOpen || !file) return null;

  return (
    <ViewerModal
      isOpen
      onClose={onClose}
      viewerMode={viewerMode}
      onViewerModeChange={(mode) => useViewerUiStore.getState().setMode(mode)}
      file={file}
      pdfUrl={pdfUrl}
      viewerSession={viewerSession}
      pageCount={pageCount}
      uploadStatus={uploadStatus}
      isLoading={isLoading}
      onHighlight={onHighlight}
      onReorder={onReorder}
      onMerge={onMerge}
      onGetThumbnails={onGetThumbnails}
      onRenderPage={onRenderPage}
      onReplaceFile={onReplaceFile}
      operationError={operationError}
      onDismissOperationError={onDismissOperationError}
      canAnnotate={canAnnotate}
      canApprove={canApprove}
      syncWithDocugrid={syncWithDocugrid}
      slotIdentity={slotIdentity}
      slotLabel={slotLabel}
      onVersionCreated={onVersionCreated}
      onVersionDeleted={onVersionDeleted}
      onAuditStateChange={onAuditStateChange}
      slotWorkflowStatus={slotWorkflowStatus}
      persistedDocId={persistedDocId}
      canSoftDeleteDocument={canUploadDocument && !activeSlotKey?.startsWith("deleted:")}
      canPurgeDocument={canPurgeDocument}
      onSoftDelete={
        persistedDocId
          ? () => {
              const ok = window.confirm(
                canPurgeDocument
                  ? "資料を削除します。削除済み一覧から閲覧・復元できます。よろしいですか？"
                  : "資料を削除します。よろしいですか？",
              );
              if (ok) void onSoftDeleteDocument(persistedDocId);
            }
          : undefined
      }
      onPurge={
        canPurgeDocument && persistedDocId
          ? () => {
              const ok = window.confirm(
                "完全削除します。PDF は表示できなくなりますが、削除の記録は残ります。よろしいですか？",
              );
              if (ok) void onPurgeDocument(persistedDocId);
            }
          : undefined
      }
      onRestore={
        canPurgeDocument && activeSlotKey?.startsWith("deleted:") && persistedDocId
          ? () => {
              const ok = window.confirm("この資料を元の枠に復元しますか？");
              if (ok) void onRestoreDocument(persistedDocId);
            }
          : undefined
      }
      canShareWithClient={
        canShareWithClient &&
        !!persistedDocId &&
        !activeClientSharedAt &&
        !activeSlotKey?.startsWith("deleted:")
      }
      clientSharedAt={activeClientSharedAt}
      onShareWithClient={
        canShareWithClient && persistedDocId && !activeClientSharedAt
          ? () => {
              const ok = window.confirm(
                "この資料をクライアントポータルで閲覧できるように共有します。クライアント側の提出状況にも反映されます。よろしいですか？",
              );
              if (ok) void onShareWithClient(persistedDocId);
            }
          : undefined
      }
      onUnshareWithClient={
        canShareWithClient && persistedDocId && activeClientSharedAt && !activeSlotKey?.startsWith("deleted:")
          ? () => {
              const ok = window.confirm(
                "クライアントポータルからこの資料を非表示にします。クライアントは閲覧できなくなります。よろしいですか？",
              );
              if (ok) void onUnshareWithClient(persistedDocId);
            }
          : undefined
      }
      historyRevision={historyRevision}
      classifyMeta={classifyMeta}
      clientProfile={clientProfile}
      clientProfileMeta={clientProfileMeta}
    />
  );
}
