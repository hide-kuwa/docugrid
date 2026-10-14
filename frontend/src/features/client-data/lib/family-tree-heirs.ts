/**
 * 家系図からの年齢計算と法定相続人の判定（民法 887〜890 条・900 条の概略）。
 * 相続放棄・欠格・廃除・遺言は扱わない。結果は目安として表示する。
 */

import type { FamilyMember } from "@/features/client-data/lib/family-tree-api";

/** 満年齢。死亡日があればその日時点（享年） */
export function ageOf(member: Pick<FamilyMember, "birth_date" | "death_date">, today = new Date()): number | null {
  if (!member.birth_date) return null;
  const birth = new Date(`${member.birth_date}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const asOf = member.death_date ? new Date(`${member.death_date}T00:00:00`) : today;
  let age = asOf.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    asOf.getMonth() < birth.getMonth() ||
    (asOf.getMonth() === birth.getMonth() && asOf.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

export function ageLabel(member: FamilyMember, today = new Date()): string {
  const age = ageOf(member, today);
  if (age == null) return member.deceased ? "故人" : "";
  return member.deceased ? `享年 ${age} 歳` : `${age} 歳`;
}

type Fraction = { n: number; d: number };

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

function frac(n: number, d: number): Fraction {
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
}

function mul(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.n, a.d * b.d);
}

export function formatFraction(f: Fraction): string {
  return f.d === 1 ? `${f.n}` : `${f.n}/${f.d}`;
}

export type HeirRank = "spouse" | "child" | "ascendant" | "sibling";

export const HEIR_RANK_LABEL: Record<HeirRank, string> = {
  spouse: "配偶者",
  child: "第1順位（子・代襲）",
  ascendant: "第2順位（直系尊属）",
  sibling: "第3順位（兄弟姉妹・代襲）",
};

export type Heir = {
  memberId: string;
  rank: HeirRank;
  share: Fraction;
  /** 亡くなった親に代わって相続する（代襲） */
  representation: boolean;
};

export type HeirResult = {
  heirs: Heir[];
  /** 相続税の「法定相続人の数」（養子の算入制限後） */
  taxHeirCount: number;
  /** 基礎控除額（円） */
  basicDeductionYen: number;
  notes: string[];
};

/** 枝（子 1 人分など）を相続できる人に展開。亡くなった人は子に代襲させる */
function expandBranch(
  member: FamilyMember,
  childrenOf: (id: string) => FamilyMember[],
  depthLimit: number,
): { member: FamilyMember; weight: Fraction; representation: boolean }[] {
  if (!member.deceased) return [{ member, weight: frac(1, 1), representation: false }];
  if (depthLimit <= 0) return [];
  const kids = childrenOf(member.id);
  const branches = kids
    .map((k) => expandBranch(k, childrenOf, depthLimit - 1))
    .filter((b) => b.length > 0);
  return branches.flatMap((branch) =>
    branch.map((h) => ({
      member: h.member,
      weight: mul(h.weight, frac(1, branches.length)),
      representation: true,
    })),
  );
}

export function computeStatutoryHeirs(
  members: FamilyMember[],
  decedentId: string | null,
): HeirResult | null {
  const byId = new Map(members.map((m) => [m.id, m]));
  const decedent = decedentId ? byId.get(decedentId) : undefined;
  if (!decedent) return null;

  const childrenOf = (id: string) => members.filter((m) => m.parent_ids.includes(id));
  const notes: string[] = [];

  const spouse =
    (decedent.spouse_id ? byId.get(decedent.spouse_id) : undefined) ??
    members.find((m) => m.spouse_id === decedent.id);
  const livingSpouse = spouse && !spouse.deceased ? spouse : undefined;

  type Pending = { member: FamilyMember; weight: Fraction; representation: boolean };
  let rank: Exclude<HeirRank, "spouse"> | null = null;
  let blood: Pending[] = [];

  const childBranches = childrenOf(decedent.id)
    .map((c) => expandBranch(c, childrenOf, 10))
    .filter((b) => b.length > 0);
  if (childBranches.length > 0) {
    rank = "child";
    blood = childBranches.flatMap((branch) =>
      branch.map((h) => ({ ...h, weight: mul(h.weight, frac(1, childBranches.length)) })),
    );
  }

  if (!rank) {
    let level = decedent.parent_ids.map((id) => byId.get(id)).filter(Boolean) as FamilyMember[];
    while (level.length > 0) {
      const living = level.filter((m) => !m.deceased);
      if (living.length > 0) {
        rank = "ascendant";
        blood = living.map((m) => ({ member: m, weight: frac(1, living.length), representation: false }));
        break;
      }
      level = level.flatMap((m) => m.parent_ids.map((id) => byId.get(id)).filter(Boolean) as FamilyMember[]);
    }
  }

  if (!rank && decedent.parent_ids.length > 0) {
    const siblings = members.filter(
      (m) => m.id !== decedent.id && m.parent_ids.some((p) => decedent.parent_ids.includes(p)),
    );
    const weighted = siblings
      .map((s) => {
        const fullBlood =
          decedent.parent_ids.length === 2 &&
          decedent.parent_ids.every((p) => s.parent_ids.includes(p));
        // 兄弟姉妹の代襲は甥・姪まで（民法 889 条 2 項）
        return { heirs: expandBranch(s, childrenOf, 1), w: fullBlood ? 2 : 1, fullBlood };
      })
      .filter((s) => s.heirs.length > 0);
    if (weighted.some((s) => !s.fullBlood) && decedent.parent_ids.length === 2) {
      notes.push("半血の兄弟姉妹は全血の 1/2 として計算しています");
    }
    const total = weighted.reduce((n, s) => n + s.w, 0);
    if (total > 0) {
      rank = "sibling";
      blood = weighted.flatMap((s) =>
        s.heirs.map((h) => ({ ...h, weight: mul(h.weight, frac(s.w, total)) })),
      );
    }
  }

  const spouseShare: Fraction | null = livingSpouse
    ? rank === "child"
      ? frac(1, 2)
      : rank === "ascendant"
        ? frac(2, 3)
        : rank === "sibling"
          ? frac(3, 4)
          : frac(1, 1)
    : null;
  const bloodShare: Fraction = spouseShare ? frac(spouseShare.d - spouseShare.n, spouseShare.d) : frac(1, 1);

  const heirs: Heir[] = [];
  if (livingSpouse && spouseShare) {
    heirs.push({ memberId: livingSpouse.id, rank: "spouse", share: spouseShare, representation: false });
  }
  if (rank) {
    for (const h of blood) {
      heirs.push({
        memberId: h.member.id,
        rank,
        share: mul(bloodShare, h.weight),
        representation: h.representation,
      });
    }
  }

  // 相続税法 15 条: 実子がいれば養子は 1 人、いなければ 2 人まで算入
  const adoptedChildren = heirs.filter(
    (h) => h.rank === "child" && !h.representation && byId.get(h.memberId)?.adopted,
  );
  const hasNaturalChild = heirs.some(
    (h) => h.rank === "child" && !byId.get(h.memberId)?.adopted,
  );
  const adoptedCap = hasNaturalChild ? 1 : 2;
  const excessAdopted = Math.max(0, adoptedChildren.length - adoptedCap);
  if (excessAdopted > 0) {
    notes.push(`養子は相続税の法定相続人の数に ${adoptedCap} 人まで算入しています`);
  }
  const taxHeirCount = heirs.length - excessAdopted;
  if (heirs.length === 0) notes.push("相続人がいません（家系図の入力が不足している可能性があります）");
  notes.push("相続放棄・欠格・廃除・遺言は考慮していません");

  return {
    heirs,
    taxHeirCount,
    basicDeductionYen: 30_000_000 + 6_000_000 * taxHeirCount,
    notes,
  };
}
