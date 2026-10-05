/** 差し込み項目（Word の差し込み印刷に相当）。本文には 【法人名１】 形式で入れる。 */

export type MergeFieldKind =
  | "name"
  | "address"
  | "mailing_address"
  | "representative"
  | "corporate_number"
  | "phone"
  | "fiscal_month"
  | "honorific"
  | "addressee"
  | "wareki";

export type MergeFieldInsert = {
  token: string;
  label: string;
  kind: MergeFieldKind;
  party: 1 | 2 | 3;
};

export const MERGE_FIELD_INSERTS: MergeFieldInsert[] = [
  { token: "【法人名１】", label: "法人名（甲）", kind: "name", party: 1 },
  { token: "【法人名１住所】", label: "本店住所（甲）", kind: "address", party: 1 },
  { token: "【代表者名１】", label: "代表者（甲）", kind: "representative", party: 1 },
  { token: "【法人番号１】", label: "法人番号（甲）", kind: "corporate_number", party: 1 },
  { token: "【電話番号１】", label: "電話（甲）", kind: "phone", party: 1 },
  { token: "【決算月１】", label: "決算月（甲）", kind: "fiscal_month", party: 1 },
  { token: "【送付先住所１】", label: "送付先（甲）", kind: "mailing_address", party: 1 },
  { token: "【法人名２】", label: "法人名（乙）", kind: "name", party: 2 },
  { token: "【法人名２住所】", label: "本店住所（乙）", kind: "address", party: 2 },
  { token: "【代表者名２】", label: "代表者（乙）", kind: "representative", party: 2 },
  { token: "【法人番号２】", label: "法人番号（乙）", kind: "corporate_number", party: 2 },
  { token: "【電話番号２】", label: "電話（乙）", kind: "phone", party: 2 },
  { token: "【送付先住所２】", label: "送付先（乙）", kind: "mailing_address", party: 2 },
  { token: "【敬称１】", label: "敬称（甲・御中/様）", kind: "honorific", party: 1 },
  { token: "【宛名１】", label: "宛名（甲）", kind: "addressee", party: 1 },
  { token: "【敬称２】", label: "敬称（乙）", kind: "honorific", party: 2 },
  { token: "【宛名２】", label: "宛名（乙）", kind: "addressee", party: 2 },
  { token: "【法人名３】", label: "法人名（丙）", kind: "name", party: 3 },
  { token: "【法人名３住所】", label: "本店住所（丙）", kind: "address", party: 3 },
  { token: "【代表者名３】", label: "代表者（丙）", kind: "representative", party: 3 },
];

export const DOCUMENT_FIELD_INSERTS: MergeFieldInsert[] = [
  { token: "【和暦本日】", label: "和暦の本日", kind: "wareki", party: 1 },
  { token: "【本日】", label: "本日（和暦）", kind: "wareki", party: 1 },
];

export const PARTY_ROLE_LABEL: Record<number, string> = {
  1: "当事者１（甲・会社）",
  2: "当事者２（乙／代表取締役など）",
  3: "当事者３（丙）",
};

export const BLANK_AGREEMENT_BODY =
  ">> 契　約　書\n" +
  "\n" +
  "【法人名１】（以下「甲」という。）と【法人名２】（以下「乙」という。）は、次のとおり合意した。\n" +
  "\n" +
  "第1条（当事者の表示）\n" +
  "甲の本店：【法人名１住所】\n" +
  "乙の本店：【法人名２住所】\n" +
  "\n" +
  "第2条（合意事項）\n" +
  "\n" +
  "　【和暦本日】\n" +
  "\n" +
  "　【宛名１】\n" +
  ">>> 代表者　【代表者名１】　　㊞\n" +
  "\n" +
  "　【宛名２】\n" +
  ">>> 代表者　【代表者名２】　　㊞";

const FW_DIGITS: Record<string, string> = {
  "１": "1",
  "２": "2",
  "３": "3",
  "４": "4",
  "５": "5",
  "６": "6",
  "７": "7",
  "８": "8",
  "９": "9",
};

export function maxPartySlotFromBody(body: string): number {
  let highest = 1;
  const re = /【([^】]+)】/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body || "")) !== null) {
    const inner = match[1] ?? "";
    if (inner.includes("乙") || inner.includes("丙") || inner.includes("丁")) {
      if (inner.includes("丁")) highest = Math.max(highest, 4);
      else if (inner.includes("丙")) highest = Math.max(highest, 3);
      else highest = Math.max(highest, 2);
    }
    const ascii = inner.replace(/[１２３４５６７８９]/g, (ch) => FW_DIGITS[ch] ?? ch);
    const digit = ascii.match(/([1-9])/);
    if (digit) highest = Math.max(highest, Number(digit[1]));
  }
  return Math.min(highest, 9);
}

export function countUnresolvedMergeFields(body: string): number {
  const braces = (body || "").match(/\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/g);
  const jp = (body || "").match(/【[^】]+】/g);
  return (braces?.length ?? 0) + (jp?.length ?? 0);
}
