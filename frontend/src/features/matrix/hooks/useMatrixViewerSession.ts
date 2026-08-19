"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  PDF_WORKSPACE_SLOT_ID,
  useViewerUiStore,
} from "@/features/pdf-viewer/state/viewer-ui-store";
import { buildAuthHeaders, setClientScope } from "@/lib/api-auth";
import { parseSlotKey } from "@/features/docugrid/lib/slot-scope";
import { buildSlotStorageKeyFromSlotId } from "@/lib/slot-ids";
import type { NavClient } from "@/lib/client-nav";
import type { SlotDoc } from "@/features/matrix/types/slot-doc";

type PdfWorkspaceBind = ReturnType<typeof useViewerUiStore.getState>["pdfWorkspaceBind"];

type UseMatrixViewerSessionParams = {
  file: File | null;
  setFile: (file: File | null) => void;
  pdfUrl: string | null;
  setPdfUrl: React.Dispatch<React.SetStateAction<string | null>>;
  assignPreviewFromFile: (source: File) => void;
  pageCount: number | null;
  setViewerSession: React.Dispatch<React.SetStateAction<number>>;
  setViewerError: (error: string | null) => void;
  activeSlotKey: string | null;
  setActiveSlotKey: (key: string | null) => void;
  slotDocs: Record<string, SlotDoc>;
  setSlotDocs: React.Dispatch<React.SetStateAction<Record<string, SlotDoc>>>;
  currentClientId: string;
  periodKey: string;
  navClients: NavClient[];
  setActiveClientIdx: React.Dispatch<React.SetStateAction<number>>;
  pdfWorkspaceBind: PdfWorkspaceBind;
};

export function useMatrixViewerSession({
  file,
  setFile,
  pdfUrl,
  setPdfUrl,
  assignPreviewFromFile,
  pageCount,
  setViewerSession,
  setViewerError,
  activeSlotKey,
  setActiveSlotKey,
  slotDocs,
  setSlotDocs,
  currentClientId,
  periodKey,
  navClients,
  setActiveClientIdx,
  pdfWorkspaceBind,
}: UseMatrixViewerSessionParams) {
  const fileRef = useRef<File | null>(null);
  const wasViewerOpenRef = useRef(false);
  const appliedPdfWorkspaceBindRef = useRef<string | null>(null);

  const isViewerOpen = useViewerUiStore((s) => s.isOpen);
  const viewerSourceFile = useViewerUiStore((s) => s.sourceFile);

  useEffect(() => {
    fileRef.current = file;
  }, [file]);

  useEffect(() => {
    if (!file && isViewerOpen) {
      useViewerUiStore.getState().close();
    }
  }, [file, isViewerOpen]);

  useEffect(() => {
    if (isViewerOpen && file && !pdfUrl) {
      assignPreviewFromFile(file);
    }
  }, [isViewerOpen, file, pdfUrl, assignPreviewFromFile]);

  const rememberWorkingFile = useCallback(
    (working: File | null | undefined) => {
      if (!working) return;
      fileRef.current = working;
      useViewerUiStore.getState().setSourceFile(working);
      if (!activeSlotKey) return;
      setSlotDocs((prev) => {
        const cur = prev[activeSlotKey];
        if (cur?.file === working) return prev;
        return {
          ...prev,
          [activeSlotKey]: {
            ...cur,
            file: working,
            pageCount: cur?.pageCount ?? pageCount,
          },
        };
      });
    },
    [activeSlotKey, pageCount, setSlotDocs],
  );

  useEffect(() => {
    if (!isViewerOpen) {
      appliedPdfWorkspaceBindRef.current = null;
      return;
    }
    if (!viewerSourceFile || !pdfWorkspaceBind?.fromPdfWorkspace) return;

    const token = [
      viewerSourceFile.name,
      viewerSourceFile.size,
      viewerSourceFile.lastModified,
      pdfWorkspaceBind.clientId ?? "",
      pdfWorkspaceBind.periodKey ?? periodKey,
      pdfWorkspaceBind.slotId ?? PDF_WORKSPACE_SLOT_ID,
      pdfWorkspaceBind.docId ?? "",
    ].join("|");
    if (appliedPdfWorkspaceBindRef.current === token) return;
    appliedPdfWorkspaceBindRef.current = token;

    if (!pdfWorkspaceBind.clientId) {
      setActiveSlotKey(null);
      return;
    }

    const clientId = pdfWorkspaceBind.clientId;
    const bindPeriodKey = pdfWorkspaceBind.periodKey || periodKey;
    const slotId = pdfWorkspaceBind.slotId || PDF_WORKSPACE_SLOT_ID;
    const key = buildSlotStorageKeyFromSlotId(clientId, bindPeriodKey, slotId);

    setActiveClientIdx((prev) => {
      const idx = navClients.findIndex((c) => c.id === clientId);
      return idx >= 0 ? idx : prev;
    });
    setActiveSlotKey(key);
    setSlotDocs((prev) => {
      const cur = prev[key];
      const base = (name: string) => name.replace(/^(processed_)+/i, "").toLowerCase();
      const keepWorking =
        Boolean(cur?.file) &&
        base(cur!.file.name) === base(viewerSourceFile.name) &&
        (cur!.file.size !== viewerSourceFile.size ||
          cur!.file.lastModified !== viewerSourceFile.lastModified);
      return {
        ...prev,
        [key]: {
          file: keepWorking && cur?.file ? cur.file : viewerSourceFile,
          pageCount: cur?.pageCount ?? null,
          docId: pdfWorkspaceBind.docId ?? cur?.docId,
          persisted: Boolean(pdfWorkspaceBind.docId || cur?.persisted),
          logicalDocumentId: cur?.logicalDocumentId,
          currentVersionId: cur?.currentVersionId,
          currentVersionLabel: cur?.currentVersionLabel,
          versionCount: cur?.versionCount,
          workflowStatus: cur?.workflowStatus,
          logicalStatus: cur?.logicalStatus,
          docugridDocumentId: cur?.docugridDocumentId,
          classifyMeta: cur?.classifyMeta,
          clientSharedAt: cur?.clientSharedAt,
        },
      };
    });
  }, [
    isViewerOpen,
    viewerSourceFile,
    pdfWorkspaceBind,
    periodKey,
    navClients,
    setActiveClientIdx,
    setActiveSlotKey,
    setSlotDocs,
  ]);

  useEffect(() => {
    const justOpened = isViewerOpen && !wasViewerOpenRef.current;
    wasViewerOpenRef.current = isViewerOpen;
    if (!justOpened || !viewerSourceFile) return;

    const slotFile = activeSlotKey ? slotDocs[activeSlotKey]?.file : null;
    const baseName = (name: string) => name.replace(/^(processed_)+/i, "").toLowerCase();
    const next =
      slotFile && baseName(slotFile.name) === baseName(viewerSourceFile.name)
        ? slotFile
        : viewerSourceFile;

    fileRef.current = next;
    setFile(next);
    assignPreviewFromFile(next);
    useViewerUiStore.getState().setSourceFile(next);
    setViewerSession((s) => s + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isViewerOpen, viewerSourceFile, assignPreviewFromFile, activeSlotKey]);

  useEffect(() => {
    if (!activeSlotKey || !file) return;
    setSlotDocs((prev) => {
      const cur = prev[activeSlotKey];
      if (cur && cur.file === file) return prev;
      return {
        ...prev,
        [activeSlotKey]: { ...cur, file, pageCount: cur?.pageCount ?? pageCount },
      };
    });
  }, [file, activeSlotKey, pageCount, setSlotDocs]);

  const scopedClientId = useMemo(() => {
    if (activeSlotKey) {
      const scope = parseSlotKey(activeSlotKey);
      if (scope?.clientId) return scope.clientId;
    }
    if (currentClientId && currentClientId !== "unknown") return currentClientId;
    return undefined;
  }, [activeSlotKey, currentClientId]);

  const scopedAuthHeaders = useCallback(
    () => buildAuthHeaders(scopedClientId),
    [scopedClientId],
  );

  useLayoutEffect(() => {
    if (scopedClientId) setClientScope(scopedClientId);
  }, [scopedClientId]);

  const closeViewer = useCallback(() => {
    const working = fileRef.current;
    if (working) rememberWorkingFile(working);
    useViewerUiStore.getState().close();
    setFile(null);
    setViewerError(null);
    setPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [rememberWorkingFile, setFile, setPdfUrl, setViewerError]);

  useLayoutEffect(() => {
    if (!isViewerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isViewerOpen]);

  return {
    rememberWorkingFile,
    closeViewer,
    scopedAuthHeaders,
    isViewerOpen,
  };
}
