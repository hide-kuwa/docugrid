"use client";

import { useCallback, useMemo, useState } from "react";
import { Copy, KeyRound, RefreshCw, Shield } from "lucide-react";
import { API_BASE } from "@/config/api";
import type { DocugridUser } from "@/lib/auth";
import {
  buildMcpCursorConfig,
  formatExpiresAt,
  issueMcpToken,
  type McpTokenPayload,
} from "@/lib/mcp-token-api";

type Props = {
  user: DocugridUser | null;
  embedded?: boolean;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function McpConnectPanel({ user, embedded = false }: Props) {
  const [tokenPayload, setTokenPayload] = useState<McpTokenPayload | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [mcpPath, setMcpPath] = useState("");

  const configJson = useMemo(() => {
    if (!tokenPayload) return "";
    return buildMcpCursorConfig(tokenPayload.access_token, mcpPath || undefined);
  }, [tokenPayload, mcpPath]);

  const maskedToken = tokenPayload
    ? revealed
      ? tokenPayload.access_token
      : `${tokenPayload.access_token.slice(0, 12)}…${tokenPayload.access_token.slice(-8)}`
    : "";

  const handleIssue = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const payload = await issueMcpToken();
      setTokenPayload(payload);
      setRevealed(false);
      setMessage("MCP 用トークンを発行しました。有効期限までに Cursor に設定してください。");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "発行に失敗しました");
      setTokenPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className={embedded ? "space-y-6" : "mx-auto max-w-3xl space-y-6"}>
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-violet-700">
          <KeyRound className="h-5 w-5" />
          {embedded ? (
            <h2 className="text-lg font-bold text-slate-800">AI / MCP 連携</h2>
          ) : (
            <h1 className="text-xl font-black text-slate-800">AI / MCP 連携</h1>
          )}
        </div>
        <p className="text-sm text-slate-600">
          Cursor などの AI クライアントから DocuGrid を操作するための<strong>個人専用トークン</strong>
          を発行します。権限は {user?.email ?? "ログイン中のユーザー"} と同じ範囲に限定されます。
        </p>
      </header>

      <article className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950">
        <div className="flex gap-2 font-bold">
          <Shield className="mt-0.5 h-4 w-4 shrink-0" />
          セキュリティ上の注意
        </div>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-relaxed">
          <li>トークンは他人と共有しないでください（担当外の顧問先データにアクセスできます）</li>
          <li>Git にコミットしないでください（`.cursor/mcp.json` は .gitignore 済み）</li>
          <li>短命トークン（既定 1 時間）— 期限切れ後は再発行が必要です</li>
          <li>MCP 操作は監査ログに <code className="rounded bg-amber-100 px-1">channel=mcp</code> として記録されます</li>
        </ul>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800">ステップ 1 — トークン発行</h2>
            <p className="mt-1 text-xs text-slate-500">
              現在のログインセッションと同じロール・顧問先スコープで JWT を発行します。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleIssue()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "発行中…" : tokenPayload ? "トークンを再発行" : "トークンを発行"}
          </button>
        </div>

        {tokenPayload && (
          <div className="mt-4 space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-slate-600">
                有効期限: {formatExpiresAt(tokenPayload.expires_at)}（{Math.round(tokenPayload.expires_in / 60)} 分）
              </span>
              <span className="rounded-full bg-violet-100 px-2 py-0.5 font-mono text-[10px] text-violet-800">
                aud={tokenPayload.audience}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="block max-w-full flex-1 overflow-x-auto rounded border border-slate-200 bg-white px-3 py-2 font-mono text-[10px] text-slate-700">
                {maskedToken}
              </code>
              <button
                type="button"
                onClick={() => setRevealed((v) => !v)}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
              >
                {revealed ? "隠す" : "表示"}
              </button>
              <button
                type="button"
                onClick={() => void copyText(tokenPayload.access_token).then((ok) => setMessage(ok ? "トークンをコピーしました" : "コピーに失敗しました"))}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
              >
                <Copy className="h-3 w-3" />
                トークン
              </button>
            </div>
          </div>
        )}

        {message && <p className="mt-3 text-xs text-slate-600">{message}</p>}
      </article>

      {tokenPayload && (
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800">ステップ 2 — Cursor に設定</h2>
          <p className="mt-1 text-xs text-slate-500">
            プロジェクトの <code className="rounded bg-slate-100 px-1">.cursor/mcp.json</code> に貼り付け、Cursor を再起動します。
          </p>

          <label className="mt-4 block text-xs font-bold text-slate-600">
            mcp-server のパス（任意・Windows は / 区切り推奨）
            <input
              className="mt-1 block w-full rounded border border-slate-200 px-3 py-2 font-mono text-xs"
              value={mcpPath}
              onChange={(e) => setMcpPath(e.target.value)}
              placeholder="C:/Users/you/TAXX/mcp-server/dist/index.js"
            />
          </label>

          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-500">API: {API_BASE}</span>
            <button
              type="button"
              onClick={() => void copyText(configJson).then((ok) => setMessage(ok ? "mcp.json をコピーしました" : "コピーに失敗しました"))}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-[10px] font-bold text-white hover:bg-slate-900"
            >
              <Copy className="h-3 w-3" />
              設定 JSON をコピー
            </button>
          </div>

          <pre className="mt-3 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-slate-900 p-4 text-[10px] leading-relaxed text-slate-100">
            {configJson}
          </pre>

          <ol className="mt-4 list-inside list-decimal space-y-1 text-xs text-slate-600">
            <li>リポジトリで <code className="rounded bg-slate-100 px-1">npm run mcp:build</code> を実行</li>
            <li>バックエンド（{API_BASE.replace("/api", "")}）が起動していることを確認</li>
            <li>Cursor → Settings → MCP で docugrid が緑になることを確認</li>
            <li>Agent で「get_me で権限を確認して」と試す</li>
          </ol>
        </article>
      )}
    </div>
  );
}
