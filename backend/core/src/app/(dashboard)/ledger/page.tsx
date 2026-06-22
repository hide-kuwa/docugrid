"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Select } from "../../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter, // TableFooter をインポート
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { Label } from "../../../components/ui/label";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

// --- 型定義 ---

type ApiAccount = {
  id: number;
  code: string;
  name: string;
  category: string;
};

// 総勘定元帳の1行の型
type LedgerEntry = {
  date: string; // date は string で受け取る
  journal_id: number;
  journal_description: string | null;
  detail_id: number;
  is_debit: boolean;
  amount: number;
  detail_description: string | null;
  balance: number; // 実行残高
};

// 総勘定元帳APIのレスポンス全体の型
type LedgerResponse = {
  account: ApiAccount;
  entries: LedgerEntry[];
  debit_total: number;
  credit_total: number;
  final_balance: number;
};

// --- ヘルパー関数 ---
const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
});

export default function LedgerPage() {
  const [token, setToken] = useState<string | null>(null);
  const [isTokenReady, setIsTokenReady] = useState(false);

  const [accounts, setAccounts] = useState<ApiAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [ledgerData, setLedgerData] = useState<LedgerResponse | null>(null);

  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = window.localStorage.getItem("accessToken");
    setToken(storedToken);
    setIsTokenReady(true);
  }, []);

  const fetchAccounts = useCallback(async (accessToken: string) => {
    setIsLoadingAccounts(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/accounts`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw new Error("勘定科目の取得に失敗しました。");
      }
      const data = (await response.json()) as ApiAccount[];
      setAccounts(data);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "不明なエラー");
    } finally {
      setIsLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    if (isTokenReady && token) {
      fetchAccounts(token);
    } else if (isTokenReady) {
      setError("ログインが必要です。");
    }
  }, [isTokenReady, token, fetchAccounts]);

  const handleFetchLedger = useCallback(async () => {
    if (!token || !selectedAccountId) {
      setError("勘定科目を選択してください。");
      return;
    }

    setIsLoadingLedger(true);
    setError(null);
    setLedgerData(null);
    console.log(`APIを呼び出します: /api/v1/reports/general-ledger/${selectedAccountId}`);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/reports/general-ledger/${selectedAccountId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.detail || "元帳データの取得に失敗しました。");
      }

      const data = (await response.json()) as LedgerResponse;
      setLedgerData(data);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "元帳の取得に失敗しました。");
    } finally {
      setIsLoadingLedger(false);
    }
  }, [token, selectedAccountId]);

  const accountOptions = useMemo(
    () => [
      { value: "", label: "科目を選択してください" },
      ...accounts.map((account) => ({
        value: String(account.id),
        label: `${account.code}｜${account.name}`,
      })),
    ],
    [accounts]
  );

  const selectedAccountName = useMemo(() => {
    if (!ledgerData) return null;
    return `${ledgerData.account.code}｜${ledgerData.account.name}`;
  }, [ledgerData]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">総勘定元帳</h1>
        <p className="mt-2 text-sm text-gray-500">
          勘定科目を選択して、取引明細と残高を確認します。
        </p>
      </header>

      {/* --- 操作パネル --- */}
      <div className="flex items-end gap-4 rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex-1 space-y-2">
          <Label htmlFor="account-select">勘定科目</Label>
          <Select
            id="account-select"
            value={selectedAccountId}
            options={accountOptions}
            onChange={(event) =>
              setSelectedAccountId(event.target.value)
            }
            disabled={isLoadingAccounts || isLoadingLedger}
          />
        </div>
        <Button
          onClick={handleFetchLedger}
          disabled={!selectedAccountId || isLoadingLedger}
        >
          {isLoadingLedger ? "読み込み中..." : "元帳を表示"}
        </Button>
      </div>

      {/* ★ ここがエラーが出ていた箇所。正しい div に修正 */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* --- 元帳テーブル --- */}
      <div className="rounded-md border bg-white shadow-sm">
        {ledgerData && !isLoadingLedger && (
          <div className="border-b p-4">
            <h2 className="text-lg font-semibold">
              {selectedAccountName} の元帳
            </h2>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">日付</TableHead>
              <TableHead>摘要</TableHead>
              <TableHead className="w-32 text-right">借方金額</TableHead>
              <TableHead className="w-32 text-right">貸方金額</TableHead>
              <TableHead className="w-32 text-right">残高</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoadingLedger && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-40 text-center text-gray-500"
                >
                  読み込み中です...
                </TableCell>
              </TableRow>
            )}

            {!isLoadingLedger && !ledgerData && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-40 text-center text-gray-500"
                >
                  勘定科目を選択して「元帳を表示」ボタンを押してください。
                </TableCell>
              </TableRow>
            )}

            {!isLoadingLedger && ledgerData && ledgerData.entries.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-40 text-center text-gray-500"
                >
                  この勘定科目の取引はありません。
                </TableCell>
              </TableRow>
            )}

            {!isLoadingLedger &&
              ledgerData &&
              ledgerData.entries.map((entry) => (
                <TableRow key={entry.detail_id}>
                  <TableCell>
                    {dateFormatter.format(new Date(entry.date))}
                  </TableCell>
                  <TableCell className="text-sm">
                    {entry.journal_description || entry.detail_description || "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {entry.is_debit ? currencyFormatter.format(entry.amount) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {!entry.is_debit ? currencyFormatter.format(entry.amount) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {currencyFormatter.format(entry.balance)}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>

          {!isLoadingLedger && ledgerData && ledgerData.entries.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="font-semibold">
                  期間合計
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {currencyFormatter.format(ledgerData.debit_total)}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {currencyFormatter.format(ledgerData.credit_total)}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {currencyFormatter.format(ledgerData.final_balance)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}