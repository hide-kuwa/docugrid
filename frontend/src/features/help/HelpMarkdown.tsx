import type { ReactNode } from "react";
import Link from "next/link";
import { getHelpArticle } from "@/features/help/help-articles";

/** Map docs/help/foo.md or ./foo.md → /help?id=foo when known. */
function hrefForMdLink(raw: string): string {
  const cleaned = raw.trim().replace(/^\.\//, "").replace(/^\.\.\//, "");
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("/")) {
    return raw;
  }
  const base = cleaned.split("#")[0]?.replace(/\.md$/i, "") ?? "";
  const hash = cleaned.includes("#") ? `#${cleaned.split("#")[1]}` : "";
  const file = base.split("/").pop() ?? base;
  if (getHelpArticle(file)) return `/help?id=${file}${hash}`;
  // Unknown relative doc — show as plain path hint
  return `#`;
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(text.slice(last, m.index));
    }
    const token = m[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${i}`} className="font-bold text-slate-800">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code
          key={`${keyPrefix}-c-${i}`}
          className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[12px] text-slate-700"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const lm = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (lm) {
        const href = hrefForMdLink(lm[2]);
        if (href.startsWith("/help")) {
          nodes.push(
            <Link
              key={`${keyPrefix}-a-${i}`}
              href={href}
              className="font-semibold text-teal-700 underline decoration-teal-300 underline-offset-2 hover:text-teal-800"
            >
              {lm[1]}
            </Link>,
          );
        } else if (href.startsWith("http")) {
          nodes.push(
            <a
              key={`${keyPrefix}-a-${i}`}
              href={href}
              className="font-semibold text-teal-700 underline"
              target="_blank"
              rel="noreferrer"
            >
              {lm[1]}
            </a>,
          );
        } else {
          nodes.push(
            <span key={`${keyPrefix}-a-${i}`} className="font-semibold text-slate-700">
              {lm[1]}
            </span>,
          );
        }
      }
    }
    last = m.index + token.length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderTable(rows: string[], key: string): ReactNode {
  const parsed = rows.map((line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim()),
  );
  if (parsed.length < 2) return null;
  const head = parsed[0];
  const body = parsed.slice(2); // skip separator
  return (
    <div key={key} className="my-4 overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[20rem] border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs font-bold text-slate-600">
          <tr>
            {head.map((cell, ci) => (
              <th key={ci} className="border-b border-slate-200 px-3 py-2">
                {inline(cell, `${key}-h-${ci}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-b border-slate-100 last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-slate-700">
                  {inline(cell, `${key}-r${ri}-${ci}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Minimal Markdown → React for docs/help articles (no extra dependency). */
export function HelpMarkdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    if (line.trim() === "---") {
      blocks.push(<hr key={`hr-${k++}`} className="my-6 border-slate-200" />);
      i += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(
        <pre
          key={`pre-${k++}`}
          className="my-4 overflow-x-auto rounded-xl bg-slate-900 px-4 py-3 font-mono text-[12px] leading-relaxed text-slate-100"
        >
          {code.join("\n")}
        </pre>,
      );
      continue;
    }

    if (line.trim().startsWith("|") && line.includes("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i += 1;
      }
      const table = renderTable(tableLines, `tbl-${k++}`);
      if (table) blocks.push(table);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].replace(/\s*\{#[^}]+\}\s*$/, "");
      const cls =
        level === 1
          ? "mt-2 text-2xl font-black text-slate-900"
          : level === 2
            ? "mt-8 text-lg font-bold text-slate-800"
            : "mt-6 text-base font-bold text-slate-800";
      const Tag = (level === 1 ? "h1" : level === 2 ? "h2" : "h3") as "h1" | "h2" | "h3";
      blocks.push(
        <Tag key={`h-${k++}`} className={cls}>
          {inline(text, `h-${k}`)}
        </Tag>,
      );
      i += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${k++}`} className="my-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
          {items.map((item, ii) => (
            <li key={ii}>{inline(item, `ol-${k}-${ii}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${k++}`} className="my-3 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          {items.map((item, ii) => (
            <li key={ii}>{inline(item, `ul-${k}-${ii}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("```") &&
      lines[i].trim() !== "---" &&
      !lines[i].trim().startsWith("|") &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={`p-${k++}`} className="my-2 text-sm leading-relaxed text-slate-700">
        {inline(para.join(" "), `p-${k}`)}
      </p>,
    );
  }

  return <div className="help-md">{blocks}</div>;
}
