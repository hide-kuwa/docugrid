import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { TaxxLogo, DocuGridLogo } from "@/components/brand";
import { toolsTheme } from "@/features/tools/taxx-tools-theme";

// TAXX Tools 共通シェル。ヘッダー（ブランド階層）＋本文＋フッター（免責・DocuGrid導線）。
export function ToolShell({
  title,
  subtitle,
  category,
  sourceUrl,
  sourceLabel = "国税庁",
  asOf,
  children,
  homeHref = "/tools",
  homeLabel = "TAXX Tools 一覧",
  maxWidthClass = "max-w-5xl",
  hideHomeNav = false,
}: {
  title: string;
  subtitle?: string;
  category?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  asOf?: string;
  children: ReactNode;
  /** 上部ナビの戻り先（独立ツールは別パス可） */
  homeHref?: string;
  homeLabel?: string;
  maxWidthClass?: string;
  hideHomeNav?: boolean;
}) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <ToolsHeader />
      <main className={`mx-auto ${maxWidthClass} px-4 py-8`}>
        {!hideHomeNav ? (
          <nav className="mb-4 text-xs text-slate-500">
            <Link href={homeHref} className="inline-flex items-center gap-1 font-bold taxx-link">
              <ArrowLeft className="h-3.5 w-3.5" />
              {homeLabel}
            </Link>
          </nav>
        ) : null}

        <header className="mb-6">
          {category ? (
            <span className={`mb-2 inline-block ${toolsTheme.categoryBadge}`}>
              {category}
            </span>
          ) : null}
          <h1 className="text-2xl font-black tracking-tight text-slate-900">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
            {asOf ? <span>適用時点: {asOf}</span> : null}
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center gap-1 ${toolsTheme.link}`}
              >
                <ExternalLink className="h-3 w-3" />
                出典: {sourceLabel}
              </a>
            ) : null}
          </div>
        </header>

        {children}

        <Disclaimer />
      </main>
      <ToolsFooter />
    </div>
  );
}

export function ToolsHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/tools" className="inline-flex items-center gap-2">
          <TaxxLogo size="xs" showSymbol />
          <span className="font-wordmark text-sm font-bold text-foreground" style={{ letterSpacing: "-0.02em" }}>
            {" "}
            Tools
          </span>
        </Link>
        <a
          href="/welcome"
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700"
        >
          DocuGrid を見る
        </a>
      </div>
    </header>
  );
}

export function Disclaimer() {
  return (
    <p className={toolsTheme.notice}>
      本ツールの計算結果は、公表されている法令等をもとにした<strong>参考情報</strong>です。
      実際の税額・判定は個別事情により異なる場合があります。最終的な税務判断は税理士等の専門家にご確認ください。
    </p>
  );
}

export function ToolsFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-2xl bg-neutral-900 px-6 py-6 text-white sm:px-8 sm:py-7">
          <DocuGridLogo size="sm" surface="dark" showSymbol={false} />
          <h2 className="mt-3 text-lg font-black">この計算を、申告書PDFから自動で。</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            DocuGrid なら、税務書類をアップロードするだけで数値を抽出し、TAXX の法定マスターと照合して検算できます。
            OCR・AI分類・申告書レビューまで、書類まわりを一気通貫で。
          </p>
          <a
            href="/welcome"
            className="taxx-btn-primary mt-4 inline-flex gap-1.5"
          >
            DocuGrid を詳しく見る
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <p className="mt-6 text-center text-[11px] text-slate-400">
          © TAXX — TAXX Tools は税務計算の参考ツールです。DocuGrid は TAXX の書類AIプロダクトです。
        </p>
      </div>
    </footer>
  );
}
