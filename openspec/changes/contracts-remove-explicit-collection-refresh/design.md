## Context

The deleted capability crosses the public rankings/candidates request schemas, generated Go/TypeScript models, backend request/service/cache layers, and the frontend Query Editor/coordinator. The ordinary personal-query path still needs the same anonymous public collection provider, fresh/expired cache policy, stale fallback, and dependent operation boundaries.

The working branch is isolated from the user's dirty primary worktree. This is an intentional product delta; all UI outside the removed action preserves the oracle and current `PRODUCT.md`/`DESIGN.md` contract.

## Goals / Non-Goals

**Goals:**

- Make the public rankings and candidates request objects structurally incapable of expressing an explicit collection refresh.
- Make every backend collection read use the normal freshness policy with no caller-controlled bypass.
- Remove the secondary Query Editor action and every refresh-only coordinator transaction, dependent replay path, type field, fixture, test, and current specification.
- Keep ordinary stale collection results visible with the existing stable warning.

**Non-Goals:**

- Changing cache TTLs, stale eligibility, anonymous collection access, collection/result digests, or statistical evaluation.
- Redesigning the Query Editor beyond removing the secondary action.
- Rewriting historical archived OpenSpec records or Git history.
- Push, merge, release, deployment, or live-system mutation.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Specification-first implementation on `codex/remove-collection-refresh` |
| Owner | Contracts for schemas/goldens/generated wire; backend for service/cache; frontend for UI/state; primary agent for integration |
| Writable paths | Exact affected files inventoried in the proposal under contracts, backend, frontend, three implementation guides, this change, and the eleven synchronized main specs |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, `.impeccable/**` context, oracle commit, unrelated code/tests/specs, archived changes |
| Deletion complement | Ordinary public collection loading, cache expiry/stale policy, result caches, personal/global query behavior, operation views, unrelated UI/CSS |
| Mutable refs | Local topic branch only |
| Consumes | Current schemas, generators, services, coordinator, accepted specs and authorities |
| Produces | Closed contracts without a refresh field, simplified runtime/UI, updated tests/docs/specs |
| Dependencies | Existing pinned Go and Node toolchains only; direction remains contracts → generated consumers → backend/frontend |
| Deliverables | No active UI, wire, backend bypass, or current documentation path for explicit collection refresh |
| Acceptance | Strict OpenSpec, contract/generator checks, backend full gate, frontend full gate and rendered Query Editor QA, residue scan, diff hygiene |
| Non-goals | TTL/formula/provider redesign, unrelated cleanup, history rewriting, operations |
| Operations deferred | All remote integration and deployment lifecycle states |
| Stop/rollback conditions | Stop on authority conflict, overlap, or required scope expansion; discard only the isolated branch/worktree to roll back before integration |

## Decisions

### 1. Delete the wire member instead of retaining an ignored compatibility field

The rankings and candidates request schemas remain closed and simply stop declaring the member. Generated Go and TypeScript types are regenerated from those authorities, and handlers accept only the remaining fields. Retaining and ignoring the flag was rejected because it leaves an externally visible capability and misleading compatibility surface.

### 2. Remove caller-controlled cache bypass at the cache boundary

`CollectionCache.Get` loses its refresh parameter. A fresh positive hit always returns immediately; an absent or expired value loads through the existing detached singleflight path. Negative caching and eligible stale fallback remain unchanged. Removing the parameter at the lowest shared boundary prevents a hidden backend caller from recreating the feature.

### 3. Collapse frontend apply to one path

The Query Editor exposes only its primary submit action. The coordinator and all drivers lose refresh request metadata; refresh snapshots, queued dependent intent, special invalidation, and completion metadata are deleted. Ordinary apply retains validation, pending, cancellation, previous-result restoration, revision, stale-warning, and child invalidation behavior.

### 4. Regenerate owned models and rewrite only feature-specific fixtures

Contract schemas and goldens change first. Repository generators update every affected operation consumer; generated files are not hand-maintained. Tests that prove ordinary unknown-field rejection may keep generic unknown members, but refresh-specific fixtures and assertions are removed or replaced only when the surrounding invariant still needs coverage.

### 5. Preserve history but eliminate all current authority and runtime residue

Accepted main specs and implementation guides are synchronized. Archived OpenSpec changes remain immutable historical evidence and are excluded from the final active-residue scan. This avoids rewriting lifecycle history while ensuring no current source, contract, test, guide, or accepted spec advertises or implements the feature.

## Risks / Trade-offs

- **Breaking clients may still send the removed member** → Closed schemas return the existing unknown-field failure; the removal is intentionally breaking and covered by contract tests.
- **Deleting refresh-only coordinator branches could disturb ordinary cancellation/recovery** → Preserve the common transaction snapshot path and run focused plus full frontend gates.
- **Generated files or goldens may retain the field** → Regenerate from contract authorities and run every rankings/candidates/query drift check plus a current-tree residue scan.
- **Removing the cache parameter could change stale behavior accidentally** → Keep expiry-driven load and `collectionFailure` logic unchanged and replace explicit-refresh tests with fresh-hit/expiry/stale tests.
- **Button removal could alter footer wrapping at narrow widths** → Render both routes at representative desktop/mobile widths and verify keyboard focus, overflow, and console state.

## Migration Plan

1. Update delta specs, strict-validate, and complete the main-agent zero-P0/P1 planning review.
2. Change schemas/goldens and regenerate Go/TypeScript wire models.
3. Remove backend request fields, validation, service propagation, and cache bypass.
4. Remove frontend UI, driver/coordinator fields and refresh-only state/tests.
5. Reconcile the three current implementation guides, run focused/full gates, then sync and archive the change.

Rollback before integration is removal of the isolated branch/worktree. No data migration or live rollback exists because no persisted schema or deployment is touched.

## Open Questions

None. The user explicitly requested complete removal, and the preserved ordinary cache/stale behavior is fixed by higher authorities.
