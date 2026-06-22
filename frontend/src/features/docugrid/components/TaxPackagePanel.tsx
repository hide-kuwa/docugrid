"use client";

import { useCallback, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  FileStack,
  GripVertical,
  Loader2,
  Merge,
  Upload,
} from "lucide-react";

import {
  classifyBatch,
  downloadMergedPackage,
} from "@/features/docugrid/lib/classify-batch";
import {
  labelForTaxType,
  sortByTemplate,
  type ClassifiedPackageDocument,
  type FirmDocumentTemplate,
  type TaxDocumentType,
} from "@/features/docugrid/schema/tax-document";

export type PackageQueueItem = {
  id: string;
  file: File;
  fileName: string;
  identifiedType: TaxDocumentType;
  confidence: number;
  reason?: string;
  engine: string;
  slotId?: string | null;
  label?: string;
};

type Props = {
  canUpload: boolean;
  clientId: string;
  periodKey: string;
  onAssignToSlot: (file: File, slotId: string, label: string) => Promise<void>;
  onNotice: (message: string) => void;
};

function toQueueItem(doc: ClassifiedPackageDocument, file: File): PackageQueueItem {
  return {
    id: crypto.randomUUID(),
    file,
    fileName: doc.fileName,
    identifiedType: doc.identifiedType,
    confidence: doc.confidence,
    reason: doc.reason,
    engine: doc.engine,
    slotId: doc.slotId,
    label: doc.label,
  };
}

export function TaxPackagePanel({
  canUpload,
  clientId,
  periodKey,
  onAssignToSlot,
  onNotice,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PackageQueueItem[]>([]);
  const [isClassifying, setIsClassifying] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [template, setTemplate] = useState<FirmDocumentTemplate | null>(null);
  const [visionHint, setVisionHint] = useState<string | null>(null);

  const acceptFiles = useCallback(
    async (files: File[]) => {
      if (!canUpload || files.length === 0) return;
      const pdfs = files.filter(
        (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name),
      );
      if (pdfs.length === 0) {
        onNotice("PDF ファイルを選択してください。");
        return;
      }
      setIsClassifying(true);
      try {
        const result = await classifyBatch(pdfs, clientId);
        if (result.template) setTemplate(result.template);
        const sortOrder = result.template?.sortOrder ?? [];
        const fileByName = new Map(pdfs.map((f) => [f.name, f]));
        const docs = result.documents.map((d) => {
          const file = fileByName.get(d.fileName);
          if (!file) throw new Error(`missing-file:${d.fileName}`);
          return toQueueItem(d, file);
        });
        setItems(sortByTemplate(docs, sortOrder));
        const cap = result.capabilities;
        if (cap?.vision_gemini) {
          setVisionHint("Gemini Vision で分類しました。");
        } else if (cap?.vision_openai) {
          setVisionHint("OpenAI Vision で分類しました。");
        } else if (cap?.vision_enabled) {
          setVisionHint("Vision LLM で分類しました。");
        } else if (cap?.ai_openai_key_configured) {
          setVisionHint("ルール分類で処理しました（Vision は OCR/AI 設定を確認）。");
        } else {
          setVisionHint("ルール分類のみ（API キー未設定のため AI 未使用）。");
        }
        onNotice(`${docs.length} 件を申告パッケージとして分類・整列しました。`);
      } catch (err) {
        console.error(err);
        onNotice("申告パッケージの分類に失敗しました。");
      } finally {
        setIsClassifying(false);
      }
    },
    [canUpload, clientId, onNotice],
  );

  const moveItem = (index: number, direction: -1 | 1) => {
    setItems((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const handleMerge = async () => {
    if (items.length === 0) return;
    setIsMerging(true);
    try {
      await downloadMergedPackage(
        items.map((i) => i.file),
        `申告パッケージ_${periodKey}.pdf`,
        clientId,
      );
      onNotice("テンプレート順で結合 PDF をダウンロードしました。");
    } catch (err) {
      console.error(err);
      onNotice("PDF 結合に失敗しました。");
    } finally {
      setIsMerging(false);
    }
  };

  const handleAssign = async (item: PackageQueueItem) => {
    if (!item.slotId) {
      onNotice(`「${labelForTaxType(item.identifiedType)}」に対応するスロットがありません。手動で配置してください。`);
      return;
    }
    await onAssignToSlot(item.file, item.slotId, item.label ?? labelForTaxType(item.identifiedType));
    setItems((prev) => prev.filter((p) => p.id !== item.id));
  };

  if (!canUpload) return null;

  return (
    <section
      data-tour="tax-package"
      className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-black text-indigo-900">
            <FileStack className="h-4 w-4" aria-hidden />
            申告パッケージ自動整列
          </div>
          <p className="mt-1 text-[11px] text-indigo-800/80">
            法人税・消費税等の PDF 束を AI で種別判定し、事務所テンプレの順に並べます。
            {template ? `（${template.templateName}）` : ""}
          </p>
          {visionHint && (
            <p className="mt-1 text-[10px] font-medium text-indigo-600">{visionHint}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              void acceptFiles(list);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={isClassifying}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isClassifying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            PDF をまとめて解析
          </button>
          {items.length > 0 && (
            <button
              type="button"
              disabled={isMerging}
              onClick={() => void handleMerge()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
            >
              {isMerging ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Merge className="h-3.5 w-3.5" />
              )}
              この順で結合
            </button>
          )}
        </div>
      </div>

      {items.length > 0 && (
        <ol className="mt-4 space-y-2">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-100 bg-white p-3 shadow-sm"
            >
              <GripVertical className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
              <span className="w-6 shrink-0 text-center text-xs font-black text-indigo-500">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold text-slate-800">{item.file.name}</div>
                <div className="mt-0.5 text-[10px] text-slate-500">
                  {labelForTaxType(item.identifiedType)} ・ 確信度{" "}
                  {Math.round(item.confidence * 100)}% ・ {item.engine}
                  {item.reason ? ` ・ ${item.reason}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label="上へ"
                  disabled={index === 0}
                  onClick={() => moveItem(index, -1)}
                  className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="下へ"
                  disabled={index === items.length - 1}
                  onClick={() => moveItem(index, 1)}
                  className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                {item.slotId && (
                  <button
                    type="button"
                    onClick={() => void handleAssign(item)}
                    className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-blue-700"
                  >
                    スロットへ
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
