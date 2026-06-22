'use client';

import { useState, useId } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DragEndEvent } from '@dnd-kit/core';
import { Document, Page, pdfjs } from 'react-pdf';

// これが最後の、そして正しいパスです
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

type PdfFile = {
  id: string;
  file: File;
  pageCount: number;
};

function SortableFile({ pdfFile, onDelete }: { pdfFile: PdfFile; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: pdfFile.id });
  const style = { transform: CSS.Transform.toString(transform), transition, touchAction: 'none' };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="relative group w-40 text-center">
      <div className="w-full h-56 border-2 border-gray-600 rounded-md shadow-md p-2 flex items-center justify-center bg-white">
        <Document file={pdfFile.file}>
          <Page pageNumber={1} width={140} />
        </Document>
      </div>
      <p className="text-xs text-white truncate mt-2">{pdfFile.file.name}</p>
      <p className="text-xs text-gray-400">{pdfFile.pageCount} ページ</p>
      <button onClick={() => onDelete(pdfFile.id)} className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
    </div>
  );
}

export default function PdfMerger() {
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const componentId = useId();
  const sensors = useSensors(useSensor(PointerSensor));

  const handleFileSelect = async (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    setIsLoading(true);

    const newPdfFiles: PdfFile[] = [];
    for (const file of Array.from(selectedFiles)) {
      if (file.type !== 'application/pdf') continue;
      
      const fileReader = new FileReader();
      fileReader.onload = (e) => {
        const doc = pdfjs.getDocument(e.target?.result as ArrayBuffer);
        doc.promise.then(pdf => {
          newPdfFiles.push({
            id: `${file.name}-${newPdfFiles.length}-${Date.now()}`,
            file: file,
            pageCount: pdf.numPages,
          });
          if (newPdfFiles.length === selectedFiles.length) {
            setFiles(currentFiles => [...currentFiles, ...newPdfFiles]);
            setIsLoading(false);
          }
        });
      };
      fileReader.readAsArrayBuffer(file);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFiles(items => arrayMove(items, items.findIndex(item => item.id === active.id), items.findIndex(item => item.id === over.id)));
    }
  };

  const handleDeleteFile = (idToDelete: string) => {
    setFiles(currentFiles => currentFiles.filter(file => file.id !== idToDelete));
  };
  
  const handleMerge = async () => {
    if (files.length < 2) {
      alert('結合するには2つ以上のPDFファイルが必要です。');
      return;
    }
    setIsLoading(true);
    const formData = new FormData();
    files.forEach(pdfFile => formData.append('files', pdfFile.file));

    try {
      const response = await fetch('/api/merge', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('API Error');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ilovepdf_merged.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      alert('エラーが発生しました。');
    } finally {
      setIsLoading(false);
      setFiles([]);
    }
  };

  return (
    <div className="w-full min-h-screen bg-gray-900 text-white flex flex-col items-center p-8">
      {files.length === 0 ? (
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">PDFを結合</h1>
          <p className="text-xl text-gray-400 mb-8">複数のPDFファイルを1つのPDFにまとめます。</p>
          <div
            className="w-full max-w-2xl h-64 flex flex-col items-center justify-center border-2 border-dashed border-gray-600 rounded-lg bg-gray-800"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFileSelect(e.dataTransfer.files); }}
          >
            <input type="file" accept=".pdf" multiple className="hidden" id={componentId} onChange={(e) => handleFileSelect(e.target.files)} />
            <label htmlFor={componentId} className="px-8 py-4 bg-red-600 rounded-lg text-xl font-bold cursor-pointer hover:bg-red-700">
              PDFファイルを選択
            </label>
            <p className="mt-4 text-gray-400">またはPDFをここにドロップ</p>
          </div>
        </div>
      ) : (
        <div className="w-full flex flex-col items-center">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={files} strategy={rectSortingStrategy}>
              <div className="flex flex-wrap gap-6 justify-center">
                {files.map(file => <SortableFile key={file.id} pdfFile={file} onDelete={handleDeleteFile} />)}
              </div>
            </SortableContext>
          </DndContext>
          <div className="fixed bottom-0 w-full bg-gray-800 p-4 flex justify-center items-center gap-4 shadow-lg">
             <input type="file" accept=".pdf" multiple className="hidden" id={`${componentId}-add`} onChange={(e) => handleFileSelect(e.target.files)} />
             <label htmlFor={`${componentId}-add`} className="p-4 bg-gray-700 rounded-full cursor-pointer hover:bg-gray-600 text-2xl">+</label>
            <button onClick={handleMerge} disabled={isLoading} className="px-16 py-4 bg-red-600 rounded-lg text-xl font-bold hover:bg-red-700 disabled:bg-gray-500">
              {isLoading ? '結合中...' : 'PDFを結合'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}