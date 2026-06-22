"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ClipboardCheck } from "lucide-react";
import { useOrgDirectory } from "@/features/org/useOrgDirectory";
import { useFirmTasks } from "@/features/persona/hooks/useFirmTasks";
import { ApprovalQueueWidget } from "@/features/persona/widgets/ApprovalQueueWidget";
import { RemandHistoryWidget } from "@/features/persona/widgets/RemandHistoryWidget";
import type { FirmTaskItem } from "@/features/docugrid/lib/firm-tasks";
import type { DocugridUser } from "@/lib/auth";
import { canAccessClient, resolveStakeholder } from "@/lib/authorization";

type Props = {
  user: DocugridUser | null;
  onSelectClient?: (clientId: string) => void;
  variant?: "inline" | "drawer";
};

/** 補佐スタッフ向け — レビュー待ち資料の俯瞰 */
export function FirmStaffSupportDashboard({ user, onSelectClient, variant = "inline" }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const { clients } = useOrgDirectory();
  const { firmTasks, loading, error } = useFirmTasks(true);
  const userStakeholder = resolveStakeholder(user);
  const visibleClientIds = useMemo(
    () =>
      clients
        .filter((c) => canAccessClient(userStakeholder, c.id, user?.visibleClientIds))
        .map((c) => c.id),
    [clients, user?.visibleClientIds, userStakeholder],
  );

  const clientNameById = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c.name])),
    [clients],
  );

  const handleSelect = (item: FirmTaskItem) => {
    onSelectClient?.(item.client_id);
  };

  const pendingTotal = firmTasks?.pending_approval_total ?? 0;

  const content = (
    <div
      className={
        variant === "drawer"
          ? "p-4"
          : "mx-auto mt-3 max-w-6xl rounded-xl border border-violet-200 bg-white/80 p-4"
      }
    >
      <h2 className="text-sm font-bold text-violet-900">レビュー待ち</h2>
      <p className="mt-0.5 text-xs text-violet-800/80">
        承認・照合が必要な資料です。行をクリックすると該当顧問先のマトリクスへ移動します。
      </p>
      <div className="mt-3">
        <ApprovalQueueWidget
          items={firmTasks?.items ?? []}
          clientNameById={clientNameById}
          loading={loading}
          error={error}
          onSelectItem={onSelectClient ? handleSelect : undefined}
        />
      </div>
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
        <h3 className="text-xs font-bold text-slate-800">差戻し履歴</h3>
        <div className="mt-2">
          <RemandHistoryWidget
            clientIds={visibleClientIds}
            clientNameById={clientNameById}
            maxItems={8}
          />
        </div>
      </div>
    </div>
  );

  if (variant === "drawer") {
    return (
      <section className="bg-gradient-to-b from-violet-50/50 to-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-violet-600">
            補佐スタッフ
          </p>
          <p className="text-sm font-bold text-slate-800">
            {user?.name ?? "担当者"} · レビュー待ち {pendingTotal} 件
          </p>
          <Link
            href="/tasks"
            className="mt-2 inline-block rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50"
          >
            タスク一覧
          </Link>
        </div>
        {content}
      </section>
    );
  }

  return (
    <section className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-violet-50/50 px-4 py-3 shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-violet-600" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-violet-600">
              補佐スタッフ
            </p>
            <p className="text-sm font-bold text-slate-800">
              {user?.name ?? "担当者"} · レビュー待ち {pendingTotal} 件
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!loading && pendingTotal > 0 && (
            <span className="hidden rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 sm:inline">
              要レビュー {pendingTotal}
            </span>
          )}
          <Link
            href="/tasks"
            className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50"
          >
            タスク一覧
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "パネルを展開" : "パネルを折りたたむ"}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!collapsed && content}
    </section>
  );
}
