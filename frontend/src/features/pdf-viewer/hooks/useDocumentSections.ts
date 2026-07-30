import { useEffect, useState } from "react";

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

/** file をフィンガープリントで区別し、同一ファイルの再解析を避ける */
function fingerprint(file: File | null): string | null {
  if (!file) return null;
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/**
 * PDF を pdf.js で開き、各ページのテキストから別表・受信通知セクションを検出する。
 * enabled=false の間は解析しない（分割表示中など）。
 */
export function useDocumentSections(
  file: File | null,
  enabled: boolean,
): SectionState {
  const [state, setState] = useState<SectionState>(INITIAL);
  const fp = fingerprint(file);

  useEffect(() => {
    if (!enabled || !file) {
      setState(INITIAL);
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const data = await file.arrayBuffer();
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
        const sections = buildSectionsFromPageTexts(pageTexts);
        setState({
          sections,
          pageCount: pdf.numPages,
          loading: false,
          error: null,
        });
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
    // fp をキーに、同一ファイルなら再解析しない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fp, enabled]);

  return state;
}
