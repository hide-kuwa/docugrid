"use client";

import { useEffect, useState } from "react";
import { ToolShell } from "@/features/tools/ToolShell";
import { Field, NumInput } from "@/features/tools/ui";
import { ConsumptionTaxableFlowchart } from "@/features/consumption-taxable/ConsumptionTaxableFlowchart";
import { postCheckTaxableStatus } from "@/features/consumption-taxable/lib/api";
import type {
  ResultOverride,
  TaxableStatusInputs,
  TaxableStatusPayload,
} from "@/features/consumption-taxable/lib/types";

const EMPTY: TaxableStatusInputs = {
  entity_type: "individual",
  base_period_sales: 0,
  specified_period_sales: 0,
  specified_period_salaries: 0,
  is_invoice_registered: false,
  has_voluntary_election: false,
  initial_capital: 0,
  is_special_new_corporate: false,
  has_high_value_asset_restriction: false,
  has_taxable_inheritance: false,
};

export function ConsumptionTaxableTool() {
  const [inputs, setInputs] = useState<TaxableStatusInputs>(EMPTY);
  const [resultOverride, setResultOverride] = useState<ResultOverride>("auto");
  const [payload, setPayload] = useState<TaxableStatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      void postCheckTaxableStatus({ ...inputs, result_override: resultOverride })
        .then((r) => {
          setPayload(r);
          setError(null);
        })
        .catch((e) => {
          setPayload(null);
          setError(e instanceof Error ? e.message : "判定に失敗しました");
        });
    }, 200);
    return () => clearTimeout(t);
  }, [inputs, resultOverride]);

  const patch = (partial: TaxableStatusInputs) => setInputs((prev) => ({ ...prev, ...partial }));

  return (
    <ToolShell
      title="消費税 課税事業者判定"
      subtitle="基準期間・特定期間・インボイス等の条件をフローチャートで確認します。ノードをクリックするとその条件が反映され、手動設定が自動判定より優先されます。"
      category="消費税"
      sourceUrl="https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6501.htm"
      sourceLabel="国税庁（納税義務の免除）"
      asOf="簡易判定"
    >
      <div className="mb-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
        <Field label="事業者区分" htmlFor="entity-type">
          <select
            id="entity-type"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            value={inputs.entity_type ?? "individual"}
            onChange={(e) =>
              patch({ entity_type: e.target.value === "corporate" ? "corporate" : "individual" })
            }
          >
            <option value="individual">個人</option>
            <option value="corporate">法人</option>
          </select>
        </Field>
        <Field label="基準期間の課税売上高（円）" htmlFor="base-sales">
          <NumInput
            id="base-sales"
            value={inputs.base_period_sales ?? 0}
            onValueChange={(n) => patch({ base_period_sales: n })}
            formatWithCommas
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </Field>
        <Field label="特定期間の課税売上高（円）" htmlFor="spec-sales">
          <NumInput
            id="spec-sales"
            value={inputs.specified_period_sales ?? 0}
            onValueChange={(n) => patch({ specified_period_sales: n })}
            formatWithCommas
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </Field>
        <Field label="特定期間の給与等（円）" htmlFor="spec-salaries">
          <NumInput
            id="spec-salaries"
            value={inputs.specified_period_salaries ?? 0}
            onValueChange={(n) => patch({ specified_period_salaries: n })}
            formatWithCommas
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </Field>
        <Field label="設立時資本金（円・法人）" htmlFor="capital">
          <NumInput
            id="capital"
            value={inputs.initial_capital ?? 0}
            onValueChange={(n) => patch({ initial_capital: n })}
            formatWithCommas
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </Field>
      </div>

      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      {payload ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <ConsumptionTaxableFlowchart
            payload={{ ...payload, input_override_keys: payload.input_override_keys ?? [] }}
            canEdit
            onChange={(next) => {
              setResultOverride(next.result_override);
              if (next.result_override === "auto" && Object.keys(next.input_overrides).length === 0) {
                setInputs(EMPTY);
                return;
              }
              setInputs((prev) => ({ ...prev, ...next.input_overrides }));
            }}
          />
        </div>
      ) : null}

      <p className="mt-4 text-[11px] text-slate-500">
        帳票の詳細を開くには、顧問先カルテの <strong>進捗</strong> で同じフローを使います。これは公開の簡易試算です。
      </p>
    </ToolShell>
  );
}
