"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ListTodo } from "lucide-react";
import { useOrgDirectory } from "@/features/org/useOrgDirectory";
import type { FirmTaskItem } from "@/features/docugrid/lib/firm-tasks";
import { useFirmTasks } from "@/features/persona/hooks/useFirmTasks";
import { TodayTasksWidget } from "@/features/persona/widgets/TodayTasksWidget";
import { ClassifyQueueWidget } from "@/features/persona/widgets/ClassifyQueueWidget";
import { RemandAlertsWidget } from "@/features/persona/widgets/RemandAlertsWidget";
import { useFirmRemandedSlots } from "@/features/persona/hooks/useFirmRemandedSlots";
import type { DocugridUser } from "@/lib/auth";
import { canAccessClient, resolveStakeholder } from "@/lib/authorization";

type Props = {
  user: DocugridUser | null;
  onSelectClient?: (clientId: string) => void;
  variant?: "inline" | "drawer";
};

export function FirmStaffMainDashboard({ user, onSelectClient, variant = "inline" }: Props) {
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
  const { items: remandedSlots, loading: remandLoading } = useFirmRemandedSlots(visibleClientIds);

  const clientNameById = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c.name])),
    [clients],
  );

  const handleSelect = (item: FirmTaskItem) => {
    onSelectClient?.(item.client_id);
  };

  const missingTotal = firmTasks?.missing_total ?? 0;

  const content = (
    <div className={variant === "drawer" ? "p-4" : "mx-auto mt-3 max-w-6xl rounded-xl border border-sky-200 bg-white/80 p-4"}>
      <h2 className="text-sm font-bold text-sky-900">今日やること</h2>
      <p className="mt-0.5 text-xs text-sky-800/80">
        行をクリックすると該当顧問先のマトリクスへ移動します。
      </p>
      <div className="mt-3">
        <TodayTasksWidget
          items={firmTasks?.items ?? []}
          clientNameById={clientNameById}
          loading={loading}
          error={error}
          onSelect={handleSelect}
        />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
          <h3 className="text-xs font-bold text-amber-900">要確認（OCR）</h3>
          <div className="mt-2">
            <ClassifyQueueWidget maxItems={6} />
          </div>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/40 p-3">
          <h3 className="text-xs font-bold text-red-900">差戻し対応</h3>
          <div className="mt-2">
            <RemandAlertsWidget items={remandedSlots} loading={remandLoading} />
          </div>
        </div>
      </div>
    </div>
  );

  if (variant === "drawer") {
    return (
      <section className="bg-gradient-to-b from-sky-50/50 to-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
            担当スタッフ
          </p>
          <p className="text-sm font-bold text-slate-800">
            {user?.name ?? "担当者"} · 不足資料 {missingTotal} 点
          </p>
          <Link
            href="/tasks"
            className="mt-2 inline-block rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-50"
          >
            タスク一覧
          </Link>
        </div>
        {content}
      </section>
    );
  }

  return (
    <section className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-sky-50/50 px-4 py-3 shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-sky-600" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
              担当スタッフ
            </p>
            <p className="text-sm font-bold text-slate-800">
              {user?.name ?? "担当者"} · 不足資料 {missingTotal} 点
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!loading && missingTotal > 0 && (
            <span className="hidden rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 sm:inline">
              要対応 {missingTotal}
            </span>
          )}
          <Link
            href="/tasks"
            className="rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-50"
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
