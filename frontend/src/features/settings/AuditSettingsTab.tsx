"use client";

import { STAKEHOLDER_MASTER } from "@/config/organization";
import type { OrgClient } from "@/config/organization";
import {
  formatAuditAction,
  REVIEW_EVENT_LABEL,
  type AuditEventRow,
} from "@/features/settings/hooks/useAuditSettings";
import type { ReviewTimelineItem } from "@/features/pdf-viewer/lib/review-events";

type AuditSettingsTabProps = {
  editableClients: OrgClient[];
  auditRows: AuditEventRow[];
  auditLoading: boolean;
  auditMessage: string;
  auditResultFilter: "" | "success" | "denied";
  onAuditResultFilterChange: (value: "" | "success" | "denied") => void;
  auditActionFilter: string;
  onAuditActionFilterChange: (value: string) => void;
  auditPathFilter: string;
  onAuditPathFilterChange: (value: string) => void;
  auditClientFilter: string;
  onAuditClientFilterChange: (value: string) => void;
  auditStakeholderFilter: string;
  onAuditStakeholderFilterChange: (value: string) => void;
  auditFromDate: string;
  onAuditFromDateChange: (value: string) => void;
  auditToDate: string;
  onAuditToDateChange: (value: string) => void;
  reviewExportClientId: string;
  onReviewExportClientIdChange: (value: string) => void;
  reviewExportPeriodKey: string;
  onReviewExportPeriodKeyChange: (value: string) => void;
  reviewExportMessage: string;
  reviewExportLoading: boolean;
  reviewTimelineRows: ReviewTimelineItem[];
  reviewTimelineLoading: boolean;
  reviewTimelineMessage: string;
  onReviewExport: (format: "csv" | "json") => void;
  onLoadReviewTimeline: () => void;
  onLoadAuditEvents: (actionOverride?: string) => void;
  onDownloadAuditCsv: () => void;
};

export function AuditSettingsTab({
  editableClients,
  auditRows,
  auditLoading,
  auditMessage,
  auditResultFilter,
  onAuditResultFilterChange,
  auditActionFilter,
  onAuditActionFilterChange,
  auditPathFilter,
  onAuditPathFilterChange,
  auditClientFilter,
  onAuditClientFilterChange,
  auditStakeholderFilter,
  onAuditStakeholderFilterChange,
  auditFromDate,
  onAuditFromDateChange,
  auditToDate,
  onAuditToDateChange,
  reviewExportClientId,
  onReviewExportClientIdChange,
  reviewExportPeriodKey,
  onReviewExportPeriodKeyChange,
  reviewExportMessage,
  reviewExportLoading,
  reviewTimelineRows,
  reviewTimelineLoading,
  reviewTimelineMessage,
  onReviewExport,
  onLoadReviewTimeline,
  onLoadAuditEvents,
  onDownloadAuditCsv,
}: AuditSettingsTabProps) {
  return (
    <section className="fade-in-up space-y-4">
      <h2 className="text-lg font-bold text-slate-800">操作履歴（監査ログ）</h2>
      <article className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm">
        <div className="text-sm font-bold text-slate-800">業務監査ログ（review_events）エクスポート</div>
        <p className="mt-1 text-xs text-slate-500">
          チェック開始・承認・ページ閲覧など、資料単位の業務イベントを CSV / JSON で出力します（承認権限が必要）。
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs font-bold text-slate-600">
            顧客
            <select
              className="mt-1 block w-48 rounded border border-slate-200 px-2 py-1 text-xs"
              value={reviewExportClientId}
              onChange={(e) => onReviewExportClientIdChange(e.target.value)}
            >
              <option value="">選択してください</option>
              {editableClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.id} / {client.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">
            期キー（任意）
            <input
              className="mt-1 block w-40 rounded border border-slate-200 px-2 py-1 font-mono text-xs"
              value={reviewExportPeriodKey}
              onChange={(e) => onReviewExportPeriodKeyChange(e.target.value)}
              placeholder="year:1"
            />
          </label>
          <button
            type="button"
            disabled={reviewExportLoading}
            onClick={() => onReviewExport("csv")}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            CSV
          </button>
          <button
            type="button"
            disabled={reviewExportLoading}
            onClick={() => onReviewExport("json")}
            className="rounded-lg border border-indigo-300 bg-white px-4 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
          >
            JSON
          </button>
        </div>
        {reviewExportMessage && <p className="mt-2 text-xs text-slate-600">{reviewExportMessage}</p>}
      </article>
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-bold text-slate-800">業務監査タイムライン（閲覧）</div>
        <p className="mt-1 text-xs text-slate-500">
          上と同じ顧客・期キーで、チェック・注釈・承認などのイベントを新しい順に表示します。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={reviewTimelineLoading}
            onClick={onLoadReviewTimeline}
            className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {reviewTimelineLoading ? "読込中…" : "タイムライン読込"}
          </button>
          {reviewTimelineMessage && (
            <span className="text-xs text-slate-600">{reviewTimelineMessage}</span>
          )}
        </div>
        {reviewTimelineRows.length > 0 && (
          <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">日時</th>
                  <th className="px-3 py-2">資料</th>
                  <th className="px-3 py-2">イベント</th>
                  <th className="px-3 py-2">版</th>
                  <th className="px-3 py-2">操作者</th>
                </tr>
              </thead>
              <tbody>
                {reviewTimelineRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px] text-slate-500">
                      {new Date(row.created_at).toLocaleString("ja-JP")}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {row.slot_label ?? `slot ${row.slot_id}`}
                      <span className="ml-1 font-mono text-[10px] text-slate-400">{row.period_key}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {row.action_title ?? REVIEW_EVENT_LABEL[row.event_type] ?? row.event_type}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-blue-700">
                      {row.version_label ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-slate-500">
                      {row.actor_email ?? row.actor_role ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
      <p className="text-xs text-slate-500">
        API 上の成功操作と、401/403 による拒否を記録します。管理者（settings.manage）のみ参照できます。
      </p>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="text-xs font-bold text-slate-600">
          期間（開始）
          <input
            type="date"
            className="mt-1 block rounded border border-slate-200 px-2 py-1 text-xs"
            value={auditFromDate}
            onChange={(e) => onAuditFromDateChange(e.target.value)}
          />
        </label>
        <label className="text-xs font-bold text-slate-600">
          期間（終了）
          <input
            type="date"
            className="mt-1 block rounded border border-slate-200 px-2 py-1 text-xs"
            value={auditToDate}
            onChange={(e) => onAuditToDateChange(e.target.value)}
          />
        </label>
        <label className="text-xs font-bold text-slate-600">
          結果
          <select
            className="mt-1 block rounded border border-slate-200 px-2 py-1 text-xs"
            value={auditResultFilter}
            onChange={(e) => onAuditResultFilterChange(e.target.value as "" | "success" | "denied")}
          >
            <option value="">すべて</option>
            <option value="success">success</option>
            <option value="denied">denied</option>
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">
          顧客
          <select
            className="mt-1 block w-36 rounded border border-slate-200 px-2 py-1 text-xs"
            value={auditClientFilter}
            onChange={(e) => onAuditClientFilterChange(e.target.value)}
          >
            <option value="">すべて</option>
            {editableClients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.id} / {client.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">
          担当
          <select
            className="mt-1 block w-44 rounded border border-slate-200 px-2 py-1 text-xs"
            value={auditStakeholderFilter}
            onChange={(e) => onAuditStakeholderFilterChange(e.target.value)}
          >
            <option value="">すべて</option>
            {STAKEHOLDER_MASTER.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.id} / {actor.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">
          アクション含む
          <input
            className="mt-1 block w-40 rounded border border-slate-200 px-2 py-1 text-xs"
            value={auditActionFilter}
            onChange={(e) => onAuditActionFilterChange(e.target.value)}
            placeholder="例: pdf.highlight"
          />
        </label>
        <label className="text-xs font-bold text-slate-600">
          パス含む
          <input
            className="mt-1 block w-48 rounded border border-slate-200 px-2 py-1 text-xs"
            value={auditPathFilter}
            onChange={(e) => onAuditPathFilterChange(e.target.value)}
            placeholder="例: /api/"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            onAuditActionFilterChange("ssot.normalize");
            void onLoadAuditEvents("ssot.normalize");
          }}
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
        >
          SSOT 正規化のみ
        </button>
        <button
          type="button"
          onClick={() => void onLoadAuditEvents()}
          disabled={auditLoading}
          className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {auditLoading ? "読込中..." : "再読込"}
        </button>
        <button
          type="button"
          onClick={onDownloadAuditCsv}
          disabled={auditRows.length === 0}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          CSV出力
        </button>
      </div>
      {auditMessage && <p className="text-xs text-amber-700">{auditMessage}</p>}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-[11px] text-slate-700">
          <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">時刻</th>
              <th className="px-3 py-2">結果</th>
              <th className="px-3 py-2">HTTP</th>
              <th className="px-3 py-2">ロール</th>
              <th className="px-3 py-2">顧客</th>
              <th className="px-3 py-2">アクション</th>
              <th className="px-3 py-2">パス</th>
              <th className="px-3 py-2">詳細</th>
            </tr>
          </thead>
          <tbody>
            {auditRows.length === 0 && !auditLoading ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                  ログがありません
                </td>
              </tr>
            ) : (
              auditRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px] text-slate-600">{row.created_at}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 font-bold ${
                        row.result === "denied" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"
                      }`}
                    >
                      {row.result}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-slate-500">
                    {row.http_status ?? "—"}
                  </td>
                  <td className="px-3 py-2">{row.role ?? "—"}</td>
                  <td className="max-w-[120px] truncate px-3 py-2 font-mono text-[10px]">{row.client_id ?? "—"}</td>
                  <td className="max-w-[140px] truncate px-3 py-2 font-mono text-[10px]" title={row.action}>
                    {formatAuditAction(row.action)}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2 font-mono text-[10px] text-slate-600">{row.path}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-slate-500" title={row.detail ?? ""}>
                    {row.detail ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
