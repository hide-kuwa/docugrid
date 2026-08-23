import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Wallet, Receipt, Landmark, HeartPulse, BadgeCheck, ArrowRight } from "lucide-react";
import { ToolsHeader, ToolsFooter } from "@/features/tools/ToolShell";

export const metadata: Metadata = {
  title: "TAXX Tools — 税務計算・法定マスターの無料ツール",
  description:
    "法人税率・給与所得控除・源泉徴収税額など、税務実務でよく使う計算をその場で。国税庁の公表値をもとにした無料ツール集。TAXX エコシステムが提供。",
};

const TOOLS = [
  {
    id: "corporate-tax",
    href: "/tools/corporate-tax",
    title: "法人税率チェッカー",
    summary: "課税所得と事業年度から法人税額を試算。軽減税率・標準税率の内訳も表示。",
    category: "法人税",
    Icon: Building2,
  },
  {
    id: "employment-income",
    href: "/tools/employment-income",
    title: "給与所得控除チェッカー",
    summary: "給与収入から給与所得控除額と給与所得を自動計算。",
    category: "所得税",
    Icon: Wallet,
  },
  {
    id: "withholding",
    href: "/tools/withholding",
    title: "源泉徴収税額表ビューア",
    summary: "月額表に基づく源泉所得税額（甲欄・乙欄）を試算。表全体も確認可能。",
    category: "源泉所得税",
    Icon: Receipt,
  },
  {
    id: "local-tax",
    href: "/tools/local-tax",
    title: "法人地方税シミュレーター",
    summary: "課税所得・資本金・従業員数から、法人税、地方法人税、法人住民税、事業税、特別法人事業税をまとめて試算。",
    category: "地方税（法人）",
    Icon: Landmark,
  },
  {
    id: "consumption-taxable",
    href: "/tools/consumption-taxable",
    title: "消費税 課税事業者判定",
    summary: "基準期間・特定期間・インボイス等から課税事業者かをフローチャートで簡易判定。",
    category: "消費税",
    Icon: BadgeCheck,
  },
  {
    id: "association-health",
    href: "/tools/association-health",
    title: "協会けんぽ 保険料額表",
    summary: "都道府県別の健保・介護・支援金・厚生年金の料率と、報酬月額から等級・保険料額を試算。",
    category: "社会保険",
    Icon: HeartPulse,
  },
];

export default function ToolsLandingPage() {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <ToolsHeader />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-14">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-600">TAXX Tools</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-black leading-tight tracking-tight sm:text-4xl">
            税務計算を、その場で。
          </h1>
          <p className="mt-3 max-w-2xl text-base text-slate-600">
            法人税率・給与所得控除・源泉徴収税額など、実務でよく使う計算を無料で。
            国税庁が公表する法定値をもとに、入力するとすぐに結果が出ます。
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map(({ id, href, title, summary, category, Icon }) => (
            <Link
              key={id}
              href={href}
              className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">
                  {category}
                </span>
              </div>
              <h2 className="mt-4 text-base font-black text-slate-900">{title}</h2>
              <p className="mt-1 flex-1 text-sm text-slate-600">{summary}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-blue-600 group-hover:gap-2">
                使ってみる
                <ArrowRight className="h-4 w-4 transition-all" />
              </span>
            </Link>
          ))}
        </div>
      </main>

      <ToolsFooter />
    </div>
  );
}
