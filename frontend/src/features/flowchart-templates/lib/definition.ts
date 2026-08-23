import type {
  FlowchartBindingDraft,
  FlowchartDefinitionDraft,
  FlowchartNodeDraft,
  FlowchartWhen,
  FlowchartWhenClause,
} from "./types";

export const EMPTY_DEFINITION: FlowchartDefinitionDraft = {
  combine: "any",
  bindings: [
    { input_id: "client_name", source: "master", field: "name", transform: "text" },
    { input_id: "flag1", source: "const", value: false, transform: "bool" },
  ],
  nodes: [
    {
      id: "flag1",
      label: "条件1",
      rule: "該当するかどうかを選びます",
      kind: "flag",
      when: { input: "flag1", eq: true },
      match_inputs: { flag1: true },
      facts: [{ input_id: "flag1", label: "条件1", kind: "flag" }],
      documents: [],
    },
  ],
  outcomes: {
    true: { label: "該当", message: "該当します。" },
    false: { label: "非該当", message: "該当しません。" },
  },
};

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function parseWhen(raw: unknown): FlowchartWhen {
  const obj = asRecord(raw);
  if (Array.isArray(obj.all)) return { all: obj.all.map(parseWhen) };
  if (Array.isArray(obj.any)) return { any: obj.any.map(parseWhen) };
  const op = obj.op;
  const clause: FlowchartWhenClause = { input: String(obj.input || "") };
  if ("eq" in obj) clause.eq = obj.eq;
  if (op === ">" || op === ">=" || op === "<" || op === "<=" || op === "==") {
    clause.op = op;
    clause.value = obj.value;
  }
  return clause;
}

function parseBinding(raw: unknown): FlowchartBindingDraft | null {
  const obj = asRecord(raw);
  const input_id = String(obj.input_id || "").trim();
  if (!input_id) return null;
  const source = obj.source;
  const transform = obj.transform;
  return {
    input_id,
    source: source === "master" || source === "profile" || source === "metric" || source === "const" ? source : "const",
    field: obj.field ? String(obj.field) : undefined,
    metric_key: obj.metric_key ? String(obj.metric_key) : undefined,
    pick: obj.pick ? String(obj.pick) : undefined,
    value: obj.value,
    transform:
      transform === "text" || transform === "yen" || transform === "truthy" || transform === "bool" || transform === "entity_type"
        ? transform
        : "text",
  };
}

function parseNode(raw: unknown): FlowchartNodeDraft | null {
  const obj = asRecord(raw);
  const id = String(obj.id || "").trim();
  if (!id) return null;
  const facts = Array.isArray(obj.facts)
    ? obj.facts
        .map((item) => {
          const fact = asRecord(item);
          const input_id = String(fact.input_id || "").trim();
          if (!input_id) return null;
          return {
            input_id,
            label: String(fact.label || input_id),
            kind: String(fact.kind || "text"),
            threshold: typeof fact.threshold === "number" ? fact.threshold : undefined,
            comparison: fact.comparison ? String(fact.comparison) : undefined,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];
  const documents = Array.isArray(obj.documents)
    ? obj.documents
        .map((item) => {
          const doc = asRecord(item);
          return {
            period_key: String(doc.period_key || ""),
            slot_id: String(doc.slot_id || ""),
            label: String(doc.label || ""),
          };
        })
        .filter((doc) => doc.slot_id)
    : [];
  return {
    id,
    label: String(obj.label || id),
    rule: String(obj.rule || ""),
    kind: obj.kind === "threshold" ? "threshold" : "flag",
    when: parseWhen(obj.when),
    match_inputs: asRecord(obj.match_inputs),
    facts,
    documents,
  };
}

export function parseDefinition(raw: unknown): FlowchartDefinitionDraft {
  const obj = asRecord(raw);
  const bindings = Array.isArray(obj.bindings)
    ? obj.bindings.map(parseBinding).filter((item): item is FlowchartBindingDraft => Boolean(item))
    : [];
  const nodes = Array.isArray(obj.nodes)
    ? obj.nodes.map(parseNode).filter((item): item is FlowchartNodeDraft => Boolean(item))
    : [];
  const outcomes = asRecord(obj.outcomes);
  const yes = asRecord(outcomes.true);
  const no = asRecord(outcomes.false);
  return {
    combine: obj.combine === "all" ? "all" : "any",
    bindings: bindings.length ? bindings : EMPTY_DEFINITION.bindings,
    nodes: nodes.length ? nodes : EMPTY_DEFINITION.nodes,
    outcomes: {
      true: {
        label: String(yes.label || "該当"),
        message: String(yes.message || "該当します。"),
      },
      false: {
        label: String(no.label || "非該当"),
        message: String(no.message || "該当しません。"),
      },
    },
  };
}

export function serializeDefinition(draft: FlowchartDefinitionDraft): Record<string, unknown> {
  return {
    combine: draft.combine,
    bindings: draft.bindings.map((b) => ({
      input_id: b.input_id,
      source: b.source,
      ...(b.field ? { field: b.field } : {}),
      ...(b.metric_key ? { metric_key: b.metric_key } : {}),
      ...(b.pick ? { pick: b.pick } : {}),
      ...(b.source === "const" ? { value: b.value } : {}),
      transform: b.transform,
    })),
    nodes: draft.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      rule: node.rule,
      kind: node.kind,
      when: node.when,
      match_inputs: node.match_inputs || {},
      facts: node.facts,
      documents: node.documents,
    })),
    outcomes: draft.outcomes,
  };
}

export function isWhenClause(when: FlowchartWhen): when is FlowchartWhenClause {
  return "input" in when;
}

export function clausesOf(when: FlowchartWhen): FlowchartWhenClause[] {
  if ("all" in when) return when.all.flatMap(clausesOf);
  if ("any" in when) return when.any.flatMap(clausesOf);
  return [when];
}

function slug(label: string, fallback: string): string {
  const ascii = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return ascii || fallback;
}

export function newFlagNode(existing: FlowchartNodeDraft[]): {
  node: FlowchartNodeDraft;
  binding: FlowchartBindingDraft;
} {
  const id = slug(`flag_${existing.length + 1}`, `flag_${existing.length + 1}`);
  return {
    binding: { input_id: id, source: "const", value: false, transform: "bool" },
    node: {
      id,
      label: "新しい条件",
      rule: "該当するかどうかを選びます",
      kind: "flag",
      when: { input: id, eq: true },
      match_inputs: { [id]: true },
      facts: [{ input_id: id, label: "新しい条件", kind: "flag" }],
      documents: [],
    },
  };
}

export function newThresholdNode(existing: FlowchartNodeDraft[]): {
  node: FlowchartNodeDraft;
  binding: FlowchartBindingDraft;
} {
  const id = slug(`amount_${existing.length + 1}`, `amount_${existing.length + 1}`);
  return {
    binding: { input_id: id, source: "const", value: 0, transform: "yen" },
    node: {
      id,
      label: "金額の条件",
      rule: "基準を超えたら該当",
      kind: "threshold",
      when: { input: id, op: ">", value: 10_000_000 },
      match_inputs: {},
      facts: [{ input_id: id, label: "金額", kind: "yen", threshold: 10_000_000, comparison: ">" }],
      documents: [],
    },
  };
}

export function syncNodeFromClauses(
  node: FlowchartNodeDraft,
  clauses: FlowchartWhenClause[],
): FlowchartNodeDraft {
  const when: FlowchartWhen = clauses.length <= 1 ? clauses[0] || { input: node.id, eq: true } : { all: clauses };
  const first = clauses[0];
  return {
    ...node,
    when,
    kind: first?.op ? "threshold" : "flag",
    facts: clauses.map((clause) => ({
      input_id: clause.input,
      label: node.label,
      kind: clause.op ? "yen" : "flag",
      threshold: typeof clause.value === "number" ? clause.value : undefined,
      comparison: clause.op,
    })),
    match_inputs:
      !first?.op && first
        ? { [first.input]: first.eq === undefined ? true : first.eq }
        : {},
  };
}
