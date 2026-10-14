import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type FamilyCohabitation = "" | "same" | "separate";

export type FamilyMember = {
  id: string;
  /** 1 = 親世代 … 4 = ひ孫世代 */
  generation: number;
  relation: string;
  name: string;
  kana: string;
  birth_date: string;
  death_date: string;
  deceased: boolean;
  adopted: boolean;
  occupation: string;
  cohabitation: FamilyCohabitation;
  address: string;
  note: string;
  /** 顧問先にひも付く場合のみ。表示名は顧客マスタを正とする */
  linked_client_id: string | null;
  spouse_id: string | null;
  parent_ids: string[];
  sort_order: number;
};

export type FamilyTree = {
  members: FamilyMember[];
  /** 法定相続人を判定する被相続人 */
  decedent_id: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

export const FAMILY_GENERATIONS = [1, 2, 3, 4] as const;

export const FAMILY_GENERATION_LABEL: Record<number, string> = {
  1: "第1世代（親）",
  2: "第2世代（お子様・ご兄弟姉妹）",
  3: "第3世代（お孫様）",
  4: "第4世代（ひ孫様）",
};

export const COHABITATION_LABEL: Record<FamilyCohabitation, string> = {
  "": "",
  same: "同居",
  separate: "別居",
};

export function newFamilyMember(generation: number, patch?: Partial<FamilyMember>): FamilyMember {
  return {
    id: `fm_${Math.random().toString(36).slice(2, 10)}`,
    generation,
    relation: "",
    name: "",
    kana: "",
    birth_date: "",
    death_date: "",
    deceased: false,
    adopted: false,
    occupation: "",
    cohabitation: "",
    address: "",
    note: "",
    linked_client_id: null,
    spouse_id: null,
    parent_ids: [],
    sort_order: 0,
    ...patch,
  };
}

export async function fetchFamilyTree(clientId: string, signal?: AbortSignal): Promise<FamilyTree> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/family-tree`,
    { headers: buildAuthHeaders(clientId), signal },
  );
  if (!res.ok) throw new Error(`family-tree-fetch-failed:${res.status}`);
  return (await res.json()) as FamilyTree;
}

export async function saveFamilyTree(
  clientId: string,
  tree: Pick<FamilyTree, "members" | "decedent_id">,
): Promise<FamilyTree> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/family-tree`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...buildAuthHeaders(clientId) },
      body: JSON.stringify(tree),
    },
  );
  if (!res.ok) {
    let detail = "";
    try {
      detail = String(((await res.json()) as { detail?: unknown }).detail ?? "");
    } catch {
      /* ignore */
    }
    throw new Error(detail || `family-tree-save-failed:${res.status}`);
  }
  return (await res.json()) as FamilyTree;
}
