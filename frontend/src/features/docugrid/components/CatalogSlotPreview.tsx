"use client";

import { useCallback, useEffect, useState } from "react";
import ViewerModal from "@/features/pdf-viewer";
import { usePdfApiHandlers } from "@/features/pdf-viewer/hooks/usePdfApiHandlers";
import type { UploadStatus } from "@/features/pdf-viewer/types";
import {
  fetchSlotDocumentFile,
  type SlotDocumentItem,
} from "@/features/docugrid/lib/slot-documents";
import type { CatalogRow } from "@/features/docugrid/lib/document-catalog-api";

type Props = {
  row: CatalogRow | null;
  onClose: () => void;
};

function rowToSlotItem(row: CatalogRow): SlotDocumentItem {
  return {
    id: row.slot_document_id!,
    client_id: row.client_id,
    period_key: row.period_key,
    slot_id: row.category_id,
    slot_label: row.slot_label ?? null,
    original_name: row.original_name || `${row.slot_label || "document"}.pdf`,
    page_count: row.page_count ?? null,
    content_sha256: "",
    byte_size: 0,
    uploaded_by: null,
    uploaded_at: row.uploaded_at || "",
  };
}

export function CatalogSlotPreview({ row, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadStatus] = useState<UploadStatus>("idle");
  const [viewerSession, setViewerSession] = useState(0);

  const api = usePdfApiHandlers(file, row?.client_id);

  useEffect(() => {
    if (!row?.slot_document_id) {
      setFile(null);
      setPdfUrl(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const fetched = await fetchSlotDocumentFile(rowToSlotItem(row), controller.signal);
        setFile(fetched);
        setPdfUrl(URL.createObjectURL(fetched));
        setPageCount(row.page_count ?? null);
        setViewerSession((s) => s + 1);
      } catch {
        setFile(null);
        setPdfUrl(null);
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      controller.abort();
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [row]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!row?.slot_document_id) return null;

  return (
    <ViewerModal
      isOpen
      onClose={handleClose}
      viewerMode="preview"
      file={file}
      pdfUrl={pdfUrl}
      viewerSession={viewerSession}
      pageCount={pageCount}
      uploadStatus={uploadStatus}
      isLoading={loading}
      onHighlight={api.handleHighlight}
      onReorder={api.handleReorder}
      onMerge={api.handleMerge}
      onGetThumbnails={api.handleGetThumbnails}
      onRenderPage={api.handleRenderPage}
      canAnnotate={false}
      canApprove={false}
      slotIdentity={{
        clientId: row.client_id,
        periodKey: row.period_key,
        slotId: row.category_id,
      }}
      slotLabel={row.slot_label || row.client_name}
    />
  );
}
