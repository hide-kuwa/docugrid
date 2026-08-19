import type { ClassifyPersistMetadata, ClassifyRankedItem } from "@/features/docugrid/lib/classify";

export type PendingReview = {
  id: string;
  file: File;
  fileName: string;
  confidence: number;
  engine: string;
  suggestedIndex: number | null;
  ranked: ClassifyRankedItem[];
  classifyMeta?: ClassifyPersistMetadata;
};

export const AUTO_SORT_THRESHOLD = 0.6;
