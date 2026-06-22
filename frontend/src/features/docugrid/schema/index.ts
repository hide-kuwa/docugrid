export { ORDER_PAYLOAD_VERSION } from "./constants";
export type { SyncStatus } from "./sync";
export type {
  DocugridNormalizedState,
} from "./normalized-state";
export type {
  FileEntity,
  FileSource,
  HighlightEntity,
  HighlightTool,
  NormalizedCoord,
  PageEntity,
} from "./entities";
export type {
  HighlightBatchItem,
  OrderPayload,
  OrderPayloadMeta,
  OrderedPageRef,
  PageRefFallback,
} from "./order-payload";
export type { FileId, HighlightId, PageId } from "./ids";
export { asFileId, asHighlightId, asPageId } from "./ids";
export type {
  ClassifiedPackageDocument,
  ClassifyBatchResult,
  DocuGridItem,
  FirmDocumentTemplate,
  TaxDocumentType,
} from "./tax-document";
export {
  AiClassificationSchema,
  DEFAULT_FIRM_DOCUMENT_TEMPLATE,
  DEFAULT_PACKAGE_SORT_ORDER,
  TAX_DOCUMENT_TYPE_LABELS,
  TAX_DOCUMENT_TYPES,
  TAX_TYPE_TO_SLOT_ID,
  labelForTaxType,
  sortByTemplate,
  sortIndexForType,
} from "./tax-document";
