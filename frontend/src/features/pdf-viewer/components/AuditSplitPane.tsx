"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  FolderOpen,
  RefreshCcw,
  Upload,
  X,
} from "lucide-react";
import { API_ENDPOINTS } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import type { PaneMarker } from "../lib/audit-link-markers";
import { AuditSide, ToolType } from "../types";
import { ServerFilePanel } from "./ServerFilePanel";

type AuditSplitPaneProps = {
  side: AuditSide;
  title: string;
  file: File | null;
  workingFile: File | null;
  onFileChange: (file: File | null) => void;
  onRenderPage: (page: number, fileOverride?: File) => Promise<string | null>;
  markers: PaneMarker[];
  onCheckPoint: (side: AuditSide, point: { page: number; x: number; y: number; fileName?: string }) => void;
  activeTool: ToolType;
  pageJump?: number;
  selectedLinkId?: string | null;
  pendingOnThisSide?: boolean;
  /** 空きエリアクリックで保存済一覧を開く（右ペイン＝他帳票の既定フロー） */
  emptyClickOpensSavedPicker?: boolean;
  clientId?: string;
};

export const AuditSplitPane = ({
  side,
  title,
  file,
  workingFile,
  onFileChange,
  onRenderPage,
  markers,
  onCheckPoint,
  activeTool,
  pageJump,
  selectedLinkId,
  pendingOnThisSide = false,
  emptyClickOpensSavedPicker = false,
  clientId,
}: AuditSplitPaneProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  useEffect(() => {
    setPageIndex(0);
  }, [file]);

  useEffect(() => {
    if (pageJump == null || pageJump < 0) return;
    setPageIndex(pageJump);
  }, [pageJump]);

  useEffect(() => {
    let mounted = true;
    const loadInfo = async () => {
      if (!file) {
        setPageCount(0);
        return;
      }
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await authFetch(API_ENDPOINTS.UPLOAD, {
          method: "POST",
          body: form,
          headers: buildAuthHeaders(clientId),
        });
        const data = await res.json();
        if (mounted) {
          setPageCount(data.page_count ?? data.pageCount ?? 0);
        }
      } catch {
        if (mounted) setPageCount(0);
      }
    };
    void loadInfo();
    return () => {
      mounted = false;
    };
  }, [file]);

  useEffect(() => {
    let mounted = true;
    const loadPageImage = async () => {
      if (!file) {
        setPageImage(null);
        return;
      }
      const image = await onRenderPage(pageIndex, file);
      if (mounted) setPageImage(image);
    };
    void loadPageImage();
    return () => {
      mounted = false;
    };
  }, [file, pageIndex, onRenderPage]);

  const canPrev = pageIndex > 0;
  const canNext = pageCount > 0 && pageIndex < pageCount - 1;

  const handlePaneClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== "check" || !file) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onCheckPoint(side, { page: pageIndex, x, y, fileName: file.name });
  };

  const markersOnPage = useMemo(
    () => markers.filter((m) => m.page === pageIndex),
    [markers, pageIndex],
  );

  const pickLocalFile = () => fileInputRef.current?.click();

  const openSavedPicker = () => setIsPickerOpen(true);

  const handleEmptyAreaClick = () => {
    if (emptyClickOpensSavedPicker) {
      openSavedPicker();
    } else {
      pickLocalFile();
    }
  };

  return (
    <div
      className={`relative flex min-h-0 min-w-0 flex-1 flex-col border-r border-slate-300 bg-slate-100 last:border-r-0 ${
        isDragActive ? "ring-2 ring-inset ring-blue-400" : ""
      } ${pendingOnThisSide ? "ring-2 ring-inset ring-amber-400" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragActive(true);
      }}
      onDragLeave={() => setIsDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragActive(false);
        const dropped = Array.from(e.dataTransfer.files).filter(
          (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name),
        );
        if (dropped[0]) onFileChange(dropped[0]);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const target = e.target.files?.[0];
          if (target) onFileChange(target);
          e.target.value = "";
        }}
      />

      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-slate-300 bg-slate-200 px-2">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          {title}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-700">
          {file?.name ?? "未選択"}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => canPrev && setPageIndex((p) => Math.max(0, p - 1))}
            disabled={!file || !canPrev}
            className="rounded p-0.5 text-slate-600 hover:bg-slate-300 disabled:opacity-30"
            aria-label="前のページ"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="w-12 text-center font-mono text-[10px] text-slate-600">
            {file && pageCount > 0 ? `${pageIndex + 1}/${pageCount}` : "—"}
          </span>
          <button
            type="button"
            onClick={() => canNext && setPageIndex((p) => p + 1)}
            disabled={!file || !canNext}
            className="rounded p-0.5 text-slate-600 hover:bg-slate-300 disabled:opacity-30"
            aria-label="次のページ"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => workingFile && onFileChange(workingFile)}
          disabled={!workingFile}
          title="作業中の PDF"
          className="rounded p-1 text-slate-600 hover:bg-slate-300 disabled:opacity-30"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setIsPickerOpen((v) => !v)}
          title="保存済 PDF から選択"
          className={`rounded p-1 hover:bg-slate-300 ${isPickerOpen ? "bg-slate-300 text-blue-700" : "text-slate-600"}`}
        >
          <Database className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={pickLocalFile}
          title="PC から PDF を開く"
          className="rounded p-1 text-slate-600 hover:bg-slate-300"
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </button>
        {file ? (
          <button
            type="button"
            onClick={() => onFileChange(null)}
            title="クリア"
            className="rounded p-1 text-slate-500 hover:bg-red-100 hover:text-red-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {isPickerOpen && file ? (
        <div className="max-h-40 shrink-0 overflow-hidden border-b border-slate-300 bg-white">
          <ServerFilePanel
            onFileSelect={(picked) => {
              onFileChange(picked);
              setIsPickerOpen(false);
            }}
          />
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {!file && isPickerOpen ? (
          <div className="flex min-h-0 flex-1 flex-col bg-white">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-2 py-1.5">
              <span className="text-[11px] font-bold text-slate-700">保存済 PDF から選択</span>
              <button
                type="button"
                onClick={() => setIsPickerOpen(false)}
                className="rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100"
              >
                閉じる
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <ServerFilePanel
                className="h-full border-r-0"
                description="照合する他帳票・PDF を選んでください"
                onFileSelect={(picked) => {
                  onFileChange(picked);
                  setIsPickerOpen(false);
                }}
              />
            </div>
            <p className="shrink-0 border-t border-slate-100 px-2 py-1.5 text-center text-[10px] text-slate-500">
              別の PDF はこのエリアへドラッグ＆ドロップ
            </p>
          </div>
        ) : file ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-1">
            <div
              className="relative inline-block max-h-full max-w-full"
              onClick={handlePaneClick}
              style={{ cursor: activeTool === "check" ? "crosshair" : "default" }}
            >
              {pageImage ? (
                <img
                  src={pageImage}
                  alt=""
                  className="max-h-full max-w-full object-contain shadow-lg"
                  draggable={false}
                />
              ) : (
                <div className="flex h-48 w-36 items-center justify-center text-xs text-slate-500">
                  読み込み中…
                </div>
              )}
              {markersOnPage.map((marker, idx) => {
                const isPending = marker.kind === "pending";
                const isSelected = marker.linkId && marker.linkId === selectedLinkId;
                return (
                  <div
                    key={`${side}-m-${idx}-${marker.linkId ?? "pending"}`}
                    className={`absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[9px] font-bold text-white shadow ${
                      isPending ? "animate-pulse border-amber-200" : "border-white"
                    } ${isSelected ? "ring-2 ring-yellow-300" : ""}`}
                    style={{
                      left: `${marker.x * 100}%`,
                      top: `${marker.y * 100}%`,
                      backgroundColor: marker.color,
                    }}
                  >
                    {isPending ? "?" : marker.linkIndex}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleEmptyAreaClick}
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          >
            {emptyClickOpensSavedPicker ? (
              <>
                <Database className="h-10 w-10 opacity-50 text-blue-500" />
                <span className="text-xs font-bold text-slate-600">クリックして保存済から選択</span>
                <span className="text-center text-[10px] leading-relaxed text-slate-500">
                  他帳票・別 PDF はドラッグ＆ドロップ
                  <br />
                  PC から開く場合は上部の 📁
                </span>
              </>
            ) : (
              <>
                <Upload className="h-10 w-10 opacity-40" />
                <span className="text-xs font-bold">クリックして PDF を開く</span>
                <span className="text-[10px]">またはドラッグ＆ドロップ · 保存済 💾</span>
              </>
            )}
          </button>
        )}

        {isDragActive ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-blue-500/15">
            <p className="text-sm font-bold text-blue-800">ドロップして PDF をセット</p>
          </div>
        ) : null}
      </div>
    </div>
  );
};
