"use client";

import { useEffect, useMemo, useState } from "react";
import type { PersonaDefinition } from "@/config/personas";
import type { ScreenDesignPersona } from "@/config/screen-design-types";
import { useOrgDirectory } from "@/features/org/useOrgDirectory";
import { PersonaWorkspaceLayout } from "@/features/persona/PersonaWorkspaceLayout";
import { useClientPeriodStatus } from "@/features/persona/hooks/useClientPeriodStatus";
import { CLIENT_PERIOD_OPTIONS, periodKeyLabel } from "@/features/persona/lib/period-keys";
import { slotIdForLabel } from "@/features/persona/lib/requirements";
import { QuickUploadWidget } from "@/features/persona/widgets/QuickUploadWidget";
import { RemandAlertsWidget } from "@/features/persona/widgets/RemandAlertsWidget";
import { SubmissionChecklistWidget } from "@/features/persona/widgets/SubmissionChecklistWidget";
import { ReviewChecklistWidget } from "@/features/review-checklist/ReviewChecklistWidget";
import { MoneytreeLinkPanel } from "@/features/integrations/MoneytreeLinkPanel";
import { canViewReviewChecklist } from "@/features/review-checklist/permissions";
import type { SlotDocumentItem } from "@/features/docugrid/lib/slot-documents";
import type { DocugridUser } from "@/lib/auth";
import { hasPermission } from "@/lib/authorization";
import { setClientScope } from "@/lib/api-auth";

type Props = {
  persona: PersonaDefinition;
  user: DocugridUser | null;
  design: ScreenDesignPersona | null;
  demoMode?: boolean;
};

export function ClientAccountingHome({ persona, user, design, demoMode }: Props) {
  const { clients } = useOrgDirectory();
  const clientId = user?.visibleClientIds?.[0] ?? clients[0]?.id ?? "";
  const [periodKey, setPeriodKey] = useState(CLIENT_PERIOD_OPTIONS[0].key);
  const [uploadSlotId, setUploadSlotId] = useState<string | null>(null);
  const [uploadSlotLabel, setUploadSlotLabel] = useState("");

  const { periodStatus, slots, summaryMissing, loading, error, reload } = useClientPeriodStatus(
    clientId,
    periodKey,
  );

  const canUpload = hasPermission(user, "document.upload");
  const showReviewChecklist = canViewReviewChecklist(user);
  const clientName = clients.find((c) => c.id === clientId)?.name ?? clientId;

  useEffect(() => {
    if (clientId) setClientScope(clientId);
  }, [clientId]);

  const selectMissing = (label: string) => {
    const sid = slotIdForLabel(periodKey, label);
    setUploadSlotId(sid);
    setUploadSlotLabel(label);
  };

  const selectRemand = (slot: SlotDocumentItem) => {
    setPeriodKey(slot.period_key);
    setUploadSlotId(slot.slot_id);
    setUploadSlotLabel(slot.slot_label || slot.original_name);
  };

  const periodLabel = useMemo(() => periodKeyLabel(periodKey), [periodKey]);

  return (
    <PersonaWorkspaceLayout persona={persona} user={user} design={design} demoMode={demoMode}>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-800">提出先</h2>
            <p className="text-xs text-slate-500">{clientName}</p>
          </div>
          {summaryMissing !== null && summaryMissing > 0 && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
              全体であと {summaryMissing} 点
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {CLIENT_PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                setPeriodKey(opt.key);
                setUploadSlotId(null);
                setUploadSlotLabel("");
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                periodKey === opt.key
                  ? "bg-blue-600 text-white"
                  : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {canUpload && (
        <MoneytreeLinkPanel
          clientId={clientId}
          clientName={clientName}
          returnPath="/workspace/client_accounting"
        />
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800">提出チェックリスト</h2>
        <p className="mt-1 text-xs text-slate-500">税理士事務所から依頼された必須書類の提出状況です。</p>
        <div className="mt-4">
          <SubmissionChecklistWidget
            periodKey={periodKey}
            periodLabel={periodLabel}
            status={periodStatus}
            loading={loading}
            error={error}
            onSelectMissing={(_idx, label) => selectMissing(label)}
          />
        </div>
      </section>

      {showReviewChecklist && (
        <section className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800">確認チェックリスト</h2>
          <p className="mt-1 text-xs text-slate-500">
            税理士事務所から依頼された確認事項に回答・チェックできます。保存内容は事務所と共有されます。
          </p>
          <div className="mt-4">
            <ReviewChecklistWidget
              clientId={clientId}
              periodKey={periodKey}
              periodLabel={periodLabel}
              clientName={clientName}
              user={user}
            />
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-red-900">差戻し対応</h2>
        <p className="mt-1 text-xs text-slate-500">修正が必要な資料があります。</p>
        <div className="mt-4">
          <RemandAlertsWidget items={slots} loading={loading} onReupload={selectRemand} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800">簡易アップロード</h2>
        <p className="mt-1 text-xs text-slate-500">PDF を選んでその場で提出できます。</p>
        <div className="mt-4">
          <QuickUploadWidget
            clientId={clientId}
            periodKey={periodKey}
            slotId={uploadSlotId}
            slotLabel={uploadSlotLabel}
            canUpload={canUpload}
            onUploaded={() => void reload()}
          />
        </div>
      </section>
    </PersonaWorkspaceLayout>
  );
}
