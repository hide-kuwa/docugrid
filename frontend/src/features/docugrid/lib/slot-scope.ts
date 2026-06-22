export type DocugridSlotScope = {
  clientId: string;
  periodKey: string;
  slotId: string;
};

/** `clientId:periodKey:slotIndex` 形式のスロットキーを分解する。 */
export function parseSlotKey(slotKey: string): DocugridSlotScope | null {
  const parts = slotKey.split(":");
  if (parts.length < 3) return null;
  return {
    clientId: parts[0]!,
    periodKey: parts.slice(1, -1).join(":"),
    slotId: parts[parts.length - 1]!,
  };
}
