"use client";

import { useRef, useState } from "react";
import type { ClientRelationEdge, ClientFamilyGroup, OrgClient, ClientRelationType } from "@/config/organization";
import { RELATION_TYPE_LABEL } from "@/config/organization";
import { ConfigSheetIntro } from "@/features/config/components/ConfigSheetIntro";
import { ConfigMatrixCard } from "@/features/config/components/ConfigMatrixCard";
import { formatConfigCellAddress } from "@/features/config/lib/cell-address";
import { ClientProfileEditor } from "@/features/config/components/ClientProfileEditor";
import {
  CLIENT_CSV_SAMPLE,
  clientsToCsv,
  downloadTextFile,
  parseClientCsv,
} from "@/features/settings/client-master-csv";
import { MigrationIngestPanel } from "@/features/settings/MigrationIngestPanel";

const relationTypeOptions: ClientRelationType[] = ["group_company", "shareholder", "relative_group"];

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
};

export function ClientMasterSettingsTab({
  editableClients,
  editableGroups,
  onClientsChange,
  onGroupsChange,
  onSave,
  isSaving,
  message,
  showProfileEditor,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvMessage, setCsvMessage] = useState("");
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    setCsvMessage("");
    try {
      const text = await file.text();
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

  if (showProfileEditor) {
    return (
      <section className="fade-in-up space-y-4">
        <ClientProfileEditor clients={editableClients} onChange={onClientsChange} />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? "保存中..." : "顧客詳細を保存"}
          </button>
          {message && <span className="text-xs text-slate-500">{message}</span>}
        </div>
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
        data-tour="settings-clients-csv"
        className="rounded-2xl border border-slate-200 border-l-4 border-l-emerald-600 bg-white p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">顧客一覧 CSV</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              列: <code className="text-slate-600">id,name,fiscal_month,category,tags</code>
              。id が空なら自動採番。取り込み後は必ず保存してください。
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
                downloadTextFile("docugrid-clients-sample.csv", CLIENT_CSV_SAMPLE)
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
            >
              サンプル CSV
            </button>
            <button
              type="button"
              onClick={() =>
                downloadTextFile("docugrid-clients.csv", clientsToCsv(editableClients))
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
            >
              書き出し
            </button>
            <button
              type="button"
              data-tour="settings-clients-csv-import"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-800"
            >
              CSV を取り込む
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

      <MigrationIngestPanel clients={editableClients} canEdit={true} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {editableClients.map((client, index) => {
          const groups = editableGroups.filter((group) => group.clientIds.includes(client.id));
          return (
            <ConfigMatrixCard
              key={client.id}
              cellAddress={formatConfigCellAddress("clients", client.id, "name")}
            >
              <input
                className="w-full rounded border border-slate-200 px-2 py-1 text-sm font-bold text-slate-800"
                value={client.name}
                onChange={(e) =>
                  onClientsChange(
                    editableClients.map((item, i) =>
                      i === index ? { ...item, name: e.target.value } : item,
                    ),
                  )
                }
              />
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                決算月:
                <input
                  type="number"
                  min={1}
                  max={12}
                  className="w-16 rounded border border-slate-200 px-2 py-1"
                  value={client.fiscalMonth}
                  onChange={(e) =>
                    onClientsChange(
                      editableClients.map((item, i) =>
                        i === index
                          ? { ...item, fiscalMonth: Number(e.target.value) || item.fiscalMonth }
                          : item,
                      ),
                    )
                  }
                />
                月
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
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
            </ConfigMatrixCard>
          );
        })}
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
    </section>
  );
}
