"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useOrgDirectory } from "@/features/org/useOrgDirectory";
import {
  fetchMoneytreeFirmStatus,
  type MoneytreeFirmClientStatus,
} from "@/features/integrations/moneytree-api";

export function MoneytreeFirmOverview() {
  const { clients } = useOrgDirectory();
  const [rows, setRows] = useState<MoneytreeFirmClientStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchMoneytreeFirmStatus());
    } catch {
      setError("顧問先の連携状況を取得できませんでした。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const clientNameById = new Map(clients.map((c) => [c.id, c.name]));
  const connectedCount = rows.filter((r) => r.connected).length;

  return (
    <article className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-sm font-bold text-slate-800">Moneytree LINK（銀行・クレカ）</div>
      <p className="mt-1 text-xs text-slate-500">
        口座連携は<strong className="font-semibold">顧問先ごと</strong>に、顧問先ユーザーがワークスペースから自分で行います。
        事務所側では状況の確認のみ可能です。
      </p>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          読み込み中…
        </div>
      ) : error ? (
        <p className="mt-3 text-xs text-red-600">{error}</p>
      ) : (
        <>
          <p className="mt-3 text-xs text-slate-600">
            連携済み: {connectedCount} / {rows.length} 社
          </p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-100">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">顧問先</th>
                  <th className="px-3 py-2 font-semibold">状態</th>
                  <th className="px-3 py-2 font-semibold">口座数</th>
                  <th className="px-3 py-2 font-semibold">最終同期</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.client_id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {clientNameById.get(row.client_id) || row.client_id}
                    </td>
                    <td className="px-3 py-2">
                      {row.connected ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          連携済
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                          未連携
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{row.accounts_count}</td>
                    <td className="px-3 py-2 text-slate-500">
                      {row.last_sync_at ? row.last_sync_at.slice(0, 16).replace("T", " ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">
            顧問先には「資料提出」または「経費精算」ワークスペースの口座連携セクションを案内してください。
          </p>
        </>
      )}
    </article>
  );
}
