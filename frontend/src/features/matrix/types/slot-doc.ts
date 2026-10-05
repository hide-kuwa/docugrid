import type { ClassifyPersistMetadata } from "@/features/docugrid/lib/classify";

export type SlotDoc = {
  file: File;
  pageCount: number | null;
  docId?: string;
  persisted?: boolean;
  logicalDocumentId?: string;
  currentVersionId?: string;
  currentVersionLabel?: string;
  versionCount?: number;
  workflowStatus?: string;
  logicalStatus?: string;
  docugridDocumentId?: string;
  classifyMeta?: ClassifyPersistMetadata;
  clientSharedAt?: string | null;
  contentType?: string | null;
  isPdf?: boolean;
  isConvertibleImage?: boolean;
};

export type UnassignedSlotDoc = SlotDoc & {
  docId: string;
  label: string;
  slotId: string;
};

export type DeletedSlotDoc = SlotDoc & {
  docId: string;
  label: string;
  slotId: string;
  deletedFromSlotId?: string;
  deletedFromSlotLabel?: string;
};
