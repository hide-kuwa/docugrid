"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Play, Sparkles } from "lucide-react";
import {
  fetchIntegrationPortHealth,
  fetchIntegrationPortSample,
  runIntegrationPortTest,
  type IntegrationPortItem,
  type IntegrationPortTestResult,
} from "@/lib/integration-ports-api";

type Props = {
  port: IntegrationPortItem;
};

export function IntegrationPortTestPanel({ port }: Props) {
  const [payloadText, setPayloadText] = useState("");
  const [clientId, setClientId] = useState("client-demo");
  const [periodKey, setPeriodKey] = useState("2025-03");
  const [targetBaseUrl, setTargetBaseUrl] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IntegrationPortTestResult | null>(null);
  const [lastHealth, setLastHealth] = useState<IntegrationPortTestResult | null>(null);

  const loadSample = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const sample = await fetchIntegrationPortSample(port.port_id, {
        clientId,
        periodKey,
        targetBaseUrl,
      });
      setPayloadText(JSON.stringify(sample.payload, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : "サンプル取得に失敗しました");
    } finally {
      setBusy(false);
    }
  }, [port.port_id, clientId, periodKey, targetBaseUrl]);

  const refreshHealth = useCallback(async () => {
    try {
      const h = await fetchIntegrationPortHealth(port.port_id);
      setLastHealth(h.last_test);
    } catch {
      setLastHealth(null);
    }
  }, [port.port_id]);

  useEffect(() => {
    void loadSample();
    void refreshHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- port 切替時のみ
  }, [port.port_id]);

  const onTest = async () => {
    setBusy(true);
    setError(null);
    let payload: Record<string, unknown> | undefined;
    try {
      payload = JSON.parse(payloadText) as Record<string, unknown>;
    } catch {
      setError("payload の JSON が不正です");
      setBusy(false);
      return;
    }
    try {
      const res = await runIntegrationPortTest(port.port_id, {
        dry_run: dryRun,
        payload,
        client_id: clientId,
        period_key: periodKey,
        target_base_url: targetBaseUrl,
      });
      setResult(res);
      setLastHealth(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "テスト送信に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-slate-700 bg-slate-950/50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-500/90">
        テスト送信 / dry-run
      </p>

      <div className="grid gap-2 sm:grid-cols-3">
        <MiniField label="client_id">
          <input
            className={inputClass}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </MiniField>
        <MiniField label="period_key">
          <input
            className={inputClass}
            value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value)}
          />
        </MiniField>
        <MiniField label="target_base_url（本番送信時）">
          <input
            className={inputClass}
            value={targetBaseUrl}
            placeholder="https://accounting.example"
            onChange={(e) => setTargetBaseUrl(e.target.value)}
          />
        </MiniField>
      </div>

      <textarea
        className="min-h-[140px] w-full rounded-lg border border-slate-600 bg-slate-950 p-2 font-mono text-[10px] text-slate-200 focus:border-amber-500 focus:outline-none"
        value={payloadText}
        onChange={(e) => setPayloadText(e.target.value)}
        spellCheck={false}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadSample()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-2.5 py-1 text-[10px] font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          <Sparkles className="h-3 w-3" />
          サンプル再取得
        </button>
        <label className="inline-flex items-center gap-1.5 text-[10px] text-slate-400">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            className="rounded border-slate-600"
          />
          dry-run（SSOT に書かない）
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onTest()}
          className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-amber-500 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          テスト実行
        </button>
      </div>

      {error ? (
        <p className="text-[10px] text-red-300">{error}</p>
      ) : null}

      {result ? <TestResultView result={result} /> : null}

      {lastHealth && !result ? (
        <p className="text-[10px] text-slate-500">
          前回: {lastHealth.status} — {lastHealth.tested_at}
        </p>
      ) : null}
    </div>
  );
}

function TestResultView({ result }: { result: IntegrationPortTestResult }) {
  const tone =
    result.status === "error"
      ? "border-red-800/50 text-red-200"
      : "border-emerald-800/50 text-emerald-200";

  return (
    <div className={`rounded-lg border px-3 py-2 text-[10px] ${tone}`}>
      <p className="font-bold">
        {result.status} — {result.message}
      </p>
      {result.http_method ? (
        <p className="mt-1 font-mono text-slate-400">
          {result.http_method} {result.url || "—"}
        </p>
      ) : null}
      {result.idempotency_key ? (
        <p className="mt-1 font-mono text-slate-400">idem: {result.idempotency_key}</p>
      ) : null}
      {result.validation_errors.length > 0 ? (
        <ul className="mt-1 list-inside list-disc">
          {result.validation_errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      {result.response_status != null ? (
        <p className="mt-1">HTTP {result.response_status}</p>
      ) : null}
    </div>
  );
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[9px] font-bold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-[10px] text-slate-200 focus:border-amber-500 focus:outline-none";
