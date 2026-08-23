"use client";

import { useCallback, useEffect, useState } from "react";
import { FlowchartDefinitionEditor } from "@/features/flowchart-templates/FlowchartDefinitionEditor";
import {
  createFlowchartTemplate,
  deleteFlowchartTemplate,
  listFlowchartTemplates,
  updateFlowchartTemplate,
} from "@/features/flowchart-templates/lib/api";
import { EMPTY_DEFINITION, parseDefinition, serializeDefinition } from "@/features/flowchart-templates/lib/definition";
import type { FlowchartDefinitionDraft, FlowchartTemplate } from "@/features/flowchart-templates/lib/types";
import { hasPermission } from "@/lib/authorization";
import type { DocugridUser } from "@/lib/auth";

type Props = { currentUser: DocugridUser | null };

export function FlowchartTemplatesPanel({ currentUser }: Props) {
  const canEditLocal = hasPermission(currentUser, "settings.manage");
  const [globalTemplates, setGlobalTemplates] = useState<FlowchartTemplate[]>([]);
  const [localTemplates, setLocalTemplates] = useState<FlowchartTemplate[]>([]);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [lawLabel, setLawLabel] = useState("");
  const [definition, setDefinition] = useState<FlowchartDefinitionDraft>(EMPTY_DEFINITION);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await listFlowchartTemplates();
      setGlobalTemplates(data.global);
      setLocalTemplates(data.local);
    } catch {
      setMessage("判定フローの読み込みに失敗しました。");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setFamilyId("");
    setValidFrom("");
    setValidTo("");
    setLawLabel("");
    setDefinition(EMPTY_DEFINITION);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setMessage("タイトルを入力してください。");
      return;
    }
    setSaving(true);
    try {
      const payload = serializeDefinition(definition);
      if (editingId) {
        await updateFlowchartTemplate(editingId, {
          title: title.trim(),
          description,
          definition: payload,
          family_id: familyId.trim() || undefined,
          valid_from: validFrom || undefined,
          valid_to: validTo,
          law_label: lawLabel,
        });
        setMessage("フローを更新しました。");
      } else {
        await createFlowchartTemplate({
          title: title.trim(),
          description,
          definition: payload,
          family_id: familyId.trim() || undefined,
          valid_from: validFrom || undefined,
          valid_to: validTo || undefined,
          law_label: lawLabel,
        });
        setMessage("事務所の判定フローを登録しました。");
      }
      resetForm();
      await reload();
    } catch {
      setMessage("保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const fillFromTemplate = (t: FlowchartTemplate, asNewPeriod: boolean) => {
    setEditingId(asNewPeriod ? null : t.id);
    setTitle(t.title);
    setDescription(t.description);
    setFamilyId(t.family_id || t.id);
    setValidFrom(asNewPeriod ? "" : t.valid_from || "");
    setValidTo(asNewPeriod ? "" : t.valid_to || "");
    setLawLabel(asNewPeriod ? "" : t.law_label || "");
    setDefinition(parseDefinition(t.definition));
    if (asNewPeriod) {
      setMessage("同じフローの新しい税法期間として登録します。開始日を入れて保存してください。");
    }
  };

  return (
    <section>
      <h2 className="text-lg font-bold text-slate-800">フローを作る</h2>
      <p className="mt-1 text-sm text-slate-500">
        ステップと「どの数字を見るか」を画面で組みます。法律や閾値が変わったら、同じフローに
        <strong>新しい税法期間</strong>を足します。保存済みの判定と PDF は当時のままです。
      </p>
      {message ? <p className="mt-2 text-xs text-violet-700">{message}</p> : null}

      <h3 className="mt-6 text-sm font-bold text-slate-800">公式フロー</h3>
      <ul className="mt-2 space-y-2">
        {globalTemplates.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-bold text-slate-800">{t.title}</p>
              <p className="text-xs text-slate-500">{t.description}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                税法 {t.law_label || "（ラベルなし）"} · {t.law_range}
              </p>
            </div>
            {canEditLocal ? (
              <button type="button" className="text-xs font-bold text-violet-700" onClick={() => fillFromTemplate(t, true)}>
                これを土台に作る
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      <h3 className="mt-6 text-sm font-bold text-slate-800">事務所のフロー</h3>
      <ul className="mt-2 space-y-2">
        {localTemplates.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-bold text-slate-800">{t.title}</p>
              <p className="text-xs text-slate-500">{t.description}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                税法 {t.law_label || "（ラベルなし）"} · {t.law_range}
              </p>
            </div>
            {canEditLocal ? (
              <div className="flex gap-2">
                <button type="button" className="text-xs font-bold text-violet-700" onClick={() => fillFromTemplate(t, false)}>
                  編集
                </button>
                <button type="button" className="text-xs font-bold text-slate-600" onClick={() => fillFromTemplate(t, true)}>
                  新しい期間
                </button>
                <button
                  type="button"
                  className="text-xs text-slate-400"
                  onClick={() => {
                    if (!window.confirm("このフローを削除しますか？")) return;
                    void deleteFlowchartTemplate(t.id).then(() => reload());
                  }}
                >
                  削除
                </button>
              </div>
            ) : null}
          </li>
        ))}
        {localTemplates.length === 0 ? (
          <li className="text-xs text-slate-400">まだありません。下のフォームから追加できます。</li>
        ) : null}
      </ul>

      {canEditLocal ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-800">{editingId ? "フローを編集" : "新しいフロー"}</p>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="タイトル"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="説明"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="フロー ID（同じ判定の版をまとめる）"
            value={familyId}
            onChange={(e) => setFamilyId(e.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="税法ラベル（例 令和5年10月1日以後）"
            value={lawLabel}
            onChange={(e) => setLawLabel(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-1 flex-col gap-1 text-[10px] font-bold text-slate-500">
              適用開始日
              <input
                type="date"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-[10px] font-bold text-slate-500">
              適用終了日（空なら終期なし）
              <input
                type="date"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
              />
            </label>
          </div>
          <FlowchartDefinitionEditor value={definition} onChange={setDefinition} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              {saving ? "保存中…" : editingId ? "変更を保存" : "フローを登録"}
            </button>
            {editingId ? (
              <button type="button" onClick={resetForm} className="text-xs font-bold text-slate-500">
                キャンセル
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">フローの作成・編集は事務所設定の権限が必要です。判定の実行は「この顧問先で判定」からできます。</p>
      )}
    </section>
  );
}
