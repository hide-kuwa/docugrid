# Docugrid Architecture

## Purpose

This document clarifies the gap between:

- the **target product architecture** (what Docugrid should become), and
- the **current repository runtime architecture** (what runs today).

It is the source of truth for architectural decisions and migration order.

## Product principles (DocuGrid)

- **Product naming:** This repository = **DocuGrid**; accounting repo = **税務会計システム**; umbrella = **TAXX** — `docs/product-naming.md`.
- **Matrix / cell model:** All surfaces align to a grid mental model (period × document slots on the main page; pages × files inside the viewer). Coordinates are explicit in APIs and audit. See `docs/docugrid-matrix-model.md`.
- **TAXX ecosystem vision:** Umbrella brand and long-term plan in `docs/taxx-ecosystem-development-plan.md`. **Product naming:** this repo = **DocuGrid**; accounting repo = **税務会計システム** — see `docs/product-naming.md`.
- **Tax accounting module (separate repo):** [accounting-ui](https://github.com/hide-kuwa/accounting-ui) product name **税務会計システム**; handoff in `docs/ecosystem-accounting-ui-integration.md`.
- **SSOT normalization:** All numeric surfaces read from canonical stores; see `docs/ssot-normalization.md`.
- **Temporal legal master:** Statutory rates and deduction tables must not be hardcoded; see `docs/temporal-master-pattern.md`.
- **Integration port catalog:** Cross-system handoffs — API-first, single SSOT per domain, dev config UI; see `docs/integration-port-catalog.md`.
- **Config-first (low-code):** Prefer `/settings` and dev config over code for mappings, ports, legal master — `docs/no-code-config-vision.md`.
- **Storage / SQLite:** Domain-per-file SQLite under `backend/storage/`; sustainability and migration triggers in `docs/storage-and-sqlite.md`.
- **Tenancy & authorization (planned):** Firm-scoped data with member-level client assignments. Design before implementation: `docs/auth-tenancy-design.md`.
- **Extensibility by default:** New products, integrations, and legal changes without breaking existing behavior — `docs/extensibility-principles.md`.

## Product-Level Target Architecture

### Frontend (target)

- React + TypeScript + Vite
- Tailwind CSS
- `@dnd-kit` for cross-file drag-and-drop page grid operations
- `react-pdf` for preview and rendering

### Backend (target)

- Python + FastAPI
- `pypdf` for robust merge/reorder operations
- PyMuPDF (`fitz`) for annotation burn-in and image/thumbnails
- Optional OCR pipeline (Tesseract) for scanned PDFs

### Data Flow (target)

1. Browser uploads file payloads (`multipart/form-data`).
2. Browser sends edit metadata as JSON (selection, order, annotation rectangles).
3. Backend applies deterministic PDF transformations.
4. Backend returns downloadable or previewable artifacts.
5. Processed outputs can be handed off to downstream systems (for example TAXX).

## Current Repository Runtime Architecture

### Runtime path used now

- `frontend` (Next.js)
- `backend/main.py` (FastAPI)

### Secondary track not in default runtime

- `backend/core` (auth/accounting API track)

This track is intentionally isolated for now and should not be treated as part of default Docugrid PDF runtime behavior.

## Current Architectural Risks

1. **Dual frontend paradigms**: target says Vite stack, runtime is currently Next.js.
2. **Split backend concerns**: PDF engine and accounting/auth tracks coexist in one repo.
3. **Integration ambiguity**: no single, explicit migration contract between current runtime and target stack.

## Migration Strategy

### Phase 1: Stabilize current runtime (in progress)

- Keep `frontend` + `backend/main.py` as the only default runtime.
- Remove dead/duplicated PDF UI modules.
- Centralize API endpoint configuration.
- Maintain smoke tests for critical PDF endpoints.

### Phase 2: Harden platform boundaries

- Define typed API contracts for:
  - page info
  - reorder payload
  - merge payload
  - annotation payload
- Add explicit error schema and frontend error mapping.
- Add minimal E2E verification flow for upload -> annotate -> reorder -> merge -> render.

### Phase 3: Move toward target frontend stack

- Decide one of:
  - migrate Next.js UI to Vite React app, or
  - formally update target architecture to Next.js if Next.js remains strategic.
- Keep backend API surface stable during UI migration.

### Phase 4: OCR and downstream integration

- Introduce OCR service boundary (sync/async decision).
- Add normalized extraction output format for downstream integration.
- Add optional TAXX handoff API adapter (see `docs/ecosystem-accounting-ui-integration.md` §6 — accounting-ui is the downstream accounting SSOT).

## Decision Log Rules

When architecture-level decisions are made, append to this file or a dedicated ADR file with:

- Date
- Decision
- Context
- Consequence

This prevents drift between vision and implementation.
