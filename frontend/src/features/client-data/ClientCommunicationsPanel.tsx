"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, MessagesSquare, Plus } from "lucide-react";
import type { OrgClient } from "@/config/organization";
import { WipBanner } from "@/components/work-in-progress";
import { SsotEditToolbar } from "@/features/client-data/components/SsotEditToolbar";
import { useSsotEditSession } from "@/features/client-data/hooks/use-ssot-edit-session";
import {
  deleteCommThread,
  fetchCommThreads,
  upsertCommThread,
  type CommThread,
} from "@/features/client-data/lib/client-comms-api";

type Props = {
  client: OrgClient;
  canEdit?: boolean;
};

export function ClientCommunicationsPanel({ client, canEdit }: Props) {
  const [committed, setCommitted] = useState<CommThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edit = useSsotEditSession(committed);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setCommitted(await fetchCommThreads(client.id));
    } catch {
      setError("コミュニケーション履歴の読み込みに失敗しました");
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
    const draftIds = new Set(draft.map((t) => t.id));
    try {
      await Promise.all(
        draft.map((t) =>
          upsertCommThread(client.id, {
            ...t,
            id: t.id.startsWith("new-") ? undefined : t.id,
          }),
        ),
      );
      await Promise.all(
        committed
          .filter((t) => !draftIds.has(t.id) && !t.id.startsWith("new-"))
          .map((t) => deleteCommThread(client.id, t.id)),
      );
      await reload();
      edit.finishEdit();
    } catch {
      setError("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const patchThread = (id: string, patch: Partial<CommThread>) => {
    edit.patchDraft((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const handleAdd = () => {
    const temp: CommThread = {
      id: `new-${Date.now()}`,
      client_id: client.id,
      channel: "email",
      subject: "（件名）",
      preview: "",
      participants: "",
      occurred_at: new Date().toISOString(),
      source_type: "manual",
      updated_at: new Date().toISOString(),
    };
    edit.patchDraft((prev) => [temp, ...prev]);
  };

  const threads = edit.value;

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
            <MessagesSquare className="h-3.5 w-3.5" />
            COMMS
          </div>
          <h2 className="mt-1 text-lg font-black text-slate-800">コミュニケーション履歴</h2>
          <p className="mt-1 text-sm text-slate-500">
            client_comms に保存。「変更」→編集→「決定」で反映します。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {edit.isEditing ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs hover:bg-slate-50"
              onClick={handleAdd}
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

      <WipBanner
        kind="mock"
        title="コミュニケーション履歴"
        message="初回はサンプルスレッドが入ります。Slack / Gmail など外部連携は未実装です（手動入力のみ保存）。"
        className="mb-4"
      />

      <div className="mx-auto w-full max-w-4xl space-y-3">
        {threads.map((thread) => (
          <article
            key={thread.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  thread.channel === "slack"
                    ? "bg-[#4A154B]/10 text-[#4A154B]"
                    : "bg-red-50 text-red-600"
                }`}
              >
                {thread.channel === "slack" ? (
                  <MessagesSquare className="h-4 w-4" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {edit.isEditing ? (
                  <>
                    <input
                      className="w-full rounded border border-violet-200 px-2 py-1 text-sm font-bold"
                      value={thread.subject}
                      onChange={(e) => patchThread(thread.id, { subject: e.target.value })}
                    />
                    <input
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                      value={thread.participants}
                      onChange={(e) => patchThread(thread.id, { participants: e.target.value })}
                    />
                    <textarea
                      className="w-full resize-none rounded border border-slate-200 px-2 py-1 text-sm"
                      rows={2}
                      value={thread.preview}
                      onChange={(e) => patchThread(thread.id, { preview: e.target.value })}
                    />
                    <button
                      type="button"
                      className="text-[10px] text-rose-600 hover:underline"
                      onClick={() =>
                        edit.patchDraft((prev) => prev.filter((t) => t.id !== thread.id))
                      }
                    >
                      削除
                    </button>
                  </>
                ) : (
                  <>
                    <h3 className="text-sm font-bold text-slate-800">{thread.subject}</h3>
                    <p className="text-xs text-slate-500">{thread.participants}</p>
                    <p className="text-sm leading-relaxed text-slate-600">{thread.preview}</p>
                  </>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
