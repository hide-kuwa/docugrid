import { buildDocugridEntitiesFromUpload } from "../lib/build-upload-state";
import { useDocugridStore } from "../state/docugrid-store";

/**
 * スロット用 Docugrid ストアを初期化する。
 * サーバーに保存済みワークスペースがあれば復元し、なければ PDF から構築する。
 */
export async function hydrateDocugridForSlot(
  localFile: File,
  pageCount: number | null,
  loadFromCloud: (documentId: string) => Promise<void>,
  docugridDocumentId?: string,
): Promise<void> {
  useDocugridStore.getState().resetDocugrid();

  if (docugridDocumentId) {
    try {
      await loadFromCloud(docugridDocumentId);
      const state = useDocugridStore.getState();
      const fileId = state.fileOrder[0];
      if (fileId) {
        useDocugridStore.setState({
          localFilesById: {
            ...state.localFilesById,
            [fileId]: localFile,
          },
        });
      }
      return;
    } catch (err) {
      console.warn("Docugrid workspace load failed, rebuilding from PDF:", err);
      useDocugridStore.getState().resetDocugrid();
    }
  }

  if (pageCount !== null && pageCount > 0) {
    const { fileEntity, pages } = buildDocugridEntitiesFromUpload(localFile, pageCount);
    useDocugridStore.getState().addFile(fileEntity, pages, localFile);
  }
}
