"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Upload } from "lucide-react";
import type { CaptureCategory } from "@/features/capture/types";

type Props = {
  category: CaptureCategory;
  uploading: boolean;
  onFiles: (files: File[]) => void;
};

export function CaptureZone({ category, uploading, onFiles }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list?.length) return;
      onFiles(Array.from(list));
    },
    [onFiles],
  );

  const accept = "image/*,application/pdf";

  return (
    <div
      className={`capture-zone relative overflow-hidden rounded-2xl border-2 border-dashed transition-all ${
        dragOver
          ? "border-sky-400 bg-sky-50/80"
          : "border-slate-200 bg-gradient-to-br from-slate-50 to-white"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={cameraRef}
        type="file"
        accept={accept}
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 px-6 py-10 text-center sm:min-h-[240px]">
        {uploading ? (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-sky-500" />
            <p className="text-sm text-slate-600">アップロード中…</p>
          </>
        ) : (
          <>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 text-sky-600">
              <Camera className="h-8 w-8" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-800">パシャッと撮影</p>
              <p className="mt-1 text-sm text-slate-500">
                カメラ起動・ドラッグ＆ドロップ・ファイル選択
                {category === "expense" ? "（経費レシート）" : null}
                {category === "marufu" ? "（まるふ・控除証明書）" : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
                onClick={() => cameraRef.current?.click()}
              >
                <Camera className="h-4 w-4" />
                カメラで撮影
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" />
                画像を選ぶ
              </button>
            </div>
            <p className="flex items-center gap-1 text-xs text-slate-400">
              <Upload className="h-3 w-3" />
              ここにドロップもOK
            </p>
          </>
        )}
      </div>
    </div>
  );
}
