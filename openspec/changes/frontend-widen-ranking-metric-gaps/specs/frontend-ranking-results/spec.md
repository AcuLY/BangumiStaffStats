## Capability Boundary

- **Status:** Modified existing capability; apply is blocked until all change
  artifacts are strict-valid and main-agent reviewed.
- **Owner:** Frontend / `frontend-ranking-results`.
- **Writable paths:**
  `openspec/changes/frontend-widen-ranking-metric-gaps/**`,
  `openspec/changes/archive/2026-09-02-frontend-widen-ranking-metric-gaps/**`,
  `openspec/specs/frontend-ranking-results/spec.md`,
  `frontend/src/shared/styles/base.css`, and
  `frontend/tests/shared/ranking-layout.test.ts`, plus only the exact
  persistent-file inventory entry in `frontend/scripts/check-architecture.mjs`.
- **Read-only protected inputs:** `PRODUCT.md`, `DESIGN.md`,
  `.impeccable/design.json`, `.impeccable/surfaces/route.md`,
  `frontend/src/features/ranking/components/RankedPersonList.vue`,
  `frontend/ARCHITECTURE.md`, all `openspec/specs/**` except the exact writable
  `openspec/specs/frontend-ranking-results/spec.md`, contracts/backend/updater/
  operations, and oracle commit
  `644b7748674e553f863d0ffd61d029f86fdc0717`.
- **Deletion complement:** No deletion, rename, or generated output except the
  verified OpenSpec archive move from the active path to the exact dated archive
  path; no nested OpenSpec root, nested generated OpenSpec skill set, or edit
  outside the exact writable paths.
- **Mutable refs:** Local branch `codex/widen-ranking-metric-gaps` only.
- **Consumes:** Existing server-authoritative ranking output, rank/list markup,
  design spacing tokens, and container behavior.
- **Produces:** A more legible but still dense presentation of unchanged
  ranking metrics plus focused, inventory-registered layout regression
  evidence.
- **Dependencies:** Existing `frontend-ranking-results` is modified; accepted
  `frontend-design-system`, `frontend-accessibility`, and
  `frontend-oracle-fidelity` remain read-only upstream authorities. The
  frontend remains a presentation consumer and does not become a statistical
  authority.
- **Deliverables:** Strict-valid delta, CSS/test implementation, focused/full
  frontend gates, clean Impeccable scan, rendered Browser evidence, synced main
  spec, and archived completed change.
- **Acceptance:** Strict OpenSpec, focused Vitest, `npm run check`,
  `git diff --check`, detector scan, and representative personal/global
  rendered geometry with no collision, header drift, or horizontal overflow.
- **Non-goals:** Metric computation, response contracts, formatting semantics,
  copy, interactions, unrelated frontend surfaces, dependencies, or external
  systems.
- **Operations deferred:** Push, PR, merge, release, deployment, host/service
  changes, live activation, rollback execution, and legacy retirement.
- **Stop/rollback conditions:** Stop for conflicts, dirty overlap, validation
  failure, header/row misalignment, overflow, or scope expansion; reverse only
  the exact owned hunks without destructive cleanup.

## MODIFIED Requirements

### Requirement: Ranking surface SHALL preserve approved outward behavior

The result surface SHALL preserve the oracle's ranking summary, metric labels,
compact toolbar, table-like row hierarchy, selected-metric progress treatment,
search/result empty distinction, and adaptive pagination, subject to the formal
DESIGN tokens, real API states, and the intentional metric-spacing delta below.

Each row SHALL be a keyboard-operable button with visible focus, real rank,
person identity, work/series count, nullable average/overall, and personal
preference. Missing values SHALL display `—`. Controls SHALL have at least 44px
targets. The layout SHALL not overflow horizontally at supported widths and
SHALL honor reduced motion.

Within the ranking metric group, every rendered header label SHALL share the
same grid track as its row value. Adjacent metric tracks SHALL have a visible
positive interval from the formal spacing scale, and personal ranking score
tracks SHALL accommodate the rendered `10.00` reference without touching or
overlapping an adjacent value. The narrow container reflow SHALL preserve all
metric labels and values rather than hiding them.

Person images SHALL use only derived same-origin proxy candidates through a
shared SafeImage with loading, loaded, failed, and absent states, stable aspect
ratio, meaningful/decorative alt semantics, and fallback to the next candidate.

#### Scenario: Ranking is empty after search
- **WHEN** a non-empty search returns zero items
- **THEN** the surface SHALL show the approved search-empty copy without replacing the complete query summary

#### Scenario: Person image candidates fail
- **WHEN** every derived proxy candidate fails
- **THEN** the row SHALL retain its dimensions and show the accessible fallback without exposing or requesting an arbitrary URL

#### Scenario: Personal metrics use their widest reference state
- **WHEN** a personal ranking row renders count, average, overall, and signed preference values at a supported single-row intermediate width, including `10.00` in the score tracks
- **THEN** adjacent glyphs SHALL remain visually separated, every header label SHALL align with its value track, and the page SHALL have no horizontal overflow

#### Scenario: Ranking metrics reflow in a narrow container
- **WHEN** the ranking pane reaches its accepted narrow-container layout
- **THEN** the metric group SHALL reflow as one aligned unit with positive inter-column spacing and SHALL retain all personal or global metric labels and values

#### Scenario: Apply encounters an overlapping dirty path
- **WHEN** implementation preflight finds a pre-existing modification in any writable CSS or test path
- **THEN** apply SHALL stop without overwriting, hiding, resetting, deleting, staging, or committing that work
