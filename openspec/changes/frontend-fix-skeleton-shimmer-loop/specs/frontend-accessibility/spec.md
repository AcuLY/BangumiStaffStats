## Capability Boundary

- **Status:** Revised frontend Skeleton ownership correction; implementation requires strict validation and zero-P0/P1 main-agent review.
- **Owner:** Frontend presentation, primary agent.
- **Writable paths:** The exact OpenSpec, Vue, CSS, focused test, architecture inventory, and accepted main-spec paths declared in `proposal.md`.
- **Read-only protected inputs:** Product/design authorities, Skeleton theme overrides, request/store/API code, tests outside the three declared test paths, Naive UI package source, and the oracle commit.
- **Deletion complement:** Only the superseded untracked `frontend/tests/shared/skeleton-shimmer.test.ts` may be removed; no tracked file, loading state, or dependency may be deleted.
- **Mutable refs:** No commit, remote ref, PR, release, deployment, host, service, or production state.
- **Consumes:** Existing Naive UI dependency, theme override, loading wrappers, and pending-state semantics.
- **Produces:** Naive UI `NSkeleton` as the sole visual Skeleton primitive, a layout-faithful initial ranking pending state, and focused ownership coverage.
- **Dependencies:** Existing frontend runtime only; no statistical or cross-language authority changes.
- **Deliverables:** Strict-valid artifacts, bounded conversion, inventory entry, focused tests, and rendered evidence.
- **Acceptance:** Strict OpenSpec validation, focused and affected component tests, typecheck, build, `git diff --check`, and browser desktop/mobile/reduced-motion checks.
- **Non-goals:** Loading timing, requests, copy, non-ranking geometry, palette, non-Skeleton spinners, dependencies, data, and operations.
- **Operations deferred:** Push, PR, merge, release, deployment, activation, and host mutation.
- **Stop/rollback conditions:** Stop on scope conflict, protected-input edit, state/geometry/accessibility regression, console error, or expansion; roll back only this bounded uncommitted diff.

## ADDED Requirements

### Requirement: One visual Skeleton primitive

The frontend SHALL use Naive UI `NSkeleton` as the sole primitive for every
visual Skeleton placeholder, including query/catalog, ranking, candidate,
person-detail, partner, co-star, pagination, and image-loading surfaces.
Feature markup and CSS MAY retain layout wrappers and exact dimensions but
SHALL NOT implement a separate Skeleton gradient, background animation, or
keyframes. Existing Skeleton theme overrides SHALL remain the single color
and radius mapping. The initial ranking pending wrapper SHALL use the ready
ranking surface's summary, toolbar, column, row, and pagination topology;
every visible placeholder leaf inside that topology SHALL remain `NSkeleton`.

#### Scenario: A full loading surface is rendered

- **WHEN** a core ranking, person-detail, partner, or co-star request is pending
- **THEN** every visible placeholder block is rendered by `NSkeleton` while the existing wrapper geometry, busy state, and neighboring status text remain unchanged

#### Scenario: An initial personal ranking request is pending

- **WHEN** a personal ranking request waits for its first result page
- **THEN** the pending wrapper exposes the same controls, list, and pagination regions and the same rank/person/four-metric row tracks as the ready surface
- **AND** every visible placeholder leaf is `NSkeleton`, with no pending input, button, select, or fabricated result value

#### Scenario: An initial global ranking request is pending

- **WHEN** a global ranking request waits for its first result page
- **THEN** the same responsive topology omits the personal preference heading and fourth metric placeholder

#### Scenario: A partial view request is rendered

- **WHEN** search, sort, or pagination refreshes only a result list
- **THEN** its row and pagination placeholders use `NSkeleton` and already resolved controls and summaries remain visible

#### Scenario: An image is waiting for a valid source

- **WHEN** `SafeImage` is in its loading state
- **THEN** the 3:4 media box uses `NSkeleton` while missing and error states retain their distinct non-Skeleton fallbacks

#### Scenario: Reduced motion is requested

- **WHEN** the operating preference is `prefers-reduced-motion: reduce`
- **THEN** every app-owned `NSkeleton` remains visible with its animation disabled and no loading state or geometry is hidden
