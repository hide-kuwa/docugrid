/** pdfjs-dist の worker / CMap / 標準フォントを揃えて初期化する */

let workerConfigured = false;

export async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured) {
    const base = pdfJsAssetBase(pdfjs.version);
    pdfjs.GlobalWorkerOptions.workerSrc = `${base}build/pdf.worker.min.js`;
    workerConfigured = true;
  }
  return pdfjs;
}

export function pdfJsAssetBase(version: string): string {
  const override = process.env.NEXT_PUBLIC_PDFJS_ASSET_BASE?.replace(/\/$/, "");
  if (override) return `${override}/`;
  /** public/pdfjs（npm run copy-pdfjs）を優先。無い場合は CDN */
  if (typeof window !== "undefined") {
    return "/pdfjs/";
  }
  return `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/`;
}

/** 日本語 PDF 向けに CMap・標準フォント URL を付与した getDocument 引数 */
export function buildPdfDocumentParams(data: ArrayBuffer, version: string) {
  const base = pdfJsAssetBase(version);
  return {
    data,
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
  };
}
