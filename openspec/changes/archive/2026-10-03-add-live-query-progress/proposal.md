## Why

Queries can wait through multiple collection pages and analysis stages without explaining current work. The user explicitly requests detailed live progress and a frontend progress bar.

## What Changes

- NEW_CAPABILITY: opt-in POST SSE on the existing five query operations, preserving default JSON and statistical semantics.
- NEW_CAPABILITY: request-scoped Chinese progress stages with honest optional counters, cancellation and transport failure handling.
- PRESERVE_ORACLE: existing result appearance and interactions from `644b7748674e553f863d0ffd61d029f86fdc0717`, except the user-authorized progress feedback.
- Separate bounded corrections in this delivery fix userscript visibility, character top cropping, and Chinese component locale; they do not expand the progress protocol.

## Capabilities

### New Capabilities
- `contracts-query-progress`: optional streaming progress and unchanged terminal result envelope.
- `backend-query-progress`: bounded request-scoped instrumentation through shared query workers.
- `frontend-query-progress`: live Chinese progress presentation and request lifecycle isolation.

### Modified Capabilities
None.

## Impact

- Status: proposed; apply blocked until main-agent review and strict validation of proposal, design, specs, tasks.
- Owner: root orchestrator; progress_backend owns backend/contracts; progress_frontend owns API/progress presentation; chinese_ui owns local copy/locale corrections.
- Writable paths: contracts/openapi/openapi.yaml, contracts/openapi/query-progress.md; backend/internal/{httpapi,querytiming,runtimecache,publiccollection,query,statistics,ranking,candidates,persondetail,partners,costar}/; backend/scripts/check.sh, backend/README.md, backend/internal/architecture/dependencies_test.go, backend/build/build.sh, backend/build/artifact_test.go; contracts/artifacts/lib/validation.mjs and contracts/artifacts/fixtures/positive/{backend,frontend}/component-statement.json (OpenAPI identity synchronization only); frontend/src/api/, frontend/src/features/query/progress.ts, frontend/src/features/query/components/QueryProgress.vue, frontend/src/app/App.vue, frontend/scripts/check-architecture.mjs, frontend/tests/; PRODUCT.md, DESIGN.md, frontend/ARCHITECTURE.md; openspec/changes/add-live-query-progress/, openspec/specs/{contracts-query-progress,backend-query-progress,frontend-query-progress}/.
- Read-only protected inputs: archive files, production data, statistical golden expectations and existing wire semantics, dependencies, operations configuration, CI workflow definitions, secrets.
- Deletion complement: no unrelated source, fixtures, production data or runtime files deleted.
- Mutable refs: local fix/query-progress-and-ui; user authorizes normal topic push/PR and master merge only after exact-commit checks pass. No force push.
- Consumes: existing POST requests, JSON envelopes, querytiming stages and detached singleflight cache lifecycle.
- Produces: optional SSE events, Chinese progress UI, regression tests and evidence.
- Dependencies: contract first; backend/frontend consume reviewed contract; no new dependency or service.
- Deliverables: implementation, source/build checks, browser screenshots, topic commit and CI evidence.
- Acceptance: backend/scripts/check.sh, frontend npm run check, contract artifact tests, strict OpenSpec validation, browser progress/cancel/error/cache/concurrency tests and diff hygiene.
- Non-goals: statistical changes, persistent jobs, user tracking, production archive changes, automatic replay, new auth.
- Operations deferred: existing push/PR workflow tests only; dispatch additionally assembles operations-preview bundle. No production deployment workflow exists. No manual remote deployment or new pipeline is authorized by this implementation.
- Stop/rollback conditions: protocol incompatibility or unrelated failures are investigated and reported; rollback code via normal revert, never reset production data. Existing operations rollback-app remains the documented deployment rollback.
- External state: authorized GitHub topic push/PR, CI dispatch and guarded merge only. Production host is read-only in this task.
