"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { RelatedDocumentRef } from "@/config/client-field-sources";
import { ConsumptionTaxableFlowchart } from "@/features/consumption-taxable/ConsumptionTaxableFlowchart";
import {
  fetchClientTaxableStatus,
  saveClientTaxableStatus,
} from "@/features/consumption-taxable/lib/api";
import type { ResultOverride, TaxableStatusInputs, TaxableStatusPayload } from "@/features/consumption-taxable/lib/types";

type Props = {
  clientId: string;
  canEdit?: boolean;
  filledSlotKeys?: ReadonlySet<string>;
  onOpenRelatedDocument?: (ref: RelatedDocumentRef) => void;
};

export function ClientConsumptionTaxableSection({
  clientId,
  canEdit,
  filledSlotKeys,
  onOpenRelatedDocument,
}: Props) {
  const [payload, setPayload] = useState<TaxableStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPayload(await fetchClientTaxableStatus(clientId));
    } catch {
      setError("課税事業者判定の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleChange = async (next: {
    result_override: ResultOverride;
    input_overrides: TaxableStatusInputs;
  }) => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      setPayload(await saveClientTaxableStatus(clientId, next));
    } catch {
      setError("判定の保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-tour="consumption-taxable">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-slate-700">消費税 — 課税事業者判定</h3>
          <p className="mt-1 text-[10px] text-slate-400">
            カルテ・指標から自動判定し、ノードをクリックすると手動設定が優先されます。金額はホバーかクリック、詳細で帳票を開きます。
          </p>
        </div>
        {saving ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            反映中
          </span>
        ) : null}
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          判定を読み込み中…
        </div>
      ) : payload ? (
        <ConsumptionTaxableFlowchart
          payload={payload}
          canEdit={canEdit}
          filledSlotKeys={filledSlotKeys}
          onOpenDocument={onOpenRelatedDocument}
          onChange={(next) => void handleChange(next)}
        />
      ) : (
        <p className="text-sm text-slate-500">{error ?? "判定データを表示できません。"}</p>
      )}
      {error && payload ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </section>
  );
}
