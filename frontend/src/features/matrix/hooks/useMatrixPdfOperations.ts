"use client";

import { useCallback, useEffect, useRef } from "react";
import { API_ENDPOINTS } from "@/config/api";
import { authFetch } from "@/lib/api-auth";
import { parseApiErrorResponse } from "@/lib/parse-api-error";
import { sha256HexFromFile } from "@/lib/sha256";
import { parseSlotKey } from "@/features/docugrid/lib/slot-scope";
import { createDocumentVersionSnapshot } from "@/features/pdf-viewer/lib/document-versions";
import { createReviewEvent } from "@/features/pdf-viewer/lib/review-events";
import { slotIndexFromSlotKey } from "@/lib/slot-ids";
import type { SlotDoc } from "@/features/matrix/types/slot-doc";

type VersionCreatedMeta = {
  versionId: string;
  versionLabel: string;
  logicalDocumentId?: string;
  workflowStatus?: string;
  file: File;
};

type UseMatrixPdfOperationsParams = {
  file: File | null;
  setFile: (file: File | null) => void;
  assignPreviewFromFile: (source: File) => void;
  rememberWorkingFile: (working: File | null | undefined) => void;
  setIsLoading: (loading: boolean) => void;
  setViewerError: (error: string | null) => void;
  setViewerSession: React.Dispatch<React.SetStateAction<number>>;
  setStatusNonce: React.Dispatch<React.SetStateAction<number>>;
  setPageCount: (count: number | null) => void;
  scopedAuthHeaders: () => HeadersInit;
  canAnnotateDocument: boolean;
  activeSlotKey: string | null;
  periodKey: string;
  slotLabels: string[];
  setSlotDocs: React.Dispatch<React.SetStateAction<Record<string, SlotDoc>>>;
  onVersionCreated: (meta: VersionCreatedMeta) => void;
};

export function useMatrixPdfOperations({
  file,
  setFile,
  assignPreviewFromFile,
  rememberWorkingFile,
  setIsLoading,
  setViewerError,
  setViewerSession,
  setStatusNonce,
  setPageCount,
  scopedAuthHeaders,
  canAnnotateDocument,
  activeSlotKey,
  periodKey,
  slotLabels,
  setSlotDocs,
  onVersionCreated,
}: UseMatrixPdfOperationsParams) {
  const lastThumbnailErrorRef = useRef<string | null>(null);
  const annotationSnapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logAnnotateReview = useCallback(
    (
      pageIdx: number,
      tool: string,
      rect: { x: number; y: number; w: number; h: number },
    ) => {
      if (!activeSlotKey) return;
      const scope = parseSlotKey(activeSlotKey);
      if (!scope) return;
      void createReviewEvent(scope, {
        event_type: "annotate",
        status: "draft",
        action_title: `${tool} 注釈`,
        detail: JSON.stringify({ page: pageIdx, tool, rect }),
      }).catch((err) => console.warn("annotate audit failed:", err));
    },
    [activeSlotKey],
  );

  const logExportPdfReview = useCallback(() => {
    if (!activeSlotKey) return;
    const scope = parseSlotKey(activeSlotKey);
    if (!scope) return;
    void createReviewEvent(scope, {
      event_type: "export_pdf",
      status: "draft",
      action_title: "PDF を出力",
      detail: JSON.stringify({ merge: true, source: "docugrid" }),
    }).catch((err) => console.warn("export_pdf audit failed:", err));
  }, [activeSlotKey]);

  const scheduleAnnotationSnapshot = useCallback(
    (updatedFile: File) => {
      if (!canAnnotateDocument || !activeSlotKey) return;
      const scope = parseSlotKey(activeSlotKey);
      if (!scope) return;
      const idx = slotIndexFromSlotKey(activeSlotKey, periodKey);
      const label = idx !== null && idx >= 0 ? slotLabels[idx] : undefined;
      if (annotationSnapshotTimerRef.current) {
        clearTimeout(annotationSnapshotTimerRef.current);
      }
      annotationSnapshotTimerRef.current = setTimeout(() => {
        void (async () => {
          try {
            const snap = await createDocumentVersionSnapshot(scope, updatedFile, "minor", label);
            onVersionCreated({
              versionId: snap.id,
              versionLabel: snap.version_label,
              logicalDocumentId: snap.logical_document_id,
              file: updatedFile,
            });
          } catch (err) {
            console.warn("annotation version snapshot failed:", err);
          }
        })();
      }, 8000);
    },
    [canAnnotateDocument, activeSlotKey, periodKey, slotLabels, onVersionCreated],
  );

  useEffect(() => {
    return () => {
      if (annotationSnapshotTimerRef.current) {
        clearTimeout(annotationSnapshotTimerRef.current);
      }
    };
  }, []);

  const handleHighlight = useCallback(
    async (
      type: "box" | "marker" | "line" | "check" | "text" | "eraser",
      pageIdx: number,
      rect: { x: number; y: number; w: number; h: number },
      options?: {
        file?: File;
        updatePrimary?: boolean;
        path?: { x: number; y: number }[];
        text?: string;
        fontSize?: number;
        textColor?: string;
        probeOnly?: boolean;
        replaceText?: boolean;
        originRect?: { x: number; y: number; w: number; h: number };
      },
    ) => {
      const targetFile = options?.file ?? file;
      if (!targetFile) return;
      const cleanName = targetFile.name.replace(/^(processed_)+/i, "").trim() || targetFile.name;
      try {
        const formData = new FormData();
        formData.append("file", targetFile);
        formData.append("page", pageIdx.toString());
        formData.append("x", rect.x.toString());
        formData.append("y", rect.y.toString());
        formData.append("w", rect.w.toString());
        formData.append("h", rect.h.toString());
        formData.append("type", type);
        if (options?.path && options.path.length > 0) {
          formData.append("path_json", JSON.stringify(options.path));
        }
        if (options?.text) formData.append("text", options.text);
        if (options?.fontSize != null) formData.append("fontsize", String(options.fontSize));
        if (options?.textColor) formData.append("text_color", options.textColor);
        if (options?.probeOnly) formData.append("probe_only", "1");
        if (options?.replaceText) formData.append("replace_text", "1");
        if (options?.originRect) {
          formData.append("origin_x", String(options.originRect.x));
          formData.append("origin_y", String(options.originRect.y));
          formData.append("origin_w", String(options.originRect.w));
          formData.append("origin_h", String(options.originRect.h));
        }
        if (!options?.probeOnly) formData.append("include_render", "true");

        const response = await authFetch(API_ENDPOINTS.HIGHLIGHT, {
          method: "POST",
          body: formData,
          headers: scopedAuthHeaders(),
        });
        if (!response.ok) throw new Error(`${type} action failed`);

        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = (await response.json()) as {
            pdf_base64?: string;
            preview_png_base64?: string;
            hit?: {
              x: number;
              y: number;
              w: number;
              h: number;
              text: string;
              fontsize?: number;
              fontSize?: number;
              color: string;
            } | null;
          };
          if (options?.probeOnly) {
            const hit = data.hit;
            if (!hit) return { hit: null };
            return {
              hit: {
                x: hit.x,
                y: hit.y,
                w: hit.w,
                h: hit.h,
                text: hit.text,
                fontSize: Number(hit.fontSize ?? hit.fontsize ?? 14),
                color: hit.color || "#1e3a8a",
              },
            };
          }
          if (!data.pdf_base64) throw new Error("missing pdf");
          const raw = atob(data.pdf_base64);
          const pdfBytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) pdfBytes[i] = raw.charCodeAt(i);
          const updatedFile = new File([pdfBytes], `processed_${cleanName}`, {
            type: "application/pdf",
          });
          if (options?.updatePrimary !== false) {
            setFile(updatedFile);
            assignPreviewFromFile(updatedFile);
            rememberWorkingFile(updatedFile);
          }
          logAnnotateReview(pageIdx, type, rect);
          scheduleAnnotationSnapshot(updatedFile);
          if (data.preview_png_base64) {
            return {
              file: updatedFile,
              previewDataUrl: `data:image/png;base64,${data.preview_png_base64}`,
            };
          }
          return updatedFile;
        }

        const blob = await response.blob();
        const updatedFile = new File([blob], `processed_${cleanName}`, {
          type: blob.type || "application/pdf",
        });
        if (options?.updatePrimary !== false) {
          setFile(updatedFile);
          assignPreviewFromFile(updatedFile);
          rememberWorkingFile(updatedFile);
        }
        logAnnotateReview(pageIdx, type, rect);
        scheduleAnnotationSnapshot(updatedFile);
        return updatedFile;
      } catch (error) {
        console.error(error);
        alert(`${type}処理に失敗しました。`);
      }
    },
    [
      file,
      assignPreviewFromFile,
      logAnnotateReview,
      scopedAuthHeaders,
      rememberWorkingFile,
      setFile,
      scheduleAnnotationSnapshot,
    ],
  );

  const handleReorder = useCallback(
    async (newOrderIndices: number[]) => {
      if (!file || !canAnnotateDocument) return;
      setIsLoading(true);
      setViewerError(null);
      lastThumbnailErrorRef.current = null;
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("order", newOrderIndices.join(","));
        const response = await authFetch(API_ENDPOINTS.REORDER, {
          method: "POST",
          body: formData,
          headers: scopedAuthHeaders(),
        });
        if (!response.ok) {
          setViewerError(
            await parseApiErrorResponse(response, `並べ替えに失敗しました（${response.status}）`),
          );
          return undefined;
        }
        const blob = await response.blob();
        const updatedFile = new File([blob], `reordered_${file.name}`, {
          type: blob.type || "application/pdf",
        });
        if (annotationSnapshotTimerRef.current) {
          clearTimeout(annotationSnapshotTimerRef.current);
          annotationSnapshotTimerRef.current = null;
        }
        setFile(updatedFile);
        assignPreviewFromFile(updatedFile);
        rememberWorkingFile(updatedFile);

        const scope =
          activeSlotKey &&
          !activeSlotKey.startsWith("unassigned:") &&
          !activeSlotKey.startsWith("deleted:")
            ? parseSlotKey(activeSlotKey)
            : null;
        const slotKey = activeSlotKey;
        if (scope && slotKey) {
          const idx = slotIndexFromSlotKey(slotKey, periodKey);
          const label = idx !== null && idx >= 0 ? slotLabels[idx] : undefined;
          const snap = await createDocumentVersionSnapshot(scope, updatedFile, "minor", label);
          const contentSha256 = await sha256HexFromFile(updatedFile);
          await createReviewEvent(scope, {
            event_type: "page_reorder",
            status: "draft",
            action_title: "ページ並べ替え",
            version_label: snap.version_label,
            document_version_id: snap.id,
            logical_document_id: snap.logical_document_id,
            content_sha256: contentSha256,
          });
          setSlotDocs((prev) => {
            const cur = prev[slotKey];
            if (!cur) return prev;
            return {
              ...prev,
              [slotKey]: {
                ...cur,
                file: updatedFile,
                currentVersionId: snap.id,
                currentVersionLabel: snap.version_label,
                logicalDocumentId: snap.logical_document_id ?? cur.logicalDocumentId,
                pageCount: snap.page_count ?? cur.pageCount,
              },
            };
          });
          setViewerSession((s) => s + 1);
          setStatusNonce((v) => v + 1);
        }
        return updatedFile;
      } catch {
        setViewerError("並べ替え処理に失敗しました。");
        return undefined;
      } finally {
        setIsLoading(false);
      }
    },
    [
      file,
      assignPreviewFromFile,
      canAnnotateDocument,
      scopedAuthHeaders,
      activeSlotKey,
      periodKey,
      slotLabels,
      rememberWorkingFile,
      setFile,
      setIsLoading,
      setViewerError,
      setViewerSession,
      setStatusNonce,
      setSlotDocs,
    ],
  );

  const handleMerge = useCallback(
    async (filesToMerge: File[]) => {
      setIsLoading(true);
      setViewerError(null);
      lastThumbnailErrorRef.current = null;
      try {
        const formData = new FormData();
        filesToMerge.forEach((f) => formData.append("files", f));
        const response = await authFetch(API_ENDPOINTS.MERGE, {
          method: "POST",
          body: formData,
          headers: scopedAuthHeaders(),
        });
        if (!response.ok) {
          setViewerError(
            await parseApiErrorResponse(response, `結合に失敗しました（${response.status}）`),
          );
          return undefined;
        }
        const blob = await response.blob();
        const updatedFile = new File([blob], "merged.pdf", { type: blob.type || "application/pdf" });
        setFile(updatedFile);
        assignPreviewFromFile(updatedFile);
        rememberWorkingFile(updatedFile);
        setViewerSession((s) => s + 1);
        return updatedFile;
      } catch {
        setViewerError("結合処理に失敗しました。");
        return undefined;
      } finally {
        setIsLoading(false);
      }
    },
    [
      assignPreviewFromFile,
      scopedAuthHeaders,
      rememberWorkingFile,
      setFile,
      setIsLoading,
      setViewerError,
      setViewerSession,
    ],
  );

  const handleGetThumbnails = useCallback(
    async (fileOverride?: File) => {
      const targetFile = fileOverride ?? file;
      if (!targetFile) return [];
      try {
        const formData = new FormData();
        formData.append("file", targetFile);
        const response = await authFetch(API_ENDPOINTS.THUMBNAILS, {
          method: "POST",
          body: formData,
          headers: scopedAuthHeaders(),
        });
        if (!response.ok) {
          const message = await parseApiErrorResponse(
            response,
            `サムネイル取得に失敗しました（${response.status}）`,
          );
          if (lastThumbnailErrorRef.current !== message) {
            lastThumbnailErrorRef.current = message;
            setViewerError(message);
          }
          return [];
        }
        if (lastThumbnailErrorRef.current) {
          lastThumbnailErrorRef.current = null;
          setViewerError(null);
        }
        const data = await response.json();
        if (data.thumbnails && data.thumbnails.length > 0) {
          setPageCount(data.thumbnails.length);
        }
        return data.thumbnails as string[];
      } catch {
        const message = "サムネイル取得に失敗しました（通信エラー）";
        if (lastThumbnailErrorRef.current !== message) {
          lastThumbnailErrorRef.current = message;
          setViewerError(message);
        }
        return [];
      }
    },
    [file, scopedAuthHeaders, setPageCount, setViewerError],
  );

  const handleReplaceFile = useCallback(
    (next: File) => {
      setFile(next);
      assignPreviewFromFile(next);
      rememberWorkingFile(next);
    },
    [assignPreviewFromFile, rememberWorkingFile, setFile],
  );

  const handleRenderPage = useCallback(
    async (pageIdx: number, fileOverride?: File) => {
      const targetFile = fileOverride || file;
      if (!targetFile) return null;
      try {
        const formData = new FormData();
        formData.append("file", targetFile);
        formData.append("page", pageIdx.toString());
        const response = await authFetch(API_ENDPOINTS.RENDER_PAGE, {
          method: "POST",
          body: formData,
          headers: scopedAuthHeaders(),
        });
        if (!response.ok) return null;
        const blob = await response.blob();
        return URL.createObjectURL(blob);
      } catch (error) {
        console.error("Render Page Error:", error);
        return null;
      }
    },
    [file, scopedAuthHeaders],
  );

  return {
    handleHighlight,
    handleReorder,
    handleMerge,
    handleGetThumbnails,
    handleReplaceFile,
    handleRenderPage,
    logExportPdfReview,
  };
}
