"use client";

import { ConfigSheetIntro } from "@/features/config/components/ConfigSheetIntro";
import { DocumentCategoryMatrix } from "@/features/config/components/DocumentCategoryMatrix";
import type { DocumentCategoryConfig } from "@/lib/document-types-api";

type DocumentsSettingsTabProps = {
  documentCategories: DocumentCategoryConfig[];
  ocrAutoExtractEnabled: boolean;
  onOcrAutoExtractChange: (enabled: boolean) => void;
};

export function DocumentsSettingsTab({
  documentCategories,
  ocrAutoExtractEnabled,
  onOcrAutoExtractChange,
}: DocumentsSettingsTabProps) {
  return (
    <section className="fade-in-up space-y-4">
      <ConfigSheetIntro
        sheetId="documents"
        sheetLabel="DOCS"
        title="書類種別マスタ"
        description="大分類（定款・法人税申告書…）の定義。編集は開発コンソールの書類定義マスタ。"
      />
      <DocumentCategoryMatrix
        categories={documentCategories}
        ocrAutoExtractEnabled={ocrAutoExtractEnabled}
        onOcrAutoExtractChange={onOcrAutoExtractChange}
      />
    </section>
  );
}
