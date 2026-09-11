## Capability Boundary

- **Status:** Modified existing capability; specified but not yet applied.
- **Owner:** Frontend / `frontend-person-inspector`; primary agent owns implementation and acceptance.
- **Writable paths:** `openspec/changes/frontend-restore-person-detail-tooltip-and-title/**`, `frontend/src/features/person-detail/components/RatingEvidence.vue`, `frontend/src/features/person-detail/person-detail.css`, and `frontend/tests/features/person-detail/components.test.ts`.
- **Read-only protected inputs:** `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `.impeccable/surfaces/route.md`, root specs, oracle commit, contracts/goldens, shared styles, every other frontend path, and every other active change.
- **Deletion complement:** None.
- **Mutable refs:** None.
- **Consumes:** Strict person-detail response buckets and preference evidence, existing semantic theme tokens, and public Tooltip behavior.
- **Produces:** Correct person-inspector evidence presentation and focused verification; no data or contract artifact.
- **Dependencies:** Existing `frontend-design-system`, `frontend-accessibility`, person-detail contracts, and backend-owned statistics. Dependency direction remains contracts/backend → frontend.
- **Deliverables:** Strict-valid delta, bounded implementation/test edits, frontend checks, rendered desktop/compact evidence, and final diff audit.
- **Acceptance:** Focused person-detail tests, affected frontend gate, Impeccable detector, pointer and keyboard tooltip checks, Light/Dark primary-title verification, viewport overflow/console checks, strict OpenSpec validation, and `git diff --check`.
- **Non-goals:** No statistical recomputation, API/schema change, new dependency, tooltip-system rewrite, broader inspector restyle, or unrelated cleanup.
- **Operations deferred:** Commit, push, pull request, merge, release, deployment, route mutation, and production activation.
- **Stop/rollback conditions:** Stop on authority conflict, overlapping writes, contract mismatch, strict-validation failure, or scope expansion. Rollback only this change's declared files and exact hunks.

## MODIFIED Requirements

### Requirement: Person evidence and item views SHALL remain server-authoritative

The inspector SHALL preserve the oracle's outward hierarchy for person
identity, participation summary, metrics, preference evidence, tags, rating
distribution, timeline, works/series, and cast-only characters. It SHALL
display response values and omission semantics unchanged. Works, characters,
search, sort, order, page, and pageSize SHALL be requested as server view state;
the frontend SHALL not derive aggregates from a page or invent missing values.
Images SHALL use only the shared same-origin SafeImage lifecycle.

Each non-empty rating-distribution bar's visible tooltip SHALL list only the
server-provided work or series names, one name per line in response order. A
title that exceeds the available width SHALL be visually ellipsized, and a
positive `hiddenCount` SHALL produce one final omission row without expanding
the list or repeating visible score/count prose. The focusable bar's accessible
name SHALL continue to identify its score, count, available titles, and omitted
count.

Preference-evidence work titles SHALL use the semantic primary text foreground:
near-black in Light and the corresponding accessible primary foreground in
Dark. Difference values SHALL retain their existing signed semantic colors.

#### Scenario: Global detail omits personal evidence
- **WHEN** a valid global response contains no preference evidence
- **THEN** the inspector SHALL omit the personal section without rendering a placeholder value

#### Scenario: Cast capability is absent
- **WHEN** the accepted query cannot request the characters section
- **THEN** the inspector SHALL not offer a character-view control

#### Scenario: A rating bucket has listed and hidden works
- **WHEN** a pointer or keyboard user opens a non-empty rating bar whose response contains ordered examples and a positive `hiddenCount`
- **THEN** the visible tooltip SHALL show each available work or series name on its own ellipsized line followed by one omission row, and SHALL NOT repeat the score, count, or example-label prose

#### Scenario: A rating bar is announced without the tooltip portal
- **WHEN** assistive technology reaches a focusable non-empty rating bar
- **THEN** its accessible name SHALL identify the score, count, listed titles, and omitted count from the same server response

#### Scenario: Preference evidence is shown in either theme
- **WHEN** the personal inspector renders preferred or conservative work evidence in Light or Dark
- **THEN** each work title SHALL use the current theme's primary text foreground while its signed difference retains the existing success or brand semantic color
