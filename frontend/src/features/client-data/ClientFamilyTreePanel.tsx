"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileDown,
  Loader2,
  Network,
  Plus,
  Save,
  Trash2,
  UserPlus,
} from "lucide-react";
import type { OrgClient } from "@/config/organization";
import { ClientSearchSelect, toClientSearchOption } from "@/components/ClientSearchSelect";
import { fetchClientMaster } from "@/lib/client-master-api";
import { listSlotDocuments, persistSlotDocument } from "@/features/docugrid/lib/slot-documents";
import {
  FAMILY_GENERATIONS,
  FAMILY_GENERATION_LABEL,
  fetchFamilyTree,
  newFamilyMember,
  saveFamilyTree,
  type FamilyCohabitation,
  type FamilyMember,
} from "@/features/client-data/lib/family-tree-api";
import {
  computeStatutoryHeirs,
  formatFraction,
  HEIR_RANK_LABEL,
} from "@/features/client-data/lib/family-tree-heirs";
import {
  FAMILY_CARD_H,
  FAMILY_CARD_W,
  FAMILY_HEADER_H,
  FAMILY_ROW_H,
  FAMILY_ROW_LABELS,
  familyCardValues,
  layoutFamilyTree,
} from "@/features/client-data/lib/family-tree-layout";
import {
  buildFamilyTreePdfFile,
  FAMILY_COLORS,
  familyDisplayName,
} from "@/features/client-data/lib/family-tree-pdf";
import {
  PDF_PAGE_ORIENTATIONS,
  type PdfPageOrientation,
} from "@/features/client-data/lib/relation-diagram-pdf";
import {
  FAMILY_TREE_SLOT_ID,
  FAMILY_TREE_SLOT_LABEL,
  RELATION_DIAGRAM_PERIOD_KEY,
} from "@/features/client-data/lib/relation-diagram-slot";

type Props = {
  client: OrgClient;
  canEdit?: boolean;
  /** ひも付いた顧問先の名前クリックで顧問先ナビを切替 */
  onFocusClient?: (clientId: string) => void;
};

const RELATION_SUGGESTIONS = [
  "本人", "配偶者", "夫", "妻", "父", "母", "義父", "義母",
  "長男", "次男", "三男", "長女", "次女", "三女", "兄", "弟", "姉", "妹",
  "孫", "長男の妻", "長女の夫", "甥", "姪",
];

const LABEL_W = 58;
const inputCls =
  "mt-0.5 block w-full rounded-md border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50 disabled:text-slate-500";

function withoutMember(members: FamilyMember[], id: string): FamilyMember[] {
  return members
    .filter((m) => m.id !== id)
    .map((m) => ({
      ...m,
      spouse_id: m.spouse_id === id ? null : m.spouse_id,
      parent_ids: m.parent_ids.filter((p) => p !== id),
    }));
}

export function ClientFamilyTreePanel({ client, canEdit, onFocusClient }: Props) {
  const [clients, setClients] = useState<OrgClient[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [decedentId, setDecedentId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<PdfPageOrientation>("landscape");
  const [savedVersion, setSavedVersion] = useState<string | null>(null);
  const [updatedMeta, setUpdatedMeta] = useState<{ at: string | null; by: string | null }>({
    at: null,
    by: null,
  });

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [master, tree] = await Promise.all([fetchClientMaster(), fetchFamilyTree(client.id)]);
      setClients(master.clients);
      setMembers(tree.members);
      setDecedentId(tree.decedent_id);
      setUpdatedMeta({ at: tree.updated_at, by: tree.updated_by });
      setSelectedId(null);
      setDirty(false);
      try {
        const slots = await listSlotDocuments(client.id, RELATION_DIAGRAM_PERIOD_KEY);
        setSavedVersion(
          slots.find((s) => s.slot_id === FAMILY_TREE_SLOT_ID)?.current_version_label ?? null,
        );
      } catch {
        setSavedVersion(null);
      }
    } catch {
      setError("家系図の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [client.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const clientsById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const individualOptions = useMemo(
    () => clients.filter((c) => c.category === "individual").map(toClientSearchOption),
    [clients],
  );
  const layout = useMemo(() => layoutFamilyTree(members), [members]);
  const heirResult = useMemo(() => computeStatutoryHeirs(members, decedentId), [members, decedentId]);
  const heirById = useMemo(
    () => new Map((heirResult?.heirs ?? []).map((h) => [h.memberId, h])),
    [heirResult],
  );
  const selected = members.find((m) => m.id === selectedId) ?? null;
  const today = useMemo(() => new Date(), []);

  const mutate = useCallback((next: FamilyMember[]) => {
    setMembers(next);
    setDirty(true);
    setNotice(null);
  }, []);

  const updateSelected = (patch: Partial<FamilyMember>) => {
    if (!selected) return;
    mutate(members.map((m) => (m.id === selected.id ? { ...m, ...patch } : m)));
  };

  const setSpouse = (spouseId: string | null) => {
    if (!selected) return;
    mutate(
      members.map((m) => {
        if (m.id === selected.id) return { ...m, spouse_id: spouseId };
        if (m.id === spouseId) return { ...m, spouse_id: selected.id };
        if (m.spouse_id === selected.id || (spouseId && m.spouse_id === spouseId)) {
          return { ...m, spouse_id: null };
        }
        return m;
      }),
    );
  };

  const addMember = (member: FamilyMember, linkSpouseOf?: FamilyMember) => {
    const maxOrder = members.reduce((n, m) => Math.max(n, m.sort_order), 0);
    const created = { ...member, sort_order: maxOrder + 1 };
    const next = linkSpouseOf
      ? members.map((m) => (m.id === linkSpouseOf.id ? { ...m, spouse_id: created.id } : m))
      : members;
    mutate([...next, created]);
    setSelectedId(created.id);
  };

  const addSelf = () => {
    addMember(
      newFamilyMember(2, {
        relation: "本人",
        name: client.name,
        kana: client.profile?.customer_name_kana ?? "",
        linked_client_id: client.category === "individual" ? client.id : null,
      }),
    );
  };

  const addParents = () => {
    const father = newFamilyMember(1, { relation: "父", sort_order: 1 });
    const mother = newFamilyMember(1, { relation: "母", sort_order: 2, spouse_id: father.id });
    father.spouse_id = mother.id;
    const self = members.find((m) => m.generation === 2 && m.parent_ids.length === 0);
    const next = self
      ? members.map((m) => (m.id === self.id ? { ...m, parent_ids: [father.id, mother.id] } : m))
      : members;
    mutate([...next, father, mother]);
    setSelectedId(father.id);
  };

  const addChild = (parent: FamilyMember) => {
    const generation = Math.min(parent.generation + 1, 4);
    const parentIds = [parent.id, parent.spouse_id].filter(Boolean) as string[];
    addMember(newFamilyMember(generation, { parent_ids: parentIds }));
  };

  const addSibling = (of: FamilyMember) => {
    addMember(newFamilyMember(of.generation, { parent_ids: [...of.parent_ids] }));
  };

  const addSpouse = (of: FamilyMember) => {
    addMember(
      newFamilyMember(of.generation, { relation: "配偶者", spouse_id: of.id }),
      of,
    );
  };

  const moveSelected = (dir: -1 | 1) => {
    if (!selected) return;
    const peers = members
      .filter((m) => m.generation === selected.generation)
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
    const idx = peers.findIndex((m) => m.id === selected.id);
    const swap = peers[idx + dir];
    if (!swap) return;
    const order = new Map(peers.map((m, i) => [m.id, i]));
    order.set(selected.id, idx + dir);
    order.set(swap.id, idx);
    mutate(
      members.map((m) => (order.has(m.id) ? { ...m, sort_order: order.get(m.id)! } : m)),
    );
  };

  const deleteSelected = () => {
    if (!selected) return;
    mutate(withoutMember(members, selected.id));
    if (decedentId === selected.id) setDecedentId(null);
    setSelectedId(null);
  };

  const linkClient = (clientId: string) => {
    if (!selected) return;
    const linked = clientId ? clientsById.get(clientId) : undefined;
    updateSelected({
      linked_client_id: linked?.id ?? null,
      name: linked ? linked.name : selected.name,
      kana: linked && !selected.kana ? (linked.profile?.customer_name_kana ?? "") : selected.kana,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveFamilyTree(client.id, { members, decedent_id: decedentId });
      setMembers(saved.members);
      setDecedentId(saved.decedent_id);
      setUpdatedMeta({ at: saved.updated_at, by: saved.updated_by });
      setDirty(false);
      setNotice("家系図を保存しました");
    } catch (err) {
      setError(err instanceof Error ? `保存に失敗しました: ${err.message}` : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const makePdf = () =>
    buildFamilyTreePdfFile({ focus: client, members, decedentId, clients, orientation });

  const handleDownloadPdf = async () => {
    setExporting(true);
    setError(null);
    try {
      const file = await makePdf();
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
      setNotice(`A4${orientation === "portrait" ? "縦" : "横"} の PDF をダウンロードしました`);
    } catch {
      setError("PDF の作成に失敗しました");
    } finally {
      setExporting(false);
    }
  };

  const handleSaveToPerm = async () => {
    setExporting(true);
    setError(null);
    try {
      const file = await makePdf();
      const item = await persistSlotDocument({
        clientId: client.id,
        periodKey: RELATION_DIAGRAM_PERIOD_KEY,
        slotId: FAMILY_TREE_SLOT_ID,
        slotLabel: FAMILY_TREE_SLOT_LABEL,
        file,
      });
      setSavedVersion(item.current_version_label ?? null);
      setNotice(
        `永続「${FAMILY_TREE_SLOT_LABEL}」に保存しました${item.current_version_label ? ` (${item.current_version_label})` : ""}`,
      );
    } catch {
      setError("永続スロットへの保存に失敗しました");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        家系図を読み込み中…
      </div>
    );
  }

  const earlierMembers = selected
    ? members.filter((m) => m.generation < selected.generation)
    : [];
  const sameGenMembers = selected
    ? members.filter((m) => m.generation === selected.generation && m.id !== selected.id)
    : [];
  const nameOf = (m: FamilyMember) => familyDisplayName(m, clientsById) || "（氏名未入力）";
  const readOnly = !canEdit;

  return (
    <div data-tour="karte-family-tree" className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Network className="h-4 w-4 text-slate-500" aria-hidden />
          <h2 className="text-sm font-bold text-slate-800">家系図</h2>
          <span className="text-xs text-slate-500">{client.name}</span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {canEdit ? (
              <button
                type="button"
                disabled={!dirty || saving}
                onClick={() => void handleSave()}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {dirty ? "保存" : "保存済み"}
              </button>
            ) : null}
            <div
              className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5"
              role="group"
              aria-label="PDF 用紙向き（A4）"
            >
              {PDF_PAGE_ORIENTATIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  title={opt.hint}
                  disabled={exporting}
                  onClick={() => setOrientation(opt.id)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-60 ${
                    orientation === opt.id
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={exporting || members.length === 0}
              onClick={() => void handleDownloadPdf()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              PDF
            </button>
            <button
              type="button"
              disabled={exporting || members.length === 0}
              onClick={() => void handleSaveToPerm()}
              title={`PDF を永続スロット「${FAMILY_TREE_SLOT_LABEL}」へ版管理付きで保存`}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              永続へ保存
            </button>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          カードをクリックすると右側で編集できます。顧問先にひも付けた人は顧客マスタの名前で表示されます。
          {savedVersion ? ` · 永続「${FAMILY_TREE_SLOT_LABEL}」の現在版: ${savedVersion}` : ""}
          {updatedMeta.at ? ` · 最終更新 ${updatedMeta.at.slice(0, 16).replace("T", " ")}${updatedMeta.by ? `（${updatedMeta.by}）` : ""}` : ""}
        </p>
      </header>

      {error ? (
        <p className="mx-4 mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 md:mx-6">{error}</p>
      ) : null}
      {notice ? (
        <p className="mx-4 mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 md:mx-6">{notice}</p>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 p-4 md:grid-cols-[minmax(0,1.6fr)_minmax(17rem,0.8fr)] md:p-6">
        <div className="min-w-0 overflow-auto rounded-xl border border-slate-200 bg-white p-3">
          {members.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-xs text-slate-500">
              <p>家系図はまだありません。</p>
              {canEdit ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={addSelf}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    本人（{client.name}）から始める
                  </button>
                  <button
                    type="button"
                    onClick={() => addMember(newFamilyMember(1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    空のカードを追加
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="relative" style={{ width: layout.width, height: layout.height }}>
              <svg
                className="pointer-events-none absolute inset-0"
                width={layout.width}
                height={layout.height}
                aria-hidden
              >
                {layout.bands.map((b) => (
                  <g key={b.generation}>
                    <rect x={0} y={b.y} width={layout.width} height={22} fill={FAMILY_COLORS.band} />
                    <text x={8} y={b.y + 15} fontSize={11} fontWeight={800} fill="#fff">
                      {FAMILY_GENERATION_LABEL[b.generation]}
                    </text>
                  </g>
                ))}
                {layout.connectors.map((c, i) => {
                  const xs = [c.fromX, ...c.toXs];
                  return (
                    <g key={i} stroke={FAMILY_COLORS.line} strokeWidth={1.4}>
                      <line x1={c.fromX} y1={c.fromY} x2={c.fromX} y2={c.barY} />
                      <line x1={Math.min(...xs)} y1={c.barY} x2={Math.max(...xs)} y2={c.barY} />
                      {c.toXs.map((x) => (
                        <line key={x} x1={x} y1={c.barY} x2={x} y2={c.toY - 32} />
                      ))}
                    </g>
                  );
                })}
              </svg>
              {layout.cards.map(({ member, x, y }) => {
                const values = familyCardValues(member, nameOf(member), today);
                const heir = heirById.get(member.id);
                const isSelected = member.id === selectedId;
                return (
                  <div key={member.id} className="absolute" style={{ left: x, top: y - 16, width: FAMILY_CARD_W }}>
                    <div className="flex h-4 items-end justify-between text-[9px] font-extrabold">
                      {member.linked_client_id ? (
                        <button
                          type="button"
                          className="text-teal-700 hover:underline"
                          title="この顧問先を開く"
                          onClick={() => onFocusClient?.(member.linked_client_id!)}
                        >
                          顧問先
                        </button>
                      ) : (
                        <span />
                      )}
                      {member.id === decedentId ? (
                        <span className="rounded px-1 text-white" style={{ background: FAMILY_COLORS.deceased }}>被相続人</span>
                      ) : heir ? (
                        <span className="rounded px-1 text-white" style={{ background: FAMILY_COLORS.heir }}>
                          相続人 {formatFraction(heir.share)}
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedId(member.id)}
                      className={`block w-full border bg-white text-left ${
                        isSelected ? "border-amber-500 ring-2 ring-amber-400" : "border-slate-900 hover:ring-2 hover:ring-slate-300"
                      }`}
                      style={{ height: FAMILY_CARD_H }}
                    >
                      <div
                        className="flex items-center text-[10px] font-extrabold text-white"
                        style={{
                          height: FAMILY_HEADER_H,
                          background: member.deceased ? FAMILY_COLORS.deceased : FAMILY_COLORS.header,
                        }}
                      >
                        <span className="shrink-0 text-center" style={{ width: LABEL_W }}>続柄</span>
                        <span className="truncate px-1">
                          {member.relation}
                          {member.adopted ? "（養子）" : ""}
                        </span>
                      </div>
                      {FAMILY_ROW_LABELS.map((label, i) => (
                        <div key={label} className="flex border-t border-slate-400 text-[9px]" style={{ height: FAMILY_ROW_H }}>
                          <span
                            className="flex shrink-0 items-center justify-center border-r border-slate-400 font-bold text-slate-800"
                            style={{ width: LABEL_W, background: FAMILY_COLORS.label }}
                          >
                            {label}
                          </span>
                          <span className="flex min-w-0 items-center truncate px-1 text-slate-900" title={values[i]}>
                            {values[i]}
                          </span>
                        </div>
                      ))}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <aside className="flex min-h-0 flex-col gap-4">
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
              <h3 className="text-xs font-bold text-slate-800">
                {selected ? `${nameOf(selected)} を編集` : "メンバー"}
              </h3>
              {canEdit && members.length > 0 ? (
                <button
                  type="button"
                  onClick={() => addMember(newFamilyMember(1))}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                >
                  <Plus className="h-3 w-3" />
                  追加
                </button>
              ) : null}
            </div>
            {!selected ? (
              <p className="px-3 py-4 text-xs text-slate-500">
                図のカードを選ぶと、ここで氏名・生年月日・顧問先へのひも付けなどを編集できます。
                {canEdit && members.length > 0 && !members.some((m) => m.generation === 1) ? (
                  <button type="button" onClick={addParents} className="mt-2 block font-bold text-slate-700 underline">
                    第1世代に父・母を追加する
                  </button>
                ) : null}
              </p>
            ) : (
              <div className="space-y-2 px-3 py-3 text-[11px] text-slate-600">
                <label className="block">
                  顧問先にひも付け（任意）
                  <ClientSearchSelect
                    clients={individualOptions}
                    value={selected.linked_client_id ?? ""}
                    onChange={linkClient}
                    allowEmpty
                    emptyLabel="ひも付けない（家系図だけに登録）"
                    disabled={readOnly}
                    selectClassName={inputCls}
                    searchClassName={inputCls}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    続柄
                    <input
                      list="family-relation-suggestions"
                      className={inputCls}
                      value={selected.relation}
                      disabled={readOnly}
                      onChange={(e) => updateSelected({ relation: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    世代
                    <select
                      className={inputCls}
                      value={selected.generation}
                      disabled={readOnly}
                      onChange={(e) => {
                        const generation = Number(e.target.value);
                        mutate(
                          members.map((m) => {
                            if (m.id === selected.id) {
                              const parents = m.parent_ids.filter(
                                (p) => (members.find((o) => o.id === p)?.generation ?? 0) < generation,
                              );
                              return { ...m, generation, parent_ids: parents };
                            }
                            if (m.parent_ids.includes(selected.id) && m.generation <= generation) {
                              return { ...m, parent_ids: m.parent_ids.filter((p) => p !== selected.id) };
                            }
                            return m;
                          }),
                        );
                      }}
                    >
                      {FAMILY_GENERATIONS.map((g) => (
                        <option key={g} value={g}>
                          {FAMILY_GENERATION_LABEL[g]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block">
                  氏名
                  <input
                    className={inputCls}
                    value={selected.linked_client_id ? nameOf(selected) : selected.name}
                    disabled={readOnly || Boolean(selected.linked_client_id)}
                    title={selected.linked_client_id ? "顧問先の名前を表示しています（顧客マスタで変更）" : undefined}
                    onChange={(e) => updateSelected({ name: e.target.value })}
                  />
                </label>
                <label className="block">
                  フリガナ
                  <input
                    className={inputCls}
                    value={selected.kana}
                    disabled={readOnly}
                    onChange={(e) => updateSelected({ kana: e.target.value })}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    生年月日
                    <input
                      type="date"
                      className={inputCls}
                      value={selected.birth_date}
                      disabled={readOnly}
                      onChange={(e) => updateSelected({ birth_date: e.target.value })}
                    />
                  </label>
                  <div className="block">
                    年齢
                    <p className="mt-0.5 rounded-md bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
                      {familyCardValues(selected, "", today)[3] || "—"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={selected.deceased}
                      disabled={readOnly}
                      onChange={(e) =>
                        updateSelected({
                          deceased: e.target.checked,
                          death_date: e.target.checked ? selected.death_date : "",
                        })
                      }
                    />
                    故人
                  </label>
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={selected.adopted}
                      disabled={readOnly}
                      onChange={(e) => updateSelected({ adopted: e.target.checked })}
                    />
                    養子
                  </label>
                </div>
                {selected.deceased ? (
                  <label className="block">
                    没年月日
                    <input
                      type="date"
                      className={inputCls}
                      value={selected.death_date}
                      disabled={readOnly}
                      onChange={(e) => updateSelected({ death_date: e.target.value })}
                    />
                  </label>
                ) : null}
                <label className="block">
                  職業・勤務先
                  <input
                    className={inputCls}
                    value={selected.occupation}
                    disabled={readOnly}
                    onChange={(e) => updateSelected({ occupation: e.target.value })}
                  />
                </label>
                <label className="block">
                  同居・別居
                  <select
                    className={inputCls}
                    value={selected.cohabitation}
                    disabled={readOnly}
                    onChange={(e) => updateSelected({ cohabitation: e.target.value as FamilyCohabitation })}
                  >
                    <option value="">未選択</option>
                    <option value="same">同居</option>
                    <option value="separate">別居</option>
                  </select>
                </label>
                {selected.cohabitation === "separate" ? (
                  <label className="block">
                    別居時住所
                    <input
                      className={inputCls}
                      value={selected.address}
                      disabled={readOnly}
                      onChange={(e) => updateSelected({ address: e.target.value })}
                    />
                  </label>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  {[0, 1].map((slot) => (
                    <label key={slot} className="block">
                      親 {slot + 1}
                      <select
                        className={inputCls}
                        value={selected.parent_ids[slot] ?? ""}
                        disabled={readOnly || earlierMembers.length === 0}
                        onChange={(e) => {
                          const next = [...selected.parent_ids];
                          next[slot] = e.target.value;
                          updateSelected({ parent_ids: [...new Set(next.filter(Boolean))] });
                        }}
                      >
                        <option value="">なし</option>
                        {earlierMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {nameOf(m)}（{m.relation || "続柄未入力"}）
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <label className="block">
                  配偶者
                  <select
                    className={inputCls}
                    value={selected.spouse_id ?? ""}
                    disabled={readOnly}
                    onChange={(e) => setSpouse(e.target.value || null)}
                  >
                    <option value="">なし</option>
                    {sameGenMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {nameOf(m)}（{m.relation || "続柄未入力"}）
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  メモ
                  <input
                    className={inputCls}
                    value={selected.note}
                    disabled={readOnly}
                    onChange={(e) => updateSelected({ note: e.target.value })}
                  />
                </label>
                {canEdit ? (
                  <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
                    {!selected.spouse_id ? (
                      <button type="button" onClick={() => addSpouse(selected)} className="rounded-md border border-slate-200 px-2 py-1 font-bold hover:bg-slate-50">
                        ＋配偶者
                      </button>
                    ) : null}
                    {selected.generation < 4 ? (
                      <button type="button" onClick={() => addChild(selected)} className="rounded-md border border-slate-200 px-2 py-1 font-bold hover:bg-slate-50">
                        ＋子
                      </button>
                    ) : null}
                    {selected.parent_ids.length > 0 ? (
                      <button type="button" onClick={() => addSibling(selected)} className="rounded-md border border-slate-200 px-2 py-1 font-bold hover:bg-slate-50">
                        ＋兄弟姉妹
                      </button>
                    ) : null}
                    <button type="button" onClick={() => moveSelected(-1)} title="左へ" className="rounded-md border border-slate-200 px-1.5 py-1 hover:bg-slate-50">
                      <ArrowLeft className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => moveSelected(1)} title="右へ" className="rounded-md border border-slate-200 px-1.5 py-1 hover:bg-slate-50">
                      <ArrowRight className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={deleteSelected}
                      className="ml-auto inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 font-bold text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      削除
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-3 py-2.5">
              <h3 className="text-xs font-bold text-slate-800">法定相続人（目安）</h3>
            </div>
            <div className="space-y-2 px-3 py-3 text-[11px] text-slate-600">
              <label className="block">
                被相続人
                <select
                  className={inputCls}
                  value={decedentId ?? ""}
                  disabled={readOnly}
                  onChange={(e) => {
                    setDecedentId(e.target.value || null);
                    setDirty(true);
                  }}
                >
                  <option value="">選択してください</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {nameOf(m)}（{m.relation || "続柄未入力"}）
                    </option>
                  ))}
                </select>
              </label>
              {heirResult ? (
                <>
                  <ul className="divide-y divide-slate-100 rounded-md border border-slate-100">
                    {heirResult.heirs.map((h) => {
                      const m = members.find((x) => x.id === h.memberId);
                      if (!m) return null;
                      return (
                        <li key={h.memberId} className="flex items-center justify-between gap-2 px-2 py-1.5">
                          <span>
                            <span className="font-bold text-slate-800">{nameOf(m)}</span>
                            <span className="ml-1 text-slate-500">
                              {HEIR_RANK_LABEL[h.rank]}
                              {h.representation ? "・代襲" : ""}
                            </span>
                          </span>
                          <span className="font-mono font-bold text-amber-700">{formatFraction(h.share)}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="font-semibold text-slate-700">
                    相続税の法定相続人の数 {heirResult.taxHeirCount} 人 / 基礎控除{" "}
                    {heirResult.basicDeductionYen.toLocaleString("ja-JP")} 円
                  </p>
                  {heirResult.notes.map((n) => (
                    <p key={n} className="text-[10px] text-slate-400">※ {n}</p>
                  ))}
                </>
              ) : (
                <p className="text-slate-400">被相続人を選ぶと、相続人と法定相続分を表示します。</p>
              )}
            </div>
          </section>
        </aside>
      </div>
      <datalist id="family-relation-suggestions">
        {RELATION_SUGGESTIONS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
    </div>
  );
}
