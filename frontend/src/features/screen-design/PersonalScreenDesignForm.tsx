"use client";

import { useCallback, useEffect, useState } from "react";
import type { ScreenDesignPersona } from "@/config/screen-design-types";
import { resolvePersonaId } from "@/lib/persona";
import { loadCurrentUser } from "@/lib/auth";
import {
  fetchScreenDesignEditor,
  saveScreenDesignLayer,
} from "@/features/screen-design/screen-design-api";
import { parseApiErrorBody } from "@/lib/parse-api-error";

/** ログインユーザー向け・自分専用層だけ編集（非エンジニア向け） */
export function PersonalScreenDesignForm() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ScreenDesignPersona>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const personaId = resolvePersonaId(loadCurrentUser());

  const load = useCallback(async () => {
    const data = await fetchScreenDesignEditor(personaId);
    setDraft(data.member.personas?.[personaId] || {});
  }, [personaId]);

  useEffect(() => {
    if (open) void load().catch(() => setMessage("読み込みに失敗しました"));
  }, [open, load]);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      await saveScreenDesignLayer("member", personaId, draft);
      setMessage("自分専用の画面設定を保存しました");
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <h2 className="text-sm font-bold text-slate-800">自分専用の画面設計</h2>
          <p className="mt-1 text-xs text-slate-500">あなただけに適用される表示の上書き</p>
        </div>
        <span className="text-xs font-bold text-blue-600">{open ? "閉じる" : "開く"}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <div>
            <label className="text-xs font-bold text-slate-600">ページタイトル</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={draft.pageTitle || ""}
              onChange={(e) => setDraft((d) => ({ ...d, pageTitle: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600">歓迎メッセージ</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              rows={2}
              value={draft.welcomeMessage || ""}
              onChange={(e) => setDraft((d) => ({ ...d, welcomeMessage: e.target.value }))}
            />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
          {message && <p className="text-xs font-bold text-slate-600">{message}</p>}
        </div>
      )}
    </section>
  );
}
