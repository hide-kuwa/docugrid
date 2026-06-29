"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, CreditCard, ExternalLink, Landmark, Loader2, RefreshCw, Unplug } from "lucide-react";
import {
  accountSubtypeLabel,
  clearMoneytreeOauthFromLocation,
  disconnectMoneytree,
  fetchMoneytreeAccounts,
  fetchMoneytreeStatus,
  fetchMoneytreeTransactions,
  fetchMoneytreeVaultUrl,
  formatYenAmount,
  mockMoneytreeConnect,
  readMoneytreeOauthFromLocation,
  startMoneytreeConnect,
  syncMoneytree,
  type MoneytreeAccount,
  type MoneytreeStatus,
  type MoneytreeTransaction,
} from "@/features/integrations/moneytree-api";

type Props = {
  clientId: string;
  clientName?: string;
  /** OAuth 完了後に戻るワークスペースパス */
  returnPath?: string;
  compact?: boolean;
};

export function MoneytreeLinkPanel({
  clientId,
  clientName,
  returnPath = "/workspace/client_accounting",
  compact = false,
}: Props) {
  const [status, setStatus] = useState<MoneytreeStatus | null>(null);
  const [accounts, setAccounts] = useState<MoneytreeAccount[]>([]);
  const [transactions, setTransactions] = useState<MoneytreeTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const s = await fetchMoneytreeStatus(clientId);
      setStatus(s);
      if (s.connected) {
        const [accts, txns] = await Promise.all([
          fetchMoneytreeAccounts(clientId),
          fetchMoneytreeTransactions(clientId),
        ]);
        setAccounts(accts);
        setTransactions(txns.slice(0, compact ? 4 : 8));
      } else {
        setAccounts([]);
        setTransactions([]);
      }
    } catch {
      setError("口座連携情報の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [clientId, compact]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const oauth = readMoneytreeOauthFromLocation();
    if (oauth.result === "connected") {
      setMessage("銀行・カードの連携が完了しました。「同期」で最新の明細を取得できます。");
      clearMoneytreeOauthFromLocation();
      void reload();
    } else if (oauth.result === "error") {
      setError(oauth.detail || "口座連携に失敗しました。");
      clearMoneytreeOauthFromLocation();
    }
  }, [reload]);

  const handleConnect = async () => {
    setActing("connect");
    setError(null);
    setMessage("");
    try {
      const payload = await startMoneytreeConnect(clientId, returnPath);
      if (payload.mock) {
        await mockMoneytreeConnect(clientId);
        setMessage("デモモードで連携しました（サンプル口座・明細）。");
        await reload();
      } else if (payload.authorize_url) {
        window.location.href = payload.authorize_url;
      }
    } catch {
      setError("連携の開始に失敗しました。");
    } finally {
      setActing(null);
    }
  };

  const handleSync = async () => {
    setActing("sync");
    setError(null);
    setMessage("");
    try {
      await syncMoneytree(clientId);
      setMessage("口座・明細を同期しました。");
      await reload();
    } catch {
      setError("同期に失敗しました。");
    } finally {
      setActing(null);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("銀行・カードの連携を解除しますか？")) return;
    setActing("disconnect");
    setError(null);
    try {
      await disconnectMoneytree(clientId);
      setMessage("連携を解除しました。");
      await reload();
    } catch {
      setError("連携解除に失敗しました。");
    } finally {
      setActing(null);
    }
  };

  const handleVault = async () => {
    setActing("vault");
    setError(null);
    try {
      const url = await fetchMoneytreeVaultUrl(clientId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError("金融機関の登録ページを開けませんでした。");
    } finally {
      setActing(null);
    }
  };

  if (!clientId) {
    return (
      <p className="text-xs text-slate-500">顧問先が選択されていないため、口座連携を利用できません。</p>
    );
  }

  if (loading && !status) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        読み込み中…
      </div>
    );
  }

  const connected = status?.connected ?? false;
  const mockMode = status?.mock_mode ?? false;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Landmark className="h-4 w-4 text-emerald-600" />
            銀行・クレジットカード連携
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {clientName ? `${clientName} の` : ""}
            口座・カード明細を安全に共有します。税理士事務所が資料確認に利用します。
          </p>
          {!compact && (
            <p className="mt-1 text-[11px] text-slate-400">
              Moneytree LINK 経由 · ご本人の操作でのみ連携できます
              {mockMode ? " · デモモード" : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!connected ? (
            <button
              type="button"
              onClick={() => void handleConnect()}
              disabled={!status?.configured || acting !== null}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {acting === "connect" ? "接続中…" : mockMode ? "デモで試す" : "連携をはじめる"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void handleSync()}
                disabled={acting !== null}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {acting === "sync" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                同期
              </button>
              {!mockMode && (
                <button
                  type="button"
                  onClick={() => void handleVault()}
                  disabled={acting !== null}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  口座を追加
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                disabled={acting !== null}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Unplug className="h-3.5 w-3.5" />
                解除
              </button>
            </>
          )}
        </div>
      </div>

      {(message || error) && (
        <p className={`mt-3 text-xs ${error ? "text-red-600" : "text-slate-500"}`}>
          {error || message}
        </p>
      )}

      {connected && accounts.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-xs font-bold text-slate-700">連携中の口座（{accounts.length}）</div>
          <ul className="space-y-2">
            {accounts.map((acct) => (
              <li
                key={acct.external_id}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  {acct.account_subtype === "credit_card" ? (
                    <CreditCard className="h-4 w-4 text-slate-500" />
                  ) : (
                    <Building2 className="h-4 w-4 text-slate-500" />
                  )}
                  <div>
                    <div className="text-xs font-semibold text-slate-800">
                      {acct.institution_name || "金融機関"}
                      {acct.account_name ? ` · ${acct.account_name}` : ""}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {accountSubtypeLabel(acct.account_subtype)}
                    </div>
                  </div>
                </div>
                <div className="text-right text-xs font-mono font-semibold text-slate-700">
                  {formatYenAmount(acct.balance ?? null)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {connected && transactions.length > 0 && !compact && (
        <div className="mt-4 space-y-2">
          <div className="text-xs font-bold text-slate-700">直近の明細</div>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {transactions.map((txn, i) => (
              <li key={`${txn.account_external_id}-${txn.txn_date}-${i}`} className="px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-600">{txn.txn_date || "—"}</span>
                  <span
                    className={`font-mono font-semibold ${
                      (txn.amount ?? 0) < 0 ? "text-red-600" : "text-emerald-700"
                    }`}
                  >
                    {formatYenAmount(txn.amount ?? null)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-slate-700">{txn.description || "（摘要なし）"}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
