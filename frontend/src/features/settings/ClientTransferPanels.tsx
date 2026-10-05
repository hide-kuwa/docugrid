"use client";

import { useCallback, useEffect, useState } from "react";
import {
  claimClientTransfer,
  createClientTransfer,
  listClientTransfers,
  revokeClientTransfer,
  statusLabelJa,
  type TransferCreateResult,
  type TransferListItem,
  type TransferPreview,
} from "@/features/org/client-transfer-api";
import { ORG_DIRECTORY_RELOAD_EVENT } from "@/features/org/org-directory-events";

type IssueProps = {
  clientId: string;
  clientName: string;
  /** 画面下部など・目立たせない配置 */
  quiet?: boolean;
};

export function ClientTransferIssueButton({ clientId, clientName, quiet = false }: IssueProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TransferCreateResult | null>(null);
  const [copied, setCopied] = useState<"code" | "url" | null>(null);

  const issue = async () => {
    setBusy(true);
    setError("");
    try {
      const created = await createClientTransfer(clientId);
      setResult(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "発行に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (kind: "code" | "url") => {
    if (!result) return;
    const text = kind === "code" ? result.code : result.shareUrl;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  const revoke = async () => {
    if (!result) return;
    setBusy(true);
    try {
      await revokeClientTransfer(result.id);
      setResult({ ...result, status: "revoked" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "取消に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={
        quiet
          ? "mt-2"
          : "mt-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3"
      }
    >
      <p className="text-[11px] font-bold text-slate-700">次の事務所へ移管</p>
      <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
        {clientName} のマスタ・プロフィール・格納 PDF をパックし、顧客向けコードを発行します。
      </p>
      {!result ? (
        <button
          type="button"
          onClick={() => void issue()}
          disabled={busy}
          className={
            quiet
              ? "mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              : "mt-2 rounded-lg bg-teal-700 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-teal-800 disabled:opacity-50"
          }
        >
          {busy ? "発行中…" : "移管コードを発行"}
        </button>
      ) : (
        <div className="mt-2 space-y-2">
          <p className="font-mono text-sm font-black tracking-widest text-teal-900">{result.code}</p>
          <p className="break-all text-[10px] text-slate-600">{result.shareUrl}</p>
          <p className="text-[10px] text-slate-500">
            資料 {result.documentCount} 件 · 期限 {result.expiresAt.slice(0, 10)} ·{" "}
            {statusLabelJa(result.status)}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => void copy("code")}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-700"
            >
              {copied === "code" ? "コピー済" : "コード"}
            </button>
            <button
              type="button"
              onClick={() => void copy("url")}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-700"
            >
              {copied === "url" ? "コピー済" : "URL"}
            </button>
            {result.status === "pending" ? (
              <button
                type="button"
                onClick={() => void revoke()}
                disabled={busy}
                className="rounded border border-red-200 bg-white px-2 py-1 text-[10px] font-bold text-red-600"
              >
                取消
              </button>
            ) : null}
          </div>
        </div>
      )}
      {error ? <p className="mt-1 text-[10px] font-medium text-red-600">{error}</p> : null}
    </div>
  );
}

export function ClientTransferClaimPanel() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [doneMessage, setDoneMessage] = useState("");

  const runPreview = async () => {
    setBusy(true);
    setError("");
    setDoneMessage("");
    setPreview(null);
    try {
      const res = await claimClientTransfer(code.trim(), false);
      if (res.mode === "preview") setPreview(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "確認に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const runClaim = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await claimClientTransfer(code.trim(), true);
      if (res.mode === "claimed") {
        setDoneMessage(
          `取り込み完了: ${res.clientName}（資料 ${res.documentsImported}/${res.documentCount}）。顧客マスタを確認してください。`,
        );
        setPreview(null);
        setCode("");
        window.dispatchEvent(new Event(ORG_DIRECTORY_RELOAD_EVENT));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り込みに失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-800">移管コードで受け取る</h3>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">
        顧客から受け取った移管コードを入力し、プレビュー後に取り込みます。
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="例: AB12CD34"
          className="w-40 rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-xs tracking-wider text-slate-800"
        />
        <button
          type="button"
          onClick={() => void runPreview()}
          disabled={busy || code.trim().length < 4}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-700 disabled:opacity-40"
        >
          プレビュー
        </button>
      </div>
      {preview ? (
        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
          <p>
            <span className="font-bold">{preview.clientDisplayName}</span>
            （資料 {preview.documentCount} 件）
          </p>
          <p className="mt-0.5 text-slate-500">期限 {preview.expiresAt.slice(0, 10)}</p>
          <button
            type="button"
            onClick={() => void runClaim()}
            disabled={busy}
            className="mt-2 rounded-lg bg-teal-700 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {busy ? "取り込み中…" : "この内容で取り込む"}
          </button>
        </div>
      ) : null}
      {doneMessage ? <p className="mt-2 text-[11px] font-medium text-emerald-700">{doneMessage}</p> : null}
      {error ? <p className="mt-2 text-[11px] font-medium text-red-600">{error}</p> : null}
    </div>
  );
}

export function ClientTransferIssuedList() {
  const [items, setItems] = useState<TransferListItem[]>([]);
  const reload = useCallback(() => {
    void listClientTransfers().then(setItems).catch(() => setItems([]));
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  if (items.length === 0) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-800">発行した移管</h3>
        <button type="button" onClick={reload} className="text-[10px] font-bold text-slate-500">
          更新
        </button>
      </div>
      <ul className="mt-2 space-y-2">
        {items.slice(0, 8).map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-[11px]"
          >
            <div>
              <span className="font-bold text-slate-800">{item.clientDisplayName}</span>
              <span className="ml-2 font-mono tracking-wider text-teal-800">{item.code}</span>
              <span className="ml-2 text-slate-400">{statusLabelJa(item.status)}</span>
            </div>
            {item.status === "pending" ? (
              <button
                type="button"
                className="text-[10px] font-bold text-red-600"
                onClick={() => {
                  void revokeClientTransfer(item.id).then(reload);
                }}
              >
                取消
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
