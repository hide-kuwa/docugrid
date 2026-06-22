"use client";

import type { DocumentCategoryConfig } from "@/config/organization";
import { WipBanner } from "@/components/work-in-progress";
import { formatConfigCellAddress } from "../lib/cell-address";
import {
  ConfigMatrixHead,
  ConfigMatrixTable,
  ConfigMatrixTd,
  ConfigMatrixTh,
} from "./ConfigMatrixTable";

type Props = {
  categories: DocumentCategoryConfig[];
  ocrAutoExtractEnabled: boolean;
  onOcrAutoExtractChange: (enabled: boolean) => void;
};

function FlagCell({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border text-[10px] font-black ${
        on
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : "border-dashed border-slate-200 bg-slate-50 text-slate-300"
      }`}
      title={label}
    >
      {on ? "1" : "·"}
    </span>
  );
}

export function DocumentCategoryMatrix({
  categories,
  ocrAutoExtractEnabled,
  onOcrAutoExtractChange,
}: Props) {
  return (
    <div className="space-y-4">
      <ConfigMatrixTable caption="システム行（integrations シートと共有）">
        <ConfigMatrixHead>
          <tr>
            <ConfigMatrixTh>行 ID</ConfigMatrixTh>
            <ConfigMatrixTh>項目</ConfigMatrixTh>
            <ConfigMatrixTh className="text-center">値</ConfigMatrixTh>
          </tr>
        </ConfigMatrixHead>
        <tbody>
          <tr className="hover:bg-slate-50/80">
            <ConfigMatrixTd className="font-mono text-[10px] text-slate-500">ocr_auto</ConfigMatrixTd>
            <ConfigMatrixTd cellAddress={formatConfigCellAddress("integrations", "ocr_auto", "enabled")}>
              OCR 自動抽出（全体）
            </ConfigMatrixTd>
            <ConfigMatrixTd className="text-center">
              <button
                type="button"
                onClick={() => onOcrAutoExtractChange(!ocrAutoExtractEnabled)}
                className={`rounded-full px-3 py-1 text-[10px] font-bold ${
                  ocrAutoExtractEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {ocrAutoExtractEnabled ? "ON" : "OFF"}
              </button>
            </ConfigMatrixTd>
          </tr>
        </tbody>
      </ConfigMatrixTable>

      <ConfigMatrixTable caption="書類カテゴリ × フラグ列（メインの資料枠定義元）">
        <ConfigMatrixHead>
          <tr>
            <ConfigMatrixTh className="min-w-[10rem]">カテゴリ（行）</ConfigMatrixTh>
            <ConfigMatrixTh className="text-center">OCR</ConfigMatrixTh>
            <ConfigMatrixTh className="text-center">Dashboard</ConfigMatrixTh>
            <ConfigMatrixTh className="text-center">Alert</ConfigMatrixTh>
          </tr>
        </ConfigMatrixHead>
        <tbody>
          {categories.map((doc) => (
            <tr key={doc.id} className="hover:bg-slate-50/80">
              <ConfigMatrixTd cellAddress={formatConfigCellAddress("documents", doc.id, "label")}>
                <div className="border-l-4 border-blue-600 pl-2">
                  <div className="text-xs font-bold text-slate-800">{doc.label}</div>
                  <div className="font-mono text-[9px] text-slate-400">{doc.id}</div>
                </div>
              </ConfigMatrixTd>
              <ConfigMatrixTd className="text-center" cellAddress={formatConfigCellAddress("documents", doc.id, "ocrTarget")}>
                <FlagCell on={doc.ocrTarget} label="OCR" />
              </ConfigMatrixTd>
              <ConfigMatrixTd
                className="text-center"
                cellAddress={formatConfigCellAddress("documents", doc.id, "dashboardTarget")}
              >
                <FlagCell on={doc.dashboardTarget} label="Dashboard" />
              </ConfigMatrixTd>
              <ConfigMatrixTd className="text-center" cellAddress={formatConfigCellAddress("documents", doc.id, "alertTarget")}>
                <FlagCell on={doc.alertTarget} label="Alert" />
              </ConfigMatrixTd>
            </tr>
          ))}
        </tbody>
      </ConfigMatrixTable>
      <WipBanner
        kind="planned"
        title="書類カテゴリマトリクス（設定）"
        message="フラグの編集はコード定義（organization.ts）のみ。セル単位の API 保存は未実装です。"
        className="mt-3"
      />
    </div>
  );
}
