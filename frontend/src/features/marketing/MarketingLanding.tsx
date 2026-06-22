"use client";

import Link from "next/link";
import { ArrowRight, Grid3X3, ScanLine, ShieldCheck, Sparkles } from "lucide-react";
import { DemoMatrix } from "./DemoMatrix";

const FEATURES = [
  {
    icon: Grid3X3,
    title: "顧問先 × 期間のマトリクス",
    body: "試算表・元帳・請求書を枠で整理。誰が・いつ・何を上げたかが一目でわかります。",
  },
  {
    icon: ScanLine,
    title: "OCR → 正規化",
    body: "PDF を読み取り、指標キーにマッピング。監査と税務会計システムへの連携の土台になります。",
  },
  {
    icon: ShieldCheck,
    title: "監査フロー内蔵",
    body: "承認依頼から完了まで、資料と数値の根拠を同じ画面で追跡できます。",
  },
];

export function MarketingLanding() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-100">
      <header className="border-b border-slate-200/60 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-sm font-black text-white shadow-md">
              DG
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">DocuGrid</p>
              <p className="text-[10px] font-medium text-slate-500">TAXX 資料整理</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              ログイン
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-500"
            >
              無料で試す
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pb-10 pt-12 md:px-6 md:pt-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              税理士事務所向け · 資料マトリクス
            </p>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-5xl md:leading-tight">
              資料を置くだけ。
              <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                数値がぱんぱんぱん、揃う。
              </span>
            </h1>
            <p className="mt-4 text-base leading-relaxed text-slate-600 md:text-lg">
              DocuGrid は顧問先ごとの資料をマトリクスで管理し、OCR で正規化した指標を監査・税務会計システムへ渡す、TAXX
              エコシステムの資料整理ハブです。
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/25 hover:bg-blue-500"
              >
                本番環境に入る
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <a
                href="#demo"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-700 hover:border-blue-300"
              >
                デモを触る
              </a>
            </div>
          </div>
        </section>

        <section id="demo" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-16 md:px-6">
          <DemoMatrix />
        </section>

        <section className="border-y border-slate-200/60 bg-white/50 py-14">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-3 md:px-6">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="text-base font-bold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 text-center md:px-6">
          <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">事務所の資料整理を、ひとつに。</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-600">
            ログイン後は本物のマトリクス・PDF ビューア・監査フローが使えます。まずは上のデモで体験してから、お試しください。
          </p>
          <Link
            href="/login"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-8 py-3.5 text-sm font-bold text-white hover:bg-slate-800"
          >
            TAXX にログイン
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-slate-50 py-6 text-center text-xs text-slate-500">
        DocuGrid · TAXX Ecosystem · 資料整理プロダクト
      </footer>
    </div>
  );
}
