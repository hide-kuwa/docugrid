"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Search, X } from "lucide-react";
import {
  CLIENT_PROFILE_SECTIONS,
  type ClientProfileData,
  type ProfileFieldMeta,
} from "@/config/client-profile-fields";
import type { OrgClient, StakeholderMaster } from "@/config/organization";
import { ConfigSheetIntro } from "@/features/config/components/ConfigSheetIntro";
import { copyText, openEtaxLogin, type EtaxLoginKind } from "@/lib/etax-login";
import { ClientTransferIssueButton } from "@/features/settings/ClientTransferPanels";

type EditableClient = OrgClient & {
  profile?: ClientProfileData;
  profileMeta?: Record<string, ProfileFieldMeta>;
};

const ASSIGNABLE_KINDS = new Set<StakeholderMaster["kind"]>([
  "staff",
  "supervisor",
  "representative_tax_accountant",
]);

type Props = {
  clients: EditableClient[];
  onChange: (clients: EditableClient[]) => void;
  /** 顧客マスタから飛んできたときの初期選択 */
  initialClientId?: string;
  /** 名前行に並べる保存操作（固定は名前＋この行だけ） */
  saveAction?: {
    onSave: () => void;
    isSaving: boolean;
    message?: string;
  };
  stakeholders?: StakeholderMaster[];
  stakeholderScopes?: Record<string, string[]>;
  onToggleAssignee?: (stakeholderId: string, clientId: string) => void;
  onSaveAssignees?: () => void;
  assigneesSaving?: boolean;
  assigneesMessage?: string;
};

function matchesClientQuery(client: EditableClient, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    client.name,
    client.id,
    `${client.fiscalMonth}月`,
    client.profile?.customer_name_kana,
    client.profile?.customer_code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function ClientProfileEditor({
  clients,
  onChange,
  initialClientId,
  saveAction,
  stakeholders = [],
  stakeholderScopes = {},
  onToggleAssignee,
  onSaveAssignees,
  assigneesSaving,
  assigneesMessage,
}: Props) {
  const [selectedClientId, setSelectedClientId] = useState(
    () => initialClientId || clients[0]?.id || "",
  );
  const [clientQuery, setClientQuery] = useState("");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ basic: true });
  const [etaxHint, setEtaxHint] = useState<string | null>(null);

  useEffect(() => {
    if (!initialClientId) return;
    if (clients.some((client) => client.id === initialClientId)) {
      setSelectedClientId(initialClientId);
    }
  }, [initialClientId, clients]);

  const selectedIndex = useMemo(
    () => clients.findIndex((client) => client.id === selectedClientId),
    [clients, selectedClientId],
  );
  const selectedClient = selectedIndex >= 0 ? clients[selectedIndex] : null;
  const profile = selectedClient?.profile ?? {};
  const etaxUserId = (profile.etax_user_id ?? "").trim();
  const etaxPin = (profile.etax_pin ?? "").trim();
  const defaultEtaxKind: EtaxLoginKind =
    selectedClient?.category === "individual" ? "individual" : "corporate";

  const assignableStaff = useMemo(
    () => stakeholders.filter((s) => s.status === "active" && ASSIGNABLE_KINDS.has(s.kind)),
    [stakeholders],
  );

  const assignedStaff = useMemo(() => {
    if (!selectedClient) return [];
    return assignableStaff.filter((s) =>
      (stakeholderScopes[s.id] ?? s.scopedClientIds).includes(selectedClient.id),
    );
  }, [assignableStaff, selectedClient, stakeholderScopes]);

  const runEtaxAssist = async (kind: EtaxLoginKind) => {
    if (!etaxUserId) {
      setEtaxHint("利用者識別番号が未入力です。");
      return;
    }
    openEtaxLogin(kind);
    const ok = await copyText(etaxUserId);
    setEtaxHint(
      ok
        ? "ログイン画面を開きました。利用者識別番号をコピー済みです。貼り付け後、「暗証番号をコピー」を押してください。"
        : "ログイン画面を開きました。利用者識別番号のコピーに失敗したので、欄から手動コピーしてください。",
    );
  };

  const filteredClients = useMemo(
    () => clients.filter((client) => matchesClientQuery(client, clientQuery)),
    [clients, clientQuery],
  );

  const setProfileField = (fieldId: string, value: string) => {
    if (selectedIndex < 0) return;
    onChange(
      clients.map((client, index) =>
        index === selectedIndex
          ? {
              ...client,
              profile: { ...(client.profile ?? {}), [fieldId]: value },
            }
          : client,
      ),
    );
  };

  const toggleSection = (sectionId: string) => {
    setOpenSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  if (clients.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        顧客マスタに顧問先が登録されていません。
      </p>
    );
  }

  return (
    <section className="fade-in-up space-y-4">
      <ConfigSheetIntro
        sheetId="clientProfile"
        sheetLabel="PROFILE"
        title="顧客管理プロフィール"
        description="顧問先ごとに文字情報を登録します。一覧の顧客名・決算月は「顧客マスタ」シートで編集します。"
      />

      <div className="flex flex-col gap-4 lg:flex-row">
        <aside className="w-full shrink-0 rounded-2xl border border-slate-200 bg-white p-3 lg:w-56">
          <p className="px-2 text-[10px] font-black uppercase tracking-widest text-slate-400">顧問先</p>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={clientQuery}
              onChange={(e) => setClientQuery(e.target.value)}
              placeholder="名前・IDで検索"
              aria-label="顧問先を検索"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-7 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
            />
            {clientQuery ? (
              <button
                type="button"
                onClick={() => setClientQuery("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                aria-label="検索をクリア"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <div className="mt-2 max-h-[60vh] space-y-1 overflow-y-auto">
            {filteredClients.length === 0 ? (
              <p className="px-2 py-6 text-center text-[11px] text-slate-400">
                「{clientQuery.trim()}」に一致する顧問先はありません。
              </p>
            ) : (
              filteredClients.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => setSelectedClientId(client.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-xs font-bold transition-colors ${
                    client.id === selectedClientId
                      ? "bg-blue-600 text-white"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="truncate">{client.name}</div>
                  <div
                    className={`mt-0.5 text-[10px] font-semibold ${
                      client.id === selectedClientId ? "text-blue-100" : "text-slate-400"
                    }`}
                  >
                    {client.fiscalMonth}月決算
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-3">
          {selectedClient && (
            <div className="sticky top-12 z-20 -mx-1 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur md:top-14">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-black text-slate-800">{selectedClient.name}</h2>
                  <p className="truncate text-[11px] text-slate-500">
                    ID: {selectedClient.id} · {selectedClient.fiscalMonth}月決算 ·{" "}
                    {selectedClient.category === "individual" ? "個人" : "法人"}
                    {assignedStaff.length > 0
                      ? ` · 担当 ${assignedStaff.map((s) => s.displayName).join("、")}`
                      : " · 担当未設定"}
                  </p>
                </div>
                {saveAction ? (
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {saveAction.message ? (
                      <span className="max-w-[10rem] truncate text-[10px] text-slate-500 sm:max-w-[14rem]">
                        {saveAction.message}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={saveAction.onSave}
                      disabled={saveAction.isSaving}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
                    >
                      {saveAction.isSaving ? "保存中..." : "保存"}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {selectedClient && onToggleAssignee ? (
            <div className="rounded-2xl border border-slate-200 border-l-4 border-l-brand-600 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">担当者</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    この顧問先を見える／作業できるスタッフを選びます。変更後は「担当を保存」してください。
                  </p>
                </div>
                {onSaveAssignees ? (
                  <button
                    type="button"
                    onClick={onSaveAssignees}
                    disabled={assigneesSaving}
                    className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {assigneesSaving ? "保存中…" : "担当を保存"}
                  </button>
                ) : null}
              </div>
              {assignableStaff.length === 0 ? (
                <p className="mt-3 text-[11px] text-slate-400">担当マスタにスタッフがいません。</p>
              ) : (
                <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                  {assignableStaff.map((actor) => {
                    const checked = (stakeholderScopes[actor.id] ?? actor.scopedClientIds).includes(
                      selectedClient.id,
                    );
                    return (
                      <li key={actor.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2 text-xs hover:bg-slate-50">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            checked={checked}
                            onChange={() => onToggleAssignee(actor.id, selectedClient.id)}
                          />
                          <span className="min-w-0">
                            <span className="block font-bold text-slate-800">{actor.displayName}</span>
                            <span className="block text-[10px] text-slate-400">{actor.id}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              {assigneesMessage ? (
                <p className="mt-2 text-[10px] font-medium text-slate-500">{assigneesMessage}</p>
              ) : null}
            </div>
          ) : null}

          {CLIENT_PROFILE_SECTIONS.map((section) => {
            const isOpen = openSections[section.id] ?? false;
            const filledCount = section.fields.filter((field) => (profile[field.id] ?? "").trim())
              .length;
            return (
              <div
                key={section.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
                >
                  <span className="text-sm font-bold text-slate-800">{section.title}</span>
                  <span className="text-[10px] font-semibold text-slate-400">
                    {filledCount}/{section.fields.length} 入力済
                  </span>
                </button>
                {isOpen && (
                  <div className="space-y-3 border-t border-slate-100 p-4">
                    {section.id === "filing" ? (
                      <div className="rounded-xl border border-teal-100 bg-teal-50/70 px-3 py-2.5">
                        <p className="text-[11px] font-bold text-teal-900">e-Tax ログイン補助</p>
                        <p className="mt-0.5 text-[10px] leading-snug text-teal-800/80">
                          国税庁サイトへID・暗証番号を自動入力することはブラウザが禁止しています。代わりにログイン画面を開き、番号をコピーします。
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => void runEtaxAssist(defaultEtaxKind)}
                            disabled={!etaxUserId}
                            className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {defaultEtaxKind === "individual"
                              ? "個人ログインを開く"
                              : "法人ログインを開く"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void runEtaxAssist(
                                defaultEtaxKind === "individual" ? "corporate" : "individual",
                              )
                            }
                            disabled={!etaxUserId}
                            className="rounded-lg border border-teal-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {defaultEtaxKind === "individual" ? "法人ログイン" : "個人ログイン"}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await copyText(etaxPin);
                              setEtaxHint(
                                ok
                                  ? "暗証番号をコピーしました。e-Taxのパスワード欄に貼り付けてください。"
                                  : etaxPin
                                    ? "暗証番号のコピーに失敗しました。"
                                    : "暗証番号が未入力です。",
                              );
                            }}
                            disabled={!etaxPin}
                            className="rounded-lg border border-teal-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            暗証番号をコピー
                          </button>
                        </div>
                        {etaxHint ? (
                          <p className="mt-1.5 text-[10px] font-medium text-teal-900">{etaxHint}</p>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="grid gap-3 md:grid-cols-2">
                      {section.fields.map((field) => (
                        <label key={field.id} className={field.multiline ? "md:col-span-2" : ""}>
                          <span className="mb-1 block text-[11px] font-bold text-slate-600">
                            {field.label}
                          </span>
                          {field.multiline ? (
                            <textarea
                              rows={3}
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800"
                              value={profile[field.id] ?? ""}
                              onChange={(e) => setProfileField(field.id, e.target.value)}
                            />
                          ) : (
                            <input
                              type="text"
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800"
                              value={profile[field.id] ?? ""}
                              onChange={(e) => setProfileField(field.id, e.target.value)}
                            />
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {selectedClient ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                めったに使わない操作
              </p>
              <ClientTransferIssueButton
                clientId={selectedClient.id}
                clientName={selectedClient.name}
                quiet
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
