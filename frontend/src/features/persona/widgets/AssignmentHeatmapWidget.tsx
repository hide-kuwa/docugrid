"use client";

import { Loader2 } from "lucide-react";
import type { FirmClientTaskSummary, FirmStaffTaskSummary } from "@/features/docugrid/lib/firm-tasks";

type Props = {
  staff: FirmStaffTaskSummary[];
  clients: FirmClientTaskSummary[];
  clientNameById: Record<string, string>;
  memberClientIds: Record<string, string[]>;
  loading: boolean;
  error: string | null;
  onSelectClient?: (clientId: string) => void;
};

function cellTone(missing: number, pending: number): string {
  const total = missing + pending;
  if (total === 0) return "bg-emerald-50 text-emerald-800/50";
  if (total >= 5) return "bg-rose-200 text-rose-950";
  if (pending > 0) return "bg-amber-100 text-amber-950";
  return "bg-orange-100 text-orange-950";
}

export function AssignmentHeatmapWidget({
  staff,
  clients,
  clientNameById,
  memberClientIds,
  loading,
  error,
  onSelectClient,
}: Props) {
  if (loading) {
    return (
      <p className="flex items-center gap-2 py-4 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ヒートマップを読み込み中…
      </p>
    );
  }

  if (error) {
    return <p className="py-2 text-sm text-red-600">{error}</p>;
  }

  const activeClients = [...clients].sort(
    (a, b) =>
      b.missing_total + b.pending_approval_total - (a.missing_total + a.pending_approval_total),
  );

  if (staff.length === 0 || activeClients.length === 0) {
    return (
      <p className="py-2 text-sm text-slate-500">
        表示できる担当×顧問先の組み合わせがありません。
      </p>
    );
  }

  const clientIds = activeClients.map((c) => c.client_id);
  const clientById = Object.fromEntries(activeClients.map((c) => [c.client_id, c]));

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-[10px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-b border-slate-200 bg-white px-2 py-1.5 text-left font-bold text-slate-600">
              担当＼顧問先
            </th>
            {clientIds.map((cid) => (
              <th
                key={cid}
                className="max-w-[5rem] truncate border-b border-slate-200 px-1 py-1.5 text-center font-bold text-slate-600"
                title={clientNameById[cid] ?? cid}
              >
                {(clientNameById[cid] ?? cid).replace(/^株式会社\s*/, "").slice(0, 6)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {staff.map((member) => {
            const assigned = new Set(memberClientIds[member.member_id] ?? []);
            return (
              <tr key={member.member_id}>
                <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-2 py-1 font-bold text-slate-700 whitespace-nowrap">
                  {member.display_name}
                </td>
                {clientIds.map((cid) => {
                  if (!assigned.has(cid)) {
                    return (
                      <td
                        key={cid}
                        className="border-b border-slate-100 bg-slate-50/80 px-1 py-1 text-center text-slate-300"
                      >
                        ·
                      </td>
                    );
                  }
                  const row = clientById[cid];
                  const missing = row?.missing_total ?? 0;
                  const pending = row?.pending_approval_total ?? 0;
                  const total = missing + pending;
                  const label = total === 0 ? "—" : `${missing}/${pending}`;
                  return (
                    <td key={cid} className="border-b border-slate-100 p-0.5">
                      {onSelectClient && total > 0 ? (
                        <button
                          type="button"
                          onClick={() => onSelectClient(cid)}
                          className={`block w-full rounded px-1 py-1 text-center font-bold tabular-nums ${cellTone(missing, pending)}`}
                          title={`不足 ${missing} · 承認待ち ${pending}`}
                        >
                          {label}
                        </button>
                      ) : (
                        <span
                          className={`block rounded px-1 py-1 text-center font-bold tabular-nums ${cellTone(missing, pending)}`}
                          title={`不足 ${missing} · 承認待ち ${pending}`}
                        >
                          {label}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-slate-500">
        セルは「不足/承認待ち」件数。色が濃いほど滞留が多いです。
      </p>
    </div>
  );
}
