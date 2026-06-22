"use client";

import { useState } from "react";
import { Database } from "lucide-react";
import { SsotEditToolbar } from "@/features/client-data/components/SsotEditToolbar";
import { useSsotEditSession } from "@/features/client-data/hooks/use-ssot-edit-session";
import {
  upsertValuationInput,
  type ValuationInputsPayload,
} from "@/features/client-data/lib/client-valuation-api";

type Props = {
  clientId: string;
  canonical: ValuationInputsPayload;
  canEdit?: boolean;
  onUpdated: () => void;
};

const FIELDS: { key: keyof ValuationInputsPayload; label: string; suffix: string }[] = [
  { key: "issued_shares", label: "発行済株式数", suffix: "株" },
  { key: "capital_yen", label: "資本金", suffix: "円" },
  { key: "net_assets_yen", label: "純資産価額", suffix: "円" },
  { key: "annual_profit_yen", label: "年利益（課税所得）", suffix: "円" },
  { key: "annual_dividend_yen", label: "年配当額", suffix: "円" },
];

export function CanonicalValuationMetricsEditor({
  clientId,
  canonical,
  canEdit,
  onUpdated,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edit = useSsotEditSession(canonical);

  const handleCommit = async () => {
    setSaving(true);
    setError(null);
    const d = edit.draft;
    try {
      await Promise.all(
        (Object.keys(d) as (keyof ValuationInputsPayload)[]).map((field) =>
          upsertValuationInput(clientId, field, d[field]),
        ),
      );
      onUpdated();
      edit.finishEdit();
    } catch {
      setError("正規前提の保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const patch = (field: keyof ValuationInputsPayload, raw: string) => {
    const n = Number.parseInt(raw.replace(/[^\d]/g, ""), 10);
    edit.patchDraft((prev) => ({
      ...prev,
      [field]: Number.isFinite(n) ? n : 0,
    }));
  };

  const data = edit.isEditing ? edit.draft : edit.value;

  return (
    <section className="rounded-2xl border border-slate-300 bg-slate-50/80 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Database className="h-4 w-4 text-slate-500" />
            正規前提（client_metrics）
          </h3>
          <p className="mt-1 text-[10px] text-slate-500">
            valuation.* の SSOT。シミュレーションとは別に編集します。
          </p>
        </div>
        <SsotEditToolbar
          isEditing={edit.isEditing}
          canEdit={canEdit}
          saving={saving}
          onStart={() => edit.startEdit()}
          onCommit={() => void handleCommit()}
          onCancel={edit.cancelEdit}
        />
      </div>

      {error ? (
        <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="mt-4 space-y-3">
        {FIELDS.map(({ key, label, suffix }) => (
          <label key={key} className="block text-xs">
            <span className="font-bold text-slate-600">{label}</span>
            <div className="mt-1 flex items-center gap-1">
              <input
                type="text"
                inputMode="numeric"
                disabled={!edit.isEditing}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 tabular-nums disabled:bg-white disabled:text-slate-700"
                value={data[key] > 0 ? data[key].toLocaleString() : ""}
                onChange={(e) => patch(key, e.target.value)}
              />
              <span className="shrink-0 text-[10px] text-slate-400">{suffix}</span>
            </div>
          </label>
        ))}
      </div>
    </section>
  );
}
