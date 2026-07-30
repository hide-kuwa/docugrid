"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, Save, Sparkles, Upload } from "lucide-react";
import {
  aiPromptLabel,
  fetchAiPrompts,
  resetAiPrompt,
  saveAiPrompt,
  testAiPrompt,
  type AiPromptDefinition,
  type AiPromptScope,
  type AiPromptTestResult,
} from "@/lib/ai-prompts-api";

type Props = {
  scope: AiPromptScope;
  /** global scope editor can choose firm vs global save target */
  allowGlobalSave?: boolean;
  className?: string;
};

const SOURCE_LABELS: Record<string, string> = {
  firm: "事務所上書き",
  global: "全体デフォルト",
  builtin: "組み込み既定",
};

export function AiPromptEditorPanel({ scope, allowGlobalSave = false, className = "" }: Props) {
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [prompts, setPrompts] = useState<AiPromptDefinition[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeKey, setActiveKey] = useState<string>("classify_text");
  const [saveScope, setSaveScope] = useState<AiPromptScope>(scope === "global" ? "global" : "firm");
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [testResult, setTestResult] = useState<AiPromptTestResult | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAiPrompts(scope);
      setPrompts(data.prompts);
      const nextDrafts: Record<string, string> = {};
      for (const p of data.prompts) {
        nextDrafts[p.key] = p.template;
      }
      setDrafts(nextDrafts);
      if (data.prompts.length && !data.prompts.some((p) => p.key === activeKey)) {
        setActiveKey(data.prompts[0].key);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "プロンプトの読込に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [scope, activeKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const activePrompt = useMemo(
    () => prompts.find((p) => p.key === activeKey) ?? null,
    [prompts, activeKey],
  );

  const handleSave = async (key: string) => {
    setSavingKey(key);
    setError("");
    setMessage("");
    try {
      const saved = await saveAiPrompt(scope, key, drafts[key] ?? "", saveScope);
      setMessage(`${aiPromptLabel(key)} を保存しました（${SOURCE_LABELS[saved.source] ?? saved.source}）`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSavingKey(null);
    }
  };

  const handleReset = async (key: string) => {
    setSavingKey(key);
    setError("");
    setMessage("");
    try {
      const saved = await resetAiPrompt(scope, key, saveScope);
      setDrafts((prev) => ({ ...prev, [key]: saved.template }));
      setMessage(`${aiPromptLabel(key)} をリセットしました`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "リセットに失敗しました");
    } finally {
      setSavingKey(null);
    }
  };

  const handleTest = async (key: string) => {
    if (!sampleFile) {
      setError("テスト用の PDF を選択してください");
      return;
    }
    setTestingKey(key);
    setError("");
    setMessage("");
    setTestResult(null);
    try {
      const result = await testAiPrompt(scope, key, sampleFile, drafts[key] ?? "");
      setTestResult(result);
      if (result.error) {
        setError(result.error);
      } else {
        setMessage(`テスト完了: engine=${result.engine}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "テスト実行に失敗しました");
    } finally {
      setTestingKey(null);
    }
  };

  const insertVariable = (variable: string) => {
    const token = `{${variable}}`;
    setDrafts((prev) => ({
      ...prev,
      [activeKey]: `${prev[activeKey] ?? ""}${prev[activeKey]?.endsWith("\n") || !prev[activeKey] ? "" : "\n"}${token}`,
    }));
  };

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-sm text-slate-500 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        プロンプトを読込中…
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-800">AI 分類プロンプト</p>
          <p className="mt-1 text-xs text-slate-500">
            変数はクリックで挿入できます。保存前にサンプル PDF でテスト実行してください。
          </p>
        </div>
        {allowGlobalSave && (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            保存先
            <select
              className="rounded border border-slate-200 px-2 py-1 text-xs"
              value={saveScope}
              onChange={(e) => setSaveScope(e.target.value as AiPromptScope)}
            >
              <option value="global">全体デフォルト</option>
              <option value="firm">この事務所のみ</option>
            </select>
          </label>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {message && <p className="text-xs text-emerald-700">{message}</p>}

      <div className="flex flex-wrap gap-2">
        {prompts.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setActiveKey(p.key);
              setTestResult(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              activeKey === p.key
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {aiPromptLabel(p.key)}
          </button>
        ))}
      </div>

      {activePrompt && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-500">
              適用元: <span className="font-bold text-slate-700">{SOURCE_LABELS[activePrompt.source] ?? activePrompt.source}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDrafts((prev) => ({ ...prev, [activeKey]: activePrompt.builtin_default }))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                組み込みに戻す
              </button>
              <button
                type="button"
                disabled={savingKey === activeKey}
                onClick={() => void handleReset(activeKey)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                上書き削除
              </button>
              <button
                type="button"
                disabled={savingKey === activeKey}
                onClick={() => void handleSave(activeKey)}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {savingKey === activeKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                保存
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {activePrompt.variables.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => insertVariable(v)}
                className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-600 hover:bg-slate-100"
              >
                {`{${v}}`}
              </button>
            ))}
          </div>

          <textarea
            className="mt-3 min-h-[220px] w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800"
            value={drafts[activeKey] ?? ""}
            onChange={(e) => setDrafts((prev) => ({ ...prev, [activeKey]: e.target.value }))}
          />

          <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-700">サンプル PDF でテスト</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                <Upload className="h-3.5 w-3.5" />
                PDF を選択
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setSampleFile(f);
                    setTestResult(null);
                  }}
                />
              </label>
              {sampleFile && <span className="text-xs text-slate-500">{sampleFile.name}</span>}
              <button
                type="button"
                disabled={!sampleFile || testingKey === activeKey}
                onClick={() => void handleTest(activeKey)}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {testingKey === activeKey ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                テスト実行
              </button>
            </div>
          </div>

          {testResult && testResult.key === activeKey && (
            <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-slate-600">
                <span className="font-bold">engine:</span> {testResult.engine}
                {testResult.text_excerpt && (
                  <>
                    {" "}
                    · <span className="font-bold">excerpt:</span> {testResult.text_excerpt.slice(0, 120)}
                    {testResult.text_excerpt.length > 120 ? "…" : ""}
                  </>
                )}
              </div>
              {testResult.parsed != null && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">parsed</p>
                  <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-white p-2 font-mono text-[10px] text-slate-700">
                    {JSON.stringify(testResult.parsed, null, 2)}
                  </pre>
                </div>
              )}
              {testResult.raw_response != null && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">raw response</p>
                  <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-white p-2 font-mono text-[10px] text-slate-700">
                    {JSON.stringify(testResult.raw_response, null, 2)}
                  </pre>
                </div>
              )}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">prompt used</p>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-2 font-mono text-[10px] text-slate-700">
                  {testResult.prompt_used}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
