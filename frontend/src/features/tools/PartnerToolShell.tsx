import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { getPartnerExecCompConfig } from "@/config/partner-exec-comp";
import { Disclaimer } from "@/features/tools/ToolShell";

/** パートナー別公開用シェル（TAXX / DocuGrid 導線なし、Powered by のみ）。 */
export function PartnerToolShell({
  title,
  subtitle,
  category,
  sourceUrl,
  sourceLabel = "国税庁",
  asOf,
  children,
  maxWidthClass = "max-w-6xl",
}: {
  title: string;
  subtitle?: string;
  category?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  asOf?: string;
  children: ReactNode;
  maxWidthClass?: string;
}) {
  const { partnerName, partnerSiteUrl, poweredByUrl } = getPartnerExecCompConfig();
  const displayName = partnerName ?? "役員報酬シミュレーター";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className={`mx-auto flex ${maxWidthClass} items-center justify-between gap-4 px-4 py-3`}>
          {partnerSiteUrl ? (
            <a
              href={partnerSiteUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-black text-slate-900 hover:text-blue-700"
            >
              {displayName}
            </a>
          ) : (
            <span className="text-sm font-black text-slate-900">{displayName}</span>
          )}
          <a
            href={poweredByUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] font-bold text-slate-400 hover:text-slate-600"
          >
            Powered by TAXX
          </a>
        </div>
      </header>

      <main className={`mx-auto ${maxWidthClass} px-4 py-8`}>
        <header className="mb-6">
          {category ? (
            <span className="mb-2 inline-block rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-black text-slate-600">
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
                className="inline-flex items-center gap-1 font-bold text-blue-600 hover:text-blue-700"
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

      <footer className="border-t border-slate-200 bg-white">
        <div className={`mx-auto ${maxWidthClass} px-4 py-6 text-center`}>
          <p className="text-[11px] text-slate-400">
            {partnerName ? (
              <>
                {partnerSiteUrl ? (
                  <a href={partnerSiteUrl} className="font-bold text-slate-500 hover:text-slate-700">
                    {partnerName}
                  </a>
                ) : (
                  <span className="font-bold text-slate-500">{partnerName}</span>
                )}
                {" · "}
              </>
            ) : null}
            <a href={poweredByUrl} className="hover:text-slate-600">
              Powered by TAXX
            </a>
            {" · "}
            計算結果は参考情報です
          </p>
        </div>
      </footer>
    </div>
  );
}
