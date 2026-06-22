import type { SlotDocumentItem } from "@/features/docugrid/lib/slot-documents";

export type CaptureCardStatus = "processing" | "ok" | "needs_review" | "confirmed";

export type CaptureCategory = "general" | "expense" | "marufu" | "deduction_cert";

export type CaptureClassifyRanked = {
  id: string;
  label: string;
  score: number;
  matched: string[];
};

export type CaptureAnalysisMetadata = {
  analyzed_at?: string;
  ocr_engine?: string;
  classify?: {
    best?: CaptureClassifyRanked | null;
    ranked?: CaptureClassifyRanked[];
    confidence?: number;
    engine?: string;
    text_excerpt?: string;
  };
  deduction_audit?: {
    doc_kind?: string;
    proof_yen?: number | null;
    declared_yen?: number | null;
    invoice_number?: string | null;
    issues?: string[];
    suggestions?: string[];
    status?: string;
  };
  expense_context?: {
    receipt_date?: string;
    store_name?: string;
    total_yen?: number | null;
    per_person_yen?: number | null;
    expense_type?: string;
    suggestion_text?: string | null;
    calendar_match?: {
      company?: string;
      contact?: string;
      attendees?: number;
      title?: string;
      score?: number;
    } | null;
    issues?: string[];
    status?: string;
  };
  invoice_audit?: {
    registration_number?: string | null;
    format_valid?: boolean;
    checksum_valid?: boolean;
    registration_status?: string;
    issuer_name?: string | null;
    issues?: string[];
    suggestions?: string[];
    status?: string;
  };
  marufu_parsed?: {
    doc_type?: string;
    employee_name?: string | null;
    dependent_count?: number | null;
    spouse_deduction?: boolean;
    spouse_special_deduction?: boolean;
    life_insurance_yen?: number | null;
    issues?: string[];
  };
  manual_hints?: {
    total_yen?: number;
    proof_yen?: number;
    declared_yen?: number;
    dependent_count?: number;
    attendees?: number;
    registration_number?: string;
  };
  issues?: string[];
  suggestions?: string[];
};

export type CaptureItem = {
  id: string;
  client_id: string;
  file_name: string;
  byte_size: number;
  mime_type: string;
  category: CaptureCategory;
  status: CaptureCardStatus;
  title: string | null;
  audit_message: string | null;
  period_key: string | null;
  slot_id: string | null;
  metadata: CaptureAnalysisMetadata | null;
  pinned: boolean;
  content_sha256: string;
  created_at: string;
  created_by: string | null;
  updated_at: string;
};

export type CaptureItemPatch = {
  status?: CaptureCardStatus;
  title?: string;
  audit_message?: string;
  pinned?: boolean;
  category?: CaptureCategory;
};

export type CaptureRouteResult = {
  capture: CaptureItem;
  slot: SlotDocumentItem;
};
