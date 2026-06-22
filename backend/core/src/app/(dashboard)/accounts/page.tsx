"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "../../../components/ui/button";
import { AccountTable, type Account } from "./components/AccountTable";
import {
  AddAccountDialog,
  type NewAccountPayload,
} from "./components/AddAccountDialog";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isTokenReady, setIsTokenReady] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    const storedToken = window.localStorage.getItem("accessToken");
    setToken(storedToken);
    setIsTokenReady(true);
  }, []);

  const fetchAccounts = useCallback(async (accessToken: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/accounts`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("勘定科目の取得に失敗しました。");
      }

      const data = (await response.json()) as Account[];
      setAccounts(data);
    } catch (fetchError) {
      console.error(fetchError);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "勘定科目の取得中に予期せぬエラーが発生しました。"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isTokenReady) {
      return;
    }

    if (!token) {
      setError(
        "アクセストークンが見つかりません。ログイン後に再度お試しください。"
      );
      setAccounts([]);
      return;
    }

    fetchAccounts(token);
  }, [fetchAccounts, isTokenReady, token]);

  const handleCreateAccount = useCallback(
    async (payload: NewAccountPayload) => {
      if (!token) {
        throw new Error(
          "アクセストークンが見つかりません。ログイン後に再度お試しください。"
        );
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/accounts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let message = "勘定科目の登録に失敗しました。";
        try {
          const errorBody = await response.json();
          if (typeof errorBody?.detail === "string") {
            message = errorBody.detail;
          }
        } catch (parseError) {
          console.error("failed to parse error response", parseError);
        }

        throw new Error(message);
      }

      await fetchAccounts(token);
      setIsDialogOpen(false);
    },
    [fetchAccounts, token]
  );

  const errorMessage = useMemo(() => {
    if (!error) {
      return null;
    }
    return <p className="text-sm text-red-600">{error}</p>;
  }, [error]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">勘定科目マスタ</h1>
          <p className="mt-2 text-sm text-gray-500">
            勘定科目の一覧を確認し、新しい科目を登録できます。
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} disabled={!token}>
          新規登録
        </Button>
      </header>

      {errorMessage}

      <AccountTable accounts={accounts} isLoading={isLoading} error={error} />

      <AddAccountDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSubmit={handleCreateAccount}
      />
    </div>
  );
}
