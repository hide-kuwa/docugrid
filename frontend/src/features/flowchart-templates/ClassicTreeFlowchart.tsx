"use client";

import { RotateCcw } from "lucide-react";
import type { FlowchartCondition, FlowchartRunPayload } from "./lib/types";

type Props = {
  payload: FlowchartRunPayload;
  canEdit?: boolean;
  onChange?: (next: {
    result_override: string;
    input_overrides: Record<string, unknown>;
  }) => void;
};

function boxStyle(layout: Record<string, unknown> | undefined) {
  const x = Number(layout?.x ?? 0);
  const y = Number(layout?.y ?? 0);
  const w = Number(layout?.w ?? 160);
  const h = Number(layout?.h ?? 56);
  return { left: x, top: y, width: w, minHeight: h };
}

function centerOf(layout: Record<string, unknown> | undefined) {
  const x = Number(layout?.x ?? 0);
  const y = Number(layout?.y ?? 0);
  const w = Number(layout?.w ?? 160);
  const h = Number(layout?.h ?? 56);
  return { cx: x + w / 2, cy: y + h / 2, right: x + w, left: x, top: y, bottom: y + h };
}

export function ClassicTreeFlowchart({ payload, canEdit, onChange }: Props) {
  const conditions = payload.conditions ?? [];
  const byId = new Map(conditions.map((c) => [c.id, c]));
  const outcomes = payload.outcome_options ?? [];
  const currentOverrides: Record<string, unknown> = {};
  for (const key of payload.input_override_keys ?? []) {
    if (payload.inputs && key in payload.inputs) currentOverrides[key] = payload.inputs[key];
  }

  const canvasW = Math.max(
    980,
    ...conditions.map((c) => Number(c.layout?.x ?? 0) + Number(c.layout?.w ?? 160) + 40),
  );
  const canvasH = Math.max(
    560,
    ...conditions.map((c) => Number(c.layout?.y ?? 0) + Number(c.layout?.h ?? 56) + 40),
  );

  const emit = (result_override: string, input_overrides: Record<string, unknown>) => {
    onChange?.({ result_override, input_overrides });
  };

  const answerNode = (condition: FlowchartCondition, yes: boolean) => {
    if (!canEdit) return;
    const patch = yes
      ? (condition.match_yes ?? condition.match_inputs ?? {})
      : (condition.match_no ?? {});
    emit("auto", { ...currentOverrides, ...patch });
  };

  const edgeLines = (payload.edges ?? [])
    .map((edge) => {
      const from = byId.get(edge.from);
      const toId = edge.to.startsWith("outcome:") ? null : byId.get(edge.to);
      if (!from?.layout) return null;
      const a = centerOf(from.layout);
      if (toId?.layout) {
        const b = centerOf(toId.layout);
        return {
          key: `${edge.from}-${edge.to}-${edge.branch}`,
          x1: a.right,
          y1: a.cy,
          x2: b.left,
          y2: b.cy,
          label: edge.branch === "yes" ? "YES" : "NO",
          active: true,
        };
      }
      // outcome: draw toward right column
      return {
        key: `${edge.from}-${edge.to}-${edge.branch}`,
        x1: a.right,
        y1: a.cy,
        x2: canvasW - 24,
        y2: a.cy,
        label: edge.branch === "yes" ? "YES" : "NO",
        active: true,
      };
    })
    .filter(Boolean) as Array<{
    key: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    label: string;
    active: boolean;
  }>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-800">（事業区分のフローチャート）</p>
          <p className="text-[11px] text-slate-500">
            質問に YES / NO で答えると、右側の種別に進みます。国税庁の図に近い社内判定です。
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => emit("auto", {})}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-600"
          >
            <RotateCcw className="h-3 w-3" />
            最初から
          </button>
        ) : null}
      </div>

      <div className="overflow-auto rounded border border-slate-300 bg-[#fafafa]">
        <div className="flex min-w-[1100px]">
          <div className="relative flex-1" style={{ width: canvasW, height: canvasH }}>
            <div className="absolute left-3 top-3 rounded border border-slate-800 bg-white px-2 py-1 text-[11px] font-bold">
              スタート
            </div>
            <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              {edgeLines.map((line) => (
                <g key={line.key}>
                  <path
                    d={`M ${line.x1} ${line.y1} L ${line.x2} ${line.y1} L ${line.x2} ${line.y2}`}
                    fill="none"
                    stroke="#111"
                    strokeWidth="1.5"
                    markerEnd="url(#arrow)"
                  />
                  <text
                    x={(line.x1 + line.x2) / 2}
                    y={line.y1 - 6}
                    textAnchor="middle"
                    className="fill-slate-800 text-[10px] font-bold"
                  >
                    {line.label}
                  </text>
                </g>
              ))}
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="#111" />
                </marker>
              </defs>
            </svg>

            {conditions.map((condition) => {
              const active = condition.is_current || condition.on_path;
              return (
                <div
                  key={condition.id}
                  className={`absolute border border-slate-900 bg-white p-2 shadow-sm ${
                    condition.is_current ? "ring-2 ring-cyan-500" : ""
                  } ${condition.on_path && !condition.is_current ? "bg-cyan-50" : ""}`}
                  style={boxStyle(condition.layout)}
                >
                  <p className="text-[11px] font-bold leading-snug text-slate-900">{condition.label}</p>
                  {condition.rule ? (
                    <p className="mt-1 text-[9px] leading-snug text-slate-500">{condition.rule}</p>
                  ) : null}
                  {canEdit && (condition.is_current || active) ? (
                    <div className="mt-2 flex gap-1">
                      <button
                        type="button"
                        onClick={() => answerNode(condition, true)}
                        className={`flex-1 rounded border px-1 py-0.5 text-[10px] font-black ${
                          condition.answer === true
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-400 bg-white text-slate-800"
                        }`}
                      >
                        YES
                      </button>
                      <button
                        type="button"
                        onClick={() => answerNode(condition, false)}
                        className={`flex-1 rounded border px-1 py-0.5 text-[10px] font-black ${
                          condition.answer === false
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-400 bg-white text-slate-800"
                        }`}
                      >
                        NO
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <aside className="flex w-36 shrink-0 flex-col gap-2 border-l border-slate-300 bg-white p-2">
            {outcomes.map((outcome) => {
              const selected = payload.outcome_id === outcome.id;
              return (
                <button
                  key={outcome.id}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => canEdit && emit(outcome.id, currentOverrides)}
                  className={`min-h-[4.5rem] rounded-sm border px-1 py-2 text-center ${
                    selected
                      ? "border-cyan-700 bg-cyan-200 ring-2 ring-cyan-600"
                      : "border-cyan-300 bg-cyan-100"
                  }`}
                  title={outcome.message}
                >
                  <span
                    className="inline-block text-[12px] font-black tracking-wide text-slate-900"
                    style={{ writingMode: "vertical-rl" }}
                  >
                    {outcome.label}
                  </span>
                  <p className="mt-1 text-[9px] text-slate-600">（{outcome.message}）</p>
                </button>
              );
            })}
          </aside>
        </div>
      </div>

      <div
        className={`rounded border px-3 py-2 text-sm ${
          payload.passed ? "border-cyan-400 bg-cyan-50 text-cyan-950" : "border-slate-200 bg-white text-slate-700"
        }`}
      >
        <span className="font-bold">結果: {payload.outcome_label}</span>
        <span className="ml-2 text-[12px]">{payload.message}</span>
      </div>
    </div>
  );
}
