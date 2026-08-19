import { useCallback, useState } from "react";
import type { OrgClient } from "@/config/organization";
import type { ClientRelationEdge, ClientFamilyGroup } from "@/config/organization";
import {
  buildRelationDiagramPdfFile,
  type PdfPageOrientation,
} from "@/features/client-data/lib/relation-diagram-pdf";
import type { RelationViewMode } from "@/features/client-data/lib/client-relations-layout";
import type { RelationDiagramManualLayout } from "@/features/client-data/lib/relation-diagram-manual-layout";
import {
  listSlotDocuments,
  persistSlotDocument,
} from "@/features/docugrid/lib/slot-documents";
import {
  RELATION_DIAGRAM_PERIOD_KEY,
  RELATION_DIAGRAM_SLOT_ID,
  RELATION_DIAGRAM_SLOT_LABEL,
} from "@/features/client-data/lib/relation-diagram-slot";

type ExportParams = {
  focus: OrgClient;
  clients: OrgClient[];
  groups: ClientFamilyGroup[];
  relations: ClientRelationEdge[];
  viewMode: RelationViewMode;
  orientation: PdfPageOrientation;
  manual: RelationDiagramManualLayout;
};

/** 関係図 PDF ダウンロード / 永続スロット保存 */
export function useRelationDiagramExport(clientId: string) {
  const [exporting, setExporting] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const makePdf = useCallback(
    (params: ExportParams) => buildRelationDiagramPdfFile(params),
    [],
  );

  const handleDownloadPdf = useCallback(
    async (params: ExportParams) => {
      setExporting(true);
      setSaveNotice(null);
      try {
        const file = await makePdf(params);
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        const orientLabel = params.orientation === "portrait" ? "縦" : "横";
        setSaveNotice(`A4${orientLabel} PDF をダウンロードしました（印刷向け・凡例付き）`);
      } catch (err) {
        throw err instanceof Error ? err : new Error("PDF の作成に失敗しました");
      } finally {
        setExporting(false);
      }
    },
    [makePdf],
  );

  const handleSaveToPerm = useCallback(
    async (params: ExportParams) => {
      setExporting(true);
      setSaveNotice(null);
      try {
        const file = await makePdf(params);
        const item = await persistSlotDocument({
          clientId,
          periodKey: RELATION_DIAGRAM_PERIOD_KEY,
          slotId: RELATION_DIAGRAM_SLOT_ID,
          slotLabel: RELATION_DIAGRAM_SLOT_LABEL,
          file,
        });
        const ver = item.current_version_label ? ` (${item.current_version_label})` : "";
        const hist = (item.version_count ?? 0) > 1 ? ` — 履歴 ${item.version_count} 件` : "";
      setSaveNotice(
        `永続「${RELATION_DIAGRAM_SLOT_LABEL}」に保存しました${ver}${hist}`,
      );
        return {
          versionLabel: item.current_version_label ?? null,
          versionCount: item.version_count ?? null,
        };
      } finally {
        setExporting(false);
      }
    },
    [clientId, makePdf],
  );

  const refreshSavedMeta = useCallback(async () => {
    try {
      const slots = await listSlotDocuments(clientId, RELATION_DIAGRAM_PERIOD_KEY);
      const diagram = slots.find((s) => s.slot_id === RELATION_DIAGRAM_SLOT_ID);
      if (diagram) {
        return {
          versionLabel: diagram.current_version_label ?? null,
          versionCount: diagram.version_count ?? null,
        };
      }
    } catch {
      /* optional */
    }
    return null;
  }, [clientId]);

  return {
    exporting,
    saveNotice,
    setSaveNotice,
    handleDownloadPdf,
    handleSaveToPerm,
    refreshSavedMeta,
  };
}
