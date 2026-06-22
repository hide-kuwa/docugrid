"use client";

import { Loader2 } from "lucide-react";
import type { FirmClientTaskSummary } from "@/features/docugrid/lib/firm-tasks";

type Props = {
  clients: FirmClientTaskSummary[];
  clientNameById: Record<string, string>;
  loading: boolean;
  error: string | null;
  onSelectClient?: (clientId: string) => void;
};

export function FirmProgressWidget({
  clients,
  clientNameById,
  loading,
  error,
  onSelectClient,
}: Props) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-indigo-800">
        <Loader2 className="h-4 w-4 animate-spin" />
        進捗を読み込み中…
      </div>
    );
  }

  if (error) {
    return <p className="py-2 text-sm text-red-600">{error}</p>;
  }

  if (clients.length === 0) {
    return (
      <p className="py-2 text-sm text-indigo-900/70">
        未完了タスクのある顧問先はありません。
      </p>
    );
  }

  const sorted = [...clients].sort(
    (a, b) =>
      b.pending_approval_total + b.missing_total - (a.pending_approval_total + a.missing_total),
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[280px] text-left text-xs">
        <thead>
          <tr className="border-b border-indigo-200 text-indigo-700">
            <th className="pb-2 pr-3 font-bold">顧問先</th>
            <th className="pb-2 pr-3 font-bold text-right">不足</th>
            <th className="pb-2 font-bold text-right">承認待ち</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.client_id} className="border-b border-indigo-100/80 last:border-0">
              <td className="py-2 pr-3">
                {onSelectClient ? (
                  <button
                    type="button"
                    onClick={() => onSelectClient(row.client_id)}
                    className="font-bold text-indigo-950 hover:underline"
                  >
                    {clientNameById[row.client_id] ?? row.client_id}
                  </button>
                ) : (
                  <span className="font-bold text-indigo-950">
                    {clientNameById[row.client_id] ?? row.client_id}
                  </span>
                )}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-rose-700">
                {row.missing_total}
              </td>
              <td className="py-2 text-right tabular-nums text-amber-800">
                {row.pending_approval_total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
