# Tomorrow Tasks

## Priority 1: Security and Auth Hardening
- Replace header-based role trust with verifiable auth (JWT or secure session).
- Enforce stakeholder/client scope from server-side managed master data, not static in-code maps.
- Add audit logging for denied actions (401/403) in addition to success logs.

## Priority 2: Config Operations
- Expand `client-master` editing:
  - group ordering
  - duplicate relation checks
  - validation for orphan clients/groups
- Add editable stakeholder master UI and save API.
- Add role-permission mapping management page for admins.

## Priority 3: Audit and Monitoring
- Add `/api/audit-events` list endpoint with filters:
  - date range
  - client id
  - stakeholder id
  - action/result
- Build a frontend audit log view in settings to inspect operation history.

## Priority 4: Product Flow
- Start OCR pipeline design for uploaded tax documents:
  - extraction schema (company profile, tax periods, filing signals)
  - asynchronous processing status
  - storage strategy for extracted fields
- Define dashboard MVP:
  - previous term comparison
  - filing alerts (consumption tax, corporate tax)
  - role-specific visibility rules

## Quick Start Checklist (Tomorrow)
1. Verify app runs (`frontend`, `backend`) and login defaults to admin.
2. Validate settings save/read for integrations + OCR + alerts.
3. Validate client master save/read including group edits.
4. Draft auth migration plan (API contract + token/session handling).
