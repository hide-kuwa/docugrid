"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileDown, GitBranch, Loader2, Plus, Trash2 } from "lucide-react";
import {
  RELATION_KIND_LABEL,
  type ClientRelationEdge,
  type ClientRelationKind,
  type OrgClient,
} from "@/config/organization";
import {
  kindsForViewMode,
  layoutClientRelations,
  RELATION_VIEW_MODES,
  edgeStroke,
  type RelationViewMode,
} from "@/features/client-data/lib/client-relations-layout";
import { RelationDiagramCanvas } from "@/features/client-data/RelationDiagramCanvas";
import {
  PDF_PAGE_ORIENTATIONS,
  type PdfPageOrientation,
} from "@/features/client-data/lib/relation-diagram-pdf";
import { RELATION_DIAGRAM_SLOT_LABEL } from "@/features/client-data/lib/relation-diagram-slot";
import { relationLayoutKey, type RelationDiagramManualLayout } from "@/features/client-data/lib/relation-diagram-manual-layout";
import { fetchClientMaster, saveClientMaster } from "@/lib/client-master-api";
import { useRelationLayoutPersist } from "@/features/client-data/hooks/useRelationLayoutPersist";
import { useRelationDiagramExport } from "@/features/client-data/hooks/useRelationDiagramExport";
import { ClientSearchSelect, toClientSearchOption } from "@/components/ClientSearchSelect";

type Props = {
  client: OrgClient;
  canEdit?: boolean;
  /** 図上の名前クリックで顧問先ナビを切替 */
  onFocusClient?: (clientId: string) => void;
};

const KIND_OPTIONS: ClientRelationKind[] = [
  "group_company",
  "relative",
  "shareholding",
  "officer",
  "referral",
];

/** 種別ごとの From / To の意味（役員は 個人 → 法人） */
const KIND_ENDPOINT_LABEL: Record<ClientRelationKind, { from: string; to: string }> = {
  group_company: { from: "From（親・持株など）", to: "To（子・事業会社など）" },
  relative: { from: "From（本人）", to: "To（親族）" },
  shareholding: { from: "From（出資者）", to: "To（被出資）" },
  officer: { from: "From（社長・役員の個人）", to: "To（その法人）" },
  referral: { from: "From（紹介元）", to: "To（被紹介）" },
};

export function ClientRelationsPanel({ client, canEdit, onFocusClient }: Props) {
  const [clients, setClients] = useState<OrgClient[]>([]);
  const [groups, setGroups] = useState<
    Awaited<ReturnType<typeof fetchClientMaster>>["groups"]
  >([]);
  const [relations, setRelations] = useState<ClientRelationEdge[]>([]);
  const {
    relationLayouts,
    setRelationLayouts,
    handleManualChange: onManualLayoutChange,
    emptyManual,
  } = useRelationLayoutPersist(canEdit);
  const {
    exporting,
    saveNotice,
    setSaveNotice,
    handleDownloadPdf: downloadPdf,
    handleSaveToPerm: savePdfToPerm,
    refreshSavedMeta,
  } = useRelationDiagramExport(client.id);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMeta, setSavedMeta] = useState<{
    versionLabel: string | null;
    versionCount: number | null;
  } | null>(null);
  const [viewMode, setViewMode] = useState<RelationViewMode>("all");
  /** PDF 用紙向き（A4）。関係図は横長なので初期は横 */
  const [pageOrientation, setPageOrientation] =
    useState<PdfPageOrientation>("landscape");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{
    kind: ClientRelationKind;
    fromClientId: string;
    toClientId: string;
    percent: string;
    note: string;
  }>({
    kind: "referral",
    fromClientId: "",
    toClientId: client.id,
    percent: "",
    note: "",
  });

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const master = await fetchClientMaster();
      setClients(master.clients);
      setGroups(master.groups);
      setRelations(master.relations);
      setRelationLayouts(master.relationLayouts ?? {});
      const meta = await refreshSavedMeta();
      setSavedMeta(meta);
    } catch {
      setError("関係データの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [client.id, refreshSavedMeta, setRelationLayouts]);

  useEffect(() => {
    void reload();
  }, [reload, client.id]);

  useEffect(() => {
    setDraft((prev) => ({
      ...prev,
      toClientId: prev.toClientId || client.id,
      fromClientId:
        prev.fromClientId && prev.fromClientId !== client.id
          ? prev.fromClientId
          : "",
    }));
  }, [client.id]);

  const layout = useMemo(
    () => layoutClientRelations(client.id, clients, groups, relations, viewMode),
    [client.id, clients, groups, relations, viewMode],
  );

  const layoutKey = relationLayoutKey(client.id, viewMode);
  const manual = relationLayouts[layoutKey] ?? emptyManual();

  const handleManualChange = useCallback(
    (next: RelationDiagramManualLayout) => {
      onManualLayoutChange(layoutKey, next);
    },
    [layoutKey, onManualLayoutChange],
  );

  const pdfParams = useMemo(
    () => ({
      focus: client,
      clients,
      groups,
      relations,
      viewMode,
      orientation: pageOrientation,
      manual,
    }),
    [client, clients, groups, relations, viewMode, pageOrientation, manual],
  );

  const handleDownloadPdf = async () => {
    setError(null);
    setSaveNotice(null);
    try {
      await downloadPdf(pdfParams);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF の作成に失敗しました");
    }
  };

  const handleSaveToPerm = async () => {
    setError(null);
    setSaveNotice(null);
    try {
      const meta = await savePdfToPerm(pdfParams);
      if (meta) setSavedMeta(meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : "永続への保存に失敗しました");
    }
  };

  const nameById = useMemo(
    () => new Map(clients.map((c) => [c.id, c.name])),
    [clients],
  );

  const connectionRows = useMemo(() => {
    const allowed = kindsForViewMode(viewMode);
    return relations
      .filter(
        (e) =>
          (e.fromClientId === client.id || e.toClientId === client.id) &&
          (!allowed || allowed.has(e.kind)),
      )
      .sort((a, b) => {
        const order = (k: ClientRelationKind) =>
          ({ group_company: 0, relative: 1, shareholding: 2, officer: 3, referral: 4 }[k] ??
          9);
        return order(a.kind) - order(b.kind) || a.id.localeCompare(b.id);
      });
  }, [relations, client.id, viewMode]);

  const persist = async (nextRelations: ClientRelationEdge[]) => {
    setSaving(true);
    setError(null);
    try {
      const master = await fetchClientMaster();
      const saved = await saveClientMaster(
        master.clients,
        master.groups,
        nextRelations,
        relationLayouts,
      );
      setClients(saved.clients);
      setGroups(saved.groups);
      setRelations(saved.relations);
      setRelationLayouts(saved.relationLayouts ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!canEdit) return;
    const from = draft.fromClientId.trim();
    const to = draft.toClientId.trim();
    if (!from || !to || from === to) {
      setError("異なる顧問先を from / to に指定してください");
      return;
    }
    let percent: number | undefined;
    if (draft.kind === "shareholding") {
      const n = Number(draft.percent);
      if (!Number.isFinite(n) || n <= 0 || n > 100) {
        setError("出資％は 0 超〜100 で入力してください");
        return;
      }
      percent = n;
    }
    const edge: ClientRelationEdge = {
      id: `r${Date.now()}`,
      kind: draft.kind,
      fromClientId: from,
      toClientId: to,
      percent,
      note: draft.note.trim() || undefined,
    };
    await persist([...relations, edge]);
    setDraft((prev) => ({ ...prev, note: "", percent: "" }));
    setAdding(false);
  };

  const handleDelete = async (id: string) => {
    if (!canEdit) return;
    await persist(relations.filter((e) => e.id !== id));
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        関係図を読み込み中…
      </div>
    );
  }

  return (
    <div
      data-tour="karte-relations"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50"
    >
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <GitBranch className="h-4 w-4 text-slate-500" aria-hidden />
          <h2 className="text-sm font-bold text-slate-800">関係（家系・出資・役員・紹介）</h2>
          <span className="text-xs text-slate-500">中心: {client.name}</span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <div
              className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5"
              role="group"
              aria-label="PDF 用紙向き（A4）"
            >
              {PDF_PAGE_ORIENTATIONS.map((opt) => {
                const active = pageOrientation === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    title={opt.hint}
                    disabled={exporting}
                    onClick={() => setPageOrientation(opt.id)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-60 ${
                      active
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={exporting}
              onClick={() => void handleDownloadPdf()}
              title={`A4${pageOrientation === "portrait" ? "縦" : "横"}で PDF をダウンロード`}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              PDF
            </button>
            <button
              type="button"
              disabled={exporting}
              onClick={() => void handleSaveToPerm()}
              title={`A4${pageOrientation === "portrait" ? "縦" : "横"}の PDF を永続スロット「関係図」へ版管理付きで保存`}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileDown className="h-3.5 w-3.5" />
              )}
              永続へ保存
            </button>
          </div>
        </div>
        {savedMeta?.versionLabel ? (
          <p className="mt-1 text-[11px] text-slate-500">
            永続「関係図」の現在版:{" "}
            <span className="font-semibold text-slate-700">{savedMeta.versionLabel}</span>
            {savedMeta.versionCount && savedMeta.versionCount > 1
              ? ` · 履歴 ${savedMeta.versionCount} 件`
              : null}
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-slate-400">
            未保存 — 「永続へ保存」で Doc の永続スロット「関係図」に載ります（版管理あり）
          </p>
        )}
        <div
          className="mt-3 flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="関係図の表示パターン"
        >
          {RELATION_VIEW_MODES.map((mode) => {
            const active = viewMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                role="tab"
                aria-selected={active}
                title={mode.hint}
                onClick={() => setViewMode(mode.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {mode.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          {RELATION_VIEW_MODES.find((m) => m.id === viewMode)?.hint}
        </p>
        <ul className="mt-2 flex flex-wrap gap-3 text-[10px] font-semibold text-slate-600">
          {viewMode === "all" || viewMode === "group" ? (
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded-sm border-2 border-blue-400 bg-blue-50" />
              グループ枠
            </li>
          ) : null}
          {viewMode === "all" || viewMode === "family" ? (
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-5 rounded bg-violet-700" />
              親族
            </li>
          ) : null}
          {viewMode === "all" || viewMode === "ownership" ? (
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-5 rounded bg-teal-700" />
              出資％
            </li>
          ) : null}
          {viewMode === "all" || viewMode === "officer" ? (
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-5 rounded bg-fuchsia-700" />
              代表・役員
            </li>
          ) : null}
          {viewMode === "all" || viewMode === "referral" ? (
            <li className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-5 border-t-2 border-dashed border-orange-600"
                aria-hidden
              />
              紹介
            </li>
          ) : null}
          <li className="flex items-center gap-1.5">
            <span className="rounded border border-slate-300 bg-white px-1">法人</span>
            <span className="rounded border border-rose-200 bg-rose-50 px-1">個人</span>
          </li>
        </ul>
      </header>

      {error ? (
        <p className="mx-4 mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 md:mx-6">
          {error}
        </p>
      ) : null}
      {saveNotice ? (
        <p className="mx-4 mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 md:mx-6">
          {saveNotice}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.9fr)] md:p-6">
        <div className="min-w-0 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <RelationDiagramCanvas
            layout={layout}
            viewMode={viewMode}
            focusClientId={client.id}
            focusName={client.name}
            manual={manual}
            onManualChange={handleManualChange}
            onFocusClient={onFocusClient}
          />
          {layout.nodes.length <= 1 ? (
            <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              この顧問先に紐づく関係辺・グループがまだありません。右側から追加できます。
            </p>
          ) : null}
        </div>

        <aside className="flex min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
              <div>
                <h3 className="text-xs font-bold text-slate-800">つながり</h3>
                <p className="text-[10px] text-slate-400">
                  いまの中心顧問先との関係（表示パターンに連動）
                </p>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setError(null);
                    setAdding((v) => !v);
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {adding ? "閉じる" : "追加"}
                </button>
              ) : null}
            </div>

            {adding && canEdit ? (
              <div className="space-y-2 border-b border-slate-100 bg-slate-50 px-3 py-3">
                <label className="block text-[10px] font-bold text-slate-500">
                  種別
                  <select
                    className="mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs"
                    value={draft.kind}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        kind: e.target.value as ClientRelationKind,
                      }))
                    }
                  >
                    {KIND_OPTIONS.map((k) => (
                      <option key={k} value={k}>
                        {RELATION_KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[10px] font-bold text-slate-500">
                  {KIND_ENDPOINT_LABEL[draft.kind].from}
                  <ClientSearchSelect
                    clients={clients.map(toClientSearchOption)}
                    value={draft.fromClientId}
                    onChange={(fromClientId) => setDraft((p) => ({ ...p, fromClientId }))}
                    emptyLabel="選択…"
                  />
                </label>
                <label className="block text-[10px] font-bold text-slate-500">
                  {KIND_ENDPOINT_LABEL[draft.kind].to}
                  <ClientSearchSelect
                    clients={clients.map(toClientSearchOption)}
                    value={draft.toClientId}
                    onChange={(toClientId) => setDraft((p) => ({ ...p, toClientId }))}
                    allowEmpty={false}
                  />
                </label>
                {draft.kind === "shareholding" ? (
                  <label className="block text-[10px] font-bold text-slate-500">
                    持分％
                    <input
                      type="number"
                      min={0.01}
                      max={100}
                      step={0.1}
                      className="mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs"
                      value={draft.percent}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, percent: e.target.value }))
                      }
                    />
                  </label>
                ) : null}
                <label className="block text-[10px] font-bold text-slate-500">
                  {draft.kind === "officer" ? "役職（図の線に出ます）" : "メモ"}
                  <input
                    className="mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs"
                    placeholder={draft.kind === "officer" ? "代表取締役" : ""}
                    value={draft.note}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, note: e.target.value }))
                    }
                  />
                </label>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleAdd()}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-900 bg-white px-3 py-2 text-xs font-bold text-slate-900 hover:bg-slate-100 disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  この内容で追加
                </button>
              </div>
            ) : null}

            <ul className="min-h-0 flex-1 space-y-0 overflow-y-auto">
              {connectionRows.length === 0 ? (
                <li className="px-3 py-4 text-xs text-slate-400">
                  この表示パターンではつながりがありません。
                  {canEdit ? " 「追加」から登録できます。" : ""}
                </li>
              ) : (
                connectionRows.map((edge) => {
                  const style = edgeStroke(edge.kind);
                  const fromMe = edge.fromClientId === client.id;
                  const otherId = fromMe ? edge.toClientId : edge.fromClientId;
                  const otherName = nameById.get(otherId) ?? otherId;
                  const direction = fromMe ? "→ 相手" : "← 相手から";
                  return (
                    <li
                      key={edge.id}
                      className="flex items-start justify-between gap-2 border-b border-slate-100 px-3 py-2.5 text-xs last:border-0"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                            style={{ backgroundColor: style.stroke }}
                          >
                            {RELATION_KIND_LABEL[edge.kind]}
                            {edge.percent != null ? ` ${edge.percent}%` : ""}
                          </span>
                          <span className="text-[10px] text-slate-400">{direction}</span>
                        </div>
                        <div className="mt-1 truncate font-semibold text-slate-700">
                          {otherName}
                        </div>
                        <div className="mt-0.5 truncate text-[10px] text-slate-400">
                          {nameById.get(edge.fromClientId) ?? edge.fromClientId}
                          {" → "}
                          {nameById.get(edge.toClientId) ?? edge.toClientId}
                        </div>
                        {edge.note ? (
                          <div className="mt-0.5 text-[10px] text-slate-500">{edge.note}</div>
                        ) : null}
                      </div>
                      {canEdit ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleDelete(edge.id)}
                          className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="つながりを削除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </li>
                  );
                })
              )}
            </ul>
            {!canEdit ? (
              <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">
                編集には settings.manage 権限が必要です。
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
