import { getRoleById, type AppRoleId } from "@/config/organization";
import { getPersonaById, type PersonaId } from "@/config/personas";
import type { DocugridUser } from "@/lib/auth";

const DEMO_ROLE_BY_PERSONA: Partial<Record<PersonaId, AppRoleId>> = {
  firm_director: "firm_admin",
  firm_staff_main: "operator",
  firm_staff_support: "reviewer",
  client_accounting: "client_uploader",
  client_executive: "client_uploader",
  client_sales_expense: "client_uploader",
  client_controller: "client_uploader",
  platform_admin: "platform_admin",
};

/** 営業デモ用のモックユーザー（ログインアカウントは変えない） */
export function buildDemoUser(personaId: PersonaId): DocugridUser {
  const persona = getPersonaById(personaId);
  if (!persona) {
    throw new Error(`Unknown persona: ${personaId}`);
  }
  const appRoleId = DEMO_ROLE_BY_PERSONA[personaId] ?? "operator";
  const role = getRoleById(appRoleId);
  return {
    email: `demo+${personaId}@demo.tax.local`,
    name: `デモ ${persona.shortLabel}`,
    personaId,
    personaLabel: persona.label,
    appRoleId,
    permissions: role?.permissions,
    firmId: "demo-firm",
    firmLabel: "サンプル税理士法人",
    visibleClientIds: ["c1"],
    stakeholderId: `demo-${personaId}`,
  };
}
