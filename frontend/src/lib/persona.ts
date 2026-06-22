import {
  DEFAULT_PERSONA_ID,
  PERSONAS,
  STAKEHOLDER_PERSONA_BY_ID,
  type PersonaDefinition,
  type PersonaId,
} from "@/config/personas";
import type { DocugridUser } from "./auth";
import { isInProductScope } from "./product-scope";

export function resolvePersonaId(user: DocugridUser | null): PersonaId {
  if (!user) return DEFAULT_PERSONA_ID;
  if (user.personaId && PERSONAS.some((p) => p.id === user.personaId)) {
    return user.personaId as PersonaId;
  }
  if (user.stakeholderId && STAKEHOLDER_PERSONA_BY_ID[user.stakeholderId]) {
    return STAKEHOLDER_PERSONA_BY_ID[user.stakeholderId];
  }
  return DEFAULT_PERSONA_ID;
}

export function resolvePersona(user: DocugridUser | null): PersonaDefinition {
  return (
    PERSONAS.find((p) => p.id === resolvePersonaId(user)) ??
    PERSONAS.find((p) => p.id === DEFAULT_PERSONA_ID)!
  );
}

/** 日々の業務画面（マトリクス or ペルソナ WS）。開発コンソールは含めない。 */
export function getBusinessHomePath(user: DocugridUser | null): string {
  const persona = resolvePersona(user);
  if (!isInProductScope(persona.id)) {
    return `/workspace/${persona.id}`;
  }
  if (persona.shell === "matrix") return "/";
  return persona.homePath;
}

export function getPostLoginPath(user: DocugridUser | null): string {
  return getBusinessHomePath(user);
}

export function usesMatrixShell(user: DocugridUser | null): boolean {
  return resolvePersona(user).shell === "matrix";
}
