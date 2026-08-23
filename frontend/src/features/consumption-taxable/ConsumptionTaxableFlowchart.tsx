"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, FileText, GitBranch, RotateCcw } from "lucide-react";
import type { RelatedDocumentRef } from "@/config/client-field-sources";
import { isRelatedDocumentAvailable, slotCatalogKey } from "@/config/client-field-sources";
import type {
  ResultOverride,
  TaxableCondition,
  TaxableDocumentRef,
  TaxableFact,
  TaxableStatusInputs,
  TaxableStatusPayload,
} from "./lib/types";
import { CONDITION_INPUT_KEYS, MATCH_OVERRIDE_VALUES } from "./lib/types";

function toRelated(doc: TaxableDocumentRef): RelatedDocumentRef {
  return { periodKey: doc.period_key, slotId: doc.slot_id, label: doc.label };
}

function FactValue({ fact, revealed, onToggle }: { fact: TaxableFact; revealed: boolean; onToggle: () => void }) {
  const isSecret = fact.kind === "yen";
  if (!isSecret) {
    return <span className="font-semibold text-slate-800">{fact.display}</span>;
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      title={revealed ? "数値を隠す" : "クリックまたはホバーで数値を表示"}
      className="group/fact rounded px-1 font-mono text-[11px] font-bold text-slate-800 hover:bg-slate-100"
    >
      <span className={revealed ? "" : "blur-[5px] transition group-hover/fact:blur-none"}>
        {fact.display}
      </span>
    </button>
  );
}

function ConditionNode({
  condition,
  isManual,
  filledSlotKeys,
  canEdit,
  onApply,
  onClear,
  onOpenDocument,
}: {
  condition: TaxableCondition;
  isManual: boolean;
  filledSlotKeys?: ReadonlySet<string>;
  canEdit?: boolean;
  onApply: () => void;
  onClear: () => void;
  onOpenDocument?: (ref: RelatedDocumentRef) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pinnedFacts, setPinnedFacts] = useState<Record<string, boolean>>({});

  return (
    <li className="relative pl-8">
      <span
        className={`absolute left-[7px] top-4 h-2.5 w-2.5 rounded-full ring-4 ring-white ${
          condition.matched ? "bg-emerald-500" : "bg-slate-300"
        }`}
      />
      <div
        className={`rounded-xl border p-3 shadow-sm transition ${
          condition.matched
            ? "border-emerald-200 bg-emerald-50/70"
            : "border-slate-200 bg-white"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <button
            type="button"
            className="min-w-0 text-left"
            onClick={() => {
              setOpen((v) => !v);
              if (canEdit && condition.kind === "flag") onApply();
            }}
          >
            <p className="text-sm font-bold text-slate-800">{condition.label}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">{condition.rule}</p>
          </button>
          <div className="flex flex-wrap items-center gap-1">
            {isManual ? (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                手動
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                自動
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                condition.matched ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
              }`}
            >
              {condition.matched ? "該当" : "非該当"}
            </span>
          </div>
        </div>

        {open ? (
          <div className="mt-3 space-y-2 border-t border-white/70 pt-2">
            <ul className="space-y-1">
              {condition.facts.map((fact) => (
                <li key={fact.id} className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                  <span>{fact.label}</span>
                  <FactValue
                    fact={fact}
                    revealed={!!pinnedFacts[fact.id]}
                    onToggle={() =>
                      setPinnedFacts((prev) => ({ ...prev, [fact.id]: !prev[fact.id] }))
                    }
                  />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-1.5">
              {condition.documents.map((doc) => {
                const related = toRelated(doc);
                const available =
                  !filledSlotKeys || isRelatedDocumentAvailable(related, filledSlotKeys);
                if (onOpenDocument && available) {
                  return (
                    <button
                      key={slotCatalogKey(doc.period_key, doc.slot_id)}
                      type="button"
                      onClick={() => onOpenDocument(related)}
                      className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 hover:bg-blue-100"
                    >
                      <FileText className="h-3 w-3" />
                      詳細（{doc.label}）
                    </button>
                  );
                }
                return (
                  <span
                    key={slotCatalogKey(doc.period_key, doc.slot_id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-400"
                    title={onOpenDocument ? `${doc.label}（未アップロード）` : "顧問先の進捗画面で帳票を開けます"}
                  >
                    <FileText className="h-3 w-3" />
                    詳細（{doc.label}）
                  </span>
                );
              })}
              {canEdit && condition.kind === "threshold" && !isManual ? (
                <button
                  type="button"
                  onClick={onApply}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100"
                >
                  この条件を該当として反映
                </button>
              ) : null}
              {canEdit && isManual ? (
                <button
                  type="button"
                  onClick={onClear}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                >
                  <RotateCcw className="h-3 w-3" />
                  この条件を自動に戻す
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[10px] text-slate-400">
            クリックで反映。金額はホバー／クリック、詳細で帳票を開きます。
          </p>
        )}
      </div>
    </li>
  );
}

type Props = {
  payload: TaxableStatusPayload;
  canEdit?: boolean;
  filledSlotKeys?: ReadonlySet<string>;
  onOpenDocument?: (ref: RelatedDocumentRef) => void;
  onChange?: (next: { result_override: ResultOverride; input_overrides: TaxableStatusInputs }) => void;
};

export function ConsumptionTaxableFlowchart({
  payload,
  canEdit,
  filledSlotKeys,
  onOpenDocument,
  onChange,
}: Props) {
  const overrideKeys = useMemo(
    () => new Set(payload.input_override_keys ?? []),
    [payload.input_override_keys],
  );

  const conditionIsManual = (condition: TaxableCondition) =>
    (CONDITION_INPUT_KEYS[condition.id] ?? []).some((key) => overrideKeys.has(key));

  const emit = (result_override: ResultOverride, input_overrides: TaxableStatusInputs) => {
    onChange?.({ result_override, input_overrides });
  };

  const currentOverrides = useMemo(() => {
    const next: TaxableStatusInputs = {};
    for (const key of payload.input_override_keys ?? []) {
      const k = key as keyof TaxableStatusInputs;
      if (payload.inputs && k in payload.inputs) {
        (next as Record<string, unknown>)[k] = payload.inputs[k];
      }
    }
    return next;
  }, [payload.input_override_keys, payload.inputs]);

  const applyCondition = (condition: TaxableCondition) => {
    if (!canEdit) return;
    if (conditionIsManual(condition) && condition.matched) {
      return;
    }
    emit(payload.result_override, {
      ...currentOverrides,
      ...MATCH_OVERRIDE_VALUES[condition.id],
    });
  };

  const clearCondition = (condition: TaxableCondition) => {
    if (!canEdit) return;
    const next = { ...currentOverrides };
    for (const key of CONDITION_INPUT_KEYS[condition.id] ?? []) {
      delete next[key];
    }
    emit(payload.result_override, next);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div>
        <div className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-700">
          <GitBranch className="h-4 w-4 text-violet-600" />
          判定フロー（どれか1つで課税）
        </div>
        <ol className="relative space-y-3 border-l-2 border-slate-200">
          {payload.conditions.map((condition) => (
            <ConditionNode
              key={condition.id}
              condition={condition}
              isManual={conditionIsManual(condition)}
              filledSlotKeys={filledSlotKeys}
              canEdit={canEdit}
              onApply={() => applyCondition(condition)}
              onClear={() => clearCondition(condition)}
              onOpenDocument={onOpenDocument}
            />
          ))}
        </ol>
      </div>

      <aside className="lg:sticky lg:top-4 h-fit space-y-3">
        <div
          className={`rounded-2xl border p-4 shadow-sm ${
            payload.is_taxable
              ? "border-emerald-300 bg-emerald-50"
              : "border-slate-200 bg-white"
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">採用判定</p>
          <p className={`mt-1 text-xl font-black ${payload.is_taxable ? "text-emerald-800" : "text-slate-700"}`}>
            {payload.is_taxable ? "課税事業者" : "免税（見込み）"}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{payload.message}</p>
          <p className="mt-2 text-[10px] font-bold text-slate-500">
            {payload.result_source === "manual" ? "手動設定が優先されています" : "自動判定を採用"}
            {payload.auto_is_taxable !== payload.is_taxable
              ? `（自動は${payload.auto_is_taxable ? "課税" : "免税"}）`
              : ""}
          </p>
        </div>

        {canEdit ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => emit("taxable", currentOverrides)}
              className="inline-flex items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              課税に反映（手動）
            </button>
            <button
              type="button"
              onClick={() => emit("exempt", currentOverrides)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              免税に反映（手動）
            </button>
            <button
              type="button"
              onClick={() => emit("auto", {})}
              className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              すべて自動判定に戻す
            </button>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
