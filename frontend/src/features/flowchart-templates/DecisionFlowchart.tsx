"use client";

import { useMemo } from "react";
import { ClassicTreeFlowchart } from "./ClassicTreeFlowchart";
import { ChecklistFlowchart, type ChecklistCondition } from "./components/ChecklistFlowchart";
import type {
  FlowchartOverride,
  FlowchartRunPayload,
} from "./lib/types";
import type { RelatedDocumentRef } from "@/config/client-field-sources";

type Props = {
  payload: FlowchartRunPayload;
  canEdit?: boolean;
  filledSlotKeys?: ReadonlySet<string>;
  onOpenDocument?: (ref: RelatedDocumentRef) => void;
  onChange?: (next: {
    result_override: FlowchartOverride | string;
    input_overrides: Record<string, unknown>;
  }) => void;
};

export function DecisionFlowchart(props: Props) {
  if (props.payload.mode === "tree") {
    return (
      <ClassicTreeFlowchart
        payload={props.payload}
        canEdit={props.canEdit}
        onChange={props.onChange}
      />
    );
  }
  return <ChecklistDecisionFlowchart {...props} />;
}

function ChecklistDecisionFlowchart({
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
  const yesLabel = payload.outcomes?.true?.label || "該当";
  const noLabel = payload.outcomes?.false?.label || "非該当";
  const passed = payload.passed ?? payload.is_taxable ?? false;
  const autoPassed = payload.auto_passed ?? payload.auto_is_taxable ?? false;

  const currentOverrides = useMemo(() => {
    const next: Record<string, unknown> = {};
    for (const key of payload.input_override_keys ?? []) {
      if (payload.inputs && key in payload.inputs) next[key] = payload.inputs[key];
    }
    return next;
  }, [payload.input_override_keys, payload.inputs]);

  const conditionIsManual = (condition: ChecklistCondition) =>
    Object.keys(condition.match_inputs ?? {}).some((key) => overrideKeys.has(key));

  const emit = (result_override: FlowchartOverride, input_overrides: Record<string, unknown>) => {
    onChange?.({ result_override, input_overrides });
  };

  return (
    <ChecklistFlowchart
      title="判定フロー"
      conditions={payload.conditions}
      passed={passed}
      outcomeLabel={payload.outcome_label}
      message={payload.message}
      resultSource={payload.result_source}
      autoPassed={autoPassed}
      autoOutcomeLabel={autoPassed ? yesLabel : noLabel}
      yesLabel={yesLabel}
      noLabel={noLabel}
      canEdit={canEdit}
      filledSlotKeys={filledSlotKeys}
      onOpenDocument={onOpenDocument}
      conditionIsManual={conditionIsManual}
      onApplyCondition={(condition) => {
        if (!canEdit) return;
        if (conditionIsManual(condition) && condition.matched) return;
        emit(payload.result_override, { ...currentOverrides, ...(condition.match_inputs ?? {}) });
      }}
      onClearCondition={(condition) => {
        if (!canEdit) return;
        const next = { ...currentOverrides };
        for (const key of Object.keys(condition.match_inputs ?? {})) delete next[key];
        emit(payload.result_override, next);
      }}
      onSetYes={() => emit("yes", currentOverrides)}
      onSetNo={() => emit("no", currentOverrides)}
      onResetAuto={() => emit("auto", {})}
    />
  );
}
