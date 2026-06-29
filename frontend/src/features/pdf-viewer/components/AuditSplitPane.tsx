"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Database, FolderOpen, RefreshCcw, Upload, X } from "lucide-react";
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
  emptyClickOpensSavedPicker?: boolean;
  clientId?: string;
};

function SplitScrollPage({
  pageIndex,
  file,
  onRenderPage,
  markers,
  selectedLinkId,
  side,
  activeTool,
  onCheckPoint,
  registerPageEl,
}: {
  pageIndex: number;
  file: File;
  onRenderPage: (page: number, fileOverride?: File) => Promise<string | null>;
  markers: PaneMarker[];
  selectedLinkId?: string | null;
  side: AuditSide;
  activeTool: ToolType;
  onCheckPoint: AuditSplitPaneProps["onCheckPoint"];
  registerPageEl: (pageIndex: number, el: HTMLDivElement | null) => void;
}) {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setImage(null);
    setLoading(false);
  }, [file, pageIndex]);

  useEffect(() => {
    registerPageEl(pageIndex, containerRef.current);
    return () => registerPageEl(pageIndex, null);
  }, [pageIndex, registerPageEl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let active = true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setLoading(true);
        void onRenderPage(pageIndex, file).then((img) => {
          if (active) {
            setImage(img);
            setLoading(false);
          }
        });
        observer.disconnect();
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(el);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [file, pageIndex, onRenderPage]);

  const markersOnPage = markers.filter((m) => m.page === pageIndex);

  return (
    <div ref={containerRef} data-page-index={pageIndex} className="relative w-full scroll-mt-1">
      <div
        className="relative mx-auto inline-block max-w-full"
        onClick={(e) => {
          if (activeTool !== "check") return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width;
          const y = (e.clientY - rect.top) / rect.height;
          onCheckPoint(side, { page: pageIndex, x, y, fileName: file.name });
        }}
        style={{ cursor: activeTool === "check" ? "crosshair" : "default" }}
      >
        {image ? (
          <img
            src={image}
            alt={`ページ ${pageIndex + 1}`}
            className="block w-full shadow-md"
            draggable={false}
          />
        ) : (
          <div className="flex h-40 w-full min-w-[8rem] items-center justify-center bg-white text-xs text-slate-400 shadow-sm">
            {loading ? "読み込み中…" : ""}
          </div>
        )}
        {markersOnPage.map((marker, idx) => {
          const isPending = marker.kind === "pending";
          const isSelected = marker.linkId && marker.linkId === selectedLinkId;
          return (
            <div
              key={`${side}-m-${pageIndex}-${idx}-${marker.linkId ?? "pending"}`}
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
      {pageIndex > 0 ? <div className="h-2 shrink-0" aria-hidden /> : null}
    </div>
  );
}

export const AuditSplitPane = ({
  side,
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const sideAccent =
    side === "left"
      ? "ring-red-400/60"
      : "ring-emerald-400/60";

  useEffect(() => {
    pageRefs.current = [];
    scrollRef.current?.scrollTo({ top: 0 });
  }, [file]);

  useEffect(() => {
    if (pageJump == null || pageJump < 0) return;
    pageRefs.current[pageJump]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [pageJump]);

  const registerPageEl = useCallback((index: number, el: HTMLDivElement | null) => {
    pageRefs.current[index] = el;
  }, []);

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
  }, [file, clientId]);

  const pageIndices = useMemo(
    () => (pageCount > 0 ? Array.from({ length: pageCount }, (_, i) => i) : []),
    [pageCount],
  );

  const pickLocalFile = () => fileInputRef.current?.click();

  const handleEmptyAreaClick = () => {
    if (emptyClickOpensSavedPicker) {
      setIsPickerOpen(true);
    } else {
      pickLocalFile();
    }
  };

  return (
    <div
      className={`group/pane relative flex min-h-0 min-w-0 flex-1 flex-col border-r border-slate-300/80 bg-slate-100 last:border-r-0 ${
        isDragActive ? "ring-2 ring-inset ring-blue-400" : ""
      } ${pendingOnThisSide ? `ring-2 ring-inset ${sideAccent}` : ""}`}
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

      {file ? (
        <div className="pointer-events-none absolute right-1.5 top-1.5 z-20 flex gap-0.5 opacity-0 transition-opacity group-hover/pane:pointer-events-auto group-hover/pane:opacity-100 group-focus-within/pane:pointer-events-auto group-focus-within/pane:opacity-100">
          <button
            type="button"
            onClick={() => workingFile && onFileChange(workingFile)}
            disabled={!workingFile}
            title="作業中の PDF に戻す"
            className="pointer-events-auto rounded-md bg-slate-900/75 p-1 text-white shadow hover:bg-slate-800 disabled:opacity-40"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsPickerOpen((v) => !v)}
            title="保存済 PDF から選択"
            className={`pointer-events-auto rounded-md p-1 shadow ${
              isPickerOpen ? "bg-blue-600 text-white" : "bg-slate-900/75 text-white hover:bg-slate-800"
            }`}
          >
            <Database className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={pickLocalFile}
            title="PC から PDF を開く"
            className="pointer-events-auto rounded-md bg-slate-900/75 p-1 text-white shadow hover:bg-slate-800"
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onFileChange(null)}
            title="クリア"
            className="pointer-events-auto rounded-md bg-slate-900/75 p-1 text-white shadow hover:bg-red-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {isPickerOpen && file ? (
        <div className="absolute inset-x-0 top-0 z-30 max-h-[45%] overflow-hidden border-b border-slate-300 bg-white shadow-lg">
          <ServerFilePanel
            onFileSelect={(picked) => {
              onFileChange(picked);
              setIsPickerOpen(false);
            }}
          />
        </div>
      ) : null}

      <div ref={scrollRef} className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
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
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-1.5">
            {pageIndices.map((pageIndex) => (
              <SplitScrollPage
                key={`${file.name}-${pageIndex}`}
                pageIndex={pageIndex}
                file={file}
                onRenderPage={onRenderPage}
                markers={markers}
                selectedLinkId={selectedLinkId}
                side={side}
                activeTool={activeTool}
                onCheckPoint={onCheckPoint}
                registerPageEl={registerPageEl}
              />
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleEmptyAreaClick}
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          >
            {emptyClickOpensSavedPicker ? (
              <>
                <Database className="h-10 w-10 text-blue-500 opacity-50" />
                <span className="text-xs font-bold text-slate-600">クリックして資料を選ぶ</span>
                <span className="text-center text-[10px] leading-relaxed text-slate-500">
                  上部レールの左半分・右半分 · ドラッグ＆ドロップ
                </span>
              </>
            ) : (
              <>
                <Upload className="h-10 w-10 opacity-40" />
                <span className="text-xs font-bold">クリックして PDF を開く</span>
                <span className="text-[10px]">またはドラッグ＆ドロップ</span>
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
