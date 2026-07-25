## Why

The formal SPA exposes `/co-star`, but it does not yet provide the production
candidate-selection, one-person partners, or multi-person co-star workflow.
The three server-authoritative operations are now specified, so the complete
page can be implemented as one bounded frontend vertical without carrying
prototype fixtures or browser statistics into production.

## What Changes

- **PRESERVE_ORACLE** — preserve the approved candidate rail/mobile picker,
  selected-identity tray, 0-person empty state, 1-person cooperation view, and
  2–10-person pair/group information hierarchy, responsive behavior, copy,
  focus behavior, and Light/Dark presentation from oracle
  `644b7748674e553f863d0ffd61d029f86fdc0717`.
- **INTENTIONAL_DELTA** — replace prototype-local candidate, partnership,
  intersection, matrix, tag, rating, preference, ranking, and pagination
  calculations with strict server DTO consumption as required by `PRODUCT.md`
  and the backend implementation guide.
- **NEW_CAPABILITY** — consume the contract-owned generated candidates,
  partners, and co-star DTOs through strict adapters; coordinate their
  independent request resources with
  query-revision ownership, cancellation, and latest-only commits.
- **NEW_CAPABILITY** — include the current co-star operation view and ordered
  selected identities in the existing versioned share-query flow, without
  sharing responses or transient Drawer/theme/loading state.

## Capabilities

### New Capabilities

- `frontend-co-star-vertical`: the complete production `/co-star` candidate,
  identity-selection, partners, pair, and group analysis workflow.

### Modified Capabilities

None.

## Impact

| Boundary | Declaration |
|---|---|
| Status | Investigated/specified/main-agent reviewed: complete. Group 1 is implemented, clean-worktree verified, and committed as `9eae3216`; Group 2A partners may apply from accepted `expose-partners`, while Group 2B pair/group integration remains gated on accepted `expose-co-star`. Nothing is pushed, released, or deployed. |
| Owner | One Frontend implementation agent owns apply; the main agent owns decisions, spec edits, audit, and acceptance. |
| Writable paths | `frontend/src/api/candidates.ts`, `frontend/src/api/partners.ts`, `frontend/src/api/coStar.ts`, `frontend/src/api/adapters/candidates.ts`, `frontend/src/api/adapters/partners.ts`, `frontend/src/api/adapters/coStar.ts`, `frontend/src/features/co-star/**`, `frontend/src/features/query/coordinator.ts`, `frontend/src/features/query/share.ts`, `frontend/src/app/App.vue`, `frontend/src/shared/charts/**`, `frontend/src/shared/components/AppIcon.vue`, `frontend/src/shared/components/SafeImage.vue`, `frontend/src/shared/media/bangumiImage.ts`, `frontend/src/shared/styles/base.css`, `frontend/scripts/check-architecture.mjs`, `frontend/scripts/check-production-artifact.mjs`, `frontend/tests/api/candidates.test.ts`, `frontend/tests/api/partners.test.ts`, `frontend/tests/api/co-star.test.ts`, `frontend/tests/features/co-star/**`, `frontend/tests/features/query/coordinator.test.ts`, `frontend/tests/features/query/share-routes.test.ts`, `frontend/tests/app/co-star.integration.test.ts`, `frontend/tests/shared/SafeImage.test.ts`, and this change's task markers. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717`, `tmp-formal-development/**`, `contracts/**`, `backend/**`, `updater/**`, contract-owned generators/checkers and generated DTOs under `frontend/src/api/generated/{candidates,partners,co-star}/**`, `frontend/package.json`, `frontend/package-lock.json`, existing non-co-star frontend feature code except the exact shared integration files above, other OpenSpec changes/specs, external repositories, refs, remotes, and production state. |
| Deletion complement | Newly created files only inside the declared API/co-star/test ownership paths may be deleted during rollback. Existing shared files are hunk-reverted only; no directory-wide cleanup, generated-file deletion, or unrelated file removal is allowed. |
| Mutable refs | None during apply. Local staging, commit, OpenSpec sync/archive, and branch housekeeping remain main-agent lifecycle actions after acceptance; remote refs are protected. |
| Consumes | The accepted query shell/coordinator, catalog and media primitives, server ranks/statistics/evidence, and deterministic generated candidates/partners/co-star DTOs and drift checks produced by the corresponding contract changes. |
| Produces | One fixture-free `/co-star` page, three strict frontend drivers/adapters, candidate and analysis resource state, selected-identity management, responsive accessible presentation, tests, and deterministic DTO drift checks. |
| Dependencies | Exact change IDs: `bootstrap-frontend-foundation`, `implement-frontend-query-shell`, `implement-frontend-ranking-results`, `implement-frontend-person-inspector`, `expose-candidates`, `expose-partners`, and `expose-co-star`. Candidate work consumes accepted `expose-candidates`; partners/co-star integration and final acceptance wait for the corresponding generated DTOs and endpoints from `expose-partners` and `expose-co-star`. |
| Deliverables | Candidate rail/drawer and tray; 0/1/2–10 topology; partners summary/leaders/list; co-star participants/summary/tags/ratings/preference/matrix/common-work browser; share restore; focused unit/component/integration tests; browser evidence and full frontend gates. |
| Acceptance | Strict adapter/generator drift tests; coordinator cancellation/revision/latest-only tests; component/integration coverage for every topology and scope; full frontend check; Light/Dark responsive browser verification at DESIGN breakpoints with keyboard/focus, reduced motion, overflow, console, and network checks. |
| Non-goals | Backend or contract implementation, frontend statistical recomputation, person-detail changes, new dependencies or state/request layers, fixtures, OAuth/private collection access, arbitrary image URLs, entry-point migration, prototype deletion, or unrelated cleanup. |
| Operations deferred | Hosting fallback configuration, nginx/systemd/Compose, deployment, monitoring configuration, release, tag, cutover, production secrets, and production activation. |
| Stop/rollback conditions | Stop before editing when a dependency contract is not strict-valid or its generated projection is unavailable/incompatible; when an active owner overlaps a declared shared file; when oracle and higher authority conflict; when statistics would need browser recomputation; or when apply requires an undeclared dependency/path/external mutation. Preserve the last accepted vertical and revert only this change's owned hunks/new files. |
| External state | This change touches no other repository or external state. Push, pull request, tag, release, deployment, host mutation, and production activation require separate explicit authorization. |
