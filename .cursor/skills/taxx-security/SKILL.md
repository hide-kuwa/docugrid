---
name: taxx-security
description: >-
  Fix or review DocuGrid security, tenancy, IDOR, JWT, and MCP auth boundaries.
  Use when the user mentions security, firm_id, tenant leak, IDOR, authorize,
  auth hardening, or MCP guards.
disable-model-invocation: true
---

# DocuGrid security task

## Load (in order, stop when enough)

1. `AGENTS.md` — map only
2. `docs/security-checklist.md` — relevant section (A/B/D), not whole file
3. Code under change + `backend/tests/test_security.py`

## Workflow

1. State threat: who crosses which boundary (firm / client / role).
2. Trace: route → auth context → tenancy helper → DB/storage path.
3. Fix on **server**; frontend changes are UX only.
4. Add regression test in `test_security.py` (name: `test_<boundary>_<behavior>`).
5. Run: `cd backend && python -m pytest tests/test_security.py -q`

## Test isolation

Unauthenticated POST tests must use the `fresh_client` pytest fixture (`backend/tests/conftest.py`).
A module-level `TestClient` that ran login earlier keeps session cookies → CSRF 403 before auth 401.

## MCP changes

Also read `docs/security-checklist.md` §D and `mcp-server/src/guards.ts`.
Re-fetch `/auth/me` per tool call pattern must stay intact.

## Report format

```
## Fix
- boundary:
- files:

## Test
- command + new test name

## Residual risk
- (none | item + why deferred)
```
