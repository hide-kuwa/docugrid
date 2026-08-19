"use client";

import { useCallback, useMemo } from "react";
import {
  PDF_WORKSPACE_SLOT_ID,
  PDF_WORKSPACE_SLOT_LABEL,
  useViewerUiStore,
} from "@/features/pdf-viewer/state/viewer-ui-store";
import type { ClassifyPersistMetadata } from "@/features/docugrid/lib/classify";
import { slotIndexFromSlotKey } from "@/lib/slot-ids";
import type { DeletedSlotDoc, SlotDoc, UnassignedSlotDoc } from "@/features/matrix/types/slot-doc";

type PdfWorkspaceBind = ReturnType<typeof useViewerUiStore.getState>["pdfWorkspaceBind"];

type UseMatrixActiveSlotMetaParams = {
  activeSlotKey: string | null;
  setActiveSlotKey: (key: string | null) => void;
  periodKey: string;
  slotLabels: string[];
  slotDocs: Record<string, SlotDoc>;
  unassignedDocs: Record<string, UnassignedSlotDoc>;
  deletedDocs: Record<string, DeletedSlotDoc>;
  currentClientId: string;
  pdfWorkspaceBind: PdfWorkspaceBind;
  setSlotDocs: React.Dispatch<React.SetStateAction<Record<string, SlotDoc>>>;
  setFile: (file: File | null) => void;
  assignPreviewFromFile: (source: File) => void;
  setPdfUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setViewerSession: React.Dispatch<React.SetStateAction<number>>;
  setStatusNonce: React.Dispatch<React.SetStateAction<number>>;
};

export function useMatrixActiveSlotMeta({
  activeSlotKey,
  setActiveSlotKey,
  periodKey,
  slotLabels,
  slotDocs,
  unassignedDocs,
  deletedDocs,
  currentClientId,
  pdfWorkspaceBind,
  setSlotDocs,
  setFile,
  assignPreviewFromFile,
  setPdfUrl,
  setViewerSession,
  setStatusNonce,
}: UseMatrixActiveSlotMetaParams) {
  const slotIdentity = useMemo(() => {
    if (!activeSlotKey) return undefined;
    if (activeSlotKey.startsWith("unassigned:")) {
      const docId = activeSlotKey.split(":")[1];
      const doc = unassignedDocs[docId];
      if (!doc || !currentClientId || currentClientId === "unknown") return undefined;
      return { clientId: currentClientId, slotId: doc.slotId, periodKey };
    }
    if (activeSlotKey.startsWith("deleted:")) {
      const docId = activeSlotKey.split(":")[1];
      const doc = deletedDocs[docId];
      if (!doc || !currentClientId || currentClientId === "unknown") return undefined;
      return { clientId: currentClientId, slotId: doc.slotId, periodKey };
    }
    const parts = activeSlotKey.split(":");
    if (parts.length < 3) return undefined;
    return {
      clientId: parts[0],
      slotId: parts[parts.length - 1],
      periodKey: parts.slice(1, -1).join(":"),
    };
  }, [activeSlotKey, currentClientId, deletedDocs, periodKey, unassignedDocs]);

  const activeClassifyMeta = useMemo((): ClassifyPersistMetadata | null => {
    if (!activeSlotKey) return null;
    if (activeSlotKey.startsWith("unassigned:")) {
      const docId = activeSlotKey.split(":")[1];
      return unassignedDocs[docId]?.classifyMeta ?? null;
    }
    if (activeSlotKey.startsWith("deleted:")) {
      const docId = activeSlotKey.split(":")[1];
      return deletedDocs[docId]?.classifyMeta ?? null;
    }
    return slotDocs[activeSlotKey]?.classifyMeta ?? null;
  }, [activeSlotKey, deletedDocs, slotDocs, unassignedDocs]);

  const activeSlotLabel = useMemo(() => {
    if (!activeSlotKey) return undefined;
    if (pdfWorkspaceBind?.slotLabel && pdfWorkspaceBind.fromPdfWorkspace) {
      return pdfWorkspaceBind.slotLabel;
    }
    const slotId = activeSlotKey.split(":").pop();
    if (slotId === PDF_WORKSPACE_SLOT_ID) return PDF_WORKSPACE_SLOT_LABEL;
    const idx = slotIndexFromSlotKey(activeSlotKey, periodKey);
    return idx !== null && idx >= 0 ? slotLabels[idx] : undefined;
  }, [activeSlotKey, periodKey, slotLabels, pdfWorkspaceBind]);

  const activePersistedDocId = useMemo(() => {
    if (!activeSlotKey) return undefined;
    if (activeSlotKey.startsWith("unassigned:") || activeSlotKey.startsWith("deleted:")) {
      return activeSlotKey.split(":")[1];
    }
    return slotDocs[activeSlotKey]?.docId;
  }, [activeSlotKey, slotDocs]);

  const activeClientSharedAt = useMemo(() => {
    if (!activeSlotKey) return null;
    if (activeSlotKey.startsWith("unassigned:")) {
      const docId = activeSlotKey.split(":")[1];
      return unassignedDocs[docId]?.clientSharedAt ?? null;
    }
    if (activeSlotKey.startsWith("deleted:")) {
      const docId = activeSlotKey.split(":")[1];
      return deletedDocs[docId]?.clientSharedAt ?? null;
    }
    return slotDocs[activeSlotKey]?.clientSharedAt ?? null;
  }, [activeSlotKey, slotDocs, unassignedDocs, deletedDocs]);

  const activeSlotWorkflowStatus = activeSlotKey
    ? slotDocs[activeSlotKey]?.workflowStatus
    : undefined;

  const onVersionCreated = useCallback(
    (meta: {
      versionId: string;
      versionLabel: string;
      logicalDocumentId?: string;
      workflowStatus?: string;
      file: File;
    }) => {
      if (!activeSlotKey) return;
      setSlotDocs((prev) => {
        const cur = prev[activeSlotKey];
        return {
          ...prev,
          [activeSlotKey]: {
            file: meta.file,
            pageCount: cur?.pageCount ?? null,
            docId: cur?.docId,
            persisted: true,
            currentVersionId: meta.versionId,
            currentVersionLabel: meta.versionLabel,
            logicalDocumentId: meta.logicalDocumentId ?? cur?.logicalDocumentId,
            workflowStatus: meta.workflowStatus ?? cur?.workflowStatus,
            logicalStatus: "uploaded",
            versionCount: cur?.versionCount,
            docugridDocumentId: cur?.docugridDocumentId,
            classifyMeta: cur?.classifyMeta,
            clientSharedAt: cur?.clientSharedAt,
          },
        };
      });
      setFile(meta.file);
      assignPreviewFromFile(meta.file);
      setStatusNonce((v) => v + 1);
    },
    [activeSlotKey, assignPreviewFromFile, setFile, setSlotDocs, setStatusNonce],
  );

  const onVersionDeleted = useCallback(
    (meta: { file: File | null; versionId: string | null; versionLabel: string | null }) => {
      if (!activeSlotKey) return;
      if (!meta.file) {
        setSlotDocs((prev) => {
          const next = { ...prev };
          delete next[activeSlotKey];
          return next;
        });
        setActiveSlotKey(null);
        setFile(null);
        setPdfUrl(null);
        useViewerUiStore.getState().close();
        setStatusNonce((v) => v + 1);
        return;
      }
      const restoredFile = meta.file;
      setSlotDocs((prev) => {
        const cur = prev[activeSlotKey];
        if (!cur) return prev;
        return {
          ...prev,
          [activeSlotKey]: {
            ...cur,
            file: restoredFile,
            currentVersionId: meta.versionId ?? cur.currentVersionId,
            currentVersionLabel: meta.versionLabel ?? cur.currentVersionLabel,
          },
        };
      });
      setFile(restoredFile);
      assignPreviewFromFile(restoredFile);
      setViewerSession((s) => s + 1);
      setStatusNonce((v) => v + 1);
    },
    [
      activeSlotKey,
      assignPreviewFromFile,
      setActiveSlotKey,
      setFile,
      setPdfUrl,
      setSlotDocs,
      setStatusNonce,
      setViewerSession,
    ],
  );

  const onAuditStateChange = useCallback(() => {
    setStatusNonce((v) => v + 1);
  }, [setStatusNonce]);

  return {
    slotIdentity,
    activeClassifyMeta,
    activeSlotLabel,
    activePersistedDocId,
    activeClientSharedAt,
    activeSlotWorkflowStatus,
    onVersionCreated,
    onVersionDeleted,
    onAuditStateChange,
  };
}
