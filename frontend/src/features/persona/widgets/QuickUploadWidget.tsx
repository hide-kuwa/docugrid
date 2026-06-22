"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { persistSlotDocument, type NormalizeResultPayload } from "@/features/docugrid/lib/slot-documents";
import { pollOcrJob } from "@/features/docugrid/lib/ocr-jobs-api";
import { propagateSlotNormalizeResult } from "@/features/org/org-directory-events";

type Props = {
  clientId: string;
  periodKey: string;
  slotId: string | null;
  slotLabel: string;
  canUpload: boolean;
  onUploaded: () => void;
};

export function QuickUploadWidget({
  clientId,
  periodKey,
  slotId,
  slotLabel,
  canUpload,
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (!slotId) {
      setError("先に未提出の書類を選んでください。");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("PDF ファイルを選んでください。");
      return;
    }
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await persistSlotDocument({
        clientId,
        periodKey,
        slotId,
        slotLabel: slotLabel || file.name,
        file,
        asyncClassify: true,
      });
      if (saved.ocr_job_id) {
        const finished = await pollOcrJob(saved.ocr_job_id, clientId);
        const norm = finished.result?.normalize_result as NormalizeResultPayload | undefined;
        propagateSlotNormalizeResult(clientId, norm ?? null);
        setMessage(`${slotLabel || file.name} を提出しました（OCR 完了）。`);
      } else {
        propagateSlotNormalizeResult(clientId, saved.normalize_result);
        setMessage(`${slotLabel || file.name} を提出しました。`);
      }
      onUploaded();
    } catch {
      setError("アップロードに失敗しました。再度お試しください。");
    } finally {
      setUploading(false);
    }
  };

  if (!canUpload) {
    return (
      <p className="text-sm text-slate-500">このアカウントにはアップロード権限がありません。</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center">
        <p className="text-sm font-medium text-slate-700">
          {slotId ? `提出先: ${slotLabel}` : "未提出リストから書類を選んでください"}
        </p>
        <button
          type="button"
          disabled={!slotId || uploading}
          onClick={() => inputRef.current?.click()}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          PDF を選択して提出
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
      </div>
      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
