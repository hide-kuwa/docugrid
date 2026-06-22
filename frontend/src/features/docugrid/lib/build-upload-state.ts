import type { FileEntity, PageEntity } from "../schema/entities";
import { asFileId, asPageId } from "../schema/ids";

/**
 * アップロード済み PDF と API が返したページ数から正規化エンティティを生成する。
 */
export function buildDocugridEntitiesFromUpload(
  localFile: File,
  pageCount: number,
): { fileEntity: FileEntity; pages: PageEntity[] } {
  const fid = asFileId(crypto.randomUUID());
  const pages: PageEntity[] = [];
  for (let i = 0; i < pageCount; i++) {
    pages.push({
      id: asPageId(`${fid}::${i}`),
      fileId: fid,
      originalIndex: i,
      displayKey: `${fid}-pg-${i}`,
    });
  }
  const fileEntity: FileEntity = {
    id: fid,
    name: localFile.name,
    source: { kind: "blob", blobKey: fid },
    pageCount,
    mimeType: "application/pdf",
    createdAt: new Date().toISOString(),
    syncStatus: "dirty",
  };
  return { fileEntity, pages };
}
