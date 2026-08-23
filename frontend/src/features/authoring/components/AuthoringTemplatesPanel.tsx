"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  createAuthoringTemplate,
  deleteAuthoringTemplate,
  listAuthoringTemplates,
  parseAuthoringBody,
  updateAuthoringTemplate,
} from "@/features/authoring/api";
import {
  AuthoringPageEditor,
  type AuthoringPageEditorHandle,
} from "@/features/authoring/components/AuthoringPageEditor";
import { MergeFieldPalette } from "@/features/authoring/components/MergeFieldPalette";
import { BLANK_AGREEMENT_BODY } from "@/features/authoring/lib/merge-fields";
import type { AuthoringTemplate } from "@/features/authoring/types";
import { labelForVariable } from "@/features/authoring/types";
import { hasPermission } from "@/lib/authorization";
import type { DocugridUser } from "@/lib/auth";

type Props = {
  currentUser: DocugridUser | null;
};

export function AuthoringTemplatesPanel({ currentUser }: Props) {
  const canEditGlobal = hasPermission(currentUser, "settings.platform");
  const editorRef = useRef<AuthoringPageEditorHandle>(null);
  const [globalTemplates, setGlobalTemplates] = useState<AuthoringTemplate[]>([]);
  const [localTemplates, setLocalTemplates] = useState<AuthoringTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(BLANK_AGREEMENT_BODY);
  const [description, setDescription] = useState("");
  const [parsedVars, setParsedVars] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAuthoringTemplates();
      setGlobalTemplates(data.global);
      setLocalTemplates(data.local);
    } catch {
      setMessage("ひな形の読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!body.trim()) {
        setParsedVars([]);
        return;
      }
      void parseAuthoringBody(body)
        .then(setParsedVars)
        .catch(() => setParsedVars([]));
    }, 400);
    return () => clearTimeout(timer);
  }, [body]);

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setBody(BLANK_AGREEMENT_BODY);
    setDescription("");
    setParsedVars([]);
  };

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) {
      setMessage("タイトルと本文を入力してください。");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      if (editingId) {
        await updateAuthoringTemplate(editingId, {
          title: title.trim(),
          body,
          description: description.trim(),
        });
        setMessage("ひな形を更新しました。");
      } else {
        await createAuthoringTemplate({
          title: title.trim(),
          body,
          description: description.trim(),
          scope: "local",
        });
        setMessage("独自ひな形を登録しました。");
      }
      resetForm();
      await reload();
    } catch {
      setMessage(editingId ? "更新に失敗しました。" : "登録に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("このひな形を削除しますか？")) return;
    try {
      await deleteAuthoringTemplate(id);
      if (editingId === id) resetForm();
      await reload();
    } catch {
      setMessage("削除に失敗しました。");
    }
  };

  const renderList = (items: AuthoringTemplate[], editable: boolean) => (
    <ul className="space-y-2">
      {items.length === 0 && <li className="text-xs text-slate-400">登録がありません</li>}
      {items.map((t) => (
        <li key={t.id} className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-bold text-slate-800">{t.title}</div>
              <p className="mt-0.5 text-[11px] text-slate-500">{t.description || "—"}</p>
              <p className="mt-1 text-[10px] text-slate-400">
                変数: {(t.variables ?? []).map((v) => labelForVariable(v)).join("、") || "なし"}
              </p>
            </div>
            {editable && (
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(t.id);
                    setTitle(t.title);
                    setBody(t.body);
                    setDescription(t.description);
                    setMessage("");
                  }}
                  className="text-[10px] font-bold text-indigo-600 hover:underline"
                >
                  編集
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(t.id)}
                  className="text-[10px] font-bold text-red-500 hover:underline"
                >
                  削除
                </button>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <section className="fade-in-up space-y-4">
      <h2 className="text-lg font-bold text-slate-800">文書ひな形</h2>
      <p className="text-xs text-slate-500">
        A4 上に自由に書き、{" "}
        <code className="rounded bg-slate-100 px-1">【法人名１】</code> や{" "}
        <code className="rounded bg-slate-100 px-1">{"{{client_name}}"}</code>{" "}
        を埋め込むと、マトリクスの「文書作成」で顧問先マスタから差し込みます。
      </p>

      <article className="max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800">TAXX 公式ひな形（Global）</h3>
        <p className="mt-1 text-[11px] text-slate-500">
          法令準拠文書のたたき台。内容の更新は TAXX 運営が行います。
        </p>
        <div className="mt-3">
          {loading ? <p className="text-xs text-slate-400">読込中…</p> : renderList(globalTemplates, canEditGlobal)}
        </div>
      </article>

      <article className="max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800">事務所独自ひな形（Local）</h3>
        <div className="mt-3">{loading ? null : renderList(localTemplates, true)}</div>

        <div className="mt-6 space-y-3 border-t border-slate-100 pt-4">
          <h4 className="text-xs font-bold text-slate-700">
            {editingId ? "ひな形を編集" : "新規登録"}
          </h4>
          <label className="block text-xs text-slate-600">
            タイトル
            <input
              className="mt-1 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: 業務委託契約書"
            />
          </label>
          <label className="block text-xs text-slate-600">
            説明（任意）
            <input
              className="mt-1 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <MergeFieldPalette onInsert={(token) => editorRef.current?.insertText(token)} />
          <AuthoringPageEditor ref={editorRef} value={body} onChange={setBody} />
          {parsedVars.length > 0 && (
            <p className="text-[11px] text-slate-500">
              検出した項目: {parsedVars.map((v) => labelForVariable(v)).join("、")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "保存中…" : editingId ? "変更を保存" : "独自ひな形を登録"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                新規に戻す
              </button>
            )}
          </div>
        </div>
      </article>

      {message && <p className="text-xs text-slate-600">{message}</p>}
    </section>
  );
}
