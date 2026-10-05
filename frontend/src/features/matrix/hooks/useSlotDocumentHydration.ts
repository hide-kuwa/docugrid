import { useEffect } from "react";
import {
  fetchSlotDocumentFile,
  listSlotDocuments,
} from "@/features/docugrid/lib/slot-documents";
import { slotCatalogKey } from "@/config/client-field-sources";
import {
  slotIdAtIndex,
  slotIndexFromLayoutSlotId,
  isUnassignedSlotId,
  isDeletedSlotId,
} from "@/lib/slot-layout-ops";
import { buildSlotStorageKeyFromSlotId, normalizeSlotId } from "@/lib/slot-ids";
import { isOldPeriodKey } from "@/lib/fiscal-year-drum";
import type { SlotLayout } from "@/lib/slot-layout-storage";
import type { DeletedSlotDoc, SlotDoc, UnassignedSlotDoc } from "@/features/matrix/types/slot-doc";
import type { SlotDocumentStore } from "./useSlotDocumentMutations";

export type UseSlotDocumentHydrationParams = {
  clientId: string;
  periodKey: string;
  canViewDocument: boolean;
  canPurgeDocument: boolean;
  currentSlotLayout: SlotLayout;
  statusNonce: number;
};

export function useSlotDocumentHydration(
  params: UseSlotDocumentHydrationParams,
  store: SlotDocumentStore & {
    isHydratingSlots: boolean;
    setIsHydratingSlots: React.Dispatch<React.SetStateAction<boolean>>;
    clientSlotCatalog: Set<string>;
    setClientSlotCatalog: React.Dispatch<React.SetStateAction<Set<string>>>;
    slotNotice: string | null;
    setSlotNotice: React.Dispatch<React.SetStateAction<string | null>>;
  },
) {
  const {
    clientId,
    periodKey,
    canViewDocument,
    canPurgeDocument,
    currentSlotLayout,
    statusNonce,
  } = params;
  const {
    setActiveSlotKey,
    setUnassignedDocs,
    setSlotDocs,
    setDeletedDocs,
    setIsHydratingSlots,
    slotNotice,
    setSlotNotice,
    setClientSlotCatalog,
  } = store;

  useEffect(() => {
    if (!slotNotice) return;
    const t = window.setTimeout(() => setSlotNotice(null), 8000);
    return () => window.clearTimeout(t);
  }, [slotNotice, setSlotNotice]);

  useEffect(() => {
    void import("@/features/docugrid/state/docugrid-store").then(({ useDocugridStore }) => {
      useDocugridStore.getState().resetDocugrid();
    });
    setActiveSlotKey(null);
    setUnassignedDocs({});
  }, [clientId, periodKey, setActiveSlotKey, setUnassignedDocs]);

  useEffect(() => {
    if (!canViewDocument) return;
    if (periodKey === "data" || isOldPeriodKey(periodKey)) return;
    if (!clientId || clientId === "unknown") return;
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        setIsHydratingSlots(true);
        const items = await listSlotDocuments(clientId, periodKey, controller.signal, {
          includeDeleted: canPurgeDocument,
        });
        if (!active) return;
        const entries = await Promise.all(
          items.map(async (item) => {
            if (item.deleted_at && !canPurgeDocument) return null;
            try {
              const restored = await fetchSlotDocumentFile(item, controller.signal);
              const doc: SlotDoc = {
                file: restored,
                pageCount: item.page_count,
                docId: item.id,
                persisted: true,
                logicalDocumentId: item.logical_document_id ?? undefined,
                currentVersionId: item.current_version_id ?? undefined,
                currentVersionLabel: item.current_version_label ?? undefined,
                versionCount: item.version_count ?? undefined,
                workflowStatus: item.workflow_status ?? undefined,
                logicalStatus: item.logical_status ?? undefined,
                docugridDocumentId: item.docugrid_document_id ?? undefined,
                classifyMeta: item.classify_metadata ?? undefined,
                clientSharedAt: item.client_shared_at ?? null,
                contentType: item.content_type ?? restored.type,
                isPdf: item.is_pdf ?? /\.pdf$/i.test(item.original_name || restored.name),
                isConvertibleImage:
                  item.is_convertible_image ??
                  /\.(png|jpe?g|webp|gif)$/i.test(item.original_name || restored.name),
              };
              if (item.deleted_at || isDeletedSlotId(item.slot_id)) {
                return {
                  kind: "deleted" as const,
                  docId: item.id,
                  label: item.deleted_from_slot_label ?? item.slot_label ?? item.original_name,
                  slotId: item.slot_id,
                  deletedFromSlotId: item.deleted_from_slot_id ?? undefined,
                  deletedFromSlotLabel: item.deleted_from_slot_label ?? undefined,
                  doc,
                };
              }
              if (isUnassignedSlotId(item.slot_id)) {
                return {
                  kind: "unassigned" as const,
                  docId: item.id,
                  label: item.slot_label ?? item.original_name,
                  slotId: item.slot_id,
                  doc,
                };
              }
              const idx = slotIndexFromLayoutSlotId(currentSlotLayout, periodKey, item.slot_id);
              const key =
                idx >= 0
                  ? buildSlotStorageKeyFromSlotId(
                      clientId,
                      periodKey,
                      slotIdAtIndex(currentSlotLayout, periodKey, idx),
                    )
                  : buildSlotStorageKeyFromSlotId(clientId, periodKey, item.slot_id);
              return { kind: "slot" as const, key, doc };
            } catch {
              return null;
            }
          }),
        );
        if (!active) return;
        const hydrated: Record<string, SlotDoc> = {};
        const unassigned: Record<string, UnassignedSlotDoc> = {};
        const deleted: Record<string, DeletedSlotDoc> = {};
        for (const entry of entries) {
          if (!entry) continue;
          if (entry.kind === "deleted") {
            deleted[entry.docId] = {
              ...entry.doc,
              docId: entry.docId,
              label: entry.label,
              slotId: entry.slotId,
              deletedFromSlotId: entry.deletedFromSlotId,
              deletedFromSlotLabel: entry.deletedFromSlotLabel,
            };
          } else if (entry.kind === "unassigned") {
            unassigned[entry.docId] = {
              ...entry.doc,
              docId: entry.docId,
              label: entry.label,
              slotId: entry.slotId,
            };
          } else {
            hydrated[entry.key] = entry.doc;
          }
        }
        setSlotDocs((prev) => ({ ...prev, ...hydrated }));
        setUnassignedDocs(unassigned);
        setDeletedDocs(deleted);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.warn("Slot hydration failed:", err);
        }
      } finally {
        if (active) setIsHydratingSlots(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    clientId,
    periodKey,
    canViewDocument,
    canPurgeDocument,
    currentSlotLayout,
    setIsHydratingSlots,
    setSlotDocs,
    setUnassignedDocs,
    setDeletedDocs,
  ]);

  useEffect(() => {
    if (!canViewDocument) return;
    if (!clientId || clientId === "unknown") return;
    if (statusNonce === 0) return;
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const items = await listSlotDocuments(clientId, periodKey, controller.signal);
        if (!active) return;
        setSlotDocs((prev) => {
          const next = { ...prev };
          for (const item of items) {
            const key = buildSlotStorageKeyFromSlotId(item.client_id, item.period_key, item.slot_id);
            if (!next[key]) continue;
            next[key] = {
              ...next[key],
              docId: item.id,
              logicalDocumentId: item.logical_document_id ?? undefined,
              currentVersionId: item.current_version_id ?? undefined,
              currentVersionLabel: item.current_version_label ?? undefined,
              versionCount: item.version_count ?? undefined,
              workflowStatus: item.workflow_status ?? undefined,
              logicalStatus: item.logical_status ?? undefined,
              docugridDocumentId: item.docugrid_document_id ?? undefined,
              clientSharedAt: item.client_shared_at ?? null,
            };
          }
          return next;
        });
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.warn("Slot metadata refresh failed:", err);
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [statusNonce, clientId, periodKey, canViewDocument, setSlotDocs]);

  useEffect(() => {
    if (!canViewDocument) return;
    if (!clientId || clientId === "unknown") {
      setClientSlotCatalog(new Set());
      return;
    }
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const items = await listSlotDocuments(clientId, undefined, controller.signal);
        if (!active) return;
        const keys = new Set(
          items.map((item) =>
            slotCatalogKey(item.period_key, normalizeSlotId(item.period_key, item.slot_id)),
          ),
        );
        setClientSlotCatalog(keys);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.warn("Client slot catalog load failed:", err);
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [canViewDocument, clientId, statusNonce, setClientSlotCatalog]);
}
