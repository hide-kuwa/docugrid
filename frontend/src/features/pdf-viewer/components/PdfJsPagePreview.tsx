"use client";

import { useEffect, useRef, useState } from "react";
import { buildPdfDocumentParams, loadPdfJs } from "../lib/pdfjs-config";

type PdfJsPagePreviewProps = {
  file: File;
  pageIndex: number;
  className?: string;
};

/** サーバー/API が使えないときのクライアント描画（Blob URL に依存しない） */
export function PdfJsPagePreview({ file, pageIndex, className }: PdfJsPagePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      setStatus("loading");
      try {
        const pdfjs = await loadPdfJs();
        const data = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument(
          buildPdfDocumentParams(data, pdfjs.version),
        ).promise;
        const safePage = Math.min(Math.max(0, pageIndex), pdf.numPages - 1);
        const page = await pdf.getPage(safePage + 1);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context unavailable");

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;

        if (!cancelled) setStatus("ready");
      } catch (err) {
        console.error("PdfJsPagePreview:", err);
        if (!cancelled) setStatus("error");
      }
    };

    void render();
    return () => {
      cancelled = true;
    };
  }, [file, pageIndex]);

  if (status === "error") {
    return (
      <p className="text-sm text-slate-500">PDF のクライアント描画に失敗しました。</p>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={className ?? "max-h-[min(80vh,85dvh)] w-auto max-w-full bg-white shadow-2xl"}
      aria-busy={status === "loading"}
    />
  );
}
