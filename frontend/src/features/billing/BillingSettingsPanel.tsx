"use client";



import { useCallback, useEffect, useState } from "react";

import { CreditCard, ExternalLink, Loader2, RefreshCw, Sparkles, Users } from "lucide-react";

import {

  billingStatusLabel,

  enableAiPaygo,

  fetchBillingStatus,

  formatYen,

  openBillingPortal,

  startAiTopupCheckout,

  startBillingCheckout,

  syncBillingUsage,

  type BillingStatus,

} from "@/features/billing/billing-api";

import { BillingPartnerAdminSection } from "@/features/billing/BillingPartnerAdminSection";



type Props = {

  checkoutResult?: string | null;

  topupResult?: string | null;

  isPlatformAdmin?: boolean;

};



export function BillingSettingsPanel({

  checkoutResult,

  topupResult,

  isPlatformAdmin = false,

}: Props) {

  const [status, setStatus] = useState<BillingStatus | null>(null);

  const [loading, setLoading] = useState(true);

  const [acting, setActing] = useState<string | null>(null);

  const [message, setMessage] = useState("");

  const [error, setError] = useState<string | null>(null);



  const reload = useCallback(async () => {

    setLoading(true);

    setError(null);

    try {

      setStatus(await fetchBillingStatus());

    } catch {

      setError("請求情報の取得に失敗しました。");

    } finally {

      setLoading(false);

    }

  }, []);



  useEffect(() => {

    void reload();

  }, [reload]);



  useEffect(() => {

    if (checkoutResult === "success") {

      setMessage("お支払い手続きが完了しました。反映まで少しお待ちください。");

      void reload();

    } else if (checkoutResult === "cancel") {

      setMessage("チェックアウトをキャンセルしました。");

    }

  }, [checkoutResult, reload]);



  useEffect(() => {

    if (topupResult === "success") {

      setMessage("AI トークンの購入手続きが完了しました。");

      void reload();

    } else if (topupResult === "cancel") {

      setMessage("トークン購入をキャンセルしました。");

    }

  }, [topupResult, reload]);



  const handleCheckout = async (planId: string) => {

    setActing(planId);

    setError(null);

    try {

      const url = await startBillingCheckout(planId);

      window.location.href = url;

    } catch {

      setError("チェックアウトの開始に失敗しました。Stripe の設定を確認してください。");

      setActing(null);

    }

  };



  const handlePortal = async () => {

    setActing("portal");

    setError(null);

    try {

      const url = await openBillingPortal();

      window.location.href = url;

    } catch {

      setError("請求ポータルを開けませんでした。先にプランを契約してください。");

      setActing(null);

    }

  };



  const handleSyncUsage = async () => {

    setActing("sync");

    setError(null);

    try {

      const result = await syncBillingUsage();

      setMessage(

        result.synced

          ? `顧問先数を Stripe に同期しました（${result.billableClients ?? 0} 社）。`

          : "同期できませんでした（メーター未設定または未契約）。",

      );

      void reload();

    } catch {

      setError("利用量の同期に失敗しました。");

    } finally {

      setActing(null);

    }

  };



  const handlePaygo = async () => {

    setActing("paygo");

    setError(null);

    try {

      await enableAiPaygo();

      setMessage("従量課金（AI トークン）に同意しました。");

      void reload();

    } catch {

      setError("従量課金の有効化に失敗しました。");

    } finally {

      setActing(null);

    }

  };



  const handleTopup = async (packs: number) => {

    setActing(`topup-${packs}`);

    setError(null);

    try {

      const url = await startAiTopupCheckout(packs);

      window.location.href = url;

    } catch {

      setError("トークン購入の開始に失敗しました。");

      setActing(null);

    }

  };



  if (loading) {

    return (

      <div className="flex items-center gap-2 py-8 text-sm text-slate-500">

        <Loader2 className="h-4 w-4 animate-spin" />

        読み込み中…

      </div>

    );

  }



  if (!status) {

    return <p className="text-sm text-red-600">{error ?? "請求情報を取得できません。"}</p>;

  }



  const pricing = status.pricing;

  const estimate = status.estimatedMonthlyYen ?? 0;

  const ai = status.ai;



  return (

    <div className="space-y-6">

      <header className="space-y-2">

        <div className="flex items-center gap-2 text-emerald-700">

          <CreditCard className="h-5 w-5" />

          <h2 className="text-lg font-bold text-slate-800">プラン・お支払い（Stripe）</h2>

        </div>

        <p className="text-sm text-slate-600">

          税理士事務所向けサブスクリプション。販売パートナー経由の場合、契約期間中は手数料が自動分配されます。

        </p>

      </header>



      {!status.configured && (

        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">

          Stripe が未設定です。バックエンドに <code className="text-xs">STRIPE_SECRET_KEY</code> と

          Price ID（<code className="text-xs">STRIPE_PRICE_FIRM_BASE</code> 等）を設定してください。

        </p>

      )}



      {pricing && (

        <section className="rounded-xl border border-slate-200 bg-white p-4">

          <p className="text-xs font-bold text-slate-500">料金体系</p>

          <p className="mt-2 text-sm text-slate-700">

            基本料 {formatYen(pricing.firmBaseYen)}/月 ＋ 顧問先 {formatYen(pricing.firmPerClientYen)}/社/月

          </p>

          <p className="mt-1 text-xs text-slate-500">

            販売パートナー手数料 {pricing.partnerCommissionPercent}%（契約 {pricing.partnerContractYearsMin}〜

            {pricing.partnerContractYearsMax} 年）

          </p>

        </section>

      )}



      <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">

        <div className="flex flex-wrap items-start justify-between gap-3">

          <div>

            <p className="text-xs font-bold text-slate-500">現在の契約</p>

            <p className="mt-1 text-lg font-black text-slate-800">

              {status.plans.find((p) => p.id === status.planId)?.label ?? "事務所プラン"}

              <span className="ml-2 text-sm font-bold text-slate-500">

                {billingStatusLabel(status.status)}

              </span>

            </p>

            <p className="mt-1 text-xs text-slate-500">

              顧問先 {status.clientCount} 社 · メンバー {status.seatCount} 名

            </p>

            {estimate > 0 && (

              <p className="mt-1 text-xs font-bold text-emerald-800">

                見積月額: {formatYen(estimate)}（顧問先 {status.clientCount} 社込み）

              </p>

            )}

            {status.partner && (

              <p className="mt-1 text-xs text-slate-500">

                紹介パートナー: {status.partner.partnerName ?? status.partner.name ?? status.referralPartnerId}

                {status.partner.commissionPercent != null

                  ? `（${status.partner.commissionPercent}%）`

                  : ""}

              </p>

            )}

            {status.currentPeriodEnd && (

              <p className="mt-1 text-xs text-slate-500">

                次回更新: {new Date(status.currentPeriodEnd).toLocaleString("ja-JP")}

                {status.cancelAtPeriodEnd ? "（期間終了時に解約予定）" : ""}

              </p>

            )}

          </div>

          <div className="flex flex-wrap gap-2">

            <button

              type="button"

              onClick={() => void reload()}

              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"

            >

              <RefreshCw className="h-3.5 w-3.5" />

              更新

            </button>

            <button

              type="button"

              disabled={acting !== null}

              onClick={() => void handleSyncUsage()}

              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"

            >

              {acting === "sync" ? (

                <Loader2 className="h-3.5 w-3.5 animate-spin" />

              ) : (

                <Users className="h-3.5 w-3.5" />

              )}

              顧問先数を同期

            </button>

            {status.subscriptionId && status.configured && (

              <button

                type="button"

                disabled={acting === "portal"}

                onClick={() => void handlePortal()}

                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"

              >

                {acting === "portal" ? (

                  <Loader2 className="h-3.5 w-3.5 animate-spin" />

                ) : (

                  <ExternalLink className="h-3.5 w-3.5" />

                )}

                請求ポータル

              </button>

            )}

          </div>

        </div>

      </section>



      <section className="space-y-3">

        <h3 className="text-sm font-bold text-slate-800">事務所プラン</h3>

        <div className="grid gap-3 md:grid-cols-2">

          {status.plans.map((plan) => (

            <div

              key={plan.id}

              className={`rounded-xl border p-4 ${

                status.planId === plan.id

                  ? "border-emerald-300 bg-emerald-50/50"

                  : "border-slate-200 bg-white"

              }`}

            >

              <p className="text-sm font-black text-slate-800">{plan.label}</p>

              <p className="mt-1 text-xs text-slate-500">{plan.description}</p>

              {!plan.priceConfigured && (

                <p className="mt-2 text-[10px] font-bold text-amber-700">基本 Price ID 未設定</p>

              )}

              {plan.meterConfigured === false && (

                <p className="mt-1 text-[10px] font-bold text-amber-700">顧問先メーター Price 未設定</p>

              )}

              <button

                type="button"

                disabled={!status.configured || !plan.priceConfigured || acting !== null}

                onClick={() => void handleCheckout(plan.id)}

                className="mt-3 w-full rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"

              >

                {acting === plan.id ? (

                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />

                ) : status.planId === plan.id ? (

                  "プラン変更"

                ) : (

                  "このプランで始める"

                )}

              </button>

            </div>

          ))}

        </div>

      </section>



      {ai && (

        <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-3">

          <div className="flex items-center gap-2 text-violet-800">

            <Sparkles className="h-4 w-4" />

            <h3 className="text-sm font-bold">AI トークン（顧問先単位）</h3>

          </div>

          <p className="text-xs text-slate-600">

            顧問先ごとに月 {ai.includedTokensPerClient.toLocaleString()} トークンまで無料。超過時はお知らせのうえ停止し、

            従量課金（{formatYen(ai.yenPerPack)}/パック ≒ {ai.tokensPer100Yen.toLocaleString()} トークン）で継続できます。

          </p>

          <div className="flex flex-wrap gap-4 text-xs text-slate-700">

            <span>残高: {ai.tokenBalance.toLocaleString()} トークン</span>

            <span>従量課金: {ai.paygoEnabled ? "有効" : "未同意"}</span>

          </div>

          <div className="flex flex-wrap gap-2">

            {!ai.paygoEnabled && (

              <button

                type="button"

                disabled={acting !== null}

                onClick={() => void handlePaygo()}

                className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-bold text-violet-800 hover:bg-violet-50 disabled:opacity-60"

              >

                {acting === "paygo" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "従量課金に同意"}

              </button>

            )}

            {[1, 5, 10].map((packs) => (

              <button

                key={packs}

                type="button"

                disabled={!status.configured || acting !== null}

                onClick={() => void handleTopup(packs)}

                className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-800 disabled:opacity-50"

              >

                {acting === `topup-${packs}` ? (

                  <Loader2 className="h-3.5 w-3.5 animate-spin" />

                ) : (

                  `${formatYen(packs * ai.yenPerPack)} 購入`

                )}

              </button>

            ))}

          </div>

        </section>

      )}



      {isPlatformAdmin && <BillingPartnerAdminSection />}



      <p className="text-xs text-slate-500">

        Webhook: <code className="text-[10px]">POST /api/billing/webhook</code>

        {" · "}

        ローカルは <code className="text-[10px]">stripe listen --forward-to localhost:8000/api/billing/webhook</code>

      </p>



      {message && <p className="text-sm text-emerald-700">{message}</p>}

      {error && <p className="text-sm text-red-600">{error}</p>}

    </div>

  );

}

