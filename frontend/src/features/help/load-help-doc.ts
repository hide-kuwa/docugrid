import fs from "node:fs/promises";
import path from "node:path";
import { getHelpArticle } from "@/features/help/help-articles";

/** Resolve docs/help/*.md from monorepo (Next cwd is usually frontend/). */
export function helpDocsDirCandidates(): string[] {
  const cwd = process.cwd();
  return [
    path.resolve(cwd, "..", "docs", "help"),
    path.resolve(cwd, "docs", "help"),
  ];
}

export async function loadHelpArticleMarkdown(
  articleId: string,
): Promise<string | null> {
  const meta = getHelpArticle(articleId);
  if (!meta) return null;
  const fileName = path.basename(meta.docPath);
  if (!fileName.endsWith(".md") || fileName.includes("..")) return null;

  for (const dir of helpDocsDirCandidates()) {
    const full = path.join(dir, fileName);
    try {
      return await fs.readFile(full, "utf8");
    } catch {
      /* try next */
    }
  }
  return null;
}
