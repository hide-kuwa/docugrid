import { HELP_ARTICLES, type HelpArticle } from "@/features/help/help-articles";
import { FEATURE_TOURS, type FeatureTourDefinition } from "@/lib/feature-tours";
import {
  SUPPORT_ESCALATION_COPY,
  type SupportIntent,
  type SupportMessage,
} from "@/features/support/support-types";

/** Extra keywords → help article id (S1 local matcher; S2 = RAG). */
const KEYWORD_HINTS: Array<{ id: string; words: string[] }> = [
  { id: "auto-sort", words: ["自動", "振り分け", "要確認", "キュー", "まとめて", "分類"] },
  { id: "saving", words: ["保存", "どこ", "サーバー", "drive", "ドライブ", "消えた", "見えない"] },
  { id: "guest-pdf", words: ["ゲスト", "/pdf", "ログイン不要"] },
  { id: "pdf", words: ["注釈", "並べ替え", "ダウンロード", "pdf編集"] },
  { id: "karte", words: ["カルテ", "メモ", "マスタ", "グラフ", "給与", "株評"] },
  { id: "doc-matrix", words: ["マトリクス", "スロット", "r8", "r7", "期", "doc"] },
  { id: "workspace", words: ["レール", "メニュー", "切り替え", "≡"] },
  { id: "tax-progress", words: ["税務進捗", "tax", "中間", "源泉", "決算"] },
  { id: "audit-flow", words: ["承認", "監査", "作業保存", "差戻"] },
  { id: "dm", words: ["dm", "チャット", "メール", "連絡"] },
  { id: "support", words: ["電話", "cs", "サポート", "不具合", "バグ", "壊"] },
  { id: "faq", words: ["faq", "よくある", "わからない"] },
  { id: "google-drive", words: ["google", "ミラー", "連携"] },
];

const TOUR_HINTS: Array<{ tourId: string; words: string[] }> = [
  { tourId: "first_workspace", words: ["はじめ", "最初", "全体", "使い方"] },
  { tourId: "doc_matrix", words: ["マトリクス", "スロット", "期"] },
  { tourId: "auto_sort", words: ["自動", "振り分け", "要確認"] },
  { tourId: "karte_hub", words: ["カルテ"] },
  { tourId: "pdf_workspace", words: ["pdf"] },
  { tourId: "tax_board", words: ["tax", "税務"] },
  { tourId: "saving_basics", words: ["保存", "どこ"] },
];

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, "");
}

function scoreArticle(query: string, article: HelpArticle, hintWords: string[]): number {
  const q = normalize(query);
  if (!q) return 0;
  let score = 0;
  const hay = normalize(`${article.id}${article.title}${article.summary}`);
  if (hay.includes(normalize(article.id)) && q.includes(normalize(article.id))) score += 8;
  for (const part of article.title.split(/[\s·・]+/)) {
    const p = normalize(part);
    if (p.length >= 2 && q.includes(p)) score += 5;
  }
  for (const w of hintWords) {
    if (q.includes(normalize(w))) score += 4;
  }
  for (const token of article.summary.split(/[、。・\s]+/)) {
    const t = normalize(token);
    if (t.length >= 2 && q.includes(t)) score += 1;
  }
  return score;
}

export function detectSupportIntent(query: string): SupportIntent {
  const q = normalize(query);
  if (!q) return "unknown";
  if (/(バグ|不具合|壊|エラー|動かない|落ちる)/.test(q)) return "bug_report";
  if (/(電話|コール)/.test(q)) return "escalate_phone";
  if (/(メール|cs|人に|サポートに連絡)/.test(q)) return "escalate_email";
  if (/(ガイド|ツアー|チュートリアル|教えて|どうやって)/.test(q)) return "tutorial";
  return "howto";
}

export function matchHelpArticles(query: string, limit = 3): HelpArticle[] {
  const scored = HELP_ARTICLES.map((article) => {
    const hint = KEYWORD_HINTS.find((h) => h.id === article.id);
    return { article, score: scoreArticle(query, article, hint?.words ?? []) };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.article);
}

export function matchTour(query: string): FeatureTourDefinition | undefined {
  const q = normalize(query);
  let best: { tour: FeatureTourDefinition; score: number } | null = null;
  for (const hint of TOUR_HINTS) {
    const tour = FEATURE_TOURS.find((t) => t.id === hint.tourId);
    if (!tour) continue;
    let score = 0;
    for (const w of hint.words) {
      if (q.includes(normalize(w))) score += 3;
    }
    if (score > 0 && (!best || score > best.score)) best = { tour, score };
  }
  return best?.tour;
}

function newId(): string {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function buildMockSupportReply(query: string): SupportMessage {
  const intent = detectSupportIntent(query);
  const articles = matchHelpArticles(query);
  const tour = matchTour(query);
  const top = articles[0];

  if (intent === "escalate_phone") {
    return {
      id: newId(),
      role: "assistant",
      content: SUPPORT_ESCALATION_COPY.phoneOnlyWhenNeeded,
      createdAt: new Date().toISOString(),
      helpDocId: "support",
    };
  }

  if (intent === "bug_report" || intent === "escalate_email") {
    return {
      id: newId(),
      role: "assistant",
      content: [
        intent === "bug_report"
          ? "不具合の件、ありがとうございます。いまはチャットから自動チケット送信はまだです。"
          : "CS への連絡ですね。",
        SUPPORT_ESCALATION_COPY.emailFirst,
        "伝えると良いこと: いつ／どの画面（Doc・PDF・カルテなど）／何をしようとしたか／出たメッセージ。",
        top ? `関連ヘルプ: 「${top.title}」(/help?id=${top.id})` : "ヘルプ一覧: /help",
      ].join("\n"),
      createdAt: new Date().toISOString(),
      helpDocId: top?.id ?? "support",
      tourId: tour?.id,
    };
  }

  if (!top && !tour) {
    return {
      id: newId(),
      role: "assistant",
      content: [
        "ヘルプ記事から近いものが見つかりませんでした（プレビュー応答です）。",
        "左のパネルから「ヘルプセンター」を開くか、言葉を変えて聞いてみてください。",
        "例: 「保存はどこ？」「自動振り分け」「カルテの左」",
        SUPPORT_ESCALATION_COPY.emailFirst,
      ].join("\n"),
      createdAt: new Date().toISOString(),
      helpDocId: "faq",
    };
  }

  const lines: string[] = [
    "ヘルプ記事に基づく案内です（まだ本格 AI／RAG ではありません）。",
  ];
  if (top) {
    lines.push(`いちばん近い記事: **${top.title}** — ${top.summary}`);
    lines.push(`読む: /help?id=${top.id}`);
  }
  if (articles.length > 1) {
    lines.push(
      `ほか: ${articles
        .slice(1)
        .map((a) => a.title)
        .join(" / ")}`,
    );
  }
  if (tour) {
    lines.push(`画面ガイド「${tour.label}」も使えます（下のボタン）。`);
  }
  lines.push("解決しなければサポート経由でメール CS へ。電話は最終手段です。");

  return {
    id: newId(),
    role: "assistant",
    content: lines.join("\n"),
    createdAt: new Date().toISOString(),
    helpDocId: top?.id,
    tourId: tour?.id,
  };
}

export function createUserSupportMessage(content: string): SupportMessage {
  return {
    id: newId(),
    role: "user",
    content,
    createdAt: new Date().toISOString(),
  };
}
