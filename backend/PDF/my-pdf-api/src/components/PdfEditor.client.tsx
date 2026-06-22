'use client';

import { useState, useEffect } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DragEndEvent } from '@dnd-kit/core';

type Page = {
  id: string;
  thumbnailUrl: string;
  originalPageNum: number;
};

type PdfjsLib = typeof import('pdfjs-dist/build/pdf');

function SortablePage({ page, onDelete }: { page: Page; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: page.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="relative group">
      <img src={page.thumbnailUrl} alt={`Page ${page.originalPageNum}`} className="border-2 border-gray-600 rounded-md shadow-md" />
      <button
        onClick={() => onDelete(page.id)}
        className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Delete page"
      >
        ✕
      </button>
    </div>
  );
}

export default function PdfEditor() {
  const [pdfjs, setPdfjs] = useState<PdfjsLib | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadPdfjs = async () => {
      const pdfjsLib = await import('pdfjs-dist/build/pdf');
      const workerSrc = new URL('/pdf.worker.min.mjs', window.location.origin).toString();
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
      setPdfjs(pdfjsLib);
    };
    loadPdfjs();
  }, []);

  const sensors = useSensors(useSensor(PointerSensor));

  const handleFileDrop = async (files: FileList | null) => {
    if (!files || !pdfjs) return;
    const file = files[0];
    if (file.type !== 'application/pdf') {
      alert('PDFファイルを選択してください。');
      return;
    }
    setOriginalFile(file);
    setIsLoading(true);

    const fileReader = new FileReader();
    fileReader.onload = async () => {
      const typedarray = new Uint8Array(fileReader.result as ArrayBuffer);
      const pdf: PDFDocumentProxy = await pdfjs.getDocument(typedarray).promise;
      const pageThumbnails: Page[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        
        pageThumbnails.push({ id: `page-${i}`, thumbnailUrl: canvas.toDataURL(), originalPageNum: i });
      }
      setPages(pageThumbnails);
      setIsLoading(false);
    };
    fileReader.readAsArrayBuffer(file);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPages((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleDeletePage = (idToDelete: string) => {
    setPages((currentPages) => currentPages.filter((page) => page.id !== idToDelete));
  };
  
  const handleMergeAndDownload = async () => {
    if (!originalFile || pages.length === 0) return;
    setIsLoading(true);
    const pageOrder = pages.map(p => p.originalPageNum).join(',');
    const formData = new FormData();
    formData.append('file', originalFile);
    formData.append('order', pageOrder);
    try {
      const response = await fetch('/api/reorder', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('API Error');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
a.href = url;
      a.download = `edited_${originalFile.name}`;
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('エラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  if (!pdfjs) {
    return (
      <div className="w-full max-w-4xl p-6 text-center text-white">
        PDFライブラリを読み込んでいます...
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl p-6 bg-gray-800 rounded-lg shadow-xl text-white">
      {pages.length === 0 ? (
        <div 
          className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-gray-500 rounded-lg cursor-pointer hover:bg-gray-700"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFileDrop(e.dataTransfer.files); }}
        >
          <p className="mb-4">ここにPDFファイルをドラッグ＆ドロップ</p>
          <p className="text-sm text-gray-400">または</p>
          <input 
            type="file" 
            accept=".pdf"
            className="hidden" 
            id="file-upload"
            onChange={(e) => handleFileDrop(e.target.files)} 
          />
          <label htmlFor="file-upload" className="mt-4 px-4 py-2 bg-violet-600 rounded-md cursor-pointer hover:bg-violet-700">
            ファイルを選択
          </label>
        </div>
      ) : (
        <div>
          <h2 className="text-xl font-bold mb-4">ページを並べ替えてください</h2>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={pages} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
                {pages.map(page => <SortablePage key={page.id} page={page} onDelete={handleDeletePage} />)}
              </div>
            </SortableContext>
          </DndContext>
          <div className="mt-8 flex justify-end">
            <button
              onClick={handleMergeAndDownload}
              disabled={isLoading}
              className="px-6 py-3 font-bold text-white bg-green-600 rounded-md disabled:bg-gray-500 hover:bg-green-700"
            >
              {isLoading ? '処理中...' : '完了してダウンロード'}
            </button>
          </div>
        </div>
      )}
      {isLoading && <p className="text-center mt-4">処理中です。しばらくお待ちください...</p>}
    </div>
  );
}