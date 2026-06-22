"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Loader2, Plus } from "lucide-react";
import type { OrgClient } from "@/config/organization";
import { WipBanner } from "@/components/work-in-progress";
import { SsotEditToolbar } from "@/features/client-data/components/SsotEditToolbar";
import { useSsotEditSession } from "@/features/client-data/hooks/use-ssot-edit-session";
import {
  deleteClientRecord,
  fetchClientRecords,
  upsertClientRecord,
  type ClientRecordItem,
} from "@/features/client-data/lib/client-records-api";
import { useSsotPropagateReload } from "@/features/client-data/hooks/use-ssot-propagate-reload";

const SEVERITY_OPTIONS = [
  { value: "urgent", label: "緊急" },
  { value: "warning", label: "注意" },
  { value: "info", label: "情報" },
] as const;

type Props = {
  client: OrgClient;
  canEdit?: boolean;
  onRecordsChange?: (items: ClientRecordItem[]) => void;
};

export function ClientTaxAlertsSection({ client, canEdit, onRecordsChange }: Props) {
  const [committed, setCommitted] = useState<ClientRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edit = useSsotEditSession(committed);
  const onRecordsChangeRef = useRef(onRecordsChange);
  onRecordsChangeRef.current = onRecordsChange;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchClientRecords(client.id, "tax_alert");
      setCommitted(items);
      onRecordsChangeRef.current?.(items);
    } catch {
      setError("税務アラートの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [client.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useSsotPropagateReload(client.id, () => void reload());

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
            domain: "tax_alert",
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

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Bell className="h-4 w-4 text-red-500" />
            手動の税務アラート
          </h3>
          <p className="mt-1 text-[10px] text-slate-400">
            client_records（tax_alert）に保存。資料不足などの自動アラートは上の一覧に表示されます。
          </p>
          <WipBanner
            kind="partial"
            title="設定通知との連携"
            message="法人税・消費税の届出リマインドは工事中です。ここでは手動アラートのみ編集できます。"
            className="mt-2"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {edit.isEditing ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
              onClick={() =>
                edit.patchDraft((prev) => [
                  {
                    id: `new-${Date.now()}`,
                    client_id: client.id,
                    domain: "tax_alert",
                    title: "税務アラート",
                    body: "",
                    meta: { severity: "info", due_label: "" },
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
      </div>

      {error ? (
        <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      ) : null}

      {loading && committed.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          読み込み中…
        </div>
      ) : items.length === 0 ? (
        <p className="mt-4 text-center text-sm text-slate-400">手動アラートは未登録です</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => {
            const severity = (item.meta?.severity as string) || "info";
            return (
              <li
                key={item.id}
                className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3"
              >
                {edit.isEditing ? (
                  <div className="space-y-2">
                    <input
                      className="w-full rounded border border-violet-200 px-2 py-1 text-sm font-bold"
                      value={item.title}
                      onChange={(e) =>
                        edit.patchDraft((prev) =>
                          prev.map((p) => (p.id === item.id ? { ...p, title: e.target.value } : p)),
                        )
                      }
                    />
                    <textarea
                      className="w-full resize-none rounded border border-slate-200 px-2 py-1 text-sm"
                      rows={2}
                      value={item.body}
                      onChange={(e) =>
                        edit.patchDraft((prev) =>
                          prev.map((p) => (p.id === item.id ? { ...p, body: e.target.value } : p)),
                        )
                      }
                    />
                    <div className="flex flex-wrap gap-2">
                      <select
                        className="rounded border border-slate-200 px-2 py-1 text-xs"
                        value={severity}
                        onChange={(e) =>
                          edit.patchDraft((prev) =>
                            prev.map((p) =>
                              p.id === item.id
                                ? {
                                    ...p,
                                    meta: { ...p.meta, severity: e.target.value },
                                  }
                                : p,
                            ),
                          )
                        }
                      >
                        {SEVERITY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <input
                        className="min-w-[8rem] flex-1 rounded border border-slate-200 px-2 py-1 text-xs"
                        placeholder="期限ラベル（例: 8月頃）"
                        value={String(item.meta?.due_label ?? "")}
                        onChange={(e) =>
                          edit.patchDraft((prev) =>
                            prev.map((p) =>
                              p.id === item.id
                                ? {
                                    ...p,
                                    meta: { ...p.meta, due_label: e.target.value },
                                  }
                                : p,
                            ),
                          )
                        }
                      />
                    </div>
                    <button
                      type="button"
                      className="text-[10px] text-rose-600 hover:underline"
                      onClick={() =>
                        edit.patchDraft((prev) => prev.filter((p) => p.id !== item.id))
                      }
                    >
                      削除
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-slate-800">{item.title}</p>
                      {item.meta?.kind === "normalize_conflict" ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800">
                          正規化の矛盾
                        </span>
                      ) : null}
                      {item.source_type === "normalize" ? (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-bold text-violet-700">
                          自動
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{item.body}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      重要度: {SEVERITY_OPTIONS.find((o) => o.value === severity)?.label ?? severity}
                      {item.meta?.due_label ? ` · ${String(item.meta.due_label)}` : ""}
                    </p>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
