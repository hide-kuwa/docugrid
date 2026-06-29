export type MeProfile = {
  email: string;
  role: string;
  stakeholder_id: string;
  firm_id: string;
  firm_label?: string;
  permissions: string[];
  visible_client_ids: string[];
};

const FIRM_WIDE_ROLES = new Set(["admin", "firm_admin", "platform_admin", "approver"]);

export class McpAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpAuthError";
  }
}

export function parseMeProfile(raw: Record<string, unknown>): MeProfile {
  const permissions = Array.isArray(raw.permissions)
    ? raw.permissions.filter((p): p is string => typeof p === "string")
    : [];
  const visible_client_ids = Array.isArray(raw.visible_client_ids)
    ? raw.visible_client_ids.filter((id): id is string => typeof id === "string")
    : [];

  return {
    email: String(raw.email ?? ""),
    role: String(raw.role ?? ""),
    stakeholder_id: String(raw.stakeholder_id ?? ""),
    firm_id: String(raw.firm_id ?? ""),
    firm_label: typeof raw.firm_label === "string" ? raw.firm_label : undefined,
    permissions,
    visible_client_ids,
  };
}

export class UserSession {
  private profile: MeProfile | null = null;

  constructor(private readonly fetchMe: () => Promise<Record<string, unknown>>) {}

  /** ツール呼び出しごとに最新の /auth/me を取得（権限変更の取りこぼしを防ぐ） */
  async require(): Promise<MeProfile> {
    const raw = await this.fetchMe();
    const profile = parseMeProfile(raw);
    if (!profile.email || !profile.role) {
      throw new McpAuthError("認証プロファイルを取得できませんでした。トークンを確認してください。");
    }
    this.profile = profile;
    return profile;
  }

  peek(): MeProfile | null {
    return this.profile;
  }

  isFirmWide(role: string): boolean {
    return FIRM_WIDE_ROLES.has(role);
  }

  hasPermission(profile: MeProfile, permission: string): boolean {
    return profile.permissions.includes(permission);
  }

  canAccessClient(profile: MeProfile, clientId: string): boolean {
    if (!clientId) return false;
    return profile.visible_client_ids.includes(clientId);
  }

  assertClientAccess(profile: MeProfile, clientId: string): void {
    if (!this.canAccessClient(profile, clientId)) {
      throw new McpAuthError(
        `顧問先 ${clientId} へのアクセスは許可されていません（担当外または権限外）。`,
      );
    }
  }

  assertPermission(profile: MeProfile, permission: string): void {
    if (!this.hasPermission(profile, permission)) {
      throw new McpAuthError(`権限 ${permission} が必要です（現在のロール: ${profile.role}）。`);
    }
  }

  /** スコープ付き API 用。指定 client が許可されていればそれを、なければエラー */
  resolveScopeClient(profile: MeProfile, preferred?: string): string | undefined {
    if (preferred) {
      this.assertClientAccess(profile, preferred);
      return preferred;
    }
    if (this.isFirmWide(profile.role)) {
      return undefined;
    }
    const first = profile.visible_client_ids[0];
    if (!first) {
      throw new McpAuthError(
        "顧問先スコープが未割当です。操作可能な顧問先がありません。",
      );
    }
    return first;
  }

  filterByVisible<T extends { id: string }>(profile: MeProfile, items: T[]): T[] {
    const allowed = new Set(profile.visible_client_ids);
    return items.filter((item) => allowed.has(item.id));
  }

  filterCatalogRows<T extends { client_id: string }>(profile: MeProfile, rows: T[]): T[] {
    const allowed = new Set(profile.visible_client_ids);
    return rows.filter((row) => allowed.has(row.client_id));
  }
}
