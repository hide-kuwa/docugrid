/** Slack-like primary workspace surfaces (matrix shell). */



import {

  DATA_WORKSPACE_TABS,

  type DataWorkspaceTabId,

} from "@/features/client-data/data-workspace-tabs";



export type CoreWorkspaceSurfaceId = "doc" | "pdf" | "dm" | "tax";



export type WorkspaceSurfaceId = CoreWorkspaceSurfaceId | DataWorkspaceTabId;



export type WorkspaceSurface = {

  id: WorkspaceSurfaceId;

  label: string;

  shortLabel: string;

  description: string;

  /** planned surfaces stay read-only placeholders */

  status: "live" | "planned";

  group: "core" | "data";

};



const CORE_SURFACES: WorkspaceSurface[] = [

  {

    id: "doc",

    label: "Doc",

    shortLabel: "Doc",

    description: "資料マトリクス・顧問先・期",

    status: "live",

    group: "core",

  },

  {

    id: "pdf",

    label: "PDF",

    shortLabel: "PDF",

    description: "PDF 操作・照合に寄せる",

    status: "live",

    group: "core",

  },

  {

    id: "dm",

    label: "DM",

    shortLabel: "DM",

    description: "システム内チャットとメール / Slack / LINE の受信箱",

    status: "live",

    group: "core",

  },

  {

    id: "tax",

    label: "税務進捗",

    shortLabel: "Tax",

    description: "決算・中間・源泉の進捗ボード（手動＋自動期限）",

    status: "live",

    group: "core",

  },

];



/** レールに出す Data はカルテ一本。マスタ等はカルテ内セクションへ。 */

const DATA_SURFACES: WorkspaceSurface[] = [

  {

    id: "karte",

    label: "カルテ",

    shortLabel: "カルテ",

    description: "マスタ・グラフ・給与・進捗など顧問先データ",

    status: "live",

    group: "data",

  },

];



export const WORKSPACE_SURFACES: WorkspaceSurface[] = [...CORE_SURFACES, ...DATA_SURFACES];



const STORAGE_KEY = "docugrid.workspaceSurface.v1";

const KARTE_SECTION_KEY = "docugrid.karteSection.v1";



const ALL_IDS = new Set<string>([

  ...WORKSPACE_SURFACES.map((s) => s.id),

  ...DATA_WORKSPACE_TABS.map((t) => t.id),

]);



const DATA_TAB_IDS = new Set(DATA_WORKSPACE_TABS.map((t) => t.id));



export function isDataWorkspaceSurface(id: WorkspaceSurfaceId): id is DataWorkspaceTabId {

  return DATA_TAB_IDS.has(id as DataWorkspaceTabId);

}



export function isWorkspaceSurfaceId(value: string): value is WorkspaceSurfaceId {

  return ALL_IDS.has(value);

}



/** 旧レールのマスタ等 → カルテ面へ正規化 */

export function normalizeWorkspaceSurface(id: WorkspaceSurfaceId): WorkspaceSurfaceId {

  if (id === "doc" || id === "pdf" || id === "dm" || id === "tax" || id === "karte") {

    return id;

  }

  if (DATA_TAB_IDS.has(id as DataWorkspaceTabId)) return "karte";

  return "doc";

}



export function loadWorkspaceSurface(): WorkspaceSurfaceId {

  if (typeof window === "undefined") return "doc";

  try {

    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (raw && isWorkspaceSurfaceId(raw)) {

      return normalizeWorkspaceSurface(raw);

    }

  } catch {

    /* ignore */

  }

  return "doc";

}



export function saveWorkspaceSurface(id: WorkspaceSurfaceId): void {

  if (typeof window === "undefined") return;

  try {

    window.localStorage.setItem(STORAGE_KEY, normalizeWorkspaceSurface(id));

  } catch {

    /* ignore */

  }

}



export function loadKarteSection(): DataWorkspaceTabId {

  if (typeof window === "undefined") return "master";

  try {

    const raw = window.localStorage.getItem(KARTE_SECTION_KEY);

    if (raw && DATA_TAB_IDS.has(raw as DataWorkspaceTabId)) {

      return raw as DataWorkspaceTabId;

    }

    // 旧レール選択を引き継ぐ

    const surface = window.localStorage.getItem(STORAGE_KEY);

    if (surface && DATA_TAB_IDS.has(surface as DataWorkspaceTabId) && surface !== "karte") {

      return surface as DataWorkspaceTabId;

    }

  } catch {

    /* ignore */

  }

  return "master";

}



export function saveKarteSection(id: DataWorkspaceTabId): void {

  if (typeof window === "undefined") return;

  try {

    window.localStorage.setItem(KARTE_SECTION_KEY, id);

  } catch {

    /* ignore */

  }

}


