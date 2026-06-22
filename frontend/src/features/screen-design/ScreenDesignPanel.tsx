"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SCREEN_DESIGN_LAYER_LABELS,
  type ScreenDesignLayerTab,
  type ScreenDesignPersona,
} from "@/config/screen-design-types";
import type { PersonaId } from "@/config/personas";
import { inScopePersonas } from "@/lib/product-scope";
import { ConfigSheetIntro } from "@/features/config/components/ConfigSheetIntro";
import {
  fetchScreenDesignEditor,
  saveScreenDesignLayer,
} from "@/features/screen-design/screen-design-api";
import { parseApiErrorBody } from "@/lib/parse-api-error";

type LayerDraft = ScreenDesignPersona;

export function ScreenDesignPanel() {
  const [personaId, setPersonaId] = useState<PersonaId>("firm_staff_main");
  const [activeLayer, setActiveLayer] = useState<ScreenDesignLayerTab>("firm");
  const [draft, setDraft] = useState<LayerDraft>({});
  const [mergedPreview, setMergedPreview] = useState<ScreenDesignPersona>({});
  const [canEditPlatform, setCanEditPlatform] = useState(false);
  const [canEditFirm, setCanEditFirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadEditor = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const data = await fetchScreenDesignEditor(personaId);
      setCanEditPlatform(data.can_edit_platform);
      setCanEditFirm(data.can_edit_firm);
      setMergedPreview(data.resolved.merged);
      const layerData =
        activeLayer === "platform"
          ? data.platform.personas?.[personaId]
          : activeLayer === "firm"
            ? data.firm.personas?.[personaId]
            : data.member.personas?.[personaId];
      setDraft(layerData || {});
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [personaId, activeLayer]);

  useEffect(() => {
    void loadEditor();
  }, [loadEditor]);

  const layerEditable =
    (activeLayer === "platform" && canEditPlatform) ||
    (activeLayer === "firm" && canEditFirm) ||
    activeLayer === "member";

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      await saveScreenDesignLayer(activeLayer, personaId, draft);
      setMessage("保存しました");
      await loadEditor();
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="fade-in-up space-y-4">
      <ConfigSheetIntro
        sheetId="screens"
        sheetLabel="SCREENS"
        title="画面設計（3層）"
        description="全体デフォルト → 事務所ごと → 自分専用の順で上書きされます。JSON を書かずに項目を入力するだけで変更できます。"
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="text-xs font-bold text-slate-600">対象ペルソナ（役割の画面）</label>
        <select
          className="mt-2 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={personaId}
          onChange={(e) => setPersonaId(e.target.value as PersonaId)}
        >
          {inScopePersonas().map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["platform", "firm", "member"] as ScreenDesignLayerTab[]).map((layer) => (
          <button
            key={layer}
            type="button"
            onClick={() => setActiveLayer(layer)}
            className={`rounded-full px-4 py-2 text-xs font-bold ${
              activeLayer === layer
                ? "bg-blue-600 text-white"
                : "border border-slate-300 bg-white text-slate-600"
            }`}
          >
            {SCREEN_DESIGN_LAYER_LABELS[layer]}
          </button>
        ))}
      </div>

      {!layerEditable && (
        <p className="text-sm text-amber-700">
          この層は閲覧のみです（権限が必要な場合があります）。
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">読み込み中…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800">
              編集: {SCREEN_DESIGN_LAYER_LABELS[activeLayer]}
            </h3>
            <div>
              <label className="text-xs font-bold text-slate-600">ページタイトル</label>
              <input
                disabled={!layerEditable}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
                value={draft.pageTitle || ""}
                onChange={(e) => setDraft((d) => ({ ...d, pageTitle: e.target.value }))}
                placeholder="例: 担当ワークスペース"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600">歓迎メッセージ</label>
              <textarea
                disabled={!layerEditable}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
                rows={3}
                value={draft.welcomeMessage || ""}
                onChange={(e) => setDraft((d) => ({ ...d, welcomeMessage: e.target.value }))}
                placeholder="ログイン直後に表示する一文"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600">アクセント色</label>
              <input
                disabled={!layerEditable}
                type="color"
                className="mt-1 h-10 w-20 cursor-pointer disabled:opacity-50"
                value={draft.accentColor || "#2563eb"}
                onChange={(e) => setDraft((d) => ({ ...d, accentColor: e.target.value }))}
              />
            </div>
            {layerEditable && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {saving ? "保存中…" : "この層を保存"}
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
            <h3 className="text-sm font-bold text-slate-800">合成プレビュー（実際の画面）</h3>
            <p className="mt-1 text-xs text-slate-500">下の層が上の層を上書きした結果です。</p>
            <div
              className="mt-4 rounded-xl border border-slate-200 bg-white p-4"
              style={{ borderTopWidth: 4, borderTopColor: mergedPreview.accentColor || "#2563eb" }}
            >
              <div className="text-lg font-black text-slate-800">
                {mergedPreview.pageTitle || "（タイトル未設定）"}
              </div>
              {mergedPreview.welcomeMessage && (
                <p className="mt-2 text-sm text-slate-600">{mergedPreview.welcomeMessage}</p>
              )}
              {(mergedPreview.widgets || []).filter((w) => w.enabled).length > 0 && (
                <ul className="mt-4 space-y-2">
                  {mergedPreview.widgets
                    ?.filter((w) => w.enabled)
                    .map((w) => (
                      <li
                        key={w.id}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
                      >
                        {w.label}
                      </li>
                    ))}
                </ul>
              )}
            </div>
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-xs text-slate-500">
              <li>全体デフォルト（プラットフォーム）</li>
              <li>事務所ごとの上書き</li>
              <li>自分専用の上書き</li>
            </ol>
          </div>
        </div>
      )}

      {message && <p className="text-sm font-bold text-slate-600">{message}</p>}
    </section>
  );
}
