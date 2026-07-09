"use client";

import { useCallback, useState } from "react";
import { CreditCard, ExternalLink, Loader2, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { clearAuthSession, type DocugridUser } from "@/lib/auth";
import { settingsHref } from "@/lib/app-surface";
import {
  billingStatusLabel,
  formatYen,
  openBillingPortal,
  startBillingCheckout,
  type BillingMe,
} from "@/features/billing/billing-api";

type Props = {
  billing: BillingMe;
  user: DocugridUser | null;
  onRefresh?: () => void;
};

function attentionMessage(status: string): string {
  if (status === "past_due" || status === "unpaid") {
    return "お支払いの確認ができませんでした。DocuGrid の利用を再開するには、請求情報を更新してください。";
  }
  if (status === "canceled") {
    return "プランが解約されています。再度ご契約いただくと DocuGrid をご利用いただけます。";
  }
  if (status === "incomplete") {
    return "お支払い手続きが完了していません。Stripe の画面で手続きを完了してください。";
  }
  return "DocuGrid をご利用いただくには、事務所プランのお支払い設定が必要です。";
}

export function BillingGatePanel({ billing, user, onRefresh }: Props) {
  const router = useRouter();
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = billing.canManageBilling === true;
  const pricing = billing.pricing;
  const settingsPath = billing.redirectPath || settingsHref("firm", "billing");

  const handleCheckout = useCallback(async () => {
    setActing("checkout");
    setError(null);
    try {
      const url = await startBillingCheckout(billing.primaryPlanId);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "チェックアウトを開始できませんでした。");
      setActing(null);
    }
  }, [billing.primaryPlanId]);

  const handlePortal = useCallback(async () => {
    setActing("portal");
    setError(null);
    try {
      const url = await openBillingPortal(settingsPath);
      window.location.href = url;
    } catch {
      setError("請求ポータルを開けませんでした。");
      setActing(null);
    }
  }, [settingsPath]);

  const handleLogout = useCallback(() => {
    clearAuthSession();
    router.push("/login");
  }, [router]);

  if (!billing.configured || billing.active) {
    return null;
  }

  const needsPaymentUpdate = billing.status === "past_due" || billing.status === "unpaid";

  return (
    <div className="relative mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <button
        type="button"
        onClick={handleLogout}
        className="fixed right-4 top-4 z-50 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 shadow-sm hover:bg-slate-50 sm:right-6 sm:top-6"
      >
        <LogOut className="h-4 w-4" />
        ログアウト
      </button>
      <div className="rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-800">
          <CreditCard className="h-6 w-6" />
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
          {needsPaymentUpdate ? "お支払いの更新が必要です" : "プランの開始が必要です"}
        </p>
        <h1 className="mt-2 text-xl font-black text-slate-900">
          {needsPaymentUpdate ? "DocuGrid を一時停止しています" : "DocuGrid をはじめる"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          {attentionMessage(billing.status)}
        </p>
        {pricing ? (
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            事務所プラン: 基本料 {formatYen(pricing.firmBaseYen)}/月 ＋ 顧問先{" "}
            {formatYen(pricing.firmPerClientYen)}/社/月
            <span className="mt-1 block text-xs text-slate-500">
              月額はカードから自動引き落とし（Stripe）
            </span>
          </p>
        ) : null}
        <p className="mt-2 text-xs text-slate-500">
          契約状態: {billingStatusLabel(billing.status)}
        </p>
        {billing.configured && billing.checkoutReady === false ? (
          <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
            Stripe の Price ID が未設定のため、カード登録を開始できません。開発環境では
            <code className="mx-1 rounded bg-white px-1">python scripts/setup_stripe_catalog.py --write-env</code>
            を実行してください。
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {canManage ? (
            needsPaymentUpdate ? (
              <button
                type="button"
                disabled={acting !== null}
                onClick={() => void handlePortal()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {acting === "portal" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                請求ポータルで支払いを更新
              </button>
            ) : (
              <button
                type="button"
                disabled={acting !== null || billing.checkoutReady === false}
                onClick={() => void handleCheckout()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-black disabled:opacity-60"
              >
                {acting === "checkout" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                カード登録して始める
              </button>
            )
          ) : (
            <p className="text-sm text-slate-600">
              プラン・お支払いは事務所の代表アカウントのみ操作できます。代表税理士に手続きを依頼してください。
            </p>
          )}
          <Link
            href={settingsPath}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            プラン・決済を開く
          </Link>
        </div>

        {canManage && onRefresh ? (
          <button
            type="button"
            onClick={() => onRefresh()}
            className="mt-4 text-xs font-bold text-slate-500 underline-offset-2 hover:underline"
          >
            状態を再確認
          </button>
        ) : null}

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        {user?.email ? (
          <p className="mt-6 border-t border-slate-100 pt-5 text-xs text-slate-500">{user.email}</p>
        ) : null}
      </div>
    </div>
  );
}
