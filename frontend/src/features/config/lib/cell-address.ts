/** Config sheet cell address — see docs/docugrid-matrix-model.md §5 */

export type ConfigSheetId =
  | "clients"
  | "clientProfile"
  | "stakeholders"
  | "roles"
  | "documents"
  | "screens"
  | "integrations"
  | "audit";

export function formatConfigCellAddress(
  sheetId: ConfigSheetId,
  rowId: string,
  fieldKey: string
): string {
  return `config:${sheetId}:${rowId}:${fieldKey}`;
}

export function formatBusinessCellAddress(
  clientId: string,
  periodKey: string,
  slotIndex: number
): string {
  return `${clientId}:${periodKey}:${slotIndex}`;
}
