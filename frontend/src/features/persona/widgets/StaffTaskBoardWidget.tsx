"use client";

import { Loader2, User } from "lucide-react";
import type { FirmStaffTaskSummary } from "@/features/docugrid/lib/firm-tasks";

type Props = {
  staff: FirmStaffTaskSummary[];
  loading: boolean;
  error: string | null;
  unassignedMissing?: number;
  unassignedPending?: number;
  selectedMemberId?: string | null;
  onSelectMember?: (memberId: string | null) => void;
};

export function StaffTaskBoardWidget({
  staff,
  loading,
  error,
  unassignedMissing = 0,
  unassignedPending = 0,
  selectedMemberId,
  onSelectMember,
}: Props) {
  if (loading) {
    return (
      <p className="flex items-center gap-2 py-4 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        担当別タスクを読み込み中…
      </p>
    );
  }

  if (error) {
    return <p className="py-2 text-sm text-red-600">{error}</p>;
  }

  const hasUnassigned = unassignedMissing > 0 || unassignedPending > 0;

  if (staff.length === 0 && !hasUnassigned) {
    return <p className="py-2 text-sm text-emerald-700">未完了タスクはありません。</p>;
  }

  return (
    <div className="space-y-3">
      {(unassignedMissing > 0 || unassignedPending > 0) && (
        <p className="rounded-lg border border-dashed border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
          担当未割当: 不足 {unassignedMissing} · 承認待ち {unassignedPending}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-600">
              <th className="pb-2 pr-3 font-bold">担当者</th>
              <th className="pb-2 pr-3 font-bold text-right">不足</th>
              <th className="pb-2 pr-3 font-bold text-right">承認待ち</th>
              <th className="pb-2 font-bold text-right">対応中顧問先</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((row) => {
              const total = row.missing_total + row.pending_approval_total;
              const selected = selectedMemberId === row.member_id;
              return (
                <tr
                  key={row.member_id}
                  className={`border-b border-slate-100 last:border-0 ${
                    selected ? "bg-sky-50" : ""
                  }`}
                >
                  <td className="py-2 pr-3">
                    {onSelectMember ? (
                      <button
                        type="button"
                        onClick={() =>
                          onSelectMember(selected ? null : row.member_id)
                        }
                        className="flex items-center gap-1.5 font-bold text-slate-800 hover:text-sky-700"
                      >
                        <User className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                        {row.display_name}
                      </button>
                    ) : (
                      <span className="flex items-center gap-1.5 font-bold text-slate-800">
                        <User className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                        {row.display_name}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-rose-700">
                    {row.missing_total}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-amber-800">
                    {row.pending_approval_total}
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-600">
                    {row.open_client_count}/{row.assigned_client_count}
                    {total > 0 && (
                      <span className="ml-1 inline-block h-2 w-2 rounded-full bg-rose-500 align-middle" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
