"use client";

// Re-deploy triggers
// Re-deploy triggers

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";

GlobalWorkerOptions.workerSrc = pdfWorker;

type PdfHighlight = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type PdfPage = {
  id: string;
  fileId: string;
  originalIndex: number;
  thumbnailUrl: string;
  highlights: PdfHighlight[];
};

type PdfFile = {
  id: string;
  originalFile: File;
  pageCount: number;
};

type PageCardProps = {
  page: PdfPage;
  fileName: string;
  displayIndex: number;
  onOpenEditor?: (pageId: string) => void;
  onDelete: (pageId: string) => void;
  onDownload?: (fileId: string) => void;
  onOcr?: (fileId: string) => void;
  pageCount?: number;
};

function PageCard({ page, fileName, displayIndex, onOpenEditor, onDelete, onDownload, onOcr, pageCount }: PageCardProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onOpenEditor) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenEditor(page.id);
    }
  };

  return (
    <div className="relative group">
      <div
        role={onOpenEditor ? "button" : undefined}
        tabIndex={onOpenEditor ? 0 : undefined}
        onDoubleClick={onOpenEditor ? () => onOpenEditor(page.id) : undefined}
        onKeyDown={onOpenEditor ? handleKeyDown : undefined}
        className="relative rounded-md outline-none focus-visible:ring-2 focus-visible:ring-red-500"
      >
        <img src={page.thumbnailUrl} alt={`Page ${displayIndex}`} className="border-2 border-gray-600 rounded-md shadow-md" />
        {page.highlights.map((highlight) => (
          <div
            key={highlight.id}
            className="pointer-events-none absolute rounded bg-yellow-300/60"
            style={{
              left: `${highlight.x * 100}%`,
              top: `${highlight.y * 100}%`,
              width: `${highlight.width * 100}%`,
              height: `${highlight.height * 100}%`,
            }}
          />
        ))}
        <button
          onClick={(event) => {
            event.stopPropagation();
            onDelete(page.id);
          }}
          className="absolute top-1 right-1 h-6 w-6 rounded-full bg-red-600 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100"
          type="button"
        >
          X
        </button>
        {(onDownload || onOcr) && (
          <div className="absolute inset-x-2 bottom-2 flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {onDownload && (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onDownload(page.fileId);
                }}
                type="button"
                className="rounded bg-green-600 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-green-500"
              >
                DL
              </button>
            )}
            {onOcr && (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onOcr(page.fileId);
                }}
                type="button"
                className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-blue-500"
              >
                OCR
              </button>
            )}
          </div>
        )}
      </div>
      <p className="mt-1 text-[11px] text-gray-300 truncate">{fileName}</p>
      {pageCount ? <p className="text-[10px] text-gray-500">{pageCount} pages</p> : null}
    </div>
  );
}

export default function App() {
  return <PdfMerger />;
}
type SortablePageProps = {
  page: PdfPage;
  fileName: string;
  displayIndex: number;
  onOpenEditor: (pageId: string) => void;
  onDelete: (pageId: string) => void;
  onDownload: (fileId: string) => void;
  onOcr: (fileId: string) => void;
  pageCount?: number;
};

function SortablePage({ page, fileName, displayIndex, onOpenEditor, onDelete, onDownload, onOcr, pageCount }: SortablePageProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: page.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: "none",
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
      <PageCard
        page={page}
        fileName={fileName}
        displayIndex={displayIndex}
        onOpenEditor={onOpenEditor}
        onDelete={onDelete}
        onDownload={onDownload}
        onOcr={onOcr}
        pageCount={pageCount}
      />
    </div>
  );
}

type DeleteZoneProps = {
  isActive: boolean;
};

function DeleteZone({ isActive }: DeleteZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: "delete-zone" });
  const baseClasses =
    "fixed bottom-24 right-12 w-16 h-16 rounded-full border-2 border-dashed flex items-center justify-center text-2xl font-bold transition-all duration-200 z-50";
  const visibilityClasses = isActive ? "opacity-100 scale-100" : "opacity-0 scale-60 pointer-events-none";
  const toneClasses = isOver
    ? "bg-red-600 text-white border-red-400 shadow-2xl"
    : "bg-gray-800/90 text-red-300 border-red-200 shadow-lg";

  return (
    <div ref={setNodeRef} className={`${baseClasses} ${visibilityClasses} ${toneClasses}`} aria-hidden={!isActive}>
      X
    </div>
  );
}

function PdfMerger() {
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [pages, setPages] = useState<PdfPage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGlobalDragActive, setIsGlobalDragActive] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editorImage, setEditorImage] = useState<{ src: string; width: number; height: number } | null>(null);
  const [isRenderingPage, setIsRenderingPage] = useState(false);
  const [draftHighlight, setDraftHighlight] = useState<PdfHighlight | null>(null);
  const [loadingMessage, setLoadingMessage] = useState("Processing...");
  const componentId = useId();
  const dragCounterRef = useRef(0);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const drawingStartRef = useRef<{ x: number; y: number } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const fileMetaMap = useMemo(() => {
    const map = new Map<string, { name: string; pageCount: number }>();
    files.forEach((file) => {
      map.set(file.id, { name: file.originalFile.name, pageCount: file.pageCount });
    });
    return map;
  }, [files]);

  const fileMap = useMemo(() => {
    const map = new Map<string, PdfFile>();
    files.forEach((file) => map.set(file.id, file));
    return map;
  }, [files]);

  const createUniqueId = useCallback(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }, []);

  const importPdfFiles = useCallback(
    async (incomingFiles: File[], options?: { manageLoading?: boolean }) => {
      if (!incomingFiles || incomingFiles.length === 0) {
        return;
      }

      const { manageLoading = true } = options ?? {};
      if (manageLoading) {
        setLoadingMessage("Loading files...");
        setIsLoading(true);
      }
      const newFiles: PdfFile[] = [];
      const newPages: PdfPage[] = [];

      try {
        for (const file of incomingFiles) {
          if (file.type !== "application/pdf") {
            continue;
          }

          const arrayBuffer = await file.arrayBuffer();
          const pdf = await getDocument({ data: arrayBuffer }).promise;

          const fileId = createUniqueId();
          newFiles.push({ id: fileId, originalFile: file, pageCount: pdf.numPages });

          for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 0.5 });
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: context!, viewport }).promise;

            newPages.push({
              id: `${file.name}-page-${pageNumber}-${createUniqueId()}`,
              fileId,
              originalIndex: pageNumber,
              thumbnailUrl: canvas.toDataURL("image/png"),
              highlights: [],
            });
          }
        }

        if (newFiles.length === 0) {
          alert("ファイルを選択してください。");
        } else {
          setFiles((current) => [...current, ...newFiles]);
          setPages((current) => [...current, ...newPages]);
        }
      } catch (error) {
        console.error(error);
        alert("ページの読み込みに失敗しました。PDFファイルが壊れていないか確認してください。");
      } finally {
        if (manageLoading) {
          setIsLoading(false);
          setLoadingMessage("Processing...");
        }
      }
    },
    [createUniqueId],
  );

  const convertImagesToPdfFile = useCallback(
    async (imageFiles: File[]): Promise<File | null> => {
      if (!imageFiles || imageFiles.length === 0) {
        return null;
      }

      const formData = new FormData();
      imageFiles.forEach((image) => formData.append("files", image));

      try {
        const response = await fetch("https://pdf-gl61.onrender.com/api/convert-images", {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          throw new Error("API Error");
        }

        const blob = await response.blob();
        const disposition = response.headers.get("Content-Disposition");
        let filename: string | undefined;
        if (disposition) {
          const match = /filename=\"?([^\";]+)\"?/i.exec(disposition);
          if (match && match[1]) {
            filename = decodeURIComponent(match[1]);
          }
        }

        if (!filename) {
          if (imageFiles.length === 1) {
            const base = imageFiles[0].name.replace(/\.[^.]+$/, "") || "converted";
            filename = `${base}.pdf`;
          } else {
            filename = `converted-${Date.now()}.pdf`;
          }
        }

        if (!filename.toLowerCase().endsWith(".pdf")) {
          filename = `${filename}.pdf`;
        }

        return new File([blob], filename, { type: "application/pdf" });
      } catch (error) {
        console.error(error);
        alert("画像のPDF変換に失敗しました。");
        return null;
      }
    },
    [],
  );

  const handleIncomingFiles = useCallback(
    async (incoming: FileList | File[]) => {
      const items = Array.isArray(incoming) ? incoming : Array.from(incoming ?? []);
      if (items.length === 0) {
        return;
      }

      const pdfFiles = items.filter(
        (file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"),
      );
      const imageFiles = items.filter((file) => file.type.startsWith("image/"));

      if (pdfFiles.length === 0 && imageFiles.length === 0) {
        alert("PDFまたは画像ファイルを追加してください。");
        return;
      }

      setIsLoading(true);
      try {
        if (imageFiles.length > 0) {
          const convertedPdf = await convertImagesToPdfFile(imageFiles);
          if (convertedPdf) {
            await importPdfFiles([convertedPdf], { manageLoading: false });
          }
        }
        if (pdfFiles.length > 0) {
          await importPdfFiles(pdfFiles, { manageLoading: false });
        }
    } finally {
      setIsLoading(false);
      setLoadingMessage("Processing...");
    }
    },
    [convertImagesToPdfFile, importPdfFiles],
  );

  const handleFileSelect = useCallback(
    (selectedFiles: FileList | null) => {
      if (!selectedFiles) return;
      void handleIncomingFiles(selectedFiles);
    },
    [handleIncomingFiles],
  );

  const handleDeleteFile = useCallback(
    (fileId: string) => {
      if (editingPageId) {
        const editingPage = pages.find((page) => page.id === editingPageId);
        if (editingPage && editingPage.fileId === fileId) {
          setEditingPageId(null);
          setEditorImage(null);
          setDraftHighlight(null);
        }
      }

      setFiles((current) => current.filter((file) => file.id !== fileId));
      setPages((current) => current.filter((page) => page.fileId !== fileId));
    },
    [editingPageId, pages],
  );

  const handleDownloadFile = useCallback(
    (fileId: string) => {
      const file = fileMap.get(fileId);
      if (!file) {
        alert("File not found.");
        return;
      }

      const url = window.URL.createObjectURL(file.originalFile);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.originalFile.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    },
    [fileMap],
  );

  const handleOcrFile = useCallback(
    async (fileId: string) => {
      const file = fileMap.get(fileId);
      if (!file) {
        alert("File not found.");
        return;
      }

      setLoadingMessage(`Running OCR: ${file.originalFile.name}`);
      setLoadingMessage("Processing files...");
      setIsLoading(true);

      const formData = new FormData();
      formData.append("file", file.originalFile);

      try {
        const response = await fetch("https://pdf-gl61.onrender.com/api/ocr", { method: "POST", body: formData });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || "OCR API Error");
        }

        const blob = await response.blob();
        const disposition = response.headers.get("Content-Disposition");
        let downloadName = `ocr_${file.originalFile.name}`;
        if (disposition) {
          const match = /filename=\"?([^\";]+)\"?/i.exec(disposition);
          if (match && match[1]) {
            downloadName = decodeURIComponent(match[1]);
          }
        }

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = downloadName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : "Unknown error";
        alert(`Failed to run OCR: ${message}`);
      } finally {
        setIsLoading(false);
        setLoadingMessage("Processing...");
      }
    },
    [fileMap],
  );

  const handleDeletePage = useCallback(
    (pageId: string) => {
      if (editingPageId === pageId) {
        setEditingPageId(null);
        setEditorImage(null);
        setDraftHighlight(null);
      }

      setPages((current) => current.filter((page) => page.id !== pageId));
    },
    [editingPageId],
  );

  useEffect(() => {
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const handleDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragCounterRef.current += 1;
      setIsGlobalDragActive(true);
    };

    const handleDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragCounterRef.current = Math.max(dragCounterRef.current - 1, 0);
      if (dragCounterRef.current === 0) {
        setIsGlobalDragActive(false);
      }
    };

    const handleDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
    };

    const handleDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragCounterRef.current = 0;
      setIsGlobalDragActive(false);
      const droppedFiles = event.dataTransfer?.files;
      if (droppedFiles && droppedFiles.length > 0) {
        handleFileSelect(droppedFiles);
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [handleFileSelect]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setIsDragging(true);
    setActivePageId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setIsDragging(false);
      setActivePageId(null);

      if (!over) return;

      if (over.id === "delete-zone") {
        handleDeletePage(String(active.id));
        return;
      }

      if (active.id !== over.id) {
        setPages((current) => {
          const oldIndex = current.findIndex((page) => page.id === active.id);
          const newIndex = current.findIndex((page) => page.id === over.id);
          if (oldIndex === -1 || newIndex === -1) return current;
          return arrayMove(current, oldIndex, newIndex);
        });
      }
    },
    [handleDeletePage],
  );

  const handleDragCancel = useCallback(() => {
    setIsDragging(false);
    setActivePageId(null);
  }, []);

  const handleRemoveHighlight = useCallback((pageId: string, highlightId: string) => {
    setPages((current) =>
      current.map((page) =>
        page.id === pageId
          ? { ...page, highlights: page.highlights.filter((highlight) => highlight.id !== highlightId) }
          : page,
      ),
    );
  }, []);

  useEffect(() => {
    if (!editingPageId) {
      setEditorImage(null);
      setDraftHighlight(null);
      return;
    }

    const pageToEdit = pages.find((page) => page.id === editingPageId);
    const file = files.find((item) => item.id === pageToEdit?.fileId);
    if (!pageToEdit || !file) {
      setEditorImage(null);
      setDraftHighlight(null);
      return;
    }

    let cancelled = false;
    setIsRenderingPage(true);

    (async () => {
      try {
        const arrayBuffer = await file.originalFile.arrayBuffer();
        const pdf = await getDocument({ data: arrayBuffer }).promise;
        const pdfPage = await pdf.getPage(pageToEdit.originalIndex);
        const scale = 1.5;
        const viewport = pdfPage.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await pdfPage.render({ canvasContext: context!, viewport }).promise;
        if (!cancelled) {
          setEditorImage({ src: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height });
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setEditorImage(null);
        }
      } finally {
        if (!cancelled) {
          setIsRenderingPage(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editingPageId, files, pages]);

  const getRelativePosition = useCallback((event: MouseEvent): { x: number; y: number } | null => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  }, []);

  const finishDrawing = useCallback(
    (event: MouseEvent) => {
      const start = drawingStartRef.current;
      if (!start || !editingPageId) return;
      const pos = getRelativePosition(event);
      drawingStartRef.current = null;
      if (!pos) {
        setDraftHighlight(null);
        return;
      }

      const finalHighlight = {
        x: Math.min(start.x, pos.x),
        y: Math.min(start.y, pos.y),
        width: Math.abs(pos.x - start.x),
        height: Math.abs(pos.y - start.y),
      };

      if (finalHighlight.width < 0.01 || finalHighlight.height < 0.01) {
        setDraftHighlight(null);
        return;
      }

      setPages((current) =>
        current.map((page) =>
          page.id === editingPageId
            ? {
                ...page,
                highlights: [
                  ...page.highlights,
                  { id: createUniqueId(), ...finalHighlight },
                ],
              }
            : page,
        ),
      );
      setDraftHighlight(null);
    },
    [createUniqueId, editingPageId, getRelativePosition],
  );

  const handleOverlayMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const pos = getRelativePosition(event.nativeEvent);
      if (!pos) return;
      drawingStartRef.current = pos;
      setDraftHighlight({ id: "draft", x: pos.x, y: pos.y, width: 0, height: 0 });
    },
    [getRelativePosition],
  );

  const handleOverlayMouseMove = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const start = drawingStartRef.current;
    if (!start) return;
    const pos = getRelativePosition(event.nativeEvent);
    if (!pos) return;
    setDraftHighlight({
      id: "draft",
      x: Math.min(start.x, pos.x),
      y: Math.min(start.y, pos.y),
      width: Math.abs(pos.x - start.x),
      height: Math.abs(pos.y - start.y),
    });
  }, [getRelativePosition]);

  const handleOverlayMouseUp = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      finishDrawing(event.nativeEvent);
    },
    [finishDrawing],
  );

  const handleOverlayMouseLeave = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!drawingStartRef.current) return;
      finishDrawing(event.nativeEvent);
    },
    [finishDrawing],
  );

  const handleMerge = useCallback(async () => {
    if (files.length === 0) {
      alert("ファイルを追加してください。");
      return;
    }
    setLoadingMessage("Merging PDFs...");
    setIsLoading(true);

    const ordersMap = new Map<string, number[]>();
    pages.forEach((page) => {
      const existing = ordersMap.get(page.fileId) ?? [];
      existing.push(page.originalIndex);
      ordersMap.set(page.fileId, existing);
    });

    const highlightMap = new Map<string, { originalIndex: number; highlights: PdfHighlight[] }[]>();
    pages.forEach((page) => {
      const existing = highlightMap.get(page.fileId) ?? [];
      existing.push({ originalIndex: page.originalIndex, highlights: page.highlights });
      highlightMap.set(page.fileId, existing);
    });

    const formData = new FormData();
    const orders = files.map((file) => ordersMap.get(file.id) ?? []);
    formData.append("orders", JSON.stringify(orders));

    const hasHighlights = pages.some((page) => page.highlights.length > 0);
    if (hasHighlights) {
      const highlightsPayload = files.map((file) => {
        const entries = highlightMap.get(file.id) ?? [];
        return entries.map((entry) => ({
          originalIndex: entry.originalIndex,
          highlights: entry.highlights.map(({ x, y, width, height }) => ({ x, y, width, height })),
        }));
      });
      formData.append("highlights", JSON.stringify(highlightsPayload));
    }
    files.forEach((pdfFile) => {
      formData.append("files", pdfFile.originalFile);
    });

    try {
      const response = await fetch("https://pdf-gl61.onrender.com/api/merge", { method: "POST", body: formData });
      if (!response.ok) throw new Error("API Error");
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition");
      let downloadName = "merged.pdf";
      if (disposition) {
        const match = /filename="?([^\";]+)"?/i.exec(disposition);
        if (match && match[1]) {
          downloadName = decodeURIComponent(match[1]);
        }
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setFiles([]);
      setPages([]);
      setEditingPageId(null);
      setEditorImage(null);
      setDraftHighlight(null);
    } catch (error) {
      console.error(error);
      alert("APIへの接続に失敗しました。Pythonサーバー(localhost:3100)は起動していますか？");
      } finally {
        setIsLoading(false);
        setLoadingMessage("Processing...");
      }
  }, [files, pages]);

  const activePage = useMemo(() => pages.find((page) => page.id === activePageId) ?? null, [pages, activePageId]);
  const editingPage = useMemo(
    () => pages.find((page) => page.id === editingPageId) ?? null,
    [pages, editingPageId],
  );
  const highlightedCount = useMemo(() => pages.reduce((sum, page) => sum + page.highlights.length, 0), [pages]);
  return (
    <div className="relative w-full min-h-screen bg-gray-900 text-white flex flex-col items-center gap-16 p-8">
      {isGlobalDragActive && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 pointer-events-none">
          <div className="border-4 border-dashed border-gray-200 text-center px-16 py-12 rounded-2xl bg-gray-900/70 pointer-events-none">
            <p className="text-3xl font-bold mb-4">ここにドロップ！</p>
            <p className="text-lg text-gray-200">PDFや画像ファイルを離すと自動で読み込まれます。</p>
          </div>
        </div>
      )}

      {pages.length === 0 ? (
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">ファイルを読み込んで開始</h1>
          <p className="text-xl text-gray-400 mb-8">PDFや画像ファイルをまとめて読み込み、ページごとにハイライトできます。</p>
          <div
            className="w-full max-w-2xl h-64 flex flex-col items-center justify-center border-2 border-dashed border-gray-600 rounded-lg bg-gray-800"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFileSelect(e.dataTransfer.files);
            }}
          >
            <input
              type="file"
              accept=".pdf,image/*"
              multiple
              className="hidden"
              id={componentId}
              onChange={(e) => {
                handleFileSelect(e.target.files);
                e.target.value = "";
              }}
            />
            <label htmlFor={componentId} className="px-8 py-4 bg-red-600 rounded-lg text-xl font-bold cursor-pointer hover:bg-red-700">
              ファイルを選択
            </label>
            <p className="mt-4 text-gray-400">またはPDF/画像をここにドロップ</p>
          </div>
        </div>
      ) : (
        <div className="w-full flex flex-col items-center gap-8">
          <div className="w-full max-w-6xl flex flex-wrap gap-4 justify-center">
            {files.map((file) => (
              <button
                key={file.id}
                onClick={() => handleDeleteFile(file.id)}
                className="px-4 py-1 text-xs rounded-full border border-red-500 text-red-300 hover:bg-red-500/20"
                type="button"
              >
                {file.originalFile.name} を削除
              </button>
            ))}
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={pages} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {pages.map((page, index) => {
                  const meta = fileMetaMap.get(page.fileId);
                  return (
                    <SortablePage
                      key={page.id}
                      page={page}
                      fileName={meta?.name ?? ""}
                      pageCount={meta?.pageCount}
                      displayIndex={index + 1}
                      onOpenEditor={setEditingPageId}
                      onDelete={handleDeletePage}
                      onDownload={handleDownloadFile}
                      onOcr={handleOcrFile}
                    />
                  );
                })}
              </div>
            </SortableContext>

            <DeleteZone isActive={isDragging} />

            <DragOverlay dropAnimation={null}>
              {activePage ? (
                <PageCard
                  page={activePage}
                  fileName={fileMetaMap.get(activePage.fileId)?.name ?? ""}
                  pageCount={fileMetaMap.get(activePage.fileId)?.pageCount}
                  displayIndex={pages.findIndex((page) => page.id === activePage.id) + 1}
                  onOpenEditor={setEditingPageId}
                  onDelete={handleDeletePage}
                  onDownload={handleDownloadFile}
                  onOcr={handleOcrFile}
                />
              ) : null}
            </DragOverlay>
          </DndContext>

          <div
            className={`fixed bottom-0 w-full bg-gray-800 p-4 flex justify-center items-center gap-4 shadow-lg transition-opacity ${
              isDragging ? "opacity-60 pointer-events-none" : "opacity-100"
            }`}
          >
            <input
              type="file"
              accept=".pdf,image/*"
              multiple
              className="hidden"
              id={`${componentId}-add`}
              onChange={(e) => {
                handleFileSelect(e.target.files);
                e.target.value = "";
              }}
            />
            <label
              htmlFor={`${componentId}-add`}
              className="p-4 bg-gray-700 rounded-full cursor-pointer hover:bg-gray-600 text-2xl"
              aria-label="ファイルを追加"
            >
              +
            </label>
            <button
              onClick={() => handleMerge()}
              disabled={isLoading}
              className="px-16 py-4 bg-red-600 rounded-lg text-xl font-bold hover:bg-red-700 disabled:bg-gray-500"
            >
              {isLoading ? "処理中..." : "PDFをダウンロード"}
            </button>
          </div>
        </div>
      )}
      {editingPage && editingPageId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">
            <header className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold">蛍光ペンでハイライト</h2>
                <p className="text-sm text-gray-400">{fileMetaMap.get(editingPage.fileId)?.name ?? ""} / ページ {editingPage.originalIndex}</p>
              </div>
              <button
                onClick={() => {
                  setEditingPageId(null);
                  setEditorImage(null);
                  setDraftHighlight(null);
                }}
                className="rounded-full bg-gray-700/80 px-3 py-1 text-sm font-semibold text-white hover:bg-gray-600"
                type="button"
              >
                閉じる
              </button>
            </header>
            <div className="relative flex-1 overflow-auto p-4">
              {isRenderingPage && !editorImage ? (
                <div className="flex h-full items-center justify-center text-gray-300">ページを読み込み中...</div>
              ) : editorImage ? (
                <div className="mx-auto" style={{ maxWidth: "100%", width: editorImage.width }}>
                  <div className="relative" style={{ width: "100%" }}>
                    <img src={editorImage.src} alt="編集中のページ" style={{ width: "100%", height: "auto", display: "block" }} />
                    <div
                      ref={overlayRef}
                      className="absolute inset-0 cursor-crosshair"
                      onMouseDown={handleOverlayMouseDown}
                      onMouseMove={handleOverlayMouseMove}
                      onMouseUp={handleOverlayMouseUp}
                      onMouseLeave={handleOverlayMouseLeave}
                    >
                      {editingPage.highlights.map((highlight) => (
                        <div
                          key={highlight.id}
                          role="button"
                          tabIndex={0}
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRemoveHighlight(editingPageId, highlight.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleRemoveHighlight(editingPageId, highlight.id);
                            }
                          }}
                          className="absolute rounded border border-yellow-400 bg-yellow-300/40 shadow-md outline-none focus-visible:ring-2 focus-visible:ring-yellow-300"
                          style={{
                            left: `${highlight.x * 100}%`,
                            top: `${highlight.y * 100}%`,
                            width: `${highlight.width * 100}%`,
                            height: `${highlight.height * 100}%`,
                          }}
                        />
                      ))}
                      {draftHighlight && (
                        <div
                          className="pointer-events-none absolute rounded border border-yellow-300 bg-yellow-200/40"
                          style={{
                            left: `${draftHighlight.x * 100}%`,
                            top: `${draftHighlight.y * 100}%`,
                            width: `${draftHighlight.width * 100}%`,
                            height: `${draftHighlight.height * 100}%`,
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-gray-400">ページを表示できませんでした。</div>
              )}
            </div>
            <footer className="border-t border-gray-700 px-6 py-3 text-sm text-gray-300">
              追加したい範囲をドラッグするとハイライトできます。ハイライトをクリックすると削除できます。
            </footer>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="rounded-lg bg-white px-8 py-6 text-center text-black shadow-xl">
            <p className="font-semibold">{loadingMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}

