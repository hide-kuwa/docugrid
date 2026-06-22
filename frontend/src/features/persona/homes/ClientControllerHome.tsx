"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import type { PersonaDefinition } from "@/config/personas";
import type { ScreenDesignPersona } from "@/config/screen-design-types";
import { useOrgDirectory } from "@/features/org/useOrgDirectory";
import { PersonaWorkspaceLayout } from "@/features/persona/PersonaWorkspaceLayout";
import { useClientPeriodStatus } from "@/features/persona/hooks/useClientPeriodStatus";
import { periodKeyLabel } from "@/features/persona/lib/period-keys";
import { QuickUploadWidget } from "@/features/persona/widgets/QuickUploadWidget";
import { SubmissionChecklistWidget } from "@/features/persona/widgets/SubmissionChecklistWidget";
import { setClientScope } from "@/lib/api-auth";
import type { DocugridUser } from "@/lib/auth";
import { hasPermission } from "@/lib/authorization";

const CONTROLLER_PERIOD = "year:2";

const MGMT_SLOTS = [
  { id: "financial_report", label: "決算報告書" },
  { id: "ledger", label: "総勘定元帳" },
] as const;

type Props = {
  persona: PersonaDefinition;
  user: DocugridUser | null;
  design: ScreenDesignPersona | null;
};

export function ClientControllerHome({ persona, user, design }: Props) {
  const { clients } = useOrgDirectory();
  const clientId = user?.visibleClientIds?.[0] ?? clients[0]?.id ?? "";
  const clientName = clients.find((c) => c.id === clientId)?.name ?? clientId;
  const [uploadSlotId, setUploadSlotId] = useState<string | null>(null);
  const [uploadSlotLabel, setUploadSlotLabel] = useState("");

  const { periodStatus, loading, error, reload } = useClientPeriodStatus(
    clientId,
    CONTROLLER_PERIOD,
  );
  const canUpload = hasPermission(user, "document.upload");

  useEffect(() => {
    if (clientId) setClientScope(clientId);
  }, [clientId]);

  const mgmtFilled = useMemo(() => {
    if (!periodStatus) return 0;
    return MGMT_SLOTS.filter((s) => !periodStatus.missing.includes(s.label)).length;
  }, [periodStatus]);

  return (
    <PersonaWorkspaceLayout persona={persona} user={user} design={design}>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <BarChart3 className="h-4 w-4 text-teal-600" />
          管理会計 · 提出状況
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {clientName} · {periodKeyLabel(CONTROLLER_PERIOD)}
        </p>
        <p className="mt-3 text-sm text-slate-600">
          決算関連資料{" "}
          <span className="font-bold text-teal-800">
            {mgmtFilled}/{MGMT_SLOTS.length}
          </span>{" "}
          提出済
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800">必須書類チェックリスト</h2>
        <div className="mt-4">
          <SubmissionChecklistWidget
            periodKey={CONTROLLER_PERIOD}
            periodLabel={periodKeyLabel(CONTROLLER_PERIOD)}
            status={periodStatus}
            loading={loading}
            error={error}
            onSelectMissing={(_idx, label) => {
              const slot = MGMT_SLOTS.find((s) => s.label === label);
              if (slot) {
                setUploadSlotId(slot.id);
                setUploadSlotLabel(slot.label);
              }
            }}
          />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {MGMT_SLOTS.map((slot) => (
          <button
            key={slot.id}
            type="button"
            onClick={() => {
              setUploadSlotId(slot.id);
              setUploadSlotLabel(slot.label);
            }}
            className={`rounded-xl border p-4 text-left ${
              uploadSlotId === slot.id
                ? "border-teal-400 bg-teal-50"
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
        <h2 className="text-sm font-bold text-slate-800">資料アップロード</h2>
        <div className="mt-4">
          <QuickUploadWidget
            clientId={clientId}
            periodKey={CONTROLLER_PERIOD}
            slotId={uploadSlotId}
            slotLabel={uploadSlotLabel}
            canUpload={canUpload}
            onUploaded={() => void reload()}
          />
        </div>
      </section>

      <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
        事務所側のマトリクスでは{" "}
        <Link href="/" className="font-bold text-indigo-600 hover:underline">
          全スロット
        </Link>
        を一覧できます。
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
