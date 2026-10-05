"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Upload } from "lucide-react";
import { DocuGridLogo } from "@/components/brand";
import { API_ENDPOINTS } from "@/config/api";
import { parseApiErrorResponse } from "@/lib/parse-api-error";
import ViewerModal from "@/features/pdf-viewer";
import type { NormPoint, NormRect, ToolType, UploadStatus, ViewerMode } from "@/features/pdf-viewer/types";

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/**
 * Login-free PDF workspace: local edit + download via /api/public/pdf/*.
 * DocuGrid store / client picker are intentionally omitted.
 */
export function GuestPdfWorkspace() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus] = useState<UploadStatus>("idle");
  const [viewerSession, setViewerSession] = useState(0);
  const [viewerMode, setViewerMode] = useState<ViewerMode>("edit");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastThumbnailErrorRef = useRef<string | null>(null);

  const revokePreview = useCallback(() => {
    setPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  useEffect(() => () => revokePreview(), [revokePreview]);

  const assignPreview = useCallback(
    (next: File) => {
      revokePreview();
      setPdfUrl(URL.createObjectURL(next));
    },
    [revokePreview],
  );

  const openLocalFile = useCallback(
    async (selected: File) => {
      if (!isPdfFile(selected)) {
        setError("PDF ファイルを選んでください");
        return;
      }
      setError(null);
      setIsLoading(true);
      try {
        const form = new FormData();
        form.append("file", selected);
        const res = await fetch(API_ENDPOINTS.PUBLIC_PDF.INFO, { method: "POST", body: form });
        if (res.ok) {
          const data = (await res.json()) as { page_count?: number; pageCount?: number };
          setPageCount(data.page_count ?? data.pageCount ?? null);
        } else {
          setPageCount(null);
        }
        setFile(selected);
        assignPreview(selected);
        setViewerSession((s) => s + 1);
        setViewerMode("edit");
        setViewerOpen(true);
      } catch {
        setError("PDF を開けませんでした。バックエンドが起動しているか確認してください。");
      } finally {
        setIsLoading(false);
      }
    },
    [assignPreview],
  );

  const openFromFiles = useCallback(
    (list: FileList | File[]) => {
      const pdfs = Array.from(list).filter(isPdfFile);
      if (pdfs.length === 0) {
        setError("PDF ファイルを選んでください");
        return;
      }
      void openLocalFile(pdfs[0]);
    },
    [openLocalFile],
  );

  const handleClose = useCallback(() => {
    // 作業中 PDF は消さず、ビューアだけ閉じる（続きから再開できる）
    setViewerOpen(false);
    setViewerMode("edit");
    setError(null);
  }, []);

  const resumeDraft = useCallback(() => {
    if (!file) return;
    assignPreview(file);
    setViewerSession((s) => s + 1);
    setViewerMode("edit");
    setViewerOpen(true);
  }, [file, assignPreview]);

  const discardDraft = useCallback(() => {
    setViewerOpen(false);
    setViewerMode("edit");
    setFile(null);
    setPageCount(null);
    revokePreview();
    setViewerSession((s) => s + 1);
    setError(null);
  }, [revokePreview]);

  const handleReplaceFile = useCallback(
    (next: File) => {
      setFile(next);
      assignPreview(next);
    },
    [assignPreview],
  );

  const handleHighlight = useCallback(
    async (
      type: ToolType,
      pageIdx: number,
      rect: NormRect,
      options?: {
        file?: File;
        updatePrimary?: boolean;
        path?: NormPoint[];
        text?: string;
        fontSize?: number;
        textColor?: string;
        probeOnly?: boolean;
        replaceText?: boolean;
        originRect?: NormRect;
      },
    ) => {
      const targetFile = options?.file ?? file;
      if (!targetFile) return;
      const cleanName = targetFile.name.replace(/^(processed_)+/i, "").trim() || targetFile.name;
      if (!options?.probeOnly) setIsLoading(true);
      try {
        const formData = new FormData();
        formData.append("file", targetFile);
        formData.append("page", String(pageIdx));
        formData.append("x", String(rect.x));
        formData.append("y", String(rect.y));
        formData.append("w", String(rect.w));
        formData.append("h", String(rect.h));
        formData.append("type", type);
        if (options?.path && options.path.length > 0) {
          formData.append("path_json", JSON.stringify(options.path));
        }
        if (options?.text) {
          formData.append("text", options.text);
        }
        if (options?.fontSize != null) {
          formData.append("fontsize", String(options.fontSize));
        }
        if (options?.textColor) {
          formData.append("text_color", options.textColor);
        }
        if (options?.probeOnly) {
          formData.append("probe_only", "1");
        }
        if (options?.replaceText) {
          formData.append("replace_text", "1");
        }
        if (options?.originRect) {
          formData.append("origin_x", String(options.originRect.x));
          formData.append("origin_y", String(options.originRect.y));
          formData.append("origin_w", String(options.originRect.w));
          formData.append("origin_h", String(options.originRect.h));
        }
        if (!options?.probeOnly) {
          formData.append("include_render", "true");
        }

        const response = await fetch(API_ENDPOINTS.PUBLIC_PDF.HIGHLIGHT, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) throw new Error("highlight failed");

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
            assignPreview(updatedFile);
          }
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
          assignPreview(updatedFile);
        }
        return updatedFile;
      } catch (err) {
        console.error(err);
        setError("注釈の反映に失敗しました");
      } finally {
        setIsLoading(false);
      }
    },
    [file, assignPreview],
  );

  const handleReorder = useCallback(
    async (order: number[], fileOverride?: File) => {
      const target = fileOverride ?? file;
      if (!target) return;
      setIsLoading(true);
      setError(null);
      lastThumbnailErrorRef.current = null;
      try {
        const form = new FormData();
        form.append("file", target);
        form.append("order", order.join(","));
        const res = await fetch(API_ENDPOINTS.PUBLIC_PDF.REORDER, { method: "POST", body: form });
        if (!res.ok) {
          setError(await parseApiErrorResponse(res, `並べ替えに失敗しました（${res.status}）`));
          return undefined;
        }
        const blob = await res.blob();
        const updated = new File([blob], `reordered_${target.name}`, {
          type: blob.type || "application/pdf",
        });
        setFile(updated);
        assignPreview(updated);
        return updated;
      } catch {
        setError("並べ替えに失敗しました");
        return undefined;
      } finally {
        setIsLoading(false);
      }
    },
    [file, assignPreview],
  );

  const handleMerge = useCallback(
    async (extraFiles: File[]) => {
      if (!file) return;
      setIsLoading(true);
      setError(null);
      lastThumbnailErrorRef.current = null;
      try {
        const form = new FormData();
        form.append("files", file);
        for (const f of extraFiles) form.append("files", f);
        const res = await fetch(API_ENDPOINTS.PUBLIC_PDF.MERGE, { method: "POST", body: form });
        if (!res.ok) {
          setError(await parseApiErrorResponse(res, `結合に失敗しました（${res.status}）`));
          return undefined;
        }
        const blob = await res.blob();
        const updated = new File([blob], "merged.pdf", { type: blob.type || "application/pdf" });
        setFile(updated);
        assignPreview(updated);
        return updated;
      } catch {
        setError("結合に失敗しました");
        return undefined;
      } finally {
        setIsLoading(false);
      }
    },
    [file, assignPreview],
  );

  const handleGetThumbnails = useCallback(async (fileOverride?: File) => {
    const target = fileOverride ?? file;
    if (!target) return [];
    try {
      const form = new FormData();
      form.append("file", target);
      const res = await fetch(API_ENDPOINTS.PUBLIC_PDF.THUMBNAILS, { method: "POST", body: form });
      if (!res.ok) {
        const message = await parseApiErrorResponse(
          res,
          `サムネイル取得に失敗しました（${res.status}）`,
        );
        if (lastThumbnailErrorRef.current !== message) {
          lastThumbnailErrorRef.current = message;
          setError(message);
        }
        return [];
      }

      if (lastThumbnailErrorRef.current) {
        lastThumbnailErrorRef.current = null;
        setError(null);
      }

      const data = (await res.json()) as { thumbnails?: string[] };
      return data.thumbnails ?? [];
    } catch {
      const message = "サムネイル取得に失敗しました（通信エラー）";
      if (lastThumbnailErrorRef.current !== message) {
        lastThumbnailErrorRef.current = message;
        setError(message);
      }
      return [];
    }
  }, [file]);

  const handleRenderPage = useCallback(
    async (pageIdx: number, fileOverride?: File) => {
      const target = fileOverride ?? file;
      if (!target) return null;
      try {
        const form = new FormData();
        form.append("file", target);
        form.append("page", String(pageIdx));
        const res = await fetch(API_ENDPOINTS.PUBLIC_PDF.RENDER_PAGE, {
          method: "POST",
          body: form,
        });
        if (!res.ok) return null;
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      } catch {
        return null;
      }
    },
    [file],
  );

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-slate-50 via-white to-slate-100 pb-[env(safe-area-inset-bottom)]">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white/90 px-3 py-2.5 backdrop-blur pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4 sm:py-3">
        <DocuGridLogo size="sm" />
        <div className="flex items-center gap-1.5 text-sm sm:gap-2">
          <Link
            href="/welcome"
            className="hidden rounded-lg px-3 py-2 font-semibold text-slate-600 hover:bg-slate-100 min-[380px]:inline-flex"
          >
            について
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-10 items-center rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-teal-500 sm:text-sm"
          >
            ログイン
          </Link>
        </div>
      </header>

      <div
        className={`flex flex-1 flex-col items-center justify-center px-4 py-10 transition-colors sm:py-16 ${
          dragOver ? "bg-teal-50/80" : ""
        }`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget === e.target) setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) openFromFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) openFromFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="w-full max-w-xl text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-600 sm:text-[11px]">
            無料・ログイン不要
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-4xl">
            PDF を開く
          </h1>
          <p className="mt-2 text-sm text-slate-500 sm:mt-3 sm:text-base">
            注釈・並べ替え・ダウンロード。端末上だけで編集できます。
          </p>

          <div className="mt-8 flex w-full flex-col items-stretch gap-2.5 sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-3">
            {file && !viewerOpen ? (
              <>
                <button
                  type="button"
                  onClick={resumeDraft}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-teal-700 sm:w-auto sm:min-w-[12rem]"
                >
                  作業中の PDF を続ける
                </button>
                <button
                  type="button"
                  onClick={discardDraft}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 sm:w-auto"
                >
                  破棄して選び直す
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={isLoading}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-60 sm:w-auto sm:min-w-[12rem]"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                PDFファイルを選択
              </button>
            )}
          </div>

          {file && !viewerOpen ? (
            <p className="mt-3 truncate px-2 text-xs font-medium text-slate-500">
              下書き: {file.name}
            </p>
          ) : null}

          <p className="mt-5 hidden text-sm text-slate-400 md:block">
            {dragOver ? "ここにドロップして開く" : "または、ここに PDF をドロップしてください"}
          </p>
          <p className="mt-4 text-xs text-slate-400 md:hidden">
            Files / 写真アプリから PDF を選べます
          </p>

          {error ? (
            <p className="mt-4 text-sm font-medium text-rose-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      {viewerOpen && file ? (
        <ViewerModal
          isOpen
          onClose={handleClose}
          viewerMode={viewerMode}
          onViewerModeChange={setViewerMode}
          chromeMode="pdfSimple"
          file={file}
          pdfUrl={pdfUrl}
          viewerSession={viewerSession}
          pageCount={pageCount}
          uploadStatus={uploadStatus}
          isLoading={isLoading}
          onHighlight={handleHighlight}
          onReorder={handleReorder}
          onMerge={handleMerge}
          onGetThumbnails={handleGetThumbnails}
          onRenderPage={handleRenderPage}
          onReplaceFile={handleReplaceFile}
          operationError={error}
          onDismissOperationError={() => setError(null)}
          canAnnotate
          canApprove={false}
        />
      ) : null}
    </div>
  );
}
