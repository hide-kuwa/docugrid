/**
 * pdfjs-dist の cmaps / standard_fonts / worker を public/pdfjs にコピーする。
 * 日本語 PDF の CMap 警告を防ぐ（オフラインでも動作）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const pkgRoot = path.join(root, "node_modules", "pdfjs-dist");
const dest = path.join(root, "public", "pdfjs");

if (!fs.existsSync(pkgRoot)) {
  console.warn("[copy-pdfjs-assets] pdfjs-dist not installed, skipping.");
  process.exit(0);
}

function copyRecursive(name) {
  const from = path.join(pkgRoot, name);
  const to = path.join(dest, name);
  if (!fs.existsSync(from)) {
    console.warn(`[copy-pdfjs-assets] missing ${name}, skipping.`);
    return;
  }
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
  console.log(`[copy-pdfjs-assets] copied ${name}`);
}

fs.mkdirSync(dest, { recursive: true });
copyRecursive("cmaps");
copyRecursive("standard_fonts");

const workerSrc = path.join(pkgRoot, "build", "pdf.worker.min.js");
const workerDest = path.join(dest, "build");
fs.mkdirSync(workerDest, { recursive: true });
fs.copyFileSync(workerSrc, path.join(workerDest, "pdf.worker.min.js"));
console.log("[copy-pdfjs-assets] copied build/pdf.worker.min.js");
