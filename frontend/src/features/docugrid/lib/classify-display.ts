/** 分類エンジン表示用ラベル（UI 向け） */

export type ClassifyEngineTone = "gemini" | "openai" | "rules" | "warn" | "neutral";

export type ClassifyEngineInfo = {
  shortLabel: string;
  badgeClass: string;
  tone: ClassifyEngineTone;
  isAi: boolean;
};

const ENGINE_MAP: Record<string, ClassifyEngineInfo> = {
  gemini: {
    shortLabel: "Gemini AI",
    badgeClass: "bg-violet-100 text-violet-800 border border-violet-200",
    tone: "gemini",
    isAi: true,
  },
  "gemini-vision": {
    shortLabel: "Gemini Vision",
    badgeClass: "bg-violet-100 text-violet-800 border border-violet-200",
    tone: "gemini",
    isAi: true,
  },
  openai: {
    shortLabel: "OpenAI",
    badgeClass: "bg-emerald-100 text-emerald-800 border border-emerald-200",
    tone: "openai",
    isAi: true,
  },
  "openai-vision": {
    shortLabel: "OpenAI Vision",
    badgeClass: "bg-emerald-100 text-emerald-800 border border-emerald-200",
    tone: "openai",
    isAi: true,
  },
  pymupdf: {
    shortLabel: "ルール分類",
    badgeClass: "bg-slate-100 text-slate-600 border border-slate-200",
    tone: "rules",
    isAi: false,
  },
  tesseract: {
    shortLabel: "OCR + ルール",
    badgeClass: "bg-slate-100 text-slate-600 border border-slate-200",
    tone: "rules",
    isAi: false,
  },
  rules: {
    shortLabel: "ルール分類",
    badgeClass: "bg-slate-100 text-slate-600 border border-slate-200",
    tone: "rules",
    isAi: false,
  },
  form_catalog: {
    shortLabel: "様式カタログ",
    badgeClass: "bg-indigo-100 text-indigo-800 border border-indigo-200",
    tone: "neutral",
    isAi: false,
  },
  none: {
    shortLabel: "抽出不可",
    badgeClass: "bg-amber-100 text-amber-800 border border-amber-200",
    tone: "warn",
    isAi: false,
  },
};

const FALLBACK: ClassifyEngineInfo = {
  shortLabel: "分類",
  badgeClass: "bg-slate-100 text-slate-600 border border-slate-200",
  tone: "neutral",
  isAi: false,
};

export function describeClassifyEngine(engine: string): ClassifyEngineInfo {
  return ENGINE_MAP[engine] ?? { ...FALLBACK, shortLabel: engine || FALLBACK.shortLabel };
}

export type BatchClassifyCapabilities = {
  vision_gemini?: boolean;
  vision_openai?: boolean;
  vision_enabled?: boolean;
  ai_gemini_key_configured?: boolean;
  ai_openai_key_configured?: boolean;
};

export type ClassifyBanner = {
  tone: ClassifyEngineTone;
  title: string;
  detail?: string;
};

export function bannerFromBatchCapabilities(
  cap: BatchClassifyCapabilities | undefined,
  documents?: { engine: string }[],
): ClassifyBanner | null {
  const catalogCount = documents?.filter((d) => d.engine === "form_catalog").length ?? 0;
  if (catalogCount > 0) {
    return {
      tone: "neutral",
      title: `様式カタログで ${catalogCount} 件を識別しました`,
      detail: "束 PDF はページ単位で様式を判定し、行を分割しています。",
    };
  }
  if (!cap) return null;
  if (cap.vision_gemini) {
    return {
      tone: "gemini",
      title: "Gemini Vision で分類しました",
      detail: "PDF の見た目から書類種別を判定しています。",
    };
  }
  if (cap.vision_openai) {
    return {
      tone: "openai",
      title: "OpenAI Vision で分類しました",
      detail: "PDF の見た目から書類種別を判定しています。",
    };
  }
  if (cap.vision_enabled) {
    return {
      tone: "neutral",
      title: "Vision AI で分類しました",
    };
  }
  if (cap.ai_gemini_key_configured || cap.ai_openai_key_configured) {
    return {
      tone: "warn",
      title: "ルール分類のみで処理しました",
      detail: "OCR 自動抽出と Gemini / OpenAI の有効化を設定で確認してください。",
    };
  }
  return {
    tone: "warn",
    title: "ルール分類のみ（AI 未設定）",
    detail: "設定 → 外部連携 → AI / OCR で API キーを登録できます。",
  };
}

export function summarizeAutoSortEngines(engines: string[]): string | null {
  const gemini = engines.filter((e) => e === "gemini" || e === "gemini-vision").length;
  const openai = engines.filter((e) => e === "openai" || e === "openai-vision").length;
  const parts: string[] = [];
  if (gemini > 0) parts.push(`Gemini ${gemini}件`);
  if (openai > 0) parts.push(`OpenAI ${openai}件`);
  const catalog = engines.filter((e) => e === "form_catalog").length;
  if (catalog > 0) parts.push(`様式カタログ ${catalog}件`);
  if (parts.length === 0) return null;
  return `AI 判定: ${parts.join("、")}`;
}
