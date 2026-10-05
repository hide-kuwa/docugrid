import type { OrgClient } from "@/config/organization";

export const CLIENT_CSV_HEADERS = ["id", "name", "fiscal_month", "category", "tags"] as const;

export const CLIENT_CSV_SAMPLE = `id,name,fiscal_month,category,tags
c1,株式会社サンプル商事,3,corporate,重要
c2,有限会社山田商店,9,corporate,
c3,佐藤 太郎,12,individual,個人
`;

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function slugClientId(name: string, used: Set<string>): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "client";
  let id = `c-${base}`;
  let n = 2;
  while (used.has(id)) {
    id = `c-${base}-${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

export function clientsToCsv(clients: OrgClient[]): string {
  const lines = [CLIENT_CSV_HEADERS.join(",")];
  for (const client of clients) {
    lines.push(
      [
        escapeCsvCell(client.id),
        escapeCsvCell(client.name),
        String(client.fiscalMonth || 3),
        client.category === "individual" ? "individual" : "corporate",
        escapeCsvCell((client.tags ?? []).join("|")),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export type ClientCsvImportResult = {
  clients: OrgClient[];
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
};

export function parseClientCsv(
  text: string,
  existing: OrgClient[],
  mode: "merge" | "replace" = "merge",
): ClientCsvImportResult {
  const errors: string[] = [];
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { clients: existing, added: 0, updated: 0, skipped: 0, errors: ["CSV が空です"] };
  }

  const headerCells = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = {
    id: headerCells.indexOf("id"),
    name: headerCells.indexOf("name"),
    fiscal: Math.max(headerCells.indexOf("fiscal_month"), headerCells.indexOf("fiscalmonth")),
    category: headerCells.indexOf("category"),
    tags: headerCells.indexOf("tags"),
  };
  if (idx.name < 0) {
    return {
      clients: existing,
      added: 0,
      updated: 0,
      skipped: 0,
      errors: ["ヘッダーに name 列が必要です（例: id,name,fiscal_month,category,tags）"],
    };
  }

  const byId = new Map<string, OrgClient>();
  if (mode === "merge") {
    for (const client of existing) byId.set(client.id, { ...client });
  }
  const usedIds = new Set(byId.keys());
  let added = 0;
  let updated = 0;
  let skipped = 0;

  lines.slice(1).forEach((line, rowIndex) => {
    const cells = splitCsvLine(line);
    const name = (cells[idx.name] || "").trim();
    if (!name) {
      skipped += 1;
      errors.push(`${rowIndex + 2}行目: 名前が空のためスキップ`);
      return;
    }
    let id = (idx.id >= 0 ? cells[idx.id] : "").trim();
    if (!id) {
      id = slugClientId(name, usedIds);
    } else if (!usedIds.has(id) && !byId.has(id)) {
      usedIds.add(id);
    }

    const fiscalRaw = idx.fiscal >= 0 ? Number(cells[idx.fiscal]) : NaN;
    const categoryRaw = (idx.category >= 0 ? cells[idx.category] : "corporate").trim().toLowerCase();
    const category: OrgClient["category"] =
      categoryRaw === "individual" || categoryRaw === "個人" ? "individual" : "corporate";
    const fiscalDefault = category === "individual" ? 12 : 3;
    const fiscalMonth =
      Number.isFinite(fiscalRaw) && fiscalRaw >= 1 && fiscalRaw <= 12
        ? Math.floor(fiscalRaw)
        : fiscalDefault;
    const tagsRaw = idx.tags >= 0 ? cells[idx.tags] : "";
    const tags = tagsRaw
      ? tagsRaw
          .split(/[|;、,/]/)
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;

    const prev = byId.get(id);
    if (prev) {
      byId.set(id, {
        ...prev,
        name,
        fiscalMonth,
        category,
        tags: tags ?? prev.tags,
      });
      updated += 1;
    } else {
      byId.set(id, {
        id,
        name,
        fiscalMonth,
        category,
        ...(tags ? { tags } : {}),
      });
      added += 1;
    }
  });

  return {
    clients: Array.from(byId.values()),
    added,
    updated,
    skipped,
    errors,
  };
}

const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf]);

function countJapaneseChars(text: string): number {
  return (text.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) || []).length;
}

/** Excel（日本語 Windows）向けに UTF-8 BOM + CRLF で書く */
export function csvFileBytes(content: string): Uint8Array {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r?\n/g, "\r\n");
  const body = new TextEncoder().encode(
    normalized.endsWith("\r\n") ? normalized : `${normalized}\r\n`,
  );
  const out = new Uint8Array(UTF8_BOM.length + body.length);
  out.set(UTF8_BOM, 0);
  out.set(body, UTF8_BOM.length);
  return out;
}

/** UTF-8（BOM 可）を優先し、Excel 保存の Shift-JIS も読む */
export function decodeCsvBytes(bytes: Uint8Array): string {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  let sjis = utf8;
  try {
    sjis = new TextDecoder("shift-jis").decode(bytes);
  } catch {
    return utf8;
  }
  if (utf8.includes("\uFFFD")) return sjis;
  return countJapaneseChars(sjis) > countJapaneseChars(utf8) ? sjis : utf8;
}

export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = mime.includes("csv")
    ? new Blob([Uint8Array.from(csvFileBytes(content))], { type: mime })
    : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
