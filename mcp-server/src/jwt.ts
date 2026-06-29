import { McpAuthError } from "./session.js";

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function assertTokenNotExpired(token: string): void {
  if (!token.trim()) return;
  const payload = decodeJwtPayload(token);
  if (!payload) {
    throw new McpAuthError("DOCUGRID_ACCESS_TOKEN の形式が不正です。");
  }
  const exp = payload.exp;
  if (typeof exp === "number" && exp * 1000 <= Date.now()) {
    throw new McpAuthError(
      "DOCUGRID_ACCESS_TOKEN の有効期限が切れています。再ログインして新しいトークンを設定してください。",
    );
  }
}
