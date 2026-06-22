/** Normalize FastAPI / legacy error JSON into a user-facing string. */
export function parseApiErrorBody(body: unknown, fallback = "リクエストに失敗しました"): string {
  if (body == null) return fallback;
  if (typeof body === "string") return body || fallback;
  if (typeof body !== "object") return fallback;

  const record = body as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message;
  }
  if (typeof record.detail === "string" && record.detail.trim()) {
    return record.detail;
  }
  if (Array.isArray(record.detail)) {
    const parts = record.detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }
        return "";
      })
      .filter(Boolean);
    if (parts.length > 0) return parts.join(" / ");
  }
  if (record.error && typeof record.error === "object") {
    const err = record.error as Record<string, unknown>;
    if (typeof err.message === "string" && err.message.trim()) {
      return err.message;
    }
  }
  return fallback;
}

export async function parseApiErrorResponse(
  res: Response,
  fallback = "リクエストに失敗しました",
): Promise<string> {
  try {
    const body = await res.json();
    return parseApiErrorBody(body, fallback);
  } catch {
    return fallback;
  }
}
