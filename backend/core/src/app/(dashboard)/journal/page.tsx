"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Select } from "../../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { Textarea } from "../../../components/ui/textarea";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

type ApiAccount = {
  id: number;
  code: string;
  name: string;
  category: string;
};

type JournalDetailLine = {
  id: string;
  accountId: number | "";
  amount: number | "";
  isDebit: boolean;
  description: string;
};

type JournalDetailResponse = {
  id: number;
  is_debit: boolean;
  amount: number;
  detail_description: string | null;
  account: ApiAccount;
};

type JournalResponse = {
  id: number;
  date: string;
  description: string | null;
  details: JournalDetailResponse[];
};

const createDetailLine = (isDebit: boolean): JournalDetailLine => ({
  id:
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  accountId: "",
  amount: "",
  isDebit,
  description: "",
});

const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
});

export default function JournalPage() {
  const [token, setToken] = useState<string | null>(null);
  const [isTokenReady, setIsTokenReady] = useState(false);

  const [accounts, setAccounts] = useState<ApiAccount[]>([]);
  const [journals, setJournals] = useState<JournalResponse[]>([]);

  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isLoadingJournals, setIsLoadingJournals] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  const [journalDate, setJournalDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [journalDescription, setJournalDescription] = useState("");
  const [details, setDetails] = useState<JournalDetailLine[]>([
    createDetailLine(true),
    createDetailLine(false),
  ]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = window.localStorage.getItem("accessToken");
    setToken(storedToken);
    setIsTokenReady(true);
  }, []);

  const fetchAccounts = useCallback(
    async (accessToken: string) => {
      setIsLoadingAccounts(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/accounts`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (!response.ok) {
          throw new Error("勘定科目の取得に失敗しました。");
        }
        const data = (await response.json()) as ApiAccount[];
        setAccounts(data);
      } catch (error) {
        console.error(error);
        setLedgerError(
          error instanceof Error
            ? error.message
            : "勘定科目の取得中にエラーが発生しました。"
        );
      } finally {
        setIsLoadingAccounts(false);
      }
    },
    []
  );

  const fetchJournals = useCallback(
    async (accessToken: string) => {
      setIsLoadingJournals(true);
      setLedgerError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/journals`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (!response.ok) {
          throw new Error("仕訳帳の取得に失敗しました。");
        }
        const data = (await response.json()) as JournalResponse[];
        setJournals(data);
      } catch (error) {
        console.error(error);
        setLedgerError(
          error instanceof Error
            ? error.message
            : "仕訳帳の取得中にエラーが発生しました。"
        );
      } finally {
        setIsLoadingJournals(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!isTokenReady) {
      return;
    }
    if (!token) {
      setLedgerError("アクセストークンが見つかりません。ログインし直してください。");
      return;
    }
    fetchAccounts(token);
    fetchJournals(token);
  }, [fetchAccounts, fetchJournals, isTokenReady, token]);

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

  const debitTotal = useMemo(() => {
    return details.reduce((total, detail) => {
      if (!detail.isDebit) {
        return total;
      }
      const amount =
        typeof detail.amount === "number"
          ? detail.amount
          : Number(detail.amount) || 0;
      return total + amount;
    }, 0);
  }, [details]);

  const creditTotal = useMemo(() => {
    return details.reduce((total, detail) => {
      if (detail.isDebit) {
        return total;
      }
      const amount =
        typeof detail.amount === "number"
          ? detail.amount
          : Number(detail.amount) || 0;
      return total + amount;
    }, 0);
  }, [details]);

  const difference = debitTotal - creditTotal;
  const isBalanced = debitTotal > 0 && debitTotal === creditTotal;

  const resetForm = () => {
    setJournalDate(new Date().toISOString().slice(0, 10));
    setJournalDescription("");
    setDetails([createDetailLine(true), createDetailLine(false)]);
    setFormError(null);
  };

  const handleDetailChange = (
    id: string,
    field: "accountId" | "amount" | "description",
    value: string
  ) => {
    setDetails((prev) =>
      prev.map((detail) =>
        detail.id === id
          ? {
              ...detail,
              [field]:
                field === "amount"
                  ? value === ""
                    ? ""
                    : (() => {
                        const numericValue = Number(value);
                        return Number.isFinite(numericValue)
                          ? Math.max(0, numericValue)
                          : 0;
                      })()
                  : field === "accountId"
                  ? value === ""
                    ? ""
                    : Number(value)
                  : value,
            }
          : detail
      )
    );
  };

  const addDetail = (isDebit: boolean) => {
    setDetails((prev) => [...prev, createDetailLine(isDebit)]);
  };

  const removeDetail = (id: string) => {
    setDetails((prev) => {
      const target = prev.find((detail) => detail.id === id);
      if (!target) {
        return prev;
      }
      const sameSideCount = prev.filter(
        (detail) => detail.isDebit === target.isDebit
      ).length;
      if (sameSideCount <= 1) {
        return prev;
      }
      return prev.filter((detail) => detail.id !== id);
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSubmitMessage(null);

    if (!token) {
      setFormError("アクセストークンが見つかりません。ログインし直してください。");
      return;
    }

    const normalizedDetails = details.map((detail) => {
      const rawAmount =
        typeof detail.amount === "number"
          ? detail.amount
          : Number(detail.amount);
      const amountValue = Number.isFinite(rawAmount) ? rawAmount : 0;
      return {
        ...detail,
        amountValue,
      };
    });

    if (
      normalizedDetails.some(
        (detail) => !detail.accountId || detail.amountValue <= 0
      )
    ) {
      setFormError("科目と金額をすべて入力してください。");
      return;
    }

    if (!isBalanced) {
      setFormError("借方と貸方の合計金額を一致させてください。");
      return;
    }

    const payload = {
      date: journalDate,
      description: journalDescription || null,
      is_closing_entry: false,
      attachment_url: null,
      details: normalizedDetails.map((detail) => ({
        account_id: Number(detail.accountId),
        amount: detail.amountValue,
        is_debit: detail.isDebit,
        tax_category_id: null,
        department_id: null,
        sub_account_id: null,
        detail_description: detail.description || null,
        tax_amount: null,
      })),
    };

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/journals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const message =
          typeof errorBody?.detail === "string"
            ? errorBody.detail
            : "仕訳の登録に失敗しました。";
        throw new Error(message);
      }

      setSubmitMessage("仕訳を登録しました。");
      resetForm();
      await fetchJournals(token);
    } catch (error) {
      console.error(error);
      setFormError(
        error instanceof Error ? error.message : "仕訳の登録に失敗しました。"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">仕訳入力</h1>
        <p className="text-sm text-slate-600">
          仕訳を入力し、右側の仕訳帳で登録済みの明細を確認できます。
        </p>
      </header>

      <div className="grid gap-8 xl:grid-cols-2">
        <section className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <header className="space-y-1">
            <h2 className="text-xl font-semibold text-slate-900">
              仕訳フォーム
            </h2>
            <p className="text-sm text-slate-500">
              日付・摘要・借貸行を入力して仕訳を登録します。
            </p>
          </header>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="journal-date">日付</Label>
                <Input
                  id="journal-date"
                  type="date"
                  value={journalDate}
                  onChange={(event) => setJournalDate(event.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="journal-description">摘要</Label>
                <Textarea
                  id="journal-description"
                  value={journalDescription}
                  placeholder="例：売掛金の入金を計上"
                  onChange={(event) => setJournalDescription(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">
                  仕訳明細
                </h3>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => addDetail(true)}
                  >
                    借方行を追加
                  </Button>
                  <Button
                    type="button"
                    className="bg-purple-600 hover:bg-purple-700"
                    onClick={() => addDetail(false)}
                  >
                    貸方行を追加
                  </Button>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">区分</TableHead>
                    <TableHead className="min-w-[220px]">科目</TableHead>
                    <TableHead className="w-32">金額</TableHead>
                    <TableHead>摘要</TableHead>
                    <TableHead className="w-20 text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {details.map((detail) => {
                    const matchingAccounts = details.filter(
                      (item) => item.isDebit === detail.isDebit
                    );
                    const disableRemove = matchingAccounts.length <= 1;
                    return (
                      <TableRow key={detail.id}>
                        <TableCell className="font-medium">
                          {detail.isDebit ? "借方" : "貸方"}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={
                              detail.accountId === ""
                                ? ""
                                : String(detail.accountId)
                            }
                            options={accountOptions}
                            onChange={(event) =>
                              handleDetailChange(
                                detail.id,
                                "accountId",
                                event.target.value
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={
                              detail.amount === "" ? "" : Number(detail.amount)
                            }
                            onChange={(event) =>
                              handleDetailChange(
                                detail.id,
                                "amount",
                                event.target.value
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={detail.description}
                            placeholder="任意: 摘要を入力"
                            onChange={(event) =>
                              handleDetailChange(
                                detail.id,
                                "description",
                                event.target.value
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <button
                            type="button"
                            onClick={() => removeDetail(detail.id)}
                            disabled={disableRemove}
                            className="text-sm text-red-600 transition hover:text-red-700 disabled:cursor-not-allowed disabled:text-slate-300"
                          >
                            削除
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>合計</TableCell>
                    <TableCell />
                    <TableCell>
                      <div className="flex flex-col gap-1 text-xs">
                        <span className="font-semibold text-slate-700">
                          借方: {currencyFormatter.format(debitTotal)}
                        </span>
                        <span className="font-semibold text-slate-700">
                          貸方: {currencyFormatter.format(creditTotal)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell colSpan={2}>
                      {difference !== 0 && (
                        <p className="text-sm text-red-600">
                          差額: {currencyFormatter.format(Math.abs(difference))}{" "}
                          {difference > 0 ? "(借方超過)" : "(貸方超過)"}
                        </p>
                      )}
                      {difference === 0 && debitTotal > 0 && (
                        <p className="text-sm text-emerald-600">
                          借方と貸方の合計が一致しています。
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            {formError && (
              <p className="text-sm text-red-600">{formError}</p>
            )}
            {submitMessage && (
              <p className="text-sm text-emerald-600">{submitMessage}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                disabled={isSubmitting}
              >
                リセット
              </button>
              <Button type="submit" disabled={isSubmitting || isLoadingAccounts}>
                {isSubmitting ? "登録中…" : "仕訳を登録"}
              </Button>
            </div>
          </form>
        </section>

        <section className="space-y-4">
          <header className="space-y-1">
            <h2 className="text-xl font-semibold text-slate-900">仕訳帳</h2>
            <p className="text-sm text-slate-500">
              登録済みの仕訳が新しい順に表示されます。
            </p>
          </header>

          {ledgerError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {ledgerError}
            </div>
          )}

          {isLoadingJournals ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-slate-500">
              仕訳帳を読み込み中です…
            </div>
          ) : journals.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-slate-500">
              まだ仕訳が登録されていません。
            </div>
          ) : (
            <div className="space-y-4">
              {journals.map((journal) => {
                const debitSum = journal.details
                  .filter((detail) => detail.is_debit)
                  .reduce((total, detail) => total + detail.amount, 0);
                return (
                  <article
                    key={journal.id}
                    className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-slate-500">
                          {dateFormatter.format(new Date(journal.date))}
                        </p>
                        <h3 className="text-lg font-semibold text-slate-900">
                          {journal.description || "（摘要なし）"}
                        </h3>
                      </div>
                      <p className="text-sm font-semibold text-emerald-600">
                        合計 {currencyFormatter.format(debitSum)}
                      </p>
                    </div>

                    <div className="overflow-hidden rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-20">区分</TableHead>
                            <TableHead>勘定科目</TableHead>
                            <TableHead className="w-32">金額</TableHead>
                            <TableHead>摘要</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {journal.details.map((detail) => (
                            <TableRow key={detail.id}>
                              <TableCell>
                                {detail.is_debit ? "借方" : "貸方"}
                              </TableCell>
                              <TableCell>
                                <div className="font-medium text-slate-800">
                                  {detail.account.name}
                                </div>
                                <p className="text-xs text-slate-500">
                                  {detail.account.code}｜{detail.account.category}
                                </p>
                              </TableCell>
                              <TableCell>
                                {currencyFormatter.format(detail.amount)}
                              </TableCell>
                              <TableCell className="text-sm text-slate-600">
                                {detail.detail_description || "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
