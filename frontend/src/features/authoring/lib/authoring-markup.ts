/** 文書作成用の軽量マークアップ（PDF 出力と WYSIWYG で共通） */

export type AuthoringLineAlign = "left" | "center" | "right";

export type AuthoringLine = {
  text: string;
  align: AuthoringLineAlign;
};

const CENTER_PREFIX = ">> ";
const RIGHT_PREFIX = ">>> ";

export function parseAuthoringLines(text: string): AuthoringLine[] {
  return (text || "").split("\n").map((raw) => {
    if (raw.startsWith(RIGHT_PREFIX)) {
      return { text: raw.slice(RIGHT_PREFIX.length), align: "right" as const };
    }
    if (raw.startsWith(CENTER_PREFIX)) {
      return { text: raw.slice(CENTER_PREFIX.length), align: "center" as const };
    }
    return { text: raw, align: "left" as const };
  });
}

export function serializeAuthoringLines(lines: AuthoringLine[]): string {
  return lines
    .map((line) => {
      if (line.align === "right") return `${RIGHT_PREFIX}${line.text}`;
      if (line.align === "center") return `${CENTER_PREFIX}${line.text}`;
      return line.text;
    })
    .join("\n");
}

const UNRESOLVED_VAR = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function splitLineWithVariables(text: string): Array<{ kind: "text" | "var"; value: string }> {
  const parts: Array<{ kind: "text" | "var"; value: string }> = [];
  let last = 0;
  for (const match of text.matchAll(UNRESOLVED_VAR)) {
    const index = match.index ?? 0;
    if (index > last) {
      parts.push({ kind: "text", value: text.slice(last, index) });
    }
    parts.push({ kind: "var", value: match[1] ?? match[0] });
    last = index + match[0].length;
  }
  if (last < text.length) {
    parts.push({ kind: "text", value: text.slice(last) });
  }
  return parts.length > 0 ? parts : [{ kind: "text", value: text }];
}
