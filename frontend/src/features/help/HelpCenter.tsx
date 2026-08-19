import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { HELP_ARTICLES, getHelpArticle } from "@/features/help/help-articles";
import { HelpMarkdown } from "@/features/help/HelpMarkdown";

type Props = {
  articleId?: string | null;
  markdown?: string | null;
};

export function HelpCenter({ articleId, markdown }: Props) {
  const article = articleId ? getHelpArticle(articleId) : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100">
      <header className="border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            業務画面へ
          </Link>
          <Link href="/help" className="flex items-center gap-2 text-teal-700">
            <BookOpen className="h-4 w-4" />
            <span className="text-sm font-black tracking-tight">ヘルプ</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {article ? (
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-[10px] font-bold uppercase tracking-widest text-teal-600">
              {article.audience}
            </p>
            {markdown ? (
              <HelpMarkdown source={markdown} />
            ) : (
              <>
                <h1 className="mt-1 text-2xl font-black text-slate-900">{article.title}</h1>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{article.summary}</p>
                <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
                  本文ファイルを読めませんでした（{article.docPath}）。開発サーバーの起動ディレクトリを確認してください。
                </p>
              </>
            )}
            <div className="mt-8 flex flex-wrap gap-3 border-t border-slate-100 pt-4">
              <Link href="/help" className="text-sm font-bold text-teal-700 hover:underline">
                ← ヘルプ一覧
              </Link>
              <Link href="/help?id=support" className="text-sm font-semibold text-slate-500 hover:underline">
                困ったとき
              </Link>
            </div>
          </article>
        ) : (
          <>
            <h1 className="text-2xl font-black text-slate-900">ヘルプセンター</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-600">
              使い方の目次です。記事を開くと全文が読めます。左レールの<strong>ヘルプ</strong>にマウスを乗せるとガイド・サポートも出せます。
              <strong>サポート</strong>で CS までの流れも確認できます。
            </p>
            <ul className="mt-8 space-y-2">
              {HELP_ARTICLES.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/help?id=${item.id}`}
                    className="flex flex-col rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-teal-300 hover:bg-teal-50/40"
                  >
                    <span className="text-sm font-bold text-slate-800">{item.title}</span>
                    <span className="mt-0.5 text-xs text-slate-500">{item.summary}</span>
                    <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {item.audience}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
