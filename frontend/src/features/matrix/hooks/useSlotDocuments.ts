import { useState } from "react";
import type { DeletedSlotDoc, SlotDoc, UnassignedSlotDoc } from "@/features/matrix/types/slot-doc";
import { useSlotDocumentHydration } from "./useSlotDocumentHydration";
import { useSlotDocumentMutations } from "./useSlotDocumentMutations";

export type { SlotDoc, UnassignedSlotDoc, DeletedSlotDoc };

export type UseSlotDocumentsParams = {
  clientId: string;
  periodKey: string;
  canViewDocument: boolean;
  canUploadDocument: boolean;
  canPurgeDocument: boolean;
  canShareWithClient: boolean;
  currentSlotLayout: import("@/lib/slot-layout-storage").SlotLayout;
  slotKeyFor: (slotIndex: number) => string;
  slotLabels: string[];
  applySlotLayout: (layout: import("@/lib/slot-layout-storage").SlotLayout) => void;
  uploadFile: (file: File) => Promise<{ ok: boolean; pageCount: number | null }>;
  assignPreviewFromFile: (file: File) => void;
  loadFromCloud: ReturnType<
    typeof import("@/features/docugrid/hooks/useSyncDocugrid").useSyncDocugrid
  >["loadFromCloud"];
  setFile: (file: File | null) => void;
  setPdfUrl: (url: string | null | ((prev: string | null) => string | null)) => void;
  setPageCount: (count: number | null) => void;
  setViewerSession: React.Dispatch<React.SetStateAction<number>>;
  setExtractionReviewCtx: React.Dispatch<
    React.SetStateAction<{
      periodKey: string;
      slotId: string;
      slotLabel: string;
      review: import("@/features/client-data/lib/extraction-api").ExtractionReviewPayload;
    } | null>
  >;
  statusNonce: number;
  setStatusNonce: React.Dispatch<React.SetStateAction<number>>;
};

export function useSlotDocuments(params: UseSlotDocumentsParams) {
  const {
    clientId,
    periodKey,
    canViewDocument,
    canPurgeDocument,
    currentSlotLayout,
    statusNonce,
    setStatusNonce,
  } = params;

  const [slotDocs, setSlotDocs] = useState<Record<string, SlotDoc>>({});
  const [unassignedDocs, setUnassignedDocs] = useState<Record<string, UnassignedSlotDoc>>({});
  const [deletedDocs, setDeletedDocs] = useState<Record<string, DeletedSlotDoc>>({});
  const [activeSlotKey, setActiveSlotKey] = useState<string | null>(null);
  const [isHydratingSlots, setIsHydratingSlots] = useState(false);
  const [slotNotice, setSlotNotice] = useState<string | null>(null);
  const [clientSlotCatalog, setClientSlotCatalog] = useState<Set<string>>(new Set());

  const store = {
    slotDocs,
    setSlotDocs,
    unassignedDocs,
    setUnassignedDocs,
    deletedDocs,
    setDeletedDocs,
    activeSlotKey,
    setActiveSlotKey,
    slotNotice,
    setSlotNotice,
  };

  const mutations = useSlotDocumentMutations(params, store);

  useSlotDocumentHydration(
    { clientId, periodKey, canViewDocument, canPurgeDocument, currentSlotLayout, statusNonce },
    {
      ...store,
      isHydratingSlots,
      setIsHydratingSlots,
      clientSlotCatalog,
      setClientSlotCatalog,
    },
  );

  return {
    slotDocs,
    setSlotDocs,
    unassignedDocs,
    deletedDocs,
    activeSlotKey,
    setActiveSlotKey,
    isHydratingSlots,
    slotNotice,
    setSlotNotice,
    statusNonce,
    setStatusNonce,
    clientSlotCatalog,
    ...mutations,
  };
}
