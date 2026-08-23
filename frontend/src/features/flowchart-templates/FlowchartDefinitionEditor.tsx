"use client";

import { Plus, Trash2 } from "lucide-react";
import type {
  FlowchartBindingDraft,
  FlowchartDefinitionDraft,
  FlowchartNodeDraft,
  FlowchartWhenClause,
} from "@/features/flowchart-templates/lib/types";
import {
  clausesOf,
  newFlagNode,
  newThresholdNode,
  syncNodeFromClauses,
} from "@/features/flowchart-templates/lib/definition";

type Props = {
  value: FlowchartDefinitionDraft;
  onChange: (next: FlowchartDefinitionDraft) => void;
  disabled?: boolean;
};

const SOURCE_OPTIONS: Array<{ id: FlowchartBindingDraft["source"]; label: string }> = [
  { id: "master", label: "顧問先マスタ" },
  { id: "profile", label: "カルテ詳細" },
  { id: "metric", label: "グラフ指標" },
  { id: "const", label: "手入力・初期値" },
];

const TRANSFORM_OPTIONS: Array<{ id: FlowchartBindingDraft["transform"]; label: string }> = [
  { id: "text", label: "文字" },
  { id: "yen", label: "金額" },
  { id: "bool", label: "はい/いいえ" },
  { id: "truthy", label: "記入があれば該当" },
  { id: "entity_type", label: "法人/個人" },
];

function updateNode(nodes: FlowchartNodeDraft[], id: string, patch: Partial<FlowchartNodeDraft>) {
  return nodes.map((node) => (node.id === id ? { ...node, ...patch } : node));
}

export function FlowchartDefinitionEditor({ value, onChange, disabled }: Props) {
  const setBindings = (bindings: FlowchartBindingDraft[]) => onChange({ ...value, bindings });
  const setNodes = (nodes: FlowchartNodeDraft[]) => onChange({ ...value, nodes });

  const addFlag = () => {
    const created = newFlagNode(value.nodes);
    onChange({
      ...value,
      bindings: [...value.bindings, created.binding],
      nodes: [...value.nodes, created.node],
    });
  };

  const addThreshold = () => {
    const created = newThresholdNode(value.nodes);
    onChange({
      ...value,
      bindings: [...value.bindings, created.binding],
      nodes: [...value.nodes, created.node],
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[10px] font-bold text-slate-500">
          判定のつなぎ方
          <select
            disabled={disabled}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={value.combine}
            onChange={(e) => onChange({ ...value, combine: e.target.value === "all" ? "all" : "any" })}
          >
            <option value="any">どれか1つ該当すればOK</option>
            <option value="all">すべて該当する必要あり</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[10px] font-bold text-slate-500">
            該当のときの名前
            <input
              disabled={disabled}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={value.outcomes.true.label}
              onChange={(e) =>
                onChange({
                  ...value,
                  outcomes: { ...value.outcomes, true: { ...value.outcomes.true, label: e.target.value } },
                })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold text-slate-500">
            非該当のときの名前
            <input
              disabled={disabled}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={value.outcomes.false.label}
              onChange={(e) =>
                onChange({
                  ...value,
                  outcomes: { ...value.outcomes, false: { ...value.outcomes.false, label: e.target.value } },
                })
              }
            />
          </label>
        </div>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-700">使う数字・項目</h4>
          {!disabled ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-700"
              onClick={() =>
                setBindings([
                  ...value.bindings,
                  { input_id: `item_${value.bindings.length + 1}`, source: "const", value: false, transform: "bool" },
                ])
              }
            >
              <Plus className="h-3 w-3" />
              項目を追加
            </button>
          ) : null}
        </div>
        <ul className="space-y-2">
          {value.bindings.map((binding, index) => (
            <li key={`${binding.input_id}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="grid gap-2 sm:grid-cols-4">
                <input
                  disabled={disabled}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                  placeholder="項目ID"
                  value={binding.input_id}
                  onChange={(e) => {
                    const next = [...value.bindings];
                    next[index] = { ...binding, input_id: e.target.value };
                    setBindings(next);
                  }}
                />
                <select
                  disabled={disabled}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                  value={binding.source}
                  onChange={(e) => {
                    const next = [...value.bindings];
                    next[index] = { ...binding, source: e.target.value as FlowchartBindingDraft["source"] };
                    setBindings(next);
                  }}
                >
                  {SOURCE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {binding.source === "metric" ? (
                  <input
                    disabled={disabled}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                    placeholder="指標キー"
                    value={binding.metric_key || ""}
                    onChange={(e) => {
                      const next = [...value.bindings];
                      next[index] = { ...binding, metric_key: e.target.value };
                      setBindings(next);
                    }}
                  />
                ) : binding.source === "const" ? (
                  <input
                    disabled={disabled}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                    placeholder="初期値"
                    value={binding.value === undefined || binding.value === null ? "" : String(binding.value)}
                    onChange={(e) => {
                      const next = [...value.bindings];
                      const raw = e.target.value;
                      const parsed = raw === "true" ? true : raw === "false" ? false : Number.isNaN(Number(raw)) || raw === "" ? raw : Number(raw);
                      next[index] = { ...binding, value: parsed };
                      setBindings(next);
                    }}
                  />
                ) : (
                  <input
                    disabled={disabled}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                    placeholder="フィールド名"
                    value={binding.field || ""}
                    onChange={(e) => {
                      const next = [...value.bindings];
                      next[index] = { ...binding, field: e.target.value };
                      setBindings(next);
                    }}
                  />
                )}
                <div className="flex gap-1">
                  <select
                    disabled={disabled}
                    className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                    value={binding.transform}
                    onChange={(e) => {
                      const next = [...value.bindings];
                      next[index] = { ...binding, transform: e.target.value as FlowchartBindingDraft["transform"] };
                      setBindings(next);
                    }}
                  >
                    {TRANSFORM_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {!disabled ? (
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 px-2 text-slate-400 hover:text-red-600"
                      onClick={() => setBindings(value.bindings.filter((_, i) => i !== index))}
                      aria-label="項目を削除"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-slate-700">判定のステップ</h4>
          {!disabled ? (
            <div className="flex gap-2">
              <button type="button" className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-700" onClick={addFlag}>
                <Plus className="h-3 w-3" />
                はい/いいえ
              </button>
              <button type="button" className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-700" onClick={addThreshold}>
                <Plus className="h-3 w-3" />
                金額の条件
              </button>
            </div>
          ) : null}
        </div>
        <ol className="space-y-3">
          {value.nodes.map((node, index) => {
            const clauses = clausesOf(node.when);
            return (
              <li key={node.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">ステップ {index + 1}</p>
                  {!disabled ? (
                    <button
                      type="button"
                      className="text-slate-400 hover:text-red-600"
                      onClick={() => setNodes(value.nodes.filter((item) => item.id !== node.id))}
                      aria-label="ステップを削除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    disabled={disabled}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                    placeholder="ステップ名"
                    value={node.label}
                    onChange={(e) => setNodes(updateNode(value.nodes, node.id, { label: e.target.value }))}
                  />
                  <input
                    disabled={disabled}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="説明"
                    value={node.rule}
                    onChange={(e) => setNodes(updateNode(value.nodes, node.id, { rule: e.target.value }))}
                  />
                </div>
                <ul className="mt-3 space-y-2">
                  {clauses.map((clause, clauseIndex) => (
                    <li key={`${node.id}-${clauseIndex}`} className="grid gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-4">
                      <select
                        disabled={disabled}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                        value={clause.input}
                        onChange={(e) => {
                          const nextClauses = [...clauses];
                          nextClauses[clauseIndex] = { ...clause, input: e.target.value };
                          setNodes(updateNode(value.nodes, node.id, syncNodeFromClauses(node, nextClauses)));
                        }}
                      >
                        {value.bindings.map((binding) => (
                          <option key={binding.input_id} value={binding.input_id}>
                            {binding.input_id}
                          </option>
                        ))}
                      </select>
                      <select
                        disabled={disabled}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                        value={clause.op ? clause.op : "eq"}
                        onChange={(e) => {
                          const nextClauses = [...clauses];
                          const op = e.target.value;
                          nextClauses[clauseIndex] =
                            op === "eq"
                              ? { input: clause.input, eq: true }
                              : { input: clause.input, op: op as FlowchartWhenClause["op"], value: Number(clause.value || 0) };
                          setNodes(updateNode(value.nodes, node.id, syncNodeFromClauses(node, nextClauses)));
                        }}
                      >
                        <option value="eq">該当する</option>
                        <option value=">">より大きい</option>
                        <option value=">=">以上</option>
                        <option value="<">より小さい</option>
                        <option value="<=">以下</option>
                      </select>
                      {clause.op ? (
                        <input
                          disabled={disabled}
                          type="number"
                          className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                          value={typeof clause.value === "number" ? clause.value : Number(clause.value || 0)}
                          onChange={(e) => {
                            const nextClauses = [...clauses];
                            nextClauses[clauseIndex] = { ...clause, value: Number(e.target.value) };
                            setNodes(updateNode(value.nodes, node.id, syncNodeFromClauses(node, nextClauses)));
                          }}
                        />
                      ) : (
                        <span className="self-center text-[11px] text-slate-500">はい なら該当</span>
                      )}
                      {!disabled && clauses.length > 1 ? (
                        <button
                          type="button"
                          className="text-[11px] text-slate-400"
                          onClick={() => {
                            const nextClauses = clauses.filter((_, i) => i !== clauseIndex);
                            setNodes(updateNode(value.nodes, node.id, syncNodeFromClauses(node, nextClauses)));
                          }}
                        >
                          条件を外す
                        </button>
                      ) : (
                        <span />
                      )}
                    </li>
                  ))}
                </ul>
                {!disabled ? (
                  <button
                    type="button"
                    className="mt-2 text-[11px] font-bold text-violet-700"
                    onClick={() => {
                      const extra: FlowchartWhenClause = {
                        input: value.bindings[0]?.input_id || node.id,
                        op: ">",
                        value: 10_000_000,
                      };
                      setNodes(updateNode(value.nodes, node.id, syncNodeFromClauses(node, [...clauses, extra])));
                    }}
                  >
                    かつ（複合条件）
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
