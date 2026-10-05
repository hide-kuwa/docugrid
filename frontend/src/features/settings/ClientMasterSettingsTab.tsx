"use client";

import { useMemo, useRef, useState } from "react";
import type {
  ClientRelationEdge,
  ClientFamilyGroup,
  OrgClient,
  ClientRelationType,
  StakeholderMaster,
} from "@/config/organization";
import { RELATION_TYPE_LABEL } from "@/config/organization";
import { ConfigSheetIntro } from "@/features/config/components/ConfigSheetIntro";
import { ConfigMatrixCard } from "@/features/config/components/ConfigMatrixCard";
import { formatConfigCellAddress } from "@/features/config/lib/cell-address";
import { ClientProfileEditor } from "@/features/config/components/ClientProfileEditor";
import {
  CLIENT_CSV_SAMPLE,
  clientsToCsv,
  decodeCsvBytes,
  downloadTextFile,
  parseClientCsv,
  slugClientId,
} from "@/features/settings/client-master-csv";
import {
  ClientTransferClaimPanel,
  ClientTransferIssuedList,
} from "@/features/settings/ClientTransferPanels";

const relationTypeOptions: ClientRelationType[] = ["group_company", "shareholder", "relative_group"];

type CategoryFilter = "all" | "corporate" | "individual";

type Props = {
  editableClients: OrgClient[];
  editableGroups: ClientFamilyGroup[];
  editableRelations: ClientRelationEdge[];
  onClientsChange: (clients: OrgClient[]) => void;
  onGroupsChange: (groups: Props["editableGroups"]) => void;
  onSave: () => void;
  isSaving: boolean;
  message: string;
  showProfileEditor?: boolean;
  /** 顧客詳細タブを開くときの初期選択 */
  profileClientId?: string;
  onOpenClientProfile?: (clientId: string) => void;
  stakeholders?: StakeholderMaster[];
  stakeholderScopes?: Record<string, string[]>;
  onToggleAssignee?: (stakeholderId: string, clientId: string) => void;
  onSaveAssignees?: () => void;
  assigneesSaving?: boolean;
  assigneesMessage?: string;
};

function updateClientById(
  clients: OrgClient[],
  clientId: string,
  patch: Partial<OrgClient>,
): OrgClient[] {
  return clients.map((item) => (item.id === clientId ? { ...item, ...patch } : item));
}

export function ClientMasterSettingsTab({
  editableClients,
  editableGroups,
  onClientsChange,
  onGroupsChange,
  onSave,
  isSaving,
  message,
  showProfileEditor,
  profileClientId,
  onOpenClientProfile,
  stakeholders = [],
  stakeholderScopes = {},
  onToggleAssignee,
  onSaveAssignees,
  assigneesSaving,
  assigneesMessage,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvMessage, setCsvMessage] = useState("");
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [query, setQuery] = useState("");
  const [assigneeId, setAssigneeId] = useState("all");
  const [fiscalMonth, setFiscalMonth] = useState<"all" | number>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<"corporate" | "individual">("corporate");
  const [newFiscalMonth, setNewFiscalMonth] = useState(3);
  const [newMessage, setNewMessage] = useState("");

  const assigneeOptions = useMemo(
    () =>
      stakeholders.filter(
        (actor) =>
          actor.status === "active" &&
          (actor.kind === "staff" ||
            actor.kind === "supervisor" ||
            actor.kind === "representative_tax_accountant"),
      ),
    [stakeholders],
  );

  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase();
    const assignedIds =
      assigneeId === "all"
        ? null
        : new Set(
            stakeholderScopes[assigneeId] ??
              stakeholders.find((s) => s.id === assigneeId)?.scopedClientIds ??
              [],
          );

    return editableClients.filter((client) => {
      if (assignedIds && !assignedIds.has(client.id)) return false;
      if (fiscalMonth !== "all" && client.fiscalMonth !== fiscalMonth) return false;
      if (category !== "all" && client.category !== category) return false;
      if (!q) return true;
      const hay = `${client.name} ${client.id} ${(client.tags ?? []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [editableClients, query, assigneeId, fiscalMonth, category, stakeholderScopes, stakeholders]);

  const filtersActive =
    query.trim() !== "" || assigneeId !== "all" || fiscalMonth !== "all" || category !== "all";

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    setCsvMessage("");
    try {
      const text = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
      const result = parseClientCsv(text, editableClients, importMode);
      if (result.errors.length && result.added + result.updated === 0) {
        setCsvMessage(result.errors[0]);
        return;
      }
      onClientsChange(result.clients);
      const warn = result.errors.length ? `（警告 ${result.errors.length}）` : "";
      setCsvMessage(
        `取り込み完了: 追加 ${result.added} / 更新 ${result.updated} / スキップ ${result.skipped}${warn}。内容を確認して「顧客マスタを保存」してください。`,
      );
    } catch {
      setCsvMessage("CSV の読み込みに失敗しました。文字コードは UTF-8 を推奨します。");
    }
  };

  const handleAddClient = () => {
    const name = newName.trim();
    if (!name) {
      setNewMessage("顧問先名を入力してください。");
      return;
    }
    const used = new Set(editableClients.map((c) => c.id));
    const id = slugClientId(name, used);
    const fiscalMonth =
      newFiscalMonth >= 1 && newFiscalMonth <= 12
        ? newFiscalMonth
        : newCategory === "individual"
          ? 12
          : 3;
    onClientsChange([
      ...editableClients,
      {
        id,
        name,
        fiscalMonth,
        category: newCategory,
      },
    ]);
    setNewName("");
    setNewMessage(
      `「${name}」（${newCategory === "individual" ? "個人" : "法人"} · ${fiscalMonth}月）を追加しました。内容を確認して「顧客マスタを保存」してください。`,
    );
  };

  if (showProfileEditor) {
    return (
      <section className="fade-in-up space-y-4">
        <ClientProfileEditor
          clients={editableClients}
          onChange={onClientsChange}
          initialClientId={profileClientId}
          saveAction={{ onSave, isSaving, message }}
          stakeholders={stakeholders}
          stakeholderScopes={stakeholderScopes}
          onToggleAssignee={onToggleAssignee}
          onSaveAssignees={onSaveAssignees}
          assigneesSaving={assigneesSaving}
          assigneesMessage={assigneesMessage}
        />
      </section>
    );
  }

  return (
    <section data-tour="settings-clients" className="fade-in-up space-y-4">
      <ConfigSheetIntro
        sheetId="clients"
        sheetLabel="CLIENTS"
        title="顧客マスタ / 関係グループ"
        description="1 顧問先 = 1 行セル。メインページの資料マトリクス行ラベルになります。"
      />

      <div
        data-tour="settings-clients-add"
        className="rounded-2xl border border-slate-200 border-l-4 border-l-blue-600 bg-white p-4"
      >
        <h3 className="text-sm font-bold text-slate-800">法人／個人の新規登録</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          1件ずつ追加できます。追加後は必ず「顧客マスタを保存」してください。
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1 text-[10px] font-bold text-slate-500">
            顧問先名
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例: 株式会社サンプル"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </label>
          <label className="text-[10px] font-bold text-slate-500">
            区分
            <select
              value={newCategory}
              onChange={(e) => {
                const next = e.target.value as "corporate" | "individual";
                setNewCategory(next);
                setNewFiscalMonth(next === "individual" ? 12 : 3);
              }}
              className="mt-1 block min-w-[6rem] rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800"
            >
              <option value="corporate">法人</option>
              <option value="individual">個人</option>
            </select>
          </label>
          <label className="text-[10px] font-bold text-slate-500">
            決算月（期）
            <select
              value={newFiscalMonth}
              onChange={(e) => setNewFiscalMonth(Number(e.target.value))}
              className="mt-1 block min-w-[5.5rem] rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                <option key={month} value={month}>
                  {month}月
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleAddClient}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-blue-700"
          >
            追加
          </button>
        </div>
        {newMessage ? <p className="mt-2 text-xs text-slate-600">{newMessage}</p> : null}
      </div>

      <div
        data-tour="settings-clients-filters"
        className="rounded-2xl border border-slate-200 bg-white p-3"
      >
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[10rem] flex-1 text-[10px] font-bold text-slate-500">
            検索
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="名前・ID・タグ"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </label>
          <label className="text-[10px] font-bold text-slate-500">
            担当者
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="mt-1 block min-w-[8rem] rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800"
            >
              <option value="all">すべて</option>
              {assigneeOptions.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-bold text-slate-500">
            決算月
            <select
              value={fiscalMonth === "all" ? "all" : String(fiscalMonth)}
              onChange={(e) => {
                const v = e.target.value;
                setFiscalMonth(v === "all" ? "all" : Number(v));
              }}
              className="mt-1 block min-w-[5.5rem] rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800"
            >
              <option value="all">すべて</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                <option key={month} value={month}>
                  {month}月
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-bold text-slate-500">
            法人・個人
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CategoryFilter)}
              className="mt-1 block min-w-[6rem] rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800"
            >
              <option value="all">すべて</option>
              <option value="corporate">法人</option>
              <option value="individual">個人</option>
            </select>
          </label>
          {filtersActive ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setAssigneeId("all");
                setFiscalMonth("all");
                setCategory("all");
              }}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
            >
              クリア
            </button>
          ) : null}
          <p className="ml-auto self-center text-[11px] text-slate-500">
            {filteredClients.length} / {editableClients.length} 件
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredClients.length === 0 ? (
          <p className="col-span-full rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
            条件に一致する顧問先はありません。
          </p>
        ) : (
          filteredClients.map((client) => {
            const groups = editableGroups.filter((group) => group.clientIds.includes(client.id));
            return (
              <ConfigMatrixCard
                key={client.id}
                cellAddress={formatConfigCellAddress("clients", client.id, "name")}
                className={
                  onOpenClientProfile
                    ? "cursor-pointer transition hover:border-blue-300 hover:shadow-md"
                    : undefined
                }
                onClick={
                  onOpenClientProfile ? () => onOpenClientProfile(client.id) : undefined
                }
              >
                <input
                  className="w-full rounded border border-slate-200 px-2 py-1 text-sm font-bold text-slate-800"
                  value={client.name}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    onClientsChange(updateClientById(editableClients, client.id, { name: e.target.value }))
                  }
                />
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    決算月:
                    <input
                      type="number"
                      min={1}
                      max={12}
                      className="w-16 rounded border border-slate-200 px-2 py-1"
                      value={client.fiscalMonth}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        onClientsChange(
                          updateClientById(editableClients, client.id, {
                            fiscalMonth: Number(e.target.value) || client.fiscalMonth,
                          }),
                        )
                      }
                    />
                    月
                  </span>
                  <select
                    className="rounded border border-slate-200 px-2 py-1 text-[11px]"
                    value={client.category}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      onClientsChange(
                        updateClientById(editableClients, client.id, {
                          category: e.target.value as OrgClient["category"],
                        }),
                      )
                    }
                  >
                    <option value="corporate">法人</option>
                    <option value="individual">個人</option>
                  </select>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
                  <div className="flex flex-wrap gap-1">
                    {groups.length === 0 ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                        関係グループなし
                      </span>
                    ) : (
                      groups.map((group) => (
                        <span
                          key={group.id}
                          className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700"
                        >
                          {group.name}
                        </span>
                      ))
                    )}
                  </div>
                  {onOpenClientProfile ? (
                    <span className="text-[10px] font-semibold text-blue-600">詳細 →</span>
                  ) : null}
                </div>
              </ConfigMatrixCard>
            );
          })
        )}
      </div>
      <div className="space-y-3 rounded-2xl border border-slate-200 border-l-4 border-l-blue-600 bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">関係グループ編集</h3>
          <button
            type="button"
            onClick={() =>
              onGroupsChange([
                ...editableGroups,
                {
                  id: `g${Date.now()}`,
                  name: "新規グループ",
                  relationType: "group_company",
                  clientIds: [],
                  note: "",
                },
              ])
            }
            className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
          >
            グループ追加
          </button>
        </div>
        <div className="space-y-2">
          {editableGroups.map((group, groupIndex) => (
            <div key={group.id} className="rounded border border-slate-200 p-3">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <input
                  className="rounded border border-slate-200 px-2 py-1 text-xs"
                  value={group.name}
                  onChange={(e) =>
                    onGroupsChange(
                      editableGroups.map((item, idx) =>
                        idx === groupIndex ? { ...item, name: e.target.value } : item,
                      ),
                    )
                  }
                />
                <select
                  className="rounded border border-slate-200 px-2 py-1 text-xs"
                  value={group.relationType}
                  onChange={(e) =>
                    onGroupsChange(
                      editableGroups.map((item, idx) =>
                        idx === groupIndex
                          ? { ...item, relationType: e.target.value as ClientRelationType }
                          : item,
                      ),
                    )
                  }
                >
                  {relationTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {RELATION_TYPE_LABEL[option]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onGroupsChange(editableGroups.filter((_, idx) => idx !== groupIndex))}
                  className="rounded border border-red-200 bg-white px-2 py-1 text-xs font-bold text-red-500 hover:bg-red-50"
                >
                  削除
                </button>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">構成クライアント</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {editableClients.map((client) => {
                  const selected = group.clientIds.includes(client.id);
                  return (
                    <button
                      key={`${group.id}-${client.id}`}
                      type="button"
                      onClick={() =>
                        onGroupsChange(
                          editableGroups.map((item, idx) =>
                            idx !== groupIndex
                              ? item
                              : {
                                  ...item,
                                  clientIds: selected
                                    ? item.clientIds.filter((id) => id !== client.id)
                                    : [...item.clientIds, client.id],
                                },
                          ),
                        )
                      }
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        selected ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {client.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? "保存中..." : "顧客マスタを保存"}
        </button>
        {message && <span className="text-xs text-slate-500">{message}</span>}
      </div>

      <div className="space-y-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            受け入れ・一括取込（あまり使わない）
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            CSV の取り込み・書き出し、他事務所からの移管受け取りはここにまとめています。
          </p>
        </div>

        <div
          data-tour="settings-clients-csv"
          className="rounded-2xl border border-slate-200 border-l-4 border-l-emerald-600 bg-white p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">顧客一覧 CSV</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                列: <code className="text-slate-600">id,name,fiscal_month,category,tags</code>
                。id が空なら自動採番。Excel 向けに UTF-8（BOM 付き）です。取り込み後は必ず保存してください。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 text-[11px] text-slate-600">
                <select
                  className="rounded border border-slate-200 px-2 py-1 text-[11px]"
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value as "merge" | "replace")}
                >
                  <option value="merge">既存とマージ</option>
                  <option value="replace">CSV で置き換え</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() =>
                  downloadTextFile("docugrid-clients-sample.csv", CLIENT_CSV_SAMPLE, "text/csv;charset=utf-8")
                }
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
              >
                サンプル CSV
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    "docugrid-clients.csv",
                    clientsToCsv(editableClients),
                    "text/csv;charset=utf-8",
                  )
                }
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
              >
                書き出し
              </button>
              <button
                type="button"
                data-tour="settings-clients-csv-import"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700"
              >
                CSVを取り込む
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  void handleImportFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          {(csvMessage || message) && (
            <p className="mt-3 text-xs text-slate-600">{csvMessage || message}</p>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <ClientTransferClaimPanel />
          <ClientTransferIssuedList />
        </div>
      </div>
    </section>
  );
}
