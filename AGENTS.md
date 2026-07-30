# DocuGrid (TAXX repo) — Agent map

**Naming:** This repo = **DocuGrid** (document/PDF). Not the accounting app. See `docs/product-naming.md`.

## Runtime (default dev path)

| Layer | Path | Port |
|-------|------|------|
| Frontend | `frontend/` (Next.js) | 3000 |
| Backend API | `backend/main.py` (FastAPI) | 8000 |
| MCP server | `mcp-server/` | — |
| Out of scope | `backend/core/` (separate accounting track) | — |

Start: `docs/dev-quickstart.md`

## Security — read before changing auth/tenancy/API

| Topic | Doc | Code |
|-------|-----|------|
| **Status + gaps (briefing)** | `docs/security-status.md` | — |
| **Common bug/leak causes (read before PR)** | `docs/common-pitfalls.md` | — |
| **Document taxonomy (種別/様式/レポート)** | `docs/document-taxonomy.md` | `backend/config/document_types.yaml`, `form_catalog.yaml` |
| **Platform vision (packs / 正規化 API・MCP)** | `docs/platform-packs-vision.md` | `backend/config/*.yaml`, `mcp-server/src/tools.ts` |
| File upload / AV policy | `docs/file-upload-security.md` | `upload_limits.py`, `tenancy.py` |
| Google Drive per firm | `docs/google-drive-storage-strategy.md` | `slot_drive_sync.py`, `drive.py` |
| Threat model + gaps | `docs/security-checklist.md` | — |
| Tenancy design | `docs/auth-tenancy-design.md` | `backend/services/tenancy.py` |
| Auth/JWT | — | `backend/docugrid_auth.py`, `backend/main.py` |
| MCP guards | `docs/security-checklist.md` §D | `mcp-server/src/guards.ts` |
| Tests | — | `backend/tests/test_security.py` |

**Invariants (non-negotiable):**

1. Frontend filters = UX only. Enforce on **server**.
2. Every query/mutation: `firm_id` from JWT matches resource.
3. Client-scoped APIs: `authorize_client_access` after resolving `client_id`.
4. IDOR routes: resolve resource → client → firm before allow.
5. No secrets in commits; prod disables password login + legacy `/files`.

Run security tests:

```bash
cd backend && python -m pytest tests/test_security.py -q
```

## Where to look (don't grep the whole repo)

| Task | Start here |
|------|------------|
| New/changed API | `backend/main.py` + `docs/api-contract.md` |
| Tenancy bug | `tenancy.py` → caller in `main.py` → `test_security.py` |
| MCP tool auth | `mcp-server/src/guards.ts`, `tools.ts` |
| Frontend auth UX | `frontend/src/` + `/api/auth/me` contract |

## Token discipline (Fable5 sessions)

- One task per chat. New chat when the topic shifts.
- Open only files you touch (`@path` > broad search).
- Do not read `docs/` wholesale; follow links from this file.
- Prefer editing + `pytest` over exploratory subagents.
- Summaries: changed files + test command + open risks. No recap of docs already in repo.
- **Save tokens on waste, not on capability:** narrow exploration is fine; give Fable5 a large Goal + autonomy for multi-step security work.

## Security status (quick)

- **§A-2 (firm cross-leak):** done — `pytest tests/test_security.py -q`
- **§I (production pre-flight):** `python scripts/validate_production_env.py --env-file .env.production`
- **Next code gap:** メンバー管理 API/UI、本番 env 適用（`validate_production_env.py`）

## User prompt template (copy, fill brackets)

**Small fix (Sonnet/Opus):**
```
[Goal] one sentence
[Scope] files or API routes only
[Constraint] server-side auth / firm_id / no frontend-only fix
[Done when] test name or manual step
Context: @backend/services/tenancy.py @backend/tests/test_security.py
```

**Large security sweep (Fable5):**
```
[Goal] e.g. close docs/security-checklist.md §B-2 gaps with tests
[Autonomy] read backend/mcp-server as needed; start from tenancy.py + test_security.py
[Constraint] server-side firm_id / authorize_* only
[Done when] pytest tests/test_security.py -q all pass
Context: @AGENTS.md @docs/security-checklist.md
```
