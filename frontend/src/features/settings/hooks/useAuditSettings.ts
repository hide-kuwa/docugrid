"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import {
  downloadReviewEventsExport,
  listReviewTimeline,
  type ReviewTimelineItem,
} from "@/features/pdf-viewer/lib/review-events";

export type AuditEventRow = {
  id: number;
  created_at: string;
  stakeholder_id?: string | null;
  user_email?: string | null;
  role?: string | null;
  client_id?: string | null;
  path: string;
  action: string;
  result: string;
  detail?: string | null;
  http_status?: number | null;
};

export const REVIEW_EVENT_LABEL: Record<string, string> = {
  upload: "アップロード",
  work_save: "作業保存",
  audit_start: "監査開始",
  approve: "承認",
  remand: "差戻し",
  page_view: "ページ閲覧",
  annotate: "注釈",
  export_pdf: "PDF出力",
  viewer_open_preview: "プレビュー",
  viewer_open_edit: "編集開始",
  viewer_close: "ビューア終了",
  audit_link_create: "監査リンク",
  client_share: "クライアント共有",
  client_unshare: "共有解除",
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "slot.upload": "スロット保存",
  "ssot.normalize": "SSOT 正規化",
  "document.classify": "書類分類",
  "document.catalog": "提出状況ボード",
  "ocr.job": "OCR ジョブ",
  "client_master.put": "顧客マスタ更新",
  "client_master.get": "顧客マスタ参照",
  "capture.route": "キャプチャ振分",
};

export const formatAuditAction = (action: string) => AUDIT_ACTION_LABEL[action] ?? action;

export function useAuditSettings(active: boolean) {
  const auditEventsEndpoint = `${API_BASE}/audit-events`;

  const [auditRows, setAuditRows] = useState<AuditEventRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditMessage, setAuditMessage] = useState("");
  const [auditResultFilter, setAuditResultFilter] = useState<"" | "success" | "denied">("");
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditPathFilter, setAuditPathFilter] = useState("");
  const [auditClientFilter, setAuditClientFilter] = useState("");
  const [auditStakeholderFilter, setAuditStakeholderFilter] = useState("");
  const [auditFromDate, setAuditFromDate] = useState("");
  const [auditToDate, setAuditToDate] = useState("");
  const [reviewExportClientId, setReviewExportClientId] = useState("");
  const [reviewExportPeriodKey, setReviewExportPeriodKey] = useState("");
  const [reviewExportMessage, setReviewExportMessage] = useState("");
  const [reviewExportLoading, setReviewExportLoading] = useState(false);
  const [reviewTimelineRows, setReviewTimelineRows] = useState<ReviewTimelineItem[]>([]);
  const [reviewTimelineLoading, setReviewTimelineLoading] = useState(false);
  const [reviewTimelineMessage, setReviewTimelineMessage] = useState("");

  const loadAuditEvents = useCallback(
    async (actionOverride?: string) => {
      setAuditLoading(true);
      setAuditMessage("");
      try {
        const params = new URLSearchParams();
        params.set("limit", "300");
        params.set("offset", "0");
        if (auditResultFilter) params.set("result", auditResultFilter);
        const actionQ = (actionOverride ?? auditActionFilter).trim();
        if (actionQ) params.set("action", actionQ);
        if (auditPathFilter.trim()) params.set("path_contains", auditPathFilter.trim());
        if (auditClientFilter) params.set("client_id", auditClientFilter);
        if (auditStakeholderFilter) params.set("stakeholder_id", auditStakeholderFilter);
        if (auditFromDate) params.set("from_ts", `${auditFromDate}T00:00:00`);
        if (auditToDate) params.set("to_ts", `${auditToDate}T23:59:59`);
        const res = await authFetch(`${auditEventsEndpoint}?${params.toString()}`, {
          headers: buildAuthHeaders(),
        });
        if (!res.ok) throw new Error("audit-load-failed");
        const data = (await res.json()) as AuditEventRow[];
        setAuditRows(Array.isArray(data) ? data : []);
      } catch {
        setAuditMessage("監査ログの取得に失敗しました。管理者権限を確認してください。");
        setAuditRows([]);
      } finally {
        setAuditLoading(false);
      }
    },
    [
      auditEventsEndpoint,
      auditResultFilter,
      auditActionFilter,
      auditPathFilter,
      auditClientFilter,
      auditStakeholderFilter,
      auditFromDate,
      auditToDate,
    ],
  );

  useEffect(() => {
    if (!active) return;
    void loadAuditEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tab switch only
  }, [active]);

  const handleDownloadAuditCsv = useCallback(() => {
    if (auditRows.length === 0) {
      setAuditMessage("CSV出力できるログがありません。");
      return;
    }
    const escapeCsv = (value: string | number | null | undefined): string => {
      if (value === null || value === undefined) return "";
      const text = String(value);
      if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
        return `"${text.replaceAll("\"", "\"\"")}"`;
      }
      return text;
    };
    const header = [
      "id",
      "created_at",
      "result",
      "http_status",
      "role",
      "stakeholder_id",
      "user_email",
      "client_id",
      "action",
      "path",
      "detail",
    ];
    const lines = [
      header.join(","),
      ...auditRows.map((row) =>
        [
          row.id,
          row.created_at,
          row.result,
          row.http_status ?? "",
          row.role ?? "",
          row.stakeholder_id ?? "",
          row.user_email ?? "",
          row.client_id ?? "",
          row.action,
          row.path,
          row.detail ?? "",
        ]
          .map((item) => escapeCsv(item))
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-events-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [auditRows]);

  const handleReviewExport = useCallback(
    async (format: "csv" | "json") => {
      if (!reviewExportClientId) {
        setReviewExportMessage("顧客を選択してください。");
        return;
      }
      setReviewExportLoading(true);
      setReviewExportMessage("");
      try {
        await downloadReviewEventsExport({
          clientId: reviewExportClientId,
          periodKey: reviewExportPeriodKey.trim() || undefined,
          format,
        });
        setReviewExportMessage(`${format.toUpperCase()} をダウンロードしました。`);
      } catch {
        setReviewExportMessage("業務監査ログの出力に失敗しました（承認権限が必要です）。");
      } finally {
        setReviewExportLoading(false);
      }
    },
    [reviewExportClientId, reviewExportPeriodKey],
  );

  const loadReviewTimeline = useCallback(async () => {
    if (!reviewExportClientId) {
      setReviewTimelineMessage("顧客を選択してください。");
      return;
    }
    setReviewTimelineLoading(true);
    setReviewTimelineMessage("");
    try {
      const rows = await listReviewTimeline({
        clientId: reviewExportClientId,
        periodKey: reviewExportPeriodKey.trim() || undefined,
        limit: 80,
      });
      setReviewTimelineRows(rows);
      setReviewTimelineMessage(
        rows.length === 0 ? "該当する業務イベントがありません。" : `${rows.length} 件を表示しています。`,
      );
    } catch {
      setReviewTimelineMessage("タイムラインの読込に失敗しました（document.view 権限が必要です）。");
      setReviewTimelineRows([]);
    } finally {
      setReviewTimelineLoading(false);
    }
  }, [reviewExportClientId, reviewExportPeriodKey]);

  return {
    auditRows,
    auditLoading,
    auditMessage,
    auditResultFilter,
    setAuditResultFilter,
    auditActionFilter,
    setAuditActionFilter,
    auditPathFilter,
    setAuditPathFilter,
    auditClientFilter,
    setAuditClientFilter,
    auditStakeholderFilter,
    setAuditStakeholderFilter,
    auditFromDate,
    setAuditFromDate,
    auditToDate,
    setAuditToDate,
    reviewExportClientId,
    setReviewExportClientId,
    reviewExportPeriodKey,
    setReviewExportPeriodKey,
    reviewExportMessage,
    reviewExportLoading,
    reviewTimelineRows,
    reviewTimelineLoading,
    reviewTimelineMessage,
    loadAuditEvents,
    handleDownloadAuditCsv,
    handleReviewExport,
    loadReviewTimeline,
  };
}
