"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Plus } from "lucide-react";
import type { OrgClient } from "@/config/organization";
import { SsotEditToolbar } from "@/features/client-data/components/SsotEditToolbar";
import { useSsotEditSession } from "@/features/client-data/hooks/use-ssot-edit-session";
import {
  deleteClientRecord,
  fetchClientRecords,
  upsertClientRecord,
  type ClientRecordItem,
} from "@/features/client-data/lib/client-records-api";

type Props = {
  client: OrgClient;
  canEdit?: boolean;
};

export function ClientSpecialNotesPanel({ client, canEdit }: Props) {
  const [committed, setCommitted] = useState<ClientRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edit = useSsotEditSession(committed);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setCommitted(await fetchClientRecords(client.id, "special_note"));
    } catch {
      setError("特殊事項の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [client.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCommit = async () => {
    setSaving(true);
    setError(null);
    const draft = edit.draft;
    const draftIds = new Set(draft.map((i) => i.id));
    try {
      await Promise.all(
        draft.map((item) =>
          upsertClientRecord(client.id, {
            ...item,
            id: item.id.startsWith("new-") ? undefined : item.id,
            domain: "special_note",
          }),
        ),
      );
      await Promise.all(
        committed.filter((i) => !draftIds.has(i.id)).map((i) => deleteClientRecord(client.id, i.id)),
      );
      await reload();
      edit.finishEdit();
    } catch {
      setError("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const items = edit.value;

  if (loading && committed.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        読み込み中…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50 p-4 md:p-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-violet-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            SPECIAL
          </div>
          <h2 className="mt-1 text-lg font-black text-slate-800">特殊事項</h2>
          <p className="mt-1 text-sm text-slate-500">client_records に保存。「変更」→「決定」で反映。</p>
        </div>
        <div className="flex gap-2">
          {edit.isEditing ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
              onClick={() =>
                edit.patchDraft((prev) => [
                  {
                    id: `new-${Date.now()}`,
                    client_id: client.id,
                    domain: "special_note",
                    title: "特殊事項",
                    body: "",
                    sort_order: prev.length,
                    source_type: "manual",
                    updated_at: "",
                  },
                  ...prev,
                ])
              }
            >
              <Plus className="h-3 w-3" />
              追加
            </button>
          ) : null}
          <SsotEditToolbar
            isEditing={edit.isEditing}
            canEdit={canEdit}
            saving={saving}
            onStart={edit.startEdit}
            onCommit={() => void handleCommit()}
            onCancel={edit.cancelEdit}
          />
        </div>
      </header>

      {error ? (
        <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="mx-auto w-full max-w-4xl space-y-4">
        {items.length === 0 ? (
          <p className="text-center text-sm text-slate-400">特殊事項はまだ登録されていません</p>
        ) : (
          items.map((item) => (
            <section
              key={item.id}
              className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm"
            >
              {edit.isEditing ? (
                <input
                  className="w-full border-b border-amber-100 bg-amber-50/80 px-4 py-2.5 text-xs font-bold text-amber-900"
                  value={item.title}
                  onChange={(e) =>
                    edit.patchDraft((prev) =>
                      prev.map((p) => (p.id === item.id ? { ...p, title: e.target.value } : p)),
                    )
                  }
                />
              ) : (
                <h3 className="border-b border-amber-100 bg-amber-50/80 px-4 py-2.5 text-xs font-bold text-amber-900">
                  {item.title}
                </h3>
              )}
              <div className="px-4 py-4">
                {edit.isEditing ? (
                  <>
                    <textarea
                      className="w-full resize-none rounded border border-slate-200 px-2 py-2 text-sm"
                      rows={4}
                      value={item.body}
                      onChange={(e) =>
                        edit.patchDraft((prev) =>
                          prev.map((p) => (p.id === item.id ? { ...p, body: e.target.value } : p)),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="mt-2 text-[10px] text-rose-600"
                      onClick={() =>
                        edit.patchDraft((prev) => prev.filter((p) => p.id !== item.id))
                      }
                    >
                      削除
                    </button>
                  </>
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {item.body}
                  </p>
                )}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
