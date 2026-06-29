import { assertTokenNotExpired } from "./jwt.js";

export type DocugridConfig = {
  apiBase: string;
  accessToken: string;
  email: string;
  password: string;
  clientId: string;
  strictAuth: boolean;
  allowDevLogin: boolean;
  isProduction: boolean;
};

const DEV_ADMIN_EMAIL = "admin@tax.co.jp";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function isProductionDeployment(apiBase: string): boolean {
  const env = (process.env.DOCUGRID_ENV ?? process.env.NODE_ENV ?? "").toLowerCase();
  if (env === "production") return true;
  try {
    const url = new URL(apiBase.startsWith("http") ? apiBase : `http://${apiBase}`);
    return !LOCAL_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function loadConfig(): DocugridConfig {
  const apiBase = (process.env.DOCUGRID_API_BASE ?? "http://localhost:8000/api").replace(/\/$/, "");
  const accessToken = (process.env.DOCUGRID_ACCESS_TOKEN ?? "").trim();
  const email = (process.env.DOCUGRID_EMAIL ?? DEV_ADMIN_EMAIL).trim();
  const password = process.env.DOCUGRID_PASSWORD ?? "password";
  const strictAuth = (process.env.DOCUGRID_MCP_STRICT ?? "true").toLowerCase() !== "false";
  const allowDevLogin =
    (process.env.DOCUGRID_MCP_ALLOW_DEV_LOGIN ?? "false").toLowerCase() === "true";
  const isProduction = isProductionDeployment(apiBase);

  const config: DocugridConfig = {
    apiBase,
    accessToken,
    email,
    password,
    clientId: (process.env.DOCUGRID_CLIENT_ID ?? "").trim(),
    strictAuth,
    allowDevLogin,
    isProduction,
  };

  validateMcpConfig(config);
  return config;
}

/** 本番公開前の MCP 設定検証（misconfig は起動時に失敗） */
export function validateMcpConfig(config: DocugridConfig): void {
  if (config.isProduction) {
    if (!config.accessToken) {
      throw new Error(
        "[docugrid-mcp] 本番では DOCUGRID_ACCESS_TOKEN（ユーザー本人の JWT）が必須です。",
      );
    }
    if (!config.apiBase.startsWith("https://")) {
      throw new Error("[docugrid-mcp] 本番の API は HTTPS（https://...）のみ許可されます。");
    }
    if (config.allowDevLogin) {
      throw new Error(
        "[docugrid-mcp] 本番では DOCUGRID_MCP_ALLOW_DEV_LOGIN=true は禁止です。",
      );
    }
    if (!config.strictAuth) {
      throw new Error("[docugrid-mcp] 本番では DOCUGRID_MCP_STRICT=false は禁止です。");
    }
    if (config.clientId) {
      throw new Error("[docugrid-mcp] 本番では DOCUGRID_CLIENT_ID は設定できません。");
    }
    assertTokenNotExpired(config.accessToken);
    return;
  }

  if (config.strictAuth && !config.accessToken && !config.allowDevLogin) {
    throw new Error(
      "[docugrid-mcp] DOCUGRID_ACCESS_TOKEN（ユーザー本人の JWT）が必要です。" +
        " ローカル開発のみ DOCUGRID_MCP_ALLOW_DEV_LOGIN=true で共有パスワードを許可できます。",
    );
  }

  if (config.strictAuth && !config.accessToken && emailIsDevAdmin(config.email) && !config.allowDevLogin) {
    throw new Error(
      "[docugrid-mcp] 共有 admin アカウントでのパスワードログインは禁止です。" +
        " ユーザーごとの DOCUGRID_ACCESS_TOKEN を設定するか、" +
        " ローカル開発のみ DOCUGRID_MCP_ALLOW_DEV_LOGIN=true を指定してください。",
    );
  }

  if (config.accessToken) {
    assertTokenNotExpired(config.accessToken);
  }
}

function emailIsDevAdmin(email: string): boolean {
  return email.toLowerCase() === DEV_ADMIN_EMAIL;
}
