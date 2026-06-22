import { API_BASE } from "@/config/api";
import { APP_ROLES, type AppPermission, type AppRole, type AppRoleId } from "@/config/organization";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import { parseApiErrorBody } from "@/lib/parse-api-error";

export type RolePermissionsPayload = {
  permissionsByRole: Record<string, string[]>;
  updated_at?: string | null;
};

export function rolesFromPermissionsPayload(
  permissionsByRole: Record<string, string[]>,
): AppRole[] {
  const known = new Map(APP_ROLES.map((role) => [role.id, role]));
  const roleIds = new Set([...APP_ROLES.map((role) => role.id), ...Object.keys(permissionsByRole)]);
  return [...roleIds].map((id) => {
    const base =
      known.get(id as AppRoleId) ??
      ({
        id: id as AppRoleId,
        label: id,
        description: "",
        permissions: [],
      } satisfies AppRole);
    return {
      ...base,
      permissions: (permissionsByRole[id] ?? base.permissions) as AppPermission[],
    };
  });
}

export function permissionsPayloadFromRoles(roles: AppRole[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const role of roles) {
    out[role.id] = [...role.permissions];
  }
  return out;
}

export async function fetchRolePermissions(signal?: AbortSignal): Promise<RolePermissionsPayload> {
  const res = await authFetch(`${API_BASE}/role-permissions`, {
    headers: buildAuthHeaders(),
    signal,
  });
  if (!res.ok) throw new Error(`role-permissions-get-failed:${res.status}`);
  return (await res.json()) as RolePermissionsPayload;
}

export async function saveRolePermissions(
  payload: RolePermissionsPayload,
): Promise<RolePermissionsPayload> {
  const res = await authFetch(`${API_BASE}/role-permissions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...buildAuthHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiErrorBody(body, `role-permissions-put-failed:${res.status}`));
  }
  return (await res.json()) as RolePermissionsPayload;
}
