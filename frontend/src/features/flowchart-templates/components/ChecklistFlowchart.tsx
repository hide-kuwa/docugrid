"use client";

import { useState } from "react";
import { CheckCircle2, FileText, GitBranch, RotateCcw } from "lucide-react";
import type { RelatedDocumentRef } from "@/config/client-field-sources";
import { isRelatedDocumentAvailable, slotCatalogKey } from "@/config/client-field-sources";

export type ChecklistFact = {
  id: string;
  label: string;
  display: string;
  kind: "yen" | "flag" | "text";
  value?: number | boolean | string;
};

export type ChecklistDocumentRef = {
  period_key: string;
  slot_id: string;
  label: string;
};

export type ChecklistCondition = {
  id: string;
  label: string;
  rule: string;
  kind: "flag" | "threshold" | "decision";
  matched: boolean;
  facts: ChecklistFact[];
  documents: ChecklistDocumentRef[];
  match_inputs?: Record<string, unknown>;
};

type Props = {
  title?: string;
  conditions: ChecklistCondition[];
  passed: boolean;
  outcomeLabel: string;
  message: string;
  resultSource: "auto" | "manual";
  autoPassed: boolean;
  autoOutcomeLabel: string;
  yesLabel: string;
  noLabel: string;
  canEdit?: boolean;
  filledSlotKeys?: ReadonlySet<string>;
  onOpenDocument?: (ref: RelatedDocumentRef) => void;
  conditionIsManual: (condition: ChecklistCondition) => boolean;
  onApplyCondition: (condition: ChecklistCondition) => void;
  onClearCondition: (condition: ChecklistCondition) => void;
  onSetYes: () => void;
  onSetNo: () => void;
  onResetAuto: () => void;
};

function toRelated(doc: ChecklistDocumentRef): RelatedDocumentRef {
  return { periodKey: doc.period_key, slotId: doc.slot_id, label: doc.label };
}

function FactValue({ fact, revealed, onToggle }: { fact: ChecklistFact; revealed: boolean; onToggle: () => void }) {
  if (fact.kind !== "yen") {
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
  condition: ChecklistCondition;
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
        className={`rounded-xl border p-3 shadow-sm ${
          condition.matched ? "border-emerald-200 bg-emerald-50/70" : "border-slate-200 bg-white"
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
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                isManual ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {isManual ? "手動" : "自動"}
            </span>
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
                <li
                  key={fact.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600"
                >
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
                const key = slotCatalogKey(doc.period_key, doc.slot_id);
                if (onOpenDocument && available) {
                  return (
                    <button
                      key={key}
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
                    key={key}
                    className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-400"
                    title={onOpenDocument ? `${doc.label}（未アップロード）` : "帳票は顧問先の進捗から開けます"}
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
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800"
                >
                  この条件を該当として反映
                </button>
              ) : null}
              {canEdit && isManual ? (
                <button
                  type="button"
                  onClick={onClear}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600"
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

export function ChecklistFlowchart({
  title = "判定フロー",
  conditions,
  passed,
  outcomeLabel,
  message,
  resultSource,
  autoPassed,
  autoOutcomeLabel,
  yesLabel,
  noLabel,
  canEdit,
  filledSlotKeys,
  onOpenDocument,
  conditionIsManual,
  onApplyCondition,
  onClearCondition,
  onSetYes,
  onSetNo,
  onResetAuto,
}: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div>
        <div className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-700">
          <GitBranch className="h-4 w-4 text-violet-600" />
          {title}
        </div>
        <ol className="relative space-y-3 border-l-2 border-slate-200">
          {conditions.map((condition) => (
            <ConditionNode
              key={condition.id}
              condition={condition}
              isManual={conditionIsManual(condition)}
              filledSlotKeys={filledSlotKeys}
              canEdit={canEdit}
              onApply={() => onApplyCondition(condition)}
              onClear={() => onClearCondition(condition)}
              onOpenDocument={onOpenDocument}
            />
          ))}
        </ol>
      </div>
      <aside className="h-fit space-y-3 lg:sticky lg:top-4">
        <div
          className={`rounded-2xl border p-4 shadow-sm ${
            passed ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">採用判定</p>
          <p className={`mt-1 text-xl font-black ${passed ? "text-emerald-800" : "text-slate-700"}`}>
            {outcomeLabel}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{message}</p>
          <p className="mt-2 text-[10px] font-bold text-slate-500">
            {resultSource === "manual" ? "手動設定が優先されています" : "自動判定を採用"}
            {autoPassed !== passed ? `（自動は${autoOutcomeLabel}）` : ""}
          </p>
        </div>
        {canEdit ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onSetYes}
              className="inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {yesLabel}に反映（手動）
            </button>
            <button
              type="button"
              onClick={onSetNo}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              {noLabel}に反映（手動）
            </button>
            <button
              type="button"
              onClick={onResetAuto}
              className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600"
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
