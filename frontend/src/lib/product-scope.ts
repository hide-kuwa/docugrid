/**
 * プロダクト優先スコープ（開発 / 事務所 / クライアント）。
 * 銀行・税務署など外部ペルソナは当面スコープ外。
 */

import { PERSONAS, type PersonaAudience, type PersonaId } from "@/config/personas";

/** いま注力するオーディエンス */
export const IN_SCOPE_AUDIENCES: PersonaAudience[] = ["firm", "client", "platform"];

/** 定義は残すが UI・導線からは外すペルソナ */
export const DEFERRED_PERSONA_IDS: readonly PersonaId[] = ["bank", "tax_office"];

export function isDeferredPersona(personaId: PersonaId | string): boolean {
  return (DEFERRED_PERSONA_IDS as readonly string[]).includes(personaId);
}

export function isInProductScope(personaId: PersonaId | string): boolean {
  if (isDeferredPersona(personaId)) return false;
  const persona = PERSONAS.find((p) => p.id === personaId);
  if (!persona) return false;
  return IN_SCOPE_AUDIENCES.includes(persona.audience);
}

export function inScopePersonas() {
  return PERSONAS.filter((p) => isInProductScope(p.id));
}

export function audienceLabel(audience: PersonaAudience): string {
  switch (audience) {
    case "firm":
      return "税理士事務所";
    case "client":
      return "クライアント";
    case "platform":
      return "開発・運営";
    case "external":
      return "外部（保留）";
    default:
      return audience;
  }
}
