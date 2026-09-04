## Why

At an intermediate desktop width, the personal-ranking metric cells have no
column gap and give a rendered `10.00` less than one pixel of trailing room, so
adjacent values visually run together. The header uses the same zero-gap
tracks, so the correction must preserve exact header-to-row alignment while
keeping the dense ranking surface responsive.

## What Changes

- Add an intentional spacing delta for the ranking metrics group: decimal score
  tracks are sized against a `10.00` reference value, the signed preference
  track covers `+10.00`, and adjacent metrics use the existing 8px spacing
  token.
- Keep the `作品 / 均分 / 综合 / 偏好` header on the same grid definition as the
  row values, including personal and global variants.
- Add focused source-level regression coverage and verify representative
  intermediate, breakpoint, and mobile rendered states without horizontal
  overflow.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-ranking-results`: refine the existing table-like ranking hierarchy
  so metric labels and values retain a visible inter-column interval and do not
  collide in the supported personal/global layouts.

## Impact

- **Status:** Proposed small frontend correction; apply is blocked until the
  proposal, delta spec, design, and tasks pass strict validation and main-agent
  review.
- **Owner:** Frontend / `frontend-ranking-results`.
- **Writable paths:**
  `openspec/changes/frontend-widen-ranking-metric-gaps/**`,
  `openspec/changes/archive/2026-09-02-frontend-widen-ranking-metric-gaps/**`,
  `openspec/specs/frontend-ranking-results/spec.md`,
  `frontend/src/shared/styles/base.css`, and
  `frontend/tests/shared/ranking-layout.test.ts`, plus the exact persistent-file
  inventory in `frontend/scripts/check-architecture.mjs`.
- **Read-only protected inputs:** `PRODUCT.md`, `DESIGN.md`,
  `.impeccable/design.json`, `.impeccable/surfaces/route.md`,
  `frontend/src/features/ranking/components/RankedPersonList.vue`,
  `frontend/ARCHITECTURE.md`, all `openspec/specs/**` except the exact writable
  `openspec/specs/frontend-ranking-results/spec.md`, contracts, backend,
  updater, operations, and immutable oracle commit
  `644b7748674e553f863d0ffd61d029f86fdc0717`.
- **Deletion complement:** No deletion, rename, or generated-artifact rewrite
  except the verified OpenSpec archive move from the active change path to the
  exact dated archive path; no modification outside the exact writable paths.
- **Mutable refs:** Local branch `codex/widen-ranking-metric-gaps` only; no
  remote refs.
- **Consumes:** The user-selected `/ranking?user=729218` personal-ranking state,
  existing spacing tokens, shared ranking grid selectors, and the accepted
  frontend ranking/result design contracts.
- **Produces:** A synchronized header/row metric grid correction, one focused
  registered regression test, and recorded local validation evidence.
- **Dependencies:** Existing `frontend-ranking-results`,
  `frontend-design-system`, `frontend-accessibility`, and
  `frontend-oracle-fidelity` capabilities; no new package or runtime
  dependency.
- **Deliverables:** Strict-valid change artifacts, bounded CSS/test edits, clean
  Impeccable layout scan, focused/full frontend checks, rendered Browser
  evidence, synced accepted spec, and archived completed change.
- **Acceptance:** `npx --yes @fission-ai/openspec@1.6.0 validate
  frontend-widen-ranking-metric-gaps --strict`; focused Vitest; `npm run check`;
  `git diff --check`; and Browser measurements/screenshots at 893px, 780/781px,
  380/381px, and a representative mobile width showing aligned tracks,
  positive metric gaps, and no page overflow.
- **Non-goals:** No metric semantics, formatting, copy, row interaction,
  person-detail, co-star, theme, page-level breakpoint system, or
  visual-identity change.
- **Operations deferred:** No push, pull request, merge, release, deployment,
  host/service mutation, or production activation. This change touches no
  other repository or external state.
- **Stop/rollback conditions:** Stop on authority conflict, a dirty/overlapping
  writable path, strict validation or acceptance failure, header/row track
  divergence, new horizontal overflow, or a required scope expansion. Rollback
  is the exact reversal of this change's CSS/test hunks and local change
  artifacts; destructive Git cleanup is forbidden.

The ranking's overall external behavior remains **PRESERVE_ORACLE** relative to
`644b7748674e553f863d0ffd61d029f86fdc0717`; the requested additional metric
spacing is an **INTENTIONAL_DELTA** authorized by the user's browser comments
and governed by `DESIGN.md`'s dense-but-readable layout and spacing rules. This
change introduces no **NEW_CAPABILITY**.
