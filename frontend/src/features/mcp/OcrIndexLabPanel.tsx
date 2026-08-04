"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  Download,
  FileText,
  FlaskConical,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import {
  createOcrJob,
  fetchOcrDocument,
  fetchOcrStatus,
  pollOcrJob,
  searchOcrExcerpts,
  type OcrIndexStateItem,
} from "@/features/docugrid/lib/ocr-jobs-api";
import {
  FeatureSurfaceBanner,
  FeatureSurfaceSection,
} from "@/features/feature-surfaces/FeatureSurfaceGate";
import { useFeatureSurface } from "@/features/feature-surfaces/useFeatureSurface";
import {
  createAccuracyLabEntry,
  deleteAccuracyLabEntry,
  exportAccuracyLabMarkdown,
  fetchAccuracyLabEntries,
  fetchAccuracyLabPresets,
  publishAccuracyLabDocs,
  saveAccuracyLabPresets,
  snapshotAccuracyLab,
  type AccuracyLabEntry,
  type AccuracyLabPresets,
  type AccuracyOutcome,
} from "@/features/mcp/accuracy-lab-api";
import { fetchClientMaster } from "@/lib/client-master-api";
import { parseApiErrorBody } from "@/lib/parse-api-error";

const FEATURE_ID = "rag.mcp_search";

const STATUS_FILTERS = [
  { value: "", label: "すべて" },
  { value: "ready", label: "ready" },
  { value: "processing", label: "processing" },
  { value: "failed", label: "failed" },
  { value: "pending", label: "pending" },
] as const;

const OUTCOME_BTNS: { value: AccuracyOutcome; label: string; className: string }[] = [
  { value: "ok", label: "意図どおり", className: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  { value: "partial", label: "部分的", className: "border-amber-300 bg-amber-50 text-amber-900" },
  { value: "fail", label: "ダメ", className: "border-rose-300 bg-rose-50 text-rose-900" },
];

export function OcrIndexLabPanel() {
  const gate = useFeatureSurface(FEATURE_ID);
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [clientId, setClientId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [versionId, setVersionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [statusItems, setStatusItems] = useState<OcrIndexStateItem[]>([]);
  const [searchItems, setSearchItems] = useState<OcrIndexStateItem[]>([]);
  const [docPayload, setDocPayload] = useState<Record<string, unknown> | null>(null);

  const [presets, setPresets] = useState<AccuracyLabPresets | null>(null);
  const [presetDraft, setPresetDraft] = useState("");
  const [entries, setEntries] = useState<AccuracyLabEntry[]>([]);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteOutcome, setNoteOutcome] = useState<AccuracyOutcome>("fail");

  useEffect(() => {
    let cancelled = false;
    void fetchClientMaster()
      .then((data) => {
        if (cancelled) return;
        const list = (data.clients ?? []).map((c) => ({ id: c.id, name: c.name }));
        setClients(list);
        setClientId((prev) => prev || list[0]?.id || "");
      })
      .catch(() => {
        if (!cancelled) setClients([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reloadJournal = useCallback(async () => {
    try {
      const [p, e] = await Promise.all([
        fetchAccuracyLabPresets(),
        fetchAccuracyLabEntries({ limit: 40 }),
      ]);
      setPresets(p);
      setPresetDraft((p.trial_keywords || []).join("\n"));
      setEntries(e.items);
    } catch {
      /* settings.manage がない場合は黙ってスキップ */
    }
  }, []);

  useEffect(() => {
    if (gate.mode === "planned" || gate.loading) return;
    void reloadJournal();
  }, [gate.mode, gate.loading, reloadJournal]);

  const logAuto = useCallback(
    async (args: {
      kind: "search" | "ocr" | "get_document" | "status" | "failure";
      title: string;
      outcome: AccuracyOutcome;
      body?: string;
      context?: Record<string, unknown>;
    }) => {
      try {
        await createAccuracyLabEntry({
          source: "auto",
          kind: args.kind,
          title: args.title,
          outcome: args.outcome,
          body: args.body || "",
          client_id: clientId || undefined,
          context: args.context || {},
          tags: ["accuracy-lab", args.kind],
        });
        await reloadJournal();
      } catch {
        /* ignore journal errors so lab stays usable */
      }
    },
    [clientId, reloadJournal],
  );

  const runStatus = useCallback(async () => {
    if (!clientId) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetchOcrStatus(clientId, {
        ocrStatus: statusFilter || undefined,
        limit: 100,
      });
      setStatusItems(res.items);
      setMessage(`状態 ${res.count} 件`);
      const failed = res.items.filter((i) => i.ocr_status === "failed").length;
      if (failed > 0) {
        await logAuto({
          kind: "status",
          title: `OCR failed ${failed} / ${res.count}`,
          outcome: "partial",
          body: `状態一覧で failed が ${failed} 件ありました。`,
          context: { statusFilter, count: res.count, failed },
        });
      }
    } catch (e) {
      const err = parseApiErrorBody(e) || "状態の取得に失敗しました";
      setMessage(err);
      setStatusItems([]);
      await logAuto({
        kind: "failure",
        title: "状態取得失敗",
        outcome: "fail",
        body: err,
        context: { statusFilter, action: "status" },
      });
    } finally {
      setBusy(false);
    }
  }, [clientId, statusFilter, logAuto]);

  const runSearch = useCallback(async () => {
    if (!clientId || !keyword.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await searchOcrExcerpts(clientId, keyword.trim(), 50, "hybrid");
      setSearchItems(res.items as OcrIndexStateItem[]);
      setMessage(`検索「${res.query}」[${res.mode || "hybrid"}] → ${res.count} 件`);
      if (res.count === 0) {
        await logAuto({
          kind: "search",
          title: `検索ゼロ件: ${res.query}`,
          outcome: "fail",
          body: "期待ヒットがある場合は手動メモも残してください。",
          context: { keyword: res.query, count: 0 },
        });
      }
    } catch (e) {
      const err = parseApiErrorBody(e) || "検索に失敗しました";
      setMessage(err);
      setSearchItems([]);
      await logAuto({
        kind: "failure",
        title: `検索エラー: ${keyword.trim()}`,
        outcome: "fail",
        body: err,
        context: { keyword: keyword.trim(), action: "search" },
      });
    } finally {
      setBusy(false);
    }
  }, [clientId, keyword, logAuto]);

  const runGetDocument = useCallback(async () => {
    if (!clientId || !versionId.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const doc = await fetchOcrDocument(clientId, versionId.trim());
      setDocPayload(doc);
      setMessage("資料メタを取得しました");
      const excerpt = String(doc.text_excerpt || "");
      if (!excerpt.trim()) {
        await logAuto({
          kind: "get_document",
          title: `抜粋なし: ${versionId.trim().slice(0, 12)}`,
          outcome: "partial",
          body: "メタは取れたが text_excerpt が空です。",
          context: { document_version_id: versionId.trim(), ocr_status: doc.ocr_status },
        });
      }
    } catch (e) {
      const err = parseApiErrorBody(e) || "資料の取得に失敗しました";
      setMessage(err);
      setDocPayload(null);
      await logAuto({
        kind: "failure",
        title: "メタ取得失敗",
        outcome: "fail",
        body: err,
        context: { document_version_id: versionId.trim(), action: "get_document" },
      });
    } finally {
      setBusy(false);
    }
  }, [clientId, versionId, logAuto]);

  const runTriggerOcr = useCallback(
    async (force: boolean) => {
      if (!clientId || !versionId.trim()) return;
      if (!gate.writesAllowed && force) {
        setMessage("本番モード以外では強制再OCRはできません。機能の公開で「本番」に切替えてください。");
        return;
      }
      setBusy(true);
      setMessage("");
      try {
        const job = await createOcrJob({
          clientId,
          documentVersionId: versionId.trim(),
          force,
        });
        if (job.reused || job.status === "done") {
          setMessage(`再利用または完了: job=${job.id} status=${job.status}`);
          await runStatus();
          return;
        }
        setMessage(`キュー投入: ${job.id} … 完了待ち`);
        const finished = await pollOcrJob(job.id, clientId);
        setMessage(`OCR 完了: status=${finished.status}`);
        if (finished.status === "failed") {
          await logAuto({
            kind: "ocr",
            title: `OCR failed: ${versionId.trim().slice(0, 12)}`,
            outcome: "fail",
            body: finished.error_message || "OCR ジョブが failed になりました。",
            context: {
              document_version_id: versionId.trim(),
              job_id: finished.id,
              force,
            },
          });
        }
        await runStatus();
      } catch (e) {
        const err = parseApiErrorBody(e) || "OCR 起動に失敗しました";
        setMessage(err);
        await logAuto({
          kind: "failure",
          title: "OCR 起動失敗",
          outcome: "fail",
          body: err,
          context: { document_version_id: versionId.trim(), force },
        });
      } finally {
        setBusy(false);
      }
    },
    [clientId, versionId, gate.writesAllowed, runStatus, logAuto],
  );

  const rateSearch = useCallback(
    async (outcome: AccuracyOutcome) => {
      if (!keyword.trim()) return;
      setBusy(true);
      try {
        await createAccuracyLabEntry({
          source: "manual",
          kind: "rating",
          title: `検索評価: ${keyword.trim()}`,
          outcome,
          body: `ヒット ${searchItems.length} 件を「${outcome}」と評価。`,
          client_id: clientId || undefined,
          context: {
            keyword: keyword.trim(),
            hit_count: searchItems.length,
            hit_ids: searchItems.slice(0, 20).map((i) => i.document_version_id),
          },
          tags: ["accuracy-lab", "rating", "search"],
        });
        setMessage(`検索結果を「${outcome}」として記録しました`);
        await reloadJournal();
      } catch (e) {
        setMessage(parseApiErrorBody(e) || "評価の保存に失敗しました");
      } finally {
        setBusy(false);
      }
    },
    [keyword, searchItems, clientId, reloadJournal],
  );

  const saveManualNote = useCallback(async () => {
    if (!noteTitle.trim()) {
      setMessage("手動メモにはタイトルが必要です");
      return;
    }
    setBusy(true);
    try {
      await createAccuracyLabEntry({
        source: "manual",
        kind: "note",
        title: noteTitle.trim(),
        outcome: noteOutcome,
        body: noteBody,
        client_id: clientId || undefined,
        context: {
          keyword: keyword || undefined,
          document_version_id: versionId || undefined,
          statusFilter: statusFilter || undefined,
        },
        tags: ["accuracy-lab", "manual"],
      });
      setNoteTitle("");
      setNoteBody("");
      setMessage("手動メモを保存しました");
      await reloadJournal();
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "メモの保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }, [noteTitle, noteBody, noteOutcome, clientId, keyword, versionId, statusFilter, reloadJournal]);

  const saveKeywords = useCallback(async () => {
    setBusy(true);
    try {
      const keywords = presetDraft
        .split(/\r?\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);
      const saved = await saveAccuracyLabPresets({ trial_keywords: keywords });
      setPresets(saved);
      setMessage(`試行キーワードを ${keywords.length} 件保存しました`);
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "プリセット保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }, [presetDraft]);

  const downloadMd = useCallback(async () => {
    setBusy(true);
    try {
      const md = await exportAccuracyLabMarkdown();
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `accuracy-lab-${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
      URL.revokeObjectURL(url);
      await snapshotAccuracyLab();
      setMessage("Markdown をダウンロードし、事務所ストレージにもスナップショットしました");
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "エクスポートに失敗しました");
    } finally {
      setBusy(false);
    }
  }, []);

  const publishDocs = useCallback(async () => {
    setBusy(true);
    try {
      const res = await publishAccuracyLabDocs();
      setMessage(
        `ドキュメント化しました: ${res.docs_path || "docs/accuracy-lab-findings.md"}（コード改修時の参考用）`,
      );
    } catch (e) {
      setMessage(parseApiErrorBody(e) || "ドキュメント化に失敗しました");
    } finally {
      setBusy(false);
    }
  }, []);

  if (gate.loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        公開状態を確認中…
      </div>
    );
  }

  if (gate.mode === "planned") {
    return (
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <FeatureSurfaceBanner featureId={FEATURE_ID} />
        <p className="mt-3 text-sm text-slate-600">
          OCR / 社内検索ラボは工事中です。設定 →{" "}
          <strong>機能の公開</strong> で「RAG / MCP 社内検索ラボ」を
          <strong>見本のみ</strong>または<strong>本番</strong>にすると、コードなしで実験できます。
        </p>
      </article>
    );
  }

  return (
    <FeatureSurfaceSection
      featureId={FEATURE_ID}
      bodyClassName="space-y-5 p-4"
      fallbackMessage="精度向上のための実験ラボです。失敗は自動記録、手動メモとドキュメント化もできます。"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <FlaskConical className="mt-0.5 h-5 w-5 text-violet-700" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">OCR / 精度実験ラボ</h3>
            <p className="mt-1 text-xs text-slate-500">
              プリセット語で試し、ダメなら自動／手動で残し、Markdown 化してコード改修の参考にします。
            </p>
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
          {gate.badge}
        </span>
      </header>

      <section className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-slate-600">試行キーワード（ノーコード）</h4>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveKeywords()}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            キーワード保存
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(presets?.trial_keywords || []).map((kw) => (
            <button
              key={kw}
              type="button"
              disabled={busy || !clientId}
              onClick={() => {
                setKeyword(kw);
                void (async () => {
                  setKeyword(kw);
                  setBusy(true);
                  setMessage("");
                  try {
                    const res = await searchOcrExcerpts(clientId, kw, 50, "hybrid");
                    setSearchItems(res.items);
                    setMessage(`検索「${res.query}」→ ${res.count} 件`);
                    if (res.count === 0) {
                      await logAuto({
                        kind: "search",
                        title: `検索ゼロ件: ${res.query}`,
                        outcome: "fail",
                        body: "プリセット語でヒットなし。",
                        context: { keyword: res.query, count: 0, preset: true },
                      });
                    }
                  } catch (e) {
                    const err = parseApiErrorBody(e) || "検索に失敗しました";
                    setMessage(err);
                    await logAuto({
                      kind: "failure",
                      title: `検索エラー: ${kw}`,
                      outcome: "fail",
                      body: err,
                      context: { keyword: kw, preset: true },
                    });
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              className="rounded-full border border-violet-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-violet-800 hover:bg-violet-50 disabled:opacity-50"
            >
              {kw}
            </button>
          ))}
        </div>
        <textarea
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-[11px] text-slate-700"
          rows={3}
          value={presetDraft}
          onChange={(e) => setPresetDraft(e.target.value)}
          placeholder={"1行に1キーワード\n源泉徴収\n法人税申告書"}
        />
        {presets?.check_prompts?.length ? (
          <ul className="list-inside list-disc text-[11px] text-slate-500">
            {presets.check_prompts.map((p, i) => (
              <li key={typeof p === "string" ? p : p.id || i}>
                {typeof p === "string" ? p : p.label || p.id}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-600">
          顧問先
          <select
            className="mt-1 block min-w-[12rem] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            {clients.length === 0 ? <option value="">（顧客なし）</option> : null}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.id})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          状態フィルタ
          <select
            className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value || "all"} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy || !clientId}
          onClick={() => void runStatus()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-900 disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          状態を取得
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[14rem] flex-1 text-xs text-slate-600">
          ハイブリッド検索（キーワード + RAG）
          <input
            className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="例: この顧客の源泉徴収票"
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch();
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy || !clientId || !keyword.trim()}
          onClick={() => void runSearch()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
        >
          <Search className="h-3.5 w-3.5" />
          検索
        </button>
      </div>

      {searchItems.length > 0 || keyword ? (
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-[11px] text-slate-500">この検索結果を評価:</span>
          {OUTCOME_BTNS.map((b) => (
            <button
              key={b.value}
              type="button"
              disabled={busy || !keyword.trim()}
              onClick={() => void rateSearch(b.value)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold disabled:opacity-50 ${b.className}`}
            >
              {b.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
        <label className="min-w-[14rem] flex-1 text-xs text-slate-600">
          document_version_id
          <input
            className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-xs"
            value={versionId}
            onChange={(e) => setVersionId(e.target.value)}
            placeholder="一覧の行をクリックでも入力されます"
          />
        </label>
        <button
          type="button"
          disabled={busy || !versionId.trim()}
          onClick={() => void runGetDocument()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          メタ取得
        </button>
        <button
          type="button"
          disabled={busy || !versionId.trim()}
          onClick={() => void runTriggerOcr(false)}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          OCR 実行
        </button>
        <button
          type="button"
          disabled={busy || !versionId.trim() || !gate.writesAllowed}
          title={
            gate.writesAllowed
              ? "ready でも再実行"
              : "本番モードでのみ強制再実行できます"
          }
          onClick={() => void runTriggerOcr(true)}
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          強制再OCR
        </button>
      </div>

      {message ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{message}</p>
      ) : null}

      <ResultTable title="OCR 状態" items={statusItems} onPick={(id) => setVersionId(id)} />
      <ResultTable title="検索ヒット" items={searchItems} onPick={(id) => setVersionId(id)} />

      {docPayload ? (
        <pre className="max-h-64 overflow-auto rounded-xl border border-slate-200 bg-slate-950 p-3 text-[11px] text-slate-100">
          {JSON.stringify(docPayload, null, 2)}
        </pre>
      ) : null}

      <section className="space-y-2 border-t border-slate-100 pt-4">
        <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <BookOpen className="h-3.5 w-3.5" />
          手動メモ（ダメだった理由・期待との差）
        </h4>
        <input
          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="タイトル（例: 源泉徴収で別法人の明細が混ざる）"
          value={noteTitle}
          onChange={(e) => setNoteTitle(e.target.value)}
        />
        <textarea
          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          rows={3}
          placeholder="再現手順・期待・実際・直し方の仮説"
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          {OUTCOME_BTNS.map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() => setNoteOutcome(b.value)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${
                noteOutcome === b.value ? b.className : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {b.label}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveManualNote()}
            className="ml-auto rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-900 disabled:opacity-50"
          >
            メモを残す
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-slate-700">実験ジャーナル</h4>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void reloadJournal()}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700"
            >
              再読込
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void downloadMd()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700"
            >
              <Download className="h-3 w-3" />
              MDダウンロード
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void publishDocs()}
              className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-900"
            >
              <FileText className="h-3 w-3" />
              ドキュメント化
            </button>
          </div>
        </div>
        {entries.length === 0 ? (
          <p className="text-[11px] text-slate-500">まだ記録がありません。検索や OCR を試すと自動で残ります。</p>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {entries.map((e) => (
              <li
                key={e.id}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-800">{e.title}</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      {e.created_at.slice(0, 19)} · {e.source}/{e.kind} · {e.outcome}
                      {e.created_by ? ` · ${e.created_by}` : ""}
                    </div>
                    {e.body ? <p className="mt-1 whitespace-pre-wrap text-slate-600">{e.body}</p> : null}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-slate-400 hover:text-rose-600"
                    title="削除"
                    onClick={() => {
                      void (async () => {
                        try {
                          await deleteAccuracyLabEntry(e.id);
                          await reloadJournal();
                        } catch (err) {
                          setMessage(parseApiErrorBody(err) || "削除に失敗しました");
                        }
                      })();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </FeatureSurfaceSection>
  );
}

function ResultTable({
  title,
  items,
  onPick,
}: {
  title: string;
  items: OcrIndexStateItem[];
  onPick: (versionId: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {title} ({items.length})
      </h4>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-bold">version</th>
              <th className="px-3 py-2 font-bold">status</th>
              <th className="px-3 py-2 font-bold">indexed</th>
              <th className="px-3 py-2 font-bold">excerpt</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr
                key={row.document_version_id}
                className="cursor-pointer border-t border-slate-100 hover:bg-violet-50/60"
                onClick={() => onPick(row.document_version_id)}
              >
                <td className="px-3 py-2 font-mono text-[11px] text-slate-700">
                  {row.document_version_id.slice(0, 12)}…
                </td>
                <td className="px-3 py-2">{row.ocr_status}</td>
                <td className="px-3 py-2 text-slate-500">
                  {row.indexed_at ? String(row.indexed_at).slice(0, 19) : "—"}
                </td>
                <td className="max-w-xs truncate px-3 py-2 text-slate-600">
                  {row.text_excerpt || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
