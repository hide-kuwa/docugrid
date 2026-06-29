"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, LayoutDashboard } from "lucide-react";
import { useOrgDirectory } from "@/features/org/useOrgDirectory";
import { useFirmTasks } from "@/features/persona/hooks/useFirmTasks";
import { ApprovalQueueWidget } from "@/features/persona/widgets/ApprovalQueueWidget";
import { FirmProgressWidget } from "@/features/persona/widgets/FirmProgressWidget";
import { DeadlineAlertsWidget } from "@/features/persona/widgets/DeadlineAlertsWidget";
import { StaffTaskBoardWidget } from "@/features/persona/widgets/StaffTaskBoardWidget";
import { AssignmentHeatmapWidget } from "@/features/persona/widgets/AssignmentHeatmapWidget";
import type { FirmTaskItem } from "@/features/docugrid/lib/firm-tasks";
import type { DocugridUser } from "@/lib/auth";

type Props = {
  user: DocugridUser | null;
  onSelectClient?: (clientId: string) => void;
  variant?: "inline" | "drawer";
};

export function FirmDirectorDashboard({ user, onSelectClient, variant = "inline" }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const { clients } = useOrgDirectory();
  const { firmTasks, loading, error } = useFirmTasks(true);

  const clientNameById = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c.name])),
    [clients],
  );

  const memberClientIds = useMemo(
    () =>
      Object.fromEntries(
        (firmTasks?.staff ?? []).map((s) => [s.member_id, s.assigned_client_ids ?? []]),
      ),
    [firmTasks?.staff],
  );

  const heatmapClients = useMemo(() => {
    const byId = new Map((firmTasks?.clients ?? []).map((c) => [c.client_id, c]));
    const ids = new Set<string>();
    for (const s of firmTasks?.staff ?? []) {
      for (const cid of s.assigned_client_ids ?? []) ids.add(cid);
    }
    for (const c of firmTasks?.clients ?? []) ids.add(c.client_id);
    return [...ids].map(
      (id) =>
        byId.get(id) ?? {
          client_id: id,
          missing_total: 0,
          pending_approval_total: 0,
          incomplete_period_count: 0,
        },
    );
  }, [firmTasks?.clients, firmTasks?.staff]);

  const handleQueueSelect = (item: FirmTaskItem) => {
    onSelectClient?.(item.client_id);
  };

  const content = (
    <div className={variant === "drawer" ? "grid gap-4 p-4" : "mx-auto mt-3 grid max-w-6xl gap-4 md:grid-cols-2"}>
      <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 md:col-span-2">
        <h2 className="text-sm font-bold text-sky-900">担当者別タスク</h2>
        <p className="mt-0.5 text-xs text-sky-800/80">誰がどの顧問先で何件抱えているか一目で確認できます。</p>
        <div className="mt-3">
          <StaffTaskBoardWidget
            staff={firmTasks?.staff ?? []}
            loading={loading}
            error={error}
            unassignedMissing={firmTasks?.unassigned_missing_total}
            unassignedPending={firmTasks?.unassigned_pending_total}
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 md:col-span-2">
        <h2 className="text-sm font-bold text-slate-800">担当 × 顧問先ヒートマップ</h2>
        <p className="mt-0.5 text-xs text-slate-500">セルは「不足/承認待ち」。クリックで顧問先を開けます。</p>
        <div className="mt-3">
          <AssignmentHeatmapWidget
            staff={firmTasks?.staff ?? []}
            clients={heatmapClients}
            clientNameById={clientNameById}
            memberClientIds={memberClientIds}
            loading={loading}
            error={error}
            onSelectClient={onSelectClient}
          />
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
        <h2 className="text-sm font-bold text-amber-900">承認キュー</h2>
        <p className="mt-0.5 text-xs text-amber-800/80">
          行をクリックすると該当顧問先のマトリクスへ移動します。
        </p>
        <div className="mt-3">
          <ApprovalQueueWidget
            items={firmTasks?.items ?? []}
            clientNameById={clientNameById}
            loading={loading}
            error={error}
            onSelectItem={onSelectClient ? handleQueueSelect : undefined}
          />
        </div>
      </div>

      <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
        <h2 className="text-sm font-bold text-indigo-900">顧問先別進捗</h2>
        <p className="mt-0.5 text-xs text-indigo-800/80">不足資料と承認待ちの件数です。</p>
        <div className="mt-3">
          <FirmProgressWidget
            clients={firmTasks?.clients ?? []}
            clientNameById={clientNameById}
            loading={loading}
            error={error}
            onSelectClient={onSelectClient}
          />
        </div>
      </div>

      <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 md:col-span-2">
        <h2 className="text-sm font-bold text-violet-900">期限アラート（納税予定）</h2>
        <p className="mt-0.5 text-xs text-violet-800/80">顧問先の決算月から生成した直近の予定です。</p>
        <div className="mt-3">
          <DeadlineAlertsWidget clients={clients} maxItems={8} />
        </div>
      </div>
    </div>
  );

  if (variant === "drawer") {
    return (
      <section className="bg-gradient-to-b from-indigo-50/40 to-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">
            所長ダッシュボード
          </p>
          <p className="text-sm font-bold text-slate-800">
            {user?.firmLabel ?? "事務所"} · 顧問先 {firmTasks?.client_count ?? "—"} 社
          </p>
          {!loading && firmTasks && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-rose-100 px-2.5 py-1 font-bold text-rose-800">
                不足 {firmTasks.missing_total}
              </span>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 font-bold text-amber-900">
                承認待ち {firmTasks.pending_approval_total}
              </span>
            </div>
          )}
          <Link
            href="/tasks"
            className="mt-2 inline-block rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50"
          >
            タスク一覧
          </Link>
        </div>
        {content}
      </section>
    );
  }

  return (
    <section className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-indigo-50/40 px-4 py-3 shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-4 w-4 text-indigo-600" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">
              所長ダッシュボード
            </p>
            <p className="text-sm font-bold text-slate-800">
              {user?.firmLabel ?? "事務所"} · 顧問先 {firmTasks?.client_count ?? "—"} 社
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!loading && firmTasks && (
            <div className="hidden items-center gap-2 text-xs sm:flex">
              <span className="rounded-full bg-rose-100 px-2.5 py-1 font-bold text-rose-800">
                不足 {firmTasks.missing_total}
              </span>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 font-bold text-amber-900">
                承認待ち {firmTasks.pending_approval_total}
              </span>
            </div>
          )}
          <Link
            href="/tasks"
            className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50"
          >
            タスク一覧
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "ダッシュボードを展開" : "ダッシュボードを折りたたむ"}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!collapsed && content}
    </section>
  );
}
