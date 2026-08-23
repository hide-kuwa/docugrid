"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookmarkPlus, FileDown, Loader2, RotateCcw, Trash2 } from "lucide-react";
import type { RelatedDocumentRef } from "@/config/client-field-sources";
import { DecisionFlowchart } from "@/features/flowchart-templates/DecisionFlowchart";
import {
  deleteFlowchartInstance,
  downloadFlowchartInstancePdf,
  fetchFlowchartInstance,
  fetchFlowchartRun,
  listFlowchartInstances,
  listFlowchartTemplates,
  persistFlowchartRun,
  saveFlowchartInstance,
} from "@/features/flowchart-templates/lib/api";
import type {
  FlowchartInstanceSummary,
  FlowchartOverride,
  FlowchartRunPayload,
  FlowchartTemplate,
} from "@/features/flowchart-templates/lib/types";

type Props = {
  clientId: string;
  canEdit?: boolean;
  filledSlotKeys?: ReadonlySet<string>;
  onOpenRelatedDocument?: (ref: RelatedDocumentRef) => void;
};

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function familyIdOf(t: FlowchartTemplate): string {
  return t.family_id || t.id;
}

function uniqueFamilies(templates: FlowchartTemplate[]) {
  const seen = new Map<string, FlowchartTemplate>();
  const sorted = [...templates].sort((a, b) => (b.valid_from || "").localeCompare(a.valid_from || ""));
  for (const t of sorted) {
    const fid = familyIdOf(t);
    if (!seen.has(fid)) seen.set(fid, t);
  }
  return [...seen.entries()].map(([id, t]) => ({ id, title: t.title, scope: t.scope }));
}

export function ClientFlowchartSection({
  clientId,
  canEdit,
  filledSlotKeys,
  onOpenRelatedDocument,
}: Props) {
  const [templates, setTemplates] = useState<FlowchartTemplate[]>([]);
  const [familyId, setFamilyId] = useState("consumption-taxable");
  const [asOf, setAsOf] = useState(todayIso);
  const [payload, setPayload] = useState<FlowchartRunPayload | null>(null);
  const [instances, setInstances] = useState<FlowchartInstanceSummary[]>([]);
  const [recalledTitle, setRecalledTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const families = useMemo(() => uniqueFamilies(templates), [templates]);
  const editionId = payload?.template_id || familyId;

  const reloadInstances = useCallback(async () => {
    try {
      setInstances(await listFlowchartInstances(clientId, { familyId }));
    } catch {
      setInstances([]);
    }
  }, [clientId, familyId]);

  const reloadRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRecalledTitle(null);
    try {
      setPayload(await fetchFlowchartRun(clientId, { familyId, asOf }));
    } catch {
      setError("この日付に当てはまる税法のひな形がありません");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [clientId, familyId, asOf]);

  useEffect(() => {
    void listFlowchartTemplates()
      .then((data) => {
        const all = [...data.global, ...data.local];
        setTemplates(all);
        const fams = uniqueFamilies(all);
        if (fams.length && !fams.some((f) => f.id === "consumption-taxable")) {
          setFamilyId(fams[0].id);
        }
      })
      .catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    void reloadRun();
    void reloadInstances();
  }, [reloadRun, reloadInstances]);

  const handleChange = async (next: {
    result_override: FlowchartOverride;
    input_overrides: Record<string, unknown>;
  }) => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    setRecalledTitle(null);
    try {
      setPayload(
        await persistFlowchartRun(clientId, editionId, {
          ...next,
          family_id: familyId,
          as_of: asOf,
        }),
      );
    } catch {
      setError("判定の保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleSnapshot = async () => {
    if (!canEdit || !payload) return;
    const title = window.prompt("保存名", `${payload.template_title} ${new Date().toLocaleDateString("ja-JP")}`);
    if (title == null) return;
    setSaving(true);
    try {
      const overrides: Record<string, unknown> = {};
      for (const key of payload.input_override_keys ?? []) {
        overrides[key] = payload.inputs[key];
      }
      await saveFlowchartInstance(clientId, {
        template_id: payload.template_id,
        family_id: familyId,
        title: title.trim() || payload.template_title,
        result_override: payload.result_override,
        input_overrides: overrides,
        as_of: asOf,
      });
      await reloadInstances();
    } catch {
      setError("この判定の保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleRecall = async (id: string) => {
    setSaving(true);
    try {
      const item = await fetchFlowchartInstance(clientId, id);
      if (item.snapshot) {
        setPayload({ ...item.snapshot, frozen: true });
        const law = item.snapshot.law_range || item.snapshot.law_label || "";
        setRecalledTitle(`${item.title}（${item.saved_at.slice(0, 10)}）${law ? ` · ${law}` : ""}`);
      }
    } catch {
      setError("呼び出しに失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const nameBindings = (payload?.bindings ?? []).filter(
    (b) => b.origin === "master" || b.origin === "profile" || b.origin === "metric",
  );

  const lawBanner = payload
    ? `${payload.law_label ? `${payload.law_label} · ` : ""}${payload.law_range || ""}`
    : "";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-tour="flowchart-run">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-slate-700">判定フロー（ひな形）</h3>
          <p className="mt-1 text-[10px] text-slate-400">
            判定基準日に当てはまる税法の版で自動判定します。保存と PDF はその時点の税法のまま変わりません。
          </p>
        </div>
        {saving ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            反映中
          </span>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-[10px] font-bold text-slate-500">
          ひな形
          <select
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-800"
            value={familyId}
            onChange={(e) => setFamilyId(e.target.value)}
          >
            {families.map((t) => (
              <option key={t.id} value={t.id}>
                {t.scope === "global" ? "公式" : "事務所"} · {t.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold text-slate-500">
          判定基準日
          <input
            type="date"
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-800"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => void reloadRun()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-bold text-slate-600"
        >
          <RotateCcw className="h-3 w-3" />
          最新マスタで再判定
        </button>
        {canEdit ? (
          <button
            type="button"
            onClick={() => void handleSnapshot()}
            className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1.5 text-[11px] font-bold text-violet-800"
          >
            <BookmarkPlus className="h-3 w-3" />
            この判定を保存
          </button>
        ) : null}
      </div>

      {lawBanner ? (
        <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          適用税法: <span className="font-bold text-slate-800">{lawBanner}</span>
          {payload?.frozen ? "（保存時点で固定）" : null}
        </p>
      ) : null}

      {payload?.client_name ? (
        <p className="mb-3 text-xs text-slate-600">
          顧問先名（マスタ）: <span className="font-bold">{payload.client_name}</span>
        </p>
      ) : null}

      {nameBindings.length > 0 ? (
        <ul className="mb-4 flex flex-wrap gap-1.5">
          {nameBindings.map((b) => (
            <li
              key={b.input_id}
              className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600"
              title={`${b.origin}${b.field ? `:${b.field}` : ""}${b.metric_key ? `:${b.metric_key}` : ""}`}
            >
              {b.input_id}: {b.kind === "yen" ? "••••" : b.display}
            </li>
          ))}
        </ul>
      ) : null}

      {recalledTitle ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
          呼び出し中: {recalledTitle}。保存時点の税法のままです。ひな形が後から変わっても書き換えません。最新マスタで再判定すると下書きに戻ります。
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          判定を読み込み中…
        </div>
      ) : payload ? (
        <DecisionFlowchart
          payload={payload}
          canEdit={canEdit && !recalledTitle}
          filledSlotKeys={filledSlotKeys}
          onOpenDocument={onOpenRelatedDocument}
          onChange={(next) => void handleChange(next)}
        />
      ) : (
        <p className="text-sm text-slate-500">{error ?? "判定データを表示できません。"}</p>
      )}
      {error && payload ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}

      {instances.length > 0 ? (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">保存した判定（税法固定）</p>
          <ul className="mt-2 space-y-1">
            {instances.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
              >
                <div>
                  <p className="text-xs font-bold text-slate-700">{item.title}</p>
                  <p className="text-[10px] text-slate-400">
                    {item.saved_at.slice(0, 16).replace("T", " ")} · {item.outcome_label ?? "—"}
                    {item.law_range ? ` · ${item.law_range}` : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => void handleRecall(item.id)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-700"
                  >
                    呼び出す
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void downloadFlowchartInstancePdf(clientId, item.id, item.title).catch(() =>
                        setError("PDF の出力に失敗しました"),
                      );
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-700"
                  >
                    <FileDown className="h-3 w-3" />
                    PDF
                  </button>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm("この保存を削除しますか？")) return;
                        void deleteFlowchartInstance(clientId, item.id).then(() => reloadInstances());
                      }}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] text-slate-400 hover:text-red-600"
                      aria-label="削除"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
