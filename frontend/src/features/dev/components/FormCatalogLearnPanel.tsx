"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  compileFormCatalogFromSamples,
  deleteFormCatalogSample,
  deletePageAnnotation,
  fetchFormCatalogPromptPreview,
  fetchFormCatalogSamples,
  fetchSamplePageImageBlob,
  fetchSamplePageText,
  savePageAnnotation,
  uploadFormCatalogSample,
  type FormCatalogSample,
  type FormPreset,
  type PageAnnotation,
  type TextMarker,
} from "@/lib/form-catalog-api";

const REGION_OPTIONS = [
  { value: "top_right", label: "右上（様式名）" },
  { value: "header", label: "ページ上部" },
  { value: "any", label: "ページ内" },
  { value: "body", label: "本文" },
] as const;

function regionLabel(region: string): string {
  return REGION_OPTIONS.find((r) => r.value === region)?.label ?? region;
}

export function FormCatalogLearnPanel() {
  const uploadRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [samples, setSamples] = useState<FormCatalogSample[]>([]);
  const [presets, setPresets] = useState<FormPreset[]>([]);
  const [annotationCount, setAnnotationCount] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [phrases, setPhrases] = useState<string[]>([]);
  const [textLoading, setTextLoading] = useState(false);
  const [textEngine, setTextEngine] = useState<string | null>(null);
  const [aiReadBusy, setAiReadBusy] = useState(false);

  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [customFormName, setCustomFormName] = useState("");
  const [markers, setMarkers] = useState<TextMarker[]>([]);
  const [markerRegion, setMarkerRegion] = useState("top_right");
  const [manualPhrase, setManualPhrase] = useState("");
  const [excludeText, setExcludeText] = useState("");
  const [pageNotes, setPageNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [compiling, setCompiling] = useState(false);
  const [compileResult, setCompileResult] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState("");

  const selected = samples.find((s) => s.id === selectedId) ?? null;
  const pageAnnotation = selected?.annotations.find((a) => a.page === page) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFormCatalogSamples();
      setSamples(res.samples);
      setPresets(res.presets);
      setAnnotationCount(res.annotation_count);
      setSelectedId((prev) => {
        if (prev && res.samples.some((s) => s.id === prev)) return prev;
        return res.samples[0]?.id ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setImageUrl(null);
      return;
    }
    let revoked: string | null = null;
    setImageLoading(true);
    void (async () => {
      try {
        const blob = await fetchSamplePageImageBlob(selectedId, page);
        const url = URL.createObjectURL(blob);
        revoked = url;
        setImageUrl(url);
      } catch (e) {
        setError(e instanceof Error ? e.message : "ページ画像の取得に失敗しました");
        setImageUrl(null);
      } finally {
        setImageLoading(false);
      }
    })();
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [selectedId, page]);

  const loadPageText = useCallback(
    async (sampleId: string, pageNum: number, forceAi = false) => {
      setTextLoading(true);
      if (forceAi) setAiReadBusy(true);
      try {
        const res = await fetchSamplePageText(sampleId, pageNum, forceAi);
        setPhrases(res.phrases);
        setTextEngine(res.engine ?? null);
        const hasAnn = samples
          .find((s) => s.id === sampleId)
          ?.annotations.some((a) => a.page === pageNum);
        if (!hasAnn && res.suggested_form?.form_id) {
          setSelectedPresetId(res.suggested_form.form_id);
          setCustomFormName("");
        }
      } catch {
        setPhrases([]);
        setTextEngine(null);
      } finally {
        setTextLoading(false);
        setAiReadBusy(false);
      }
    },
    [samples],
  );

  useEffect(() => {
    if (!selectedId) {
      setPhrases([]);
      setTextEngine(null);
      return;
    }
    void loadPageText(selectedId, page);
  }, [selectedId, page, loadPageText]);

  useEffect(() => {
    if (pageAnnotation) {
      const preset = presets.find((p) => p.form_id === pageAnnotation.form_id);
      setSelectedPresetId(preset?.form_id ?? (pageAnnotation.is_cover ? "cover" : ""));
      setCustomFormName(preset ? "" : pageAnnotation.form_name);
      setMarkers(pageAnnotation.markers ?? []);
      setExcludeText((pageAnnotation.exclude_phrases ?? []).join(", "));
      setPageNotes(pageAnnotation.notes ?? "");
    } else {
      setSelectedPresetId("");
      setCustomFormName("");
      setMarkers([]);
      setExcludeText("");
      setPageNotes("");
    }
  }, [pageAnnotation, presets, page, selectedId]);

  const activePreset = presets.find((p) => p.form_id === selectedPresetId);
  const formName = activePreset?.form_name ?? customFormName.trim();

  const addMarker = (phrase: string) => {
    const p = phrase.trim();
    if (!p || markers.some((m) => m.phrase === p)) return;
    setMarkers((prev) => [...prev, { phrase: p, region: markerRegion, note: "" }]);
  };

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const created = await uploadFormCatalogSample(file);
      await load();
      setSelectedId(created.id);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  };

  const onSavePage = async () => {
    if (!selectedId || !formName) {
      setError("様式名を選択または入力してください");
      return;
    }
    if (markers.length === 0) {
      setError("識別フレーズを1つ以上追加してください（PDF からクリック）");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await savePageAnnotation(selectedId, {
        id: pageAnnotation?.id,
        page,
        form_name: formName,
        form_id: activePreset?.form_id ?? null,
        slot_label: activePreset?.slot_label ?? null,
        tax_type: activePreset?.tax_type ?? null,
        is_cover: activePreset?.is_cover ?? false,
        markers,
        exclude_phrases: excludeText
          .split(/[,、]/)
          .map((s) => s.trim())
          .filter(Boolean),
        notes: pageNotes,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const onDeleteSample = async (sample: FormCatalogSample) => {
    if (!window.confirm(`「${sample.original_filename}」を削除しますか？`)) return;
    try {
      await deleteFormCatalogSample(sample.id);
      if (selectedId === sample.id) setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const onDeleteAnnotation = async (ann: PageAnnotation) => {
    if (!selectedId) return;
    try {
      await deletePageAnnotation(selectedId, ann.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const onCompile = async () => {
    setCompiling(true);
    setError(null);
    try {
      const result = await compileFormCatalogFromSamples();
      setCompileResult(
        `${result.forms_updated} 様式をカタログに反映しました。\n${result.learning_summary.join("\n")}`,
      );
      setPromptText(result.prompt_preview);
    } catch (e) {
      setError(e instanceof Error ? e.message : "反映に失敗しました");
    } finally {
      setCompiling(false);
    }
  };

  const onPreviewPrompt = async () => {
    setPromptOpen(true);
    try {
      const res = await fetchFormCatalogPromptPreview();
      setPromptText(res.prompt_preview);
    } catch (e) {
      setPromptText(e instanceof Error ? e.message : "取得に失敗しました");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        参考資料を読み込み中…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-800/50 bg-indigo-950/30 p-4">
        <div className="flex items-start gap-3">
          <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-indigo-300" />
          <div>
            <p className="text-sm font-bold text-indigo-100">実際の資料を見ながら覚える</p>
            <p className="mt-1 text-xs leading-relaxed text-indigo-200/80">
              事務所で使っている PDF を登録し、「このページは別表一」「ここにこの文言」と教えてください。
              登録内容から AI 分類用のプロンプトを自動生成し、OCR / Vision の精度を上げます。
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-indigo-300/90">
          <span>参考資料 {samples.length} 件</span>
          <span>·</span>
          <span>学習済みページ {annotationCount} 件</span>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      ) : null}

      {compileResult ? (
        <p className="rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-xs whitespace-pre-line text-emerald-100">
          {compileResult}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <input
          ref={uploadRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            void onUpload(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => uploadRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          参考 PDF を追加
        </button>
        <button
          type="button"
          disabled={compiling || annotationCount === 0}
          onClick={() => void onCompile()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {compiling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          カタログに反映して AI プロンプト更新
        </button>
        <button
          type="button"
          onClick={() => void onPreviewPrompt()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800"
        >
          <FileText className="h-3.5 w-3.5" />
          プロンプトをプレビュー
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr_320px]">
        {/* 資料一覧 */}
        <aside className="space-y-2 rounded-xl border border-slate-700 bg-slate-900/60 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">参考資料</p>
          {samples.length === 0 ? (
            <p className="text-xs text-slate-500">PDF を追加してください</p>
          ) : (
            <ul className="space-y-1">
              {samples.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(s.id);
                      setPage(1);
                    }}
                    className={`w-full rounded-lg px-2 py-2 text-left text-xs ${
                      selectedId === s.id
                        ? "bg-indigo-900/60 font-bold text-indigo-100"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <div className="truncate">{s.original_filename}</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      {s.page_count} ページ · 学習 {s.annotations.length} 件
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* PDF プレビュー */}
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
          {!selected ? (
            <p className="py-16 text-center text-sm text-slate-500">左から参考資料を選ぶか、PDF を追加</p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="truncate text-xs font-bold text-white">{selected.original_filename}</p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="rounded border border-slate-600 p-1 text-slate-300 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="min-w-[4rem] text-center text-xs text-slate-400">
                    {page} / {selected.page_count}
                  </span>
                  <button
                    type="button"
                    disabled={page >= selected.page_count}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded border border-slate-600 p-1 text-slate-300 disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDeleteSample(selected)}
                    className="ml-2 rounded p-1 text-slate-500 hover:bg-red-950 hover:text-red-300"
                    aria-label="資料削除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex min-h-[420px] items-center justify-center overflow-auto rounded-lg border border-slate-800 bg-slate-950">
                {imageLoading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
                ) : imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt={`${selected.original_filename} ${page}ページ`} className="max-h-[560px] w-auto" />
                ) : (
                  <p className="text-xs text-slate-500">プレビューなし</p>
                )}
              </div>
              {selected.annotations.length > 0 ? (
                <ul className="mt-3 space-y-1">
                  {selected.annotations.map((ann) => (
                    <li
                      key={ann.id}
                      className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-[11px] ${
                        ann.page === page ? "bg-violet-900/40 text-violet-100" : "text-slate-400"
                      }`}
                    >
                      <button type="button" className="text-left" onClick={() => setPage(ann.page)}>
                        p.{ann.page} → {ann.form_name}
                        <span className="ml-1 text-slate-500">
                          ({ann.markers.map((m) => m.phrase).join(" · ")})
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteAnnotation(ann)}
                        className="text-slate-500 hover:text-red-300"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>

        {/* 注釈パネル */}
        <aside className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <p className="text-xs font-bold text-white">このページの教え方</p>
          {!selected ? (
            <p className="text-xs text-slate-500">資料を選択してください</p>
          ) : (
            <>
              <label className="block text-[11px] text-slate-400">
                このページは何の様式？
                <select
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-2 text-xs text-white"
                  value={selectedPresetId}
                  onChange={(e) => {
                    setSelectedPresetId(e.target.value);
                    if (e.target.value) setCustomFormName("");
                  }}
                >
                  <option value="">— 選択 —</option>
                  {presets.map((p) => (
                    <option key={p.form_id} value={p.form_id}>
                      {p.form_name}
                    </option>
                  ))}
                </select>
              </label>
              {!selectedPresetId ? (
                <label className="block text-[11px] text-slate-400">
                  または自由入力
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-2 text-xs text-white"
                    value={customFormName}
                    onChange={(e) => setCustomFormName(e.target.value)}
                    placeholder="例: 別表二 同族会社の判定"
                  />
                </label>
              ) : null}

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-bold text-slate-400">
                    PDF から読み取った文言 — クリックで「ここにこの文言」として登録
                  </p>
                  {textEngine ? (
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                      {textEngine.includes("gemini") ? "Gemini OCR" : textEngine}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <select
                    className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-[10px] text-slate-300"
                    value={markerRegion}
                    onChange={(e) => setMarkerRegion(e.target.value)}
                  >
                    {REGION_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        位置: {r.label}
                      </option>
                    ))}
                  </select>
                  {selectedId ? (
                    <button
                      type="button"
                      disabled={textLoading || aiReadBusy}
                      onClick={() => void loadPageText(selectedId, page, true)}
                      className="rounded border border-violet-700 bg-violet-950/50 px-2 py-1 text-[10px] font-bold text-violet-200 hover:bg-violet-900/50 disabled:opacity-50"
                    >
                      {aiReadBusy ? "AI 読み取り中…" : "AI で文言を読み取る"}
                    </button>
                  ) : null}
                </div>
                {textLoading ? (
                  <p className="mt-2 text-[10px] text-slate-500">文言を抽出中…</p>
                ) : phrases.length === 0 ? (
                  <p className="mt-2 text-[10px] leading-relaxed text-amber-200/90">
                    テキストが読み取れませんでした。スキャン PDF の場合は「AI で文言を読み取る」を押すか、下の手入力で「別表一」などを追加してください。
                  </p>
                ) : (
                  <div className="mt-2 max-h-32 overflow-y-auto">
                    <div className="flex flex-wrap gap-1">
                      {phrases.map((phrase) => (
                        <button
                          key={phrase}
                          type="button"
                          onClick={() => addMarker(phrase)}
                          className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-200 hover:border-indigo-500 hover:bg-indigo-900/50"
                        >
                          {phrase}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-2 flex gap-1">
                  <input
                    className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-[11px] text-white"
                    value={manualPhrase}
                    onChange={(e) => setManualPhrase(e.target.value)}
                    placeholder="手入力も可"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        addMarker(manualPhrase);
                        setManualPhrase("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      addMarker(manualPhrase);
                      setManualPhrase("");
                    }}
                    className="shrink-0 rounded bg-slate-700 px-2 py-1 text-[10px] font-bold text-white"
                  >
                    追加
                  </button>
                </div>
              </div>

              {markers.length > 0 ? (
                <ul className="space-y-1 rounded-lg border border-slate-700 bg-slate-950/50 p-2">
                  {markers.map((m, i) => (
                    <li key={`${m.phrase}-${i}`} className="flex items-start justify-between gap-2 text-[11px]">
                      <span className="text-slate-200">
                        <span className="text-slate-500">{regionLabel(m.region)}</span>
                        {" 「"}
                        {m.phrase}
                        {"」"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setMarkers((prev) => prev.filter((_, j) => j !== i))}
                        className="text-slate-500 hover:text-red-300"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <label className="block text-[11px] text-slate-400">
                含まれていたら別様式（カンマ区切り）
                <input
                  className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-white"
                  value={excludeText}
                  onChange={(e) => setExcludeText(e.target.value)}
                  placeholder="例: 消費税, 勘定科目内訳"
                />
              </label>

              <label className="block text-[11px] text-slate-400">
                メモ（任意）
                <textarea
                  className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-white"
                  rows={2}
                  value={pageNotes}
                  onChange={(e) => setPageNotes(e.target.value)}
                />
              </label>

              <button
                type="button"
                disabled={saving}
                onClick={() => void onSavePage()}
                className="w-full rounded-lg bg-violet-600 py-2 text-xs font-bold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {saving ? "保存中…" : pageAnnotation ? "このページの教え方を更新" : "このページの教え方を保存"}
              </button>
            </>
          )}
        </aside>
      </div>

      {promptOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-600 bg-slate-900 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <h3 className="text-sm font-bold text-white">AI 分類プロンプト（自動生成）</h3>
              <button type="button" onClick={() => setPromptOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-[11px] leading-relaxed whitespace-pre-wrap text-slate-300">
              {promptText || "（参考資料の登録後に生成されます）"}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
