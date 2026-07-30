"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  fetchDevDocumentTypes,
  reloadDevDocumentTypes,
  type DocumentType,
  type DocumentTypeListResponse,
} from "@/lib/document-types-api";

/** 書類種別マスタ（大分類）の参照パネル。document_types.yaml の内容を表示。 */

type Props = {
  error: string | null;
  setError: (v: string | null) => void;
};

function FlagBadge({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
        on ? "bg-emerald-900/60 text-emerald-200" : "bg-slate-800 text-slate-500"
      }`}
    >
      {label}: {on ? "ON" : "OFF"}
    </span>
  );
}

export function DocumentTypesPanel({ error, setError }: Props) {
  const [data, setData] = useState<DocumentTypeListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchDevDocumentTypes());
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    void load();
  }, [load]);

  const onReload = async () => {
    setReloading(true);
    setError(null);
    try {
      setData(await reloadDevDocumentTypes());
    } catch (e) {
      setError(e instanceof Error ? e.message : "再読込に失敗しました");
    } finally {
      setReloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        読み込み中…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-indigo-800/40 bg-indigo-950/30 px-4 py-3 text-xs text-indigo-100/90">
        <p className="font-bold text-indigo-200">書類種別（大分類）</p>
        <p className="mt-1 leading-relaxed text-indigo-100/70">
          定款・法人税申告書など、マトリクスの資料枠を定義します。様式（別表・受信通知）は「様式・AI分類」タブで管理し、
          <code className="rounded bg-slate-800 px-1">type_id</code> でこの種別に紐付けます。
          提出実績の横断一覧は
          <a href="/catalog" className="ml-1 text-emerald-300 underline hover:text-emerald-200">
            提出状況ボード
          </a>
          です。
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-400">
          {data ? `${data.type_count} 種別 · v${data.version}` : "—"}
        </p>
        <button
          type="button"
          onClick={() => void onReload()}
          disabled={reloading}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${reloading ? "animate-spin" : ""}`} />
          YAML 再読込
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-xs text-red-200">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-700 bg-slate-800/80 text-xs font-bold text-slate-300">
            <tr>
              <th className="px-3 py-2">種別 ID</th>
              <th className="px-3 py-2">名称</th>
              <th className="px-3 py-2">フラグ</th>
              <th className="px-3 py-2">提出状況ボード</th>
            </tr>
          </thead>
          <tbody>
            {(data?.types ?? []).map((t: DocumentType) => (
              <tr key={t.id} className="border-t border-slate-800 hover:bg-slate-800/50">
                <td className="px-3 py-2 font-mono text-[11px] text-slate-400">{t.id}</td>
                <td className="px-3 py-2 font-semibold text-white">{t.label}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <FlagBadge on={t.flags.ocr} label="OCR" />
                    <FlagBadge on={t.flags.dashboard} label="Dash" />
                    <FlagBadge on={t.flags.alert} label="Alert" />
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-slate-400">
                  {t.catalog.enabled ? (
                    <span className="text-emerald-400">対象</span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
