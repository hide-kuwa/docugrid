"use client";



import { useCallback, useEffect, useState } from "react";

import { Handshake, Loader2, Plus } from "lucide-react";

import {

  createSalesPartner,

  fetchSalesPartners,

  startPartnerOnboarding,

  type SalesPartner,

} from "@/features/billing/billing-api";



export function BillingPartnerAdminSection() {

  const [partners, setPartners] = useState<SalesPartner[]>([]);

  const [loading, setLoading] = useState(true);

  const [acting, setActing] = useState<string | null>(null);

  const [name, setName] = useState("");

  const [email, setEmail] = useState("");

  const [error, setError] = useState<string | null>(null);



  const reload = useCallback(async () => {

    setLoading(true);

    try {

      setPartners(await fetchSalesPartners());

    } catch {

      setError("パートナー一覧の取得に失敗しました。");

    } finally {

      setLoading(false);

    }

  }, []);



  useEffect(() => {

    void reload();

  }, [reload]);



  const handleCreate = async () => {

    if (!name.trim() || !email.trim()) return;

    setActing("create");

    setError(null);

    try {

      await createSalesPartner({ name: name.trim(), email: email.trim() });

      setName("");

      setEmail("");

      void reload();

    } catch {

      setError("パートナーの作成に失敗しました。");

    } finally {

      setActing(null);

    }

  };



  const handleOnboard = async (partnerId: string) => {

    setActing(partnerId);

    setError(null);

    try {

      const url = await startPartnerOnboarding(partnerId);

      window.location.href = url;

    } catch {

      setError("Stripe Connect の onboarding を開始できませんでした。");

      setActing(null);

    }

  };



  return (

    <section className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 space-y-4">

      <div className="flex items-center gap-2 text-amber-900">

        <Handshake className="h-4 w-4" />

        <h3 className="text-sm font-bold">販売パートナー（プラットフォーム管理）</h3>

      </div>

      <p className="text-xs text-slate-600">

        営業会社を登録し Stripe Connect で onboarding します。事務所に紐づけると、契約期間中サブスクの 20% が自動分配されます。

      </p>



      <div className="flex flex-wrap gap-2">

        <input

          type="text"

          placeholder="会社名"

          value={name}

          onChange={(e) => setName(e.target.value)}

          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"

        />

        <input

          type="email"

          placeholder="メール"

          value={email}

          onChange={(e) => setEmail(e.target.value)}

          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"

        />

        <button

          type="button"

          disabled={acting !== null}

          onClick={() => void handleCreate()}

          className="inline-flex items-center gap-1 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-800 disabled:opacity-60"

        >

          {acting === "create" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}

          追加

        </button>

      </div>



      {loading ? (

        <p className="text-xs text-slate-500">読み込み中…</p>

      ) : (

        <ul className="space-y-2">

          {partners.map((p) => (

            <li

              key={p.id}

              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"

            >

              <div>

                <span className="font-bold text-slate-800">{p.name}</span>

                <span className="ml-2 text-slate-500">{p.email}</span>

                <span className="ml-2 text-slate-400">{p.commissionPercent}%</span>

              </div>

              <button

                type="button"

                disabled={acting !== null || p.onboardingComplete}

                onClick={() => void handleOnboard(p.id)}

                className="rounded border border-amber-300 px-2 py-1 font-bold text-amber-900 hover:bg-amber-50 disabled:opacity-50"

              >

                {p.onboardingComplete ? "登録済み" : acting === p.id ? "…" : "Connect 登録"}

              </button>

            </li>

          ))}

          {partners.length === 0 && <li className="text-xs text-slate-500">パートナー未登録</li>}

        </ul>

      )}



      {error && <p className="text-xs text-red-600">{error}</p>}

    </section>

  );

}

