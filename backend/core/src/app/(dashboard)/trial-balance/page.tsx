"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "../../../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter, // ★ 合計行のためにインポート
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

// --- 型定義 (schemas.py と一致させる) ---

// 試算表の1行の型
type TrialBalanceEntry = {
  account_id: number;
  account_code: string;
  account_name: string;
  account_category: string;
  debit_total: number;
  credit_total: number;
  balance_debit: number;
  balance_credit: number;
};

// 試算表APIのレスポンス全体の型
type TrialBalanceResponse = {
  entries: TrialBalanceEntry[];
  total_debit_total: number;
  total_credit_total: number;
  total_balance_debit: number;
  total_balance_credit: number;
};

// --- ヘルパー関数 ---
const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

// ゼロを '—' (ハイフン) に変えるヘルパー
const formatCurrencyZeroAsDash = (value: number) => {
  if (value === 0) return "—";
  return currencyFormatter.format(value);
};

export default function TrialBalancePage() {
  const [token, setToken] = useState<string | null>(null);
  const [isTokenReady, setIsTokenReady] = useState(false);

  // --- State ---
  const [tbData, setTbData] = useState<TrialBalanceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- 1. トークンの取得 ---
  useEffect(() => {
    const storedToken = window.localStorage.getItem("accessToken");
    setToken(storedToken);
    setIsTokenReady(true);
  }, []);

  // --- 2. 試算表データの取得 ---
  const fetchTrialBalance = useCallback(async (accessToken: string) => {
    setIsLoading(true);
    setError(null);
    setTbData(null); // 古いデータをクリア

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/reports/trial-balance`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.detail || "試算表データの取得に失敗しました。");
      }

      const data = (await response.json()) as TrialBalanceResponse;
      setTbData(data); // 取得したデータを State に保存
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "試算表の取得に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ★ ページ表示時（またはトークン準備完了時）に自動でデータを取得
  useEffect(() => {
    if (isTokenReady && token) {
      fetchTrialBalance(token);
    } else if (isTokenReady) {
      setError("ログインが必要です。");
    }
  }, [isTokenReady, token, fetchTrialBalance]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">試算表</h1>
          <p className="mt-2 text-sm text-gray-500">
            全勘定科目の合計残高を一覧で確認します。
          </p>
        </div>
        <Button
          onClick={() => {
            if (token) fetchTrialBalance(token);
          }}
          disabled={isLoading || !token}
        >
          {isLoading ? "更新中..." : "最新の情報に更新"}
        </Button>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* --- 試算表テーブル --- */}
      <div className="rounded-md border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">科目コード</TableHead>
              <TableHead>勘定科目</TableHead>
              <TableHead className="w-32 text-right">借方合計</TableHead>
              <TableHead className="w-32 text-right">貸方合計</TableHead>
              <TableHead className="w-32 text-right">残高 (借方)</TableHead>
              <TableHead className="w-32 text-right">残高 (貸方)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-60 text-center text-gray-500"
                >
                  読み込み中です...
                </TableCell>
              </TableRow>
            )}

            {!isLoading && !tbData && !error && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-60 text-center text-gray-500"
                >
                  データを取得できませんでした。
                </TableCell>
              </TableRow>
            )}

            {!isLoading && tbData && tbData.entries.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-60 text-center text-gray-500"
                >
                  表示する取引データがありません。
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              tbData &&
              tbData.entries.map((entry) => (
                <TableRow key={entry.account_id}>
                  <TableCell className="font-mono">{entry.account_code}</TableCell>
                  <TableCell className="font-medium">{entry.account_name}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrencyZeroAsDash(entry.debit_total)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrencyZeroAsDash(entry.credit_total)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrencyZeroAsDash(entry.balance_debit)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrencyZeroAsDash(entry.balance_credit)}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>

          {/* --- 合計を表示するフッター --- */}
          {!isLoading && tbData && tbData.entries.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="text-right font-semibold">
                  合計
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {currencyFormatter.format(tbData.total_debit_total)}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {currencyFormatter.format(tbData.total_credit_total)}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {currencyFormatter.format(tbData.total_balance_debit)}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {currencyFormatter.format(tbData.total_balance_credit)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}