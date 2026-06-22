"use client";

import { useMemo, useState } from "react";
import {
  CLIENT_PROFILE_SECTIONS,
  type ClientProfileData,
  type ProfileFieldMeta,
} from "@/config/client-profile-fields";
import type { OrgClient } from "@/config/organization";
import { ConfigSheetIntro } from "@/features/config/components/ConfigSheetIntro";

type EditableClient = OrgClient & {
  profile?: ClientProfileData;
  profileMeta?: Record<string, ProfileFieldMeta>;
};

type Props = {
  clients: EditableClient[];
  onChange: (clients: EditableClient[]) => void;
};

export function ClientProfileEditor({ clients, onChange }: Props) {
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id ?? "");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ basic: true });

  const selectedIndex = useMemo(
    () => clients.findIndex((client) => client.id === selectedClientId),
    [clients, selectedClientId],
  );
  const selectedClient = selectedIndex >= 0 ? clients[selectedIndex] : null;
  const profile = selectedClient?.profile ?? {};

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
          <div className="mt-2 max-h-[60vh] space-y-1 overflow-y-auto">
            {clients.map((client) => (
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
            ))}
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-3">
          {selectedClient && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <h2 className="text-sm font-black text-slate-800">{selectedClient.name}</h2>
              <p className="text-xs text-slate-500">
                ID: {selectedClient.id} · {selectedClient.fiscalMonth}月決算 ·{" "}
                {selectedClient.category === "individual" ? "個人" : "法人"}
              </p>
            </div>
          )}

          {CLIENT_PROFILE_SECTIONS.map((section) => {
            const isOpen = openSections[section.id] ?? false;
            const filledCount = section.fields.filter((field) => (profile[field.id] ?? "").trim()).length;
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
                  <div className="grid gap-3 border-t border-slate-100 p-4 md:grid-cols-2">
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
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
