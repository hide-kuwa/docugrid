import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { McpAuthError, type MeProfile, type UserSession } from "./session.js";

export function toolError(message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

export async function withUserScope<T>(
  session: UserSession,
  run: (profile: MeProfile) => Promise<T>,
): Promise<T | CallToolResult> {
  try {
    const profile = await session.require();
    return await run(profile);
  } catch (err) {
    if (err instanceof McpAuthError) {
      return toolError(err.message);
    }
    throw err;
  }
}
