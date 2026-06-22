/** 3-layer screen design (platform → firm → member). */

import type { PersonaId } from "./personas";

export type ScreenDesignWidget = {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
};

export type ScreenDesignPersona = {
  pageTitle?: string;
  welcomeMessage?: string;
  accentColor?: string;
  widgets?: ScreenDesignWidget[];
  navItems?: { id: string; label: string; href: string }[];
};

export type ScreenDesignLayerFile = {
  version?: number;
  layer?: "platform" | "firm" | "member";
  updated_at?: string | null;
  personas?: Partial<Record<PersonaId, ScreenDesignPersona>>;
};

export type ResolvedScreenDesign = {
  persona_id: string;
  merged: ScreenDesignPersona & { personaId?: string };
  layers: {
    platform: { path: string; persona: ScreenDesignPersona; updated_at?: string };
    firm: { path: string; persona: ScreenDesignPersona; updated_at?: string };
    member: { path: string; persona: ScreenDesignPersona; updated_at?: string };
  };
};

export type ScreenDesignEditorPayload = {
  persona_id: string;
  firm_id: string;
  member_id: string;
  resolved: ResolvedScreenDesign;
  platform: ScreenDesignLayerFile;
  firm: ScreenDesignLayerFile;
  member: ScreenDesignLayerFile;
  can_edit_platform: boolean;
  can_edit_firm: boolean;
  can_edit_member: boolean;
};

export type ScreenDesignLayerTab = "platform" | "firm" | "member";

export const SCREEN_DESIGN_LAYER_LABELS: Record<ScreenDesignLayerTab, string> = {
  platform: "全体デフォルト",
  firm: "事務所（会社）ごと",
  member: "自分専用",
};
