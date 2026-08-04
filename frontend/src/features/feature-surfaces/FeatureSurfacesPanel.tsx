"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfigSheetIntro } from "@/features/config/components/ConfigSheetIntro";
import { parseApiErrorBody } from "@/lib/parse-api-error";
import {
  fetchFeatureSurfacesEditor,
  saveFeatureSurfacesLayer,
  type FeatureSurface,
  type FeatureSurfaceMode,
} from "./feature-surfaces-api";
import { invalidateFeatureSurfacesCache } from "./useFeatureSurface";

const MODE_OPTIONS: { value: FeatureSurfaceMode; label: string; hint: string }[] = [
  { value: "live", label: "本番", hint: "通常どおり利用・保存できる" },
  { value: "preview", label: "見本のみ", hint: "見せるだけ。保存・確定は不可" },
  { value: "partial", label: "一部未完成", hint: "一部だけ動く。書き込みは制限" },
  { value: "planned", label: "工事中", hint: "まだ使えない。枠と説明だけ" },
];

type LayerTab = "platform" | "firm";

export function FeatureSurfacesPanel() {
  const [layer, setLayer] = useState<LayerTab>("firm");
  const [surfaces, setSurfaces] = useState<FeatureSurface[]>([]);
  const [draft, setDraft] = useState<Record<string, FeatureSurfaceMode>>({});
  const [canEditPlatform, setCanEditPlatform] = useState(false);
  const [canEditFirm, setCanEditFirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const data = await fetchFeatureSurfacesEditor();
      setCanEditPlatform(data.canEditPlatform);
      setCanEditFirm(data.canEditFirm);
      setSurfaces(data.resolved.surfaces);
      const sourceModes =
        layer === "platform" ? data.platform.modes || {} : data.firm.modes || {};
      const next: Record<string, FeatureSurfaceMode> = {};
      for (const s of data.resolved.surfaces) {
        const override = sourceModes[s.id] as FeatureSurfaceMode | undefined;
        next[s.id] = override || s.mode;
      }
      setDraft(next);
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [layer]);

  useEffect(() => {
    void load();
  }, [load]);

  const editable =
    (layer === "platform" && canEditPlatform) || (layer === "firm" && canEditFirm);

  const grouped = useMemo(() => {
    const map = new Map<string, FeatureSurface[]>();
    for (const s of surfaces) {
      const g = s.group || "other";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(s);
    }
    return [...map.entries()];
  }, [surfaces]);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      await saveFeatureSurfacesLayer(layer, draft);
      invalidateFeatureSurfacesCache();
      setMessage("保存しました。各画面のバナーは次回読み込みから反映されます。");
      await load();
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const resetToCatalog = (id: string, defaultMode: FeatureSurfaceMode) => {
    setDraft((prev) => ({ ...prev, [id]: defaultMode }));
  };

  return (
    <section className="fade-in-up space-y-4">
      <ConfigSheetIntro
        sheetId="featureSurfaces"
        sheetLabel="FEATURE GATES"
        title="機能の公開状態"
        description="工事中・見本のみ・本番をノーコードで切り替えます。コード変更は機能 ID の追加時だけです。AI グループの「社内検索ラボ」を見本/本番にすると、設定 → AI / MCP から OCR・検索を実験できます。"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setLayer("firm")}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
            layer === "firm" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"
          }`}
        >
          事務所上書き
        </button>
        <button
          type="button"
          onClick={() => setLayer("platform")}
          disabled={!canEditPlatform}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-40 ${
            layer === "platform"
              ? "bg-slate-900 text-white"
              : "border border-slate-300 bg-white text-slate-700"
          }`}
        >
          プラットフォーム既定
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!editable || saving || loading}
          className="ml-auto rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40"
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>

      {message ? <p className="text-xs text-slate-600">{message}</p> : null}
      {loading ? <p className="text-sm text-slate-500">読み込み中…</p> : null}

      {!loading &&
        grouped.map(([group, items]) => (
          <div key={group} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              {group}
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-white text-[11px] text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">機能</th>
                  <th className="px-4 py-2 font-semibold">状態</th>
                  <th className="px-4 py-2 font-semibold">解決元</th>
                  <th className="px-4 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 align-top">
                      <div className="font-semibold text-slate-900">{s.label}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">{s.description}</div>
                      <code className="mt-1 block text-[10px] text-slate-400">{s.id}</code>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <select
                        value={draft[s.id] || s.mode}
                        disabled={!editable}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [s.id]: e.target.value as FeatureSurfaceMode,
                          }))
                        }
                        className="w-full max-w-[11rem] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        {MODE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value} title={opt.hint}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[10px] text-slate-500">
                        {MODE_OPTIONS.find((o) => o.value === (draft[s.id] || s.mode))?.hint}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-slate-600">{s.source}</td>
                    <td className="px-4 py-3 align-top">
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() => resetToCatalog(s.id, s.default_mode)}
                        className="text-[11px] font-semibold text-blue-700 hover:underline disabled:opacity-40"
                      >
                        カタログ既定に戻す
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </section>
  );
}
