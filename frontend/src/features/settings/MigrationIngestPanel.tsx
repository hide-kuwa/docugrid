"use client";

import { useRef } from "react";
import Link from "next/link";
import type { OrgClient } from "@/config/organization";
import { formatYen } from "@/features/billing/billing-api";
import { useMigrationIngest } from "@/features/settings/hooks/useMigrationIngest";

type Props = {
  clients: OrgClient[];
  canEdit: boolean;
};

function formatTokenRange(low: number, high: number, yenLow: number, yenHigh: number) {
  if (low === high) {
    return `${low.toLocaleString()} トークン（≈ ${formatYen(yenLow)}）`;
  }
  return `${low.toLocaleString()}〜${high.toLocaleString()} トークン（≈ ${formatYen(yenLow)}〜${formatYen(yenHigh)}）`;
}

export function MigrationIngestPanel({ clients, canEdit }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    status,
    pending,
    recentJobs,
    estimate,
    activeJob,
    isLoading,
    isEstimating,
    isUploading,
    isConfirming,
    message,
    selectedIds,
    batchClientId,
    setBatchClientId,
    batchPeriodKey,
    setBatchPeriodKey,
    batchSlotId,
    setBatchSlotId,
    handleZipSelected,
    toggleSelect,
    batchConfirm,
    reload,
    freePassNoVision,
    setFreePassNoVision,
    folderPrefix,
    setFolderPrefix,
    reclassifySelected,
    isReclassifying,
  } = useMigrationIngest(canEdit);

  const privacy = status?.privacy;
  const threshold = status?.autoPlaceThreshold ?? 0.6;
  const wallet = status?.wallet;

  return (
    <div
      data-tour="settings-migration"
      className="rounded-2xl border border-slate-200 border-l-4 border-l-violet-600 bg-white p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">初回データ整理（ZIP 一括）</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            旧フォルダや ZIP をそのまま投入。フォルダ名・ファイル名から顧問先と期間を推定し、確信度{" "}
            {threshold} 以上は自動でマトリクスへ配置します。AI トークンは月次枠とは別の整理用ウォレットを使います。
          </p>
          {wallet?.hint && (
            <p className="mt-2 text-[11px] font-medium text-violet-800">{wallet.hint}</p>
          )}
          {canEdit && (
            <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">
              <input
                type="checkbox"
                checked={freePassNoVision}
                onChange={(e) => setFreePassNoVision(e.target.checked)}
              />
              初回は Vision なし（無料枠で試す）
            </label>
          )}
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isUploading || isEstimating}
              onClick={() => fileRef.current?.click()}
              className="rounded-lg bg-violet-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-violet-800 disabled:opacity-50"
            >
              {isEstimating || isUploading ? "処理中…" : "ZIP を取り込む"}
            </button>
            <button
              type="button"
              onClick={() => void reload()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
            >
              再読込
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => {
                void handleZipSelected(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </div>
        )}
      </div>

      {wallet && (
        <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-600">
          <span>
            残高: <strong>{wallet.tokenBalance.toLocaleString()}</strong> トークン
            {wallet.balanceYenEstimate != null && (
              <span className="text-slate-500">（≈ {formatYen(wallet.balanceYenEstimate)}）</span>
            )}
          </span>
          <span>
            使用済み: {wallet.tokensUsed.toLocaleString()} トークン
            {wallet.usedYenEstimate != null && (
              <span className="text-slate-500">（≈ {formatYen(wallet.usedYenEstimate)}）</span>
            )}
          </span>
          <span>要確認: {status?.pendingCount ?? 0} 件</span>
          <span>学習エイリアス: {status?.aliasCount ?? 0} 件（この事務所）</span>
          {status?.learningScope && (
            <span>
              全社共有（書類種別）: {status.learningScope.globalAliasCount} 件
              {status.learningScope.isGlobalContributor && " · この事務所は contributor"}
            </span>
          )}
        </div>
      )}

      {estimate && (
        <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50 p-3 text-[11px] text-violet-900">
          <p className="font-bold">見積（この ZIP）</p>
          <p className="mt-1">
            PDF {estimate.pdfCount} 件 ·{" "}
            {formatTokenRange(
              estimate.estimatedTokensLow,
              estimate.estimatedTokensHigh,
              estimate.estimatedYenLow,
              estimate.estimatedYenHigh,
            )}
          </p>
          <p className="mt-1 text-violet-700">
            中央値見積: {estimate.estimatedTokens.toLocaleString()} トークン（≈ {formatYen(estimate.estimatedYen)}）
            {estimate.visionCapable === false && " · Vision 無効のため上限は低め"}
          </p>
        </div>
      )}

      {activeJob && activeJob.status !== "completed" && activeJob.status !== "failed" && (
        <p className="mt-2 text-[11px] text-slate-500">
          処理中… {activeJob.processed}/{activeJob.totalFiles || "—"} ファイル
        </p>
      )}

      {recentJobs.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-bold text-slate-700">見積 → 実消費（直近ジョブ）</h4>
          <div className="mt-2 overflow-auto rounded border border-slate-200">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-2">ZIP</th>
                  <th className="p-2">PDF</th>
                  <th className="p-2">見積</th>
                  <th className="p-2">実消費</th>
                  <th className="p-2">差分</th>
                  <th className="p-2">状態</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((job) => {
                  const delta = job.tokensUsed - job.estimatedTokens;
                  return (
                    <tr key={job.id} className="border-t border-slate-100">
                      <td className="p-2 max-w-[120px] truncate" title={job.sourceName ?? ""}>
                        {job.sourceName ?? job.id.slice(0, 8)}
                      </td>
                      <td className="p-2">{job.totalFiles}</td>
                      <td className="p-2">
                        {job.estimatedTokens.toLocaleString()}
                        <span className="text-slate-400"> / {formatYen(job.estimatedYen)}</span>
                      </td>
                      <td className="p-2">
                        {job.tokensUsed.toLocaleString()}
                        <span className="text-slate-400"> / {formatYen(job.actualYen)}</span>
                      </td>
                      <td className="p-2">
                        {job.status === "completed" || job.status === "failed"
                          ? `${delta >= 0 ? "+" : ""}${delta.toLocaleString()}`
                          : "—"}
                      </td>
                      <td className="p-2">{job.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {privacy && (
        <details className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-[11px] text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-700">
            保存する情報・学習の範囲（個人情報の取り扱い）
          </summary>
          <p className="mt-2 font-medium text-slate-700">{privacy.learningScopeNote}</p>
          {status?.learningScope?.note && (
            <p className="mt-1 text-slate-600">{status.learningScope.note}</p>
          )}
          <p className="mt-2">
            詳細は{" "}
            <Link href="/help?id=migration" className="text-violet-700 underline">
              ヘルプ：初回データ整理
            </Link>
          </p>
        </details>
      )}

      {message && <p className="mt-3 text-xs text-slate-600">{message}</p>}

      {canEdit && pending.length > 0 && (
        <div className="mt-4 space-y-3">
          <h4 className="text-xs font-bold text-slate-700">要確認キュー（一括確定）</h4>
          <div className="flex flex-wrap items-end gap-2 text-[11px]">
            <label className="flex flex-col gap-1">
              <span className="text-slate-500">顧問先</span>
              <select
                className="rounded border border-slate-200 px-2 py-1"
                value={batchClientId}
                onChange={(e) => setBatchClientId(e.target.value)}
              >
                <option value="">選択</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-500">期間キー</span>
              <input
                className="rounded border border-slate-200 px-2 py-1 w-28"
                value={batchPeriodKey}
                onChange={(e) => setBatchPeriodKey(e.target.value)}
                placeholder="year:1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-500">スロット ID</span>
              <input
                className="rounded border border-slate-200 px-2 py-1 w-40"
                value={batchSlotId}
                onChange={(e) => setBatchSlotId(e.target.value)}
                placeholder="slot_invoice 等"
              />
            </label>
            <button
              type="button"
              disabled={isConfirming || selectedIds.length === 0}
              onClick={() => void batchConfirm()}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
            >
              {isConfirming ? "確定中…" : `選択 ${selectedIds.length} 件を確定`}
            </button>
            <label className="flex flex-col gap-1">
              <span className="text-slate-500">フォルダ接頭辞（任意）</span>
              <input
                className="rounded border border-slate-200 px-2 py-1 w-40 font-mono text-[10px]"
                value={folderPrefix}
                onChange={(e) => setFolderPrefix(e.target.value)}
                placeholder="顧問先A/R8"
              />
            </label>
            <button
              type="button"
              disabled={isReclassifying}
              onClick={() => void reclassifySelected()}
              className="rounded-lg border border-violet-400 bg-violet-50 px-3 py-1.5 text-[11px] font-bold text-violet-800 disabled:opacity-50"
            >
              {isReclassifying ? "再分類中…" : "選択を Vision で再分類"}
            </button>
          </div>

          <div className="max-h-64 overflow-auto rounded border border-slate-200">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-2 w-8" />
                  <th className="p-2">パス</th>
                  <th className="p-2">推定</th>
                  <th className="p-2">確信度</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelect(item.id)}
                      />
                    </td>
                    <td className="p-2 font-mono text-[10px] text-slate-600">{item.sourcePath}</td>
                    <td className="p-2 text-slate-700">
                      {item.suggestedClientId ?? "—"} / {item.suggestedPeriodKey ?? "—"} /{" "}
                      {item.suggestedSlotId ?? item.slotLabel ?? "—"}
                    </td>
                    <td className="p-2">{item.confidence.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isLoading && pending.length === 0 && (
        <p className="mt-3 text-xs text-slate-400">読み込み中…</p>
      )}
    </div>
  );
}
