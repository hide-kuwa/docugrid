"use client";

import { useMemo } from "react";
import type { RelatedDocumentRef } from "@/config/client-field-sources";
import { ChecklistFlowchart, type ChecklistCondition } from "@/features/flowchart-templates/components/ChecklistFlowchart";
import type {
  ResultOverride,
  TaxableStatusInputs,
  TaxableStatusPayload,
} from "./lib/types";
import { CONDITION_INPUT_KEYS, MATCH_OVERRIDE_VALUES } from "./lib/types";

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

  const conditionIsManual = (condition: ChecklistCondition) =>
    (CONDITION_INPUT_KEYS[condition.id] ?? []).some((key) => overrideKeys.has(key));

  const emit = (result_override: ResultOverride, input_overrides: TaxableStatusInputs) => {
    onChange?.({ result_override, input_overrides });
  };

  return (
    <ChecklistFlowchart
      title="判定フロー（どれか1つで課税）"
      conditions={payload.conditions}
      passed={payload.is_taxable}
      outcomeLabel={payload.is_taxable ? "課税事業者" : "免税（見込み）"}
      message={payload.message}
      resultSource={payload.result_source}
      autoPassed={payload.auto_is_taxable}
      autoOutcomeLabel={payload.auto_is_taxable ? "課税" : "免税"}
      yesLabel="課税"
      noLabel="免税"
      canEdit={canEdit}
      filledSlotKeys={filledSlotKeys}
      onOpenDocument={onOpenDocument}
      conditionIsManual={conditionIsManual}
      onApplyCondition={(condition) => {
        if (!canEdit) return;
        if (conditionIsManual(condition) && condition.matched) return;
        emit(payload.result_override, {
          ...currentOverrides,
          ...MATCH_OVERRIDE_VALUES[condition.id],
        });
      }}
      onClearCondition={(condition) => {
        if (!canEdit) return;
        const next = { ...currentOverrides };
        for (const key of CONDITION_INPUT_KEYS[condition.id] ?? []) delete next[key];
        emit(payload.result_override, next);
      }}
      onSetYes={() => emit("taxable", currentOverrides)}
      onSetNo={() => emit("exempt", currentOverrides)}
      onResetAuto={() => emit("auto", {})}
    />
  );
}
