import { HelpCenter } from "@/features/help/HelpCenter";
import { loadHelpArticleMarkdown } from "@/features/help/load-help-doc";

type Props = {
  searchParams?: { id?: string };
};

export default async function HelpPage({ searchParams }: Props) {
  const articleId = searchParams?.id ?? null;
  const markdown = articleId ? await loadHelpArticleMarkdown(articleId) : null;

  return <HelpCenter articleId={articleId} markdown={markdown} />;
}
