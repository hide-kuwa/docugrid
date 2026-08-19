import { useEffect, useRef, useState } from "react";

import { buildPdfDocumentParams, loadPdfJs } from "../lib/pdfjs-config";
import {
  type DocumentSection,
  buildSectionsFromPageTexts,
} from "../lib/document-sections";

type SectionState = {
  sections: DocumentSection[];
  pageCount: number;
  loading: boolean;
  error: string | null;
};

const INITIAL: SectionState = {
  sections: [],
  pageCount: 0,
  loading: false,
  error: null,
};

/** 注釈更新で File が差し替わっても、同じドキュメントなら結果を再利用 */
const sectionCache = new Map<string, SectionState>();
const CACHE_LIMIT = 12;

function remember(key: string, state: SectionState) {
  if (state.loading || state.error) return;
  sectionCache.delete(key);
  sectionCache.set(key, state);
  while (sectionCache.size > CACHE_LIMIT) {
    const oldest = sectionCache.keys().next().value;
    if (oldest === undefined) break;
    sectionCache.delete(oldest);
  }
}

/** file をフィンガープリントで区別し、同一ファイルの再解析を避ける */
function fingerprint(file: File | null): string | null {
  if (!file) return null;
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/**
 * PDF を pdf.js で開き、各ページのテキストから別表・受信通知セクションを検出する。
 * enabled=false の間は解析しない（分割表示中など）。
 * analysisKey が同じなら注釈などで File が更新されても再解析しない。
 */
export function useDocumentSections(
  file: File | null,
  enabled: boolean,
  analysisKey?: string | number | null,
): SectionState {
  const resolvedKey =
    analysisKey != null && String(analysisKey).length > 0
      ? String(analysisKey)
      : fingerprint(file);
  const cached = resolvedKey ? sectionCache.get(resolvedKey) : undefined;
  const [state, setState] = useState<SectionState>(cached ?? INITIAL);
  const fileRef = useRef(file);
  fileRef.current = file;

  useEffect(() => {
    if (!resolvedKey || !fileRef.current) {
      setState(INITIAL);
      return;
    }

    const hit = sectionCache.get(resolvedKey);
    if (hit) {
      setState(hit);
      return;
    }

    // 索引パネルを閉じた／分割表示中は走らせない。キャッシュも消さない。
    if (!enabled) {
      return;
    }

    const fileToAnalyze = fileRef.current;
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const data = await fileToAnalyze.arrayBuffer();
        const pdf = await pdfjs.getDocument(
          buildPdfDocumentParams(data, pdfjs.version),
        ).promise;

        const pageTexts: string[] = [];
        for (let i = 1; i <= pdf.numPages; i += 1) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const text = content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ");
          pageTexts.push(text);
        }

        if (cancelled) return;
        const next: SectionState = {
          sections: buildSectionsFromPageTexts(pageTexts),
          pageCount: pdf.numPages,
          loading: false,
          error: null,
        };
        remember(resolvedKey, next);
        setState(next);
      } catch (err) {
        if (cancelled) return;
        setState({
          sections: [],
          pageCount: 0,
          loading: false,
          error: err instanceof Error ? err.message : "解析に失敗しました",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedKey, enabled]);

  return state;
}
