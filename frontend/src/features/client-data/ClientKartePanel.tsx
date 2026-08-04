"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Check, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { OrgClient } from "@/config/organization";
import {
  deleteKarteEntry,
  fetchKarteEntries,
  KARTE_HORIZON_LABELS,
  syncKarteRag,
  upsertKarteEntry,
  type KarteEntry,
  type KarteHorizon,
  type KarteStatus,
} from "@/features/client-data/lib/client-karte-api";

type Props = {
  client: OrgClient;
  canEdit?: boolean;
  /** マトリクスの現在期など（期ごと・期末の既定値） */
  defaultPeriodKey?: string;
};

const HORIZONS: KarteHorizon[] = ["task", "period", "period_end", "permanent"];

export function ClientKartePanel({ client, canEdit, defaultPeriodKey }: Props) {
  const [horizonFilter, setHorizonFilter] = useState<KarteHorizon | "all">("all");
  const [items, setItems] = useState<KarteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [draftHorizon, setDraftHorizon] = useState<KarteHorizon>("task");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftPeriod, setDraftPeriod] = useState(defaultPeriodKey || "");
  const [draftDue, setDraftDue] = useState("");
  const [draftMeeting, setDraftMeeting] = useState("");
  const [draftStatus, setDraftStatus] = useState<KarteStatus>("open");

  useEffect(() => {
    if (defaultPeriodKey) setDraftPeriod(defaultPeriodKey);
  }, [defaultPeriodKey]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchKarteEntries(client.id, {
        horizon: horizonFilter === "all" ? undefined : horizonFilter,
      });
      setItems(list);
    } catch {
      setError("カルテの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [client.id, horizonFilter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const resetDraft = () => {
    setEditingId(null);
    setDraftHorizon("task");
    setDraftTitle("");
    setDraftBody("");
    setDraftPeriod(defaultPeriodKey || "");
    setDraftDue("");
    setDraftMeeting("");
    setDraftStatus("open");
  };

  const startEdit = (item: KarteEntry) => {
    setEditingId(item.id);
    setDraftHorizon(item.horizon);
    setDraftTitle(item.title);
    setDraftBody(item.body);
    setDraftPeriod(item.period_key || defaultPeriodKey || "");
    setDraftDue(item.due_date || "");
    setDraftMeeting(item.meeting_at || "");
    setDraftStatus(item.status);
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      await upsertKarteEntry(client.id, {
        id: editingId || undefined,
        horizon: draftHorizon,
        period_key:
          draftHorizon === "permanent" ? null : draftPeriod.trim() || defaultPeriodKey || null,
        title: draftTitle.trim() || "（無題）",
        body: draftBody,
        status: draftStatus,
        due_date: draftDue.trim() || null,
        meeting_at: draftMeeting.trim() || null,
        tags: [],
      });
      resetDraft();
      await reload();
    } catch {
      setError("保存に失敗しました（期ごと・期末は期キーが必要です）");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!canEdit) return;
    if (!window.confirm("このカルテ項目を削除しますか？")) return;
    setSaving(true);
    try {
      await deleteKarteEntry(client.id, id);
      if (editingId === id) resetDraft();
      await reload();
    } catch {
      setError("削除に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDone = async (item: KarteEntry) => {
    if (!canEdit || item.horizon !== "task") return;
    setSaving(true);
    try {
      await upsertKarteEntry(client.id, {
        ...item,
        status: item.status === "done" ? "open" : "done",
      });
      await reload();
    } catch {
      setError("更新に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleRagSync = async () => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await syncKarteRag(client.id);
      setError(null);
      window.alert(
        `RAG 同期: ${res.entries} 件中 新規 ${res.ingested} / 再利用 ${res.reused}`,
      );
    } catch {
      setError("RAG 同期に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<KarteHorizon, KarteEntry[]>();
    for (const h of HORIZONS) map.set(h, []);
    for (const item of items) {
      const list = map.get(item.horizon) || [];
      list.push(item);
      map.set(item.horizon, list);
    }
    return map;
  }, [items]);

  const needsPeriod = draftHorizon === "period" || draftHorizon === "period_end";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50 p-4 md:p-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-teal-700">
            <BookOpen className="h-3.5 w-3.5" />
            KARTE
          </div>
          <h2 className="mt-1 text-lg font-black text-slate-800">顧客カルテ</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            打ち合わせの宿題・期末に思い出すこと・ずっと残す注意点を顧客ごとに残します。後から RAG
            検索にも使えます。
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleRagSync()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            RAG 同期
          </button>
        ) : null}
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setHorizonFilter("all")}
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            horizonFilter === "all" ? "bg-teal-700 text-white" : "border border-slate-300 bg-white"
          }`}
        >
          すべて
        </button>
        {HORIZONS.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => setHorizonFilter(h)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              horizonFilter === h ? "bg-teal-700 text-white" : "border border-slate-300 bg-white"
            }`}
          >
            {KARTE_HORIZON_LABELS[h]}
          </button>
        ))}
      </div>

      {error ? <p className="mb-3 text-sm text-rose-600">{error}</p> : null}

      {canEdit ? (
        <div className="mb-6 rounded-2xl border border-teal-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-800">
              {editingId ? "編集" : "新規追加"}
            </h3>
            {editingId ? (
              <button type="button" className="text-xs text-slate-500 underline" onClick={resetDraft}>
                新規に切替
              </button>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-600">
              区分
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                value={draftHorizon}
                onChange={(e) => setDraftHorizon(e.target.value as KarteHorizon)}
              >
                {HORIZONS.map((h) => (
                  <option key={h} value={h}>
                    {KARTE_HORIZON_LABELS[h]}
                  </option>
                ))}
              </select>
            </label>
            {needsPeriod ? (
              <label className="block text-xs font-semibold text-slate-600">
                期キー
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                  value={draftPeriod}
                  onChange={(e) => setDraftPeriod(e.target.value)}
                  placeholder="例: 2025 または FY2025"
                />
              </label>
            ) : (
              <label className="block text-xs font-semibold text-slate-600">
                期限（宿題）
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                  value={draftDue}
                  onChange={(e) => setDraftDue(e.target.value)}
                  disabled={draftHorizon !== "task"}
                />
              </label>
            )}
            <label className="block text-xs font-semibold text-slate-600 md:col-span-2">
              タイトル
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="例: 前回打合せの宿題 / 役員借入の経緯"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600 md:col-span-2">
              本文
              <textarea
                className="mt-1 min-h-[6rem] w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                placeholder="打合せ内容、次回までの宿題、期末に確認すること…"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              打合せ日
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                value={draftMeeting}
                onChange={(e) => setDraftMeeting(e.target.value)}
              />
            </label>
            {draftHorizon === "task" ? (
              <label className="block text-xs font-semibold text-slate-600">
                状態
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                  value={draftStatus}
                  onChange={(e) => setDraftStatus(e.target.value as KarteStatus)}
                >
                  <option value="open">未完了</option>
                  <option value="done">完了</option>
                  <option value="archived">アーカイブ</option>
                </select>
              </label>
            ) : null}
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={saving || (!draftTitle.trim() && !draftBody.trim())}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              保存
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          読み込み中…
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
          まだカルテ項目がありません。打合せの宿題や注意点を追加してください。
        </p>
      ) : (
        <div className="space-y-6">
          {HORIZONS.filter((h) => horizonFilter === "all" || horizonFilter === h).map((h) => {
            const list = grouped.get(h) || [];
            if (list.length === 0) return null;
            return (
              <section key={h}>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  {KARTE_HORIZON_LABELS[h]}
                </h3>
                <ul className="space-y-2">
                  {list.map((item) => (
                    <li
                      key={item.id}
                      className={`rounded-xl border bg-white p-3 shadow-sm ${
                        item.status === "done" ? "border-slate-200 opacity-70" : "border-slate-200"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900">{item.title}</span>
                            {item.period_key ? (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                                {item.period_key}
                              </span>
                            ) : null}
                            {item.due_date ? (
                              <span className="text-[10px] text-amber-700">期限 {item.due_date}</span>
                            ) : null}
                            {item.status === "done" ? (
                              <span className="text-[10px] font-bold text-emerald-700">完了</span>
                            ) : null}
                          </div>
                          {item.body ? (
                            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{item.body}</p>
                          ) : null}
                          <p className="mt-1 text-[10px] text-slate-400">
                            更新 {item.updated_at.slice(0, 16).replace("T", " ")}
                            {item.updated_by ? ` · ${item.updated_by}` : ""}
                          </p>
                        </div>
                        {canEdit ? (
                          <div className="flex shrink-0 gap-1">
                            {item.horizon === "task" ? (
                              <button
                                type="button"
                                title="完了切替"
                                className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
                                onClick={() => void handleToggleDone(item)}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                              onClick={() => startEdit(item)}
                            >
                              編集
                            </button>
                            <button
                              type="button"
                              className="rounded border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50"
                              onClick={() => void handleDelete(item.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
