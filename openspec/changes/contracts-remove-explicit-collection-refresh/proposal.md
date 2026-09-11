## Why

The explicit “刷新收藏并查询” path adds a second apply action and a public request flag whose cache-bypass behavior is no longer wanted. Remove that capability end to end so personal queries have one application path and no caller can request an explicit collection refresh.

## What Changes

- **BREAKING** Remove `refreshCollection` from the rankings and candidates request contracts, affected generated consumers, handlers, service models, fixtures, and error-path vocabularies.
- Remove the personal-only “刷新收藏并查询” action and all frontend refresh transactions, recovery branches, request metadata, and tests that exist only for that action.
- Remove explicit fresh-cache bypass from the backend collection cache while preserving normal first load, expiry-driven reload, stale fallback, and immutable result-cache reuse.
- Reconcile current product implementation guides and accepted OpenSpec capabilities so they describe only ordinary personal query application.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contracts-query-wire`: Remove `refreshCollection` from the cross-operation field and digest-exclusion vocabulary.
- `contracts-rankings-api`: Remove the optional rankings refresh request field and personal-only allowance.
- `contracts-candidates-api`: Remove the optional candidates refresh request field and personal-only allowance.
- `contracts-person-detail-api`: Remove refresh-specific unknown-field language and error paths.
- `contracts-partners-api`: Remove refresh-specific unknown-field language and error paths.
- `contracts-co-star-api`: Remove refresh-specific unknown-field language and error paths.
- `backend-candidates-api`: Remove validation behavior for the deleted candidates request field.
- `backend-bounded-query-cache`: Remove explicit fresh-hit bypass while preserving normal cache freshness and stale fallback.
- `frontend-query-shell`: Remove the explicit personal refresh action and its recovery state machine.
- `frontend-co-star-vertical`: Remove refresh-only dependent-view replay and request restrictions while preserving ordinary operation boundaries.
- `frontend-oracle-fidelity`: Remove the deleted refresh capability from the list of production-only states.

## Impact

- **Status:** Proposed; apply is blocked until proposal, specs, design, and tasks pass strict validation and main-agent review.
- **Owner:** Contracts owns the public wire removal and generated-model boundary; backend owns cache and service removal; frontend owns interaction and request-state removal; the primary agent owns cross-component consistency.
- **Behavior classification:** `INTENTIONAL_DELTA` for deleting the explicit refresh action and wire capability, governed by the user request and this change; `PRESERVE_ORACLE` for all remaining UI and query behavior relative to oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717`.
- **Writable paths:** this change directory; the eleven named main specs above during sync; `contracts/schemas/{rankings,candidates,person-detail}/`, `contracts/openapi/openapi.yaml`, the affected `contracts/goldens/{query,api}/` refresh cases and verifiers; all affected operation wire models; the identified backend ranking, candidates, HTTP-handler, runtime-cache source/tests; the identified frontend API, app, query component/coordinator source/tests; `tmp-formal-development/backend-development-implementation-guide.md`; `tmp-formal-development/backend-operations-implementation-guide.md`; and `tmp-formal-development/frontend-production-cleanup-and-architecture-plan.md`.
- **Read-only protected inputs:** `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `.impeccable/surfaces/route.md`, the oracle commit, unrelated source/tests/specs, and every pre-existing archived OpenSpec change.
- **Deletion complement:** Preserve the anonymous public collection provider, ordinary personal queries, cache-key privacy, first/expired collection loading, stale fallback and warnings, result-core caching, global queries, view-only operations, all unrelated UI styling, and historical OpenSpec archives.
- **Mutable refs:** Local branch `codex/remove-collection-refresh` only. No remote refs, tags, releases, hosts, services, or production state.
- **Consumes:** Existing query contracts, cache implementation, frontend query coordinator, accepted specs, product/design authorities, and generator scripts.
- **Produces:** Strict-valid removal deltas, regenerated consumers, focused regression coverage, synchronized accepted specs, and an archived completed change.
- **Dependencies:** Existing pinned Node/npm and Go toolchains; no new dependency or upgrade.
- **Deliverables:** No current public schema/type accepts `refreshCollection`; no current frontend displays or emits the action; no backend path exposes explicit cache bypass; current docs/specs agree.
- **Acceptance:** `openspec validate <change> --strict`; contract artifact tests and wire checks; `backend/scripts/check.sh`; frontend clean install plus `npm run check`; rendered ranking and co-star Query Editor checks at representative desktop/mobile widths; a repository scan with no current (non-history) `refreshCollection` or “刷新收藏” reference; `git diff --check` and owned-diff review.
- **Non-goals:** Changing collection TTLs, stale eligibility, collection privacy/access, statistical formulas, ordinary query recovery, broader UI redesign, or historical records.
- **Operations deferred:** Push, pull request, merge, release, deployment, live routing, and host mutation are not authorized.
- **Stop/rollback conditions:** Stop on authority conflict, generated-contract drift that requires a broader schema change, unrelated overlapping edits in the isolated worktree, or a failing gate whose repair expands scope. Rollback is deletion of this isolated worktree/branch before integration; no live rollback is required.
- **External state:** This change touches no other repository and authorizes no external-system mutation.
