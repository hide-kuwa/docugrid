import type { AppPermission, AppRole, AppRoleId } from "@/config/organization";

export function toggleRolePermission(
  roles: AppRole[],
  roleId: AppRoleId,
  permission: AppPermission,
): AppRole[] {
  if (
    (roleId === "admin" || roleId === "platform_admin") &&
    permission === "settings.manage"
  ) {
    return roles;
  }
  return roles.map((role) => {
    if (role.id !== roleId) return role;
    const has = role.permissions.includes(permission);
    const permissions = has
      ? role.permissions.filter((p) => p !== permission)
      : [...role.permissions, permission];
    return { ...role, permissions };
  });
}
