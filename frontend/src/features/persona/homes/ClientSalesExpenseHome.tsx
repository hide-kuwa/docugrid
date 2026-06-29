"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Camera, Loader2, Receipt } from "lucide-react";
import type { PersonaDefinition } from "@/config/personas";
import type { ScreenDesignPersona } from "@/config/screen-design-types";
import { useOrgDirectory } from "@/features/org/useOrgDirectory";
import { PersonaWorkspaceLayout } from "@/features/persona/PersonaWorkspaceLayout";
import { useClientPeriodStatus } from "@/features/persona/hooks/useClientPeriodStatus";
import { periodKeyLabel } from "@/features/persona/lib/period-keys";
import { QuickUploadWidget } from "@/features/persona/widgets/QuickUploadWidget";
import { ExpenseStatusWidget } from "@/features/persona/widgets/ExpenseStatusWidget";
import { MoneytreeLinkPanel } from "@/features/integrations/MoneytreeLinkPanel";
import { SubmissionChecklistWidget } from "@/features/persona/widgets/SubmissionChecklistWidget";
import { setClientScope } from "@/lib/api-auth";
import type { DocugridUser } from "@/lib/auth";
import { hasPermission } from "@/lib/authorization";

const EXPENSE_PERIOD = "month:1";

const EXPENSE_SLOTS = [
  { id: "bank_statement", label: "通帳コピー" },
  { id: "invoices_bundle", label: "請求書綴り" },
] as const;

type Props = {
  persona: PersonaDefinition;
  user: DocugridUser | null;
  design: ScreenDesignPersona | null;
  demoMode?: boolean;
};

export function ClientSalesExpenseHome({ persona, user, design, demoMode }: Props) {
  const { clients } = useOrgDirectory();
  const clientId = user?.visibleClientIds?.[0] ?? clients[0]?.id ?? "";
  const clientName = clients.find((c) => c.id === clientId)?.name ?? clientId;
  const [uploadSlotId, setUploadSlotId] = useState<string | null>(null);
  const [uploadSlotLabel, setUploadSlotLabel] = useState("");

  const { periodStatus, loading, error, reload } = useClientPeriodStatus(clientId, EXPENSE_PERIOD);
  const canUpload = hasPermission(user, "document.upload");

  useEffect(() => {
    if (clientId) setClientScope(clientId);
  }, [clientId]);

  const expenseMissing = useMemo(() => {
    if (!periodStatus) return [];
    return periodStatus.missing.filter((label) =>
      EXPENSE_SLOTS.some((s) => s.label === label),
    );
  }, [periodStatus]);

  const filledExpense = useMemo(() => {
    if (!periodStatus) return 0;
    const required = EXPENSE_SLOTS.map((s) => s.label);
    return required.filter((label) => !periodStatus.missing.includes(label)).length;
  }, [periodStatus]);

  return (
    <PersonaWorkspaceLayout persona={persona} user={user} design={design} demoMode={demoMode}>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800">経費精算 · 提出状況</h2>
        <p className="mt-1 text-xs text-slate-500">
          {clientName} · {periodKeyLabel(EXPENSE_PERIOD)}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
            経費関連 {filledExpense}/{EXPENSE_SLOTS.length} 提出済
          </span>
          {expenseMissing.length > 0 ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
              未提出 {expenseMissing.length} 件
            </span>
          ) : null}
        </div>
      </section>

      {canUpload && (
        <MoneytreeLinkPanel
          clientId={clientId}
          clientName={clientName}
          returnPath="/workspace/client_sales_expense"
          compact
        />
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Receipt className="h-4 w-4 text-violet-600" />
          月次チェックリスト
        </h2>
        <div className="mt-4">
          <SubmissionChecklistWidget
            periodKey={EXPENSE_PERIOD}
            periodLabel={periodKeyLabel(EXPENSE_PERIOD)}
            status={periodStatus}
            loading={loading}
            error={error}
            onSelectMissing={(_idx, label) => {
              const slot = EXPENSE_SLOTS.find((s) => s.label === label);
              if (slot) {
                setUploadSlotId(slot.id);
                setUploadSlotLabel(slot.label);
              }
            }}
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {EXPENSE_SLOTS.map((slot) => (
          <button
            key={slot.id}
            type="button"
            onClick={() => {
              setUploadSlotId(slot.id);
              setUploadSlotLabel(slot.label);
            }}
            className={`rounded-xl border p-4 text-left transition-colors ${
              uploadSlotId === slot.id
                ? "border-violet-400 bg-violet-50"
                : "border-slate-200 bg-slate-50 hover:bg-white"
            }`}
          >
            <p className="text-sm font-bold text-slate-800">{slot.label}</p>
            <p className="mt-1 text-xs text-slate-500">
              {periodStatus?.missing.includes(slot.label) ? "未提出" : "提出済"}
            </p>
          </button>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800">領収書・通帳の提出</h2>
        <p className="mt-1 text-xs text-slate-500">PDF をその場でアップロードできます。</p>
        <div className="mt-4">
          <QuickUploadWidget
            clientId={clientId}
            periodKey={EXPENSE_PERIOD}
            slotId={uploadSlotId}
            slotLabel={uploadSlotLabel}
            canUpload={canUpload}
            onUploaded={() => void reload()}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-violet-900">精算ステータス</h2>
        <p className="mt-1 text-xs text-slate-500">キャプチャ経由の領収書・経費の処理状況です。</p>
        <div className="mt-4">
          <ExpenseStatusWidget clientId={clientId} />
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <Camera className="h-4 w-4" />
          撮影から提出
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          スマホで領収書を撮影してキャプチャ画面から提出できます。
        </p>
        <Link
          href="/capture"
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-500"
        >
          キャプチャ画面を開く
        </Link>
      </section>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          更新中…
        </p>
      ) : null}
    </PersonaWorkspaceLayout>
  );
}
