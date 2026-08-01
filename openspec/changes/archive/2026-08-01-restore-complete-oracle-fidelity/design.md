## Context

The formal rewrite was never authorized to redesign the product. `AGENTS.md`, `tmp-formal-development/formal-development-master-plan.md`, `frontend-oracle-fidelity`, and `frontend-design-system` all require the clean-room implementation to preserve immutable oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717` externally while replacing its internal architecture and adding only explicitly approved production capabilities.

The 2026-08-01 audit nevertheless found two distinct failure classes:

1. **Raw flow blockers.** The live candidates endpoint serializes `PositionCount` domain structs without JSON tags, producing `PositionKey`/`Count`; the accepted wire requires `positionKey`/`count`. Person-detail copies an empty warning slice with a nil destination, preserving nil and serializing `warningCodes:null`; the accepted wire requires an array. Strict frontend adapters correctly reject both values, so co-star and ranking detail cannot reach ready states without audit-only response transforms.
2. **Outward drift.** Current surfaces use the same broad visual language but differ from the oracle in shell inset, empty-state defaults/actions, compact sorting affordance, row density, inspector/co-star information layout, exact 780px behavior, desktop query background scroll, accessibility, layout shift, and artifact size. These are implementation defects unless a higher authority explicitly defines the differing behavior.

The already committed compact Query Editor correction (`4bfbc19`) is valid within its bounded below-780px scope and must be preserved. Its completed OpenSpec intentionally left desktop scrolling unchanged; this broader change is allowed to revisit desktop interaction because browser evidence shows the oracle's actual desktop behavior differs and the user has now approved full outward restoration.

The implementation stays in the existing linked worktree and topic branch. The previous dirty overlap was preserved and committed before this change. No subagent is used because the user profile forbids subagents; the primary agent is the single implementation owner and retains explicit per-slice TDD and review checkpoints.

## Change Boundary

| Field | Boundary |
| --- | --- |
| Status | Proposal and design are user-approved in conversation; implementation remains blocked until all OpenSpec artifacts are complete, strict-valid, self-reviewed, and committed as the planning baseline. |
| Owner | Primary agent owns specification, root-cause analysis, TDD implementation, browser evidence, diff review, and final acceptance. Backend and frontend slices are sequential, not concurrent. |
| Writable paths | `openspec/changes/restore-complete-oracle-fidelity/**`; `backend/internal/candidates/{types.go,projection.go,*_test.go}`; `backend/internal/persondetail/{types.go,service.go,projection.go,*_test.go}`; `backend/internal/httpapi/{candidates_handler_test.go,person_detail_handler_test.go}`; `frontend/src/app/{App.vue,AppProviders.vue}`; `frontend/src/features/query/**`; `frontend/src/features/ranking/**`; `frontend/src/features/person-detail/**`; `frontend/src/features/co-star/**`; `frontend/src/shared/components/{AppIcon.vue,DeferredSurfaceState.vue,SafeImage.vue}`; `frontend/src/shared/styles/base.css`; matching focused files under `frontend/tests/{api,app,features,shared}/**`; narrowly named ignored evidence under `frontend/.tmp/oracle-parity-restoration-2026-08-01/**`; this change's task markers. Additional production paths require artifact amendment and strict revalidation before edit. |
| Read-only protected inputs | `AGENTS.md`; `PRODUCT.md`; `DESIGN.md`; `.impeccable/design.json`; `.impeccable/surfaces/route.md`; `frontend/ARCHITECTURE.md`; accepted specs until final sync; completed compact-scroll change; contracts/OpenAPI/schemas/goldens and generated wire files; immutable oracle and extracted runtime; formal-development authorities; updater; operations; dependencies/lockfiles; other repositories; remotes; hosts; services; deployed state. |
| Deletion complement | No product capability, route, business field, API, accepted regression, or approved production addition is deleted. Oracle-incompatible duplicate presentation may be removed only when the approved capability remains available in its authority-defined slot. Only generated evidence inside the named ignored audit root may be replaced or removed during reruns. |
| Mutable refs | Local topic-branch commits; listed source/tests; backend success projection values; Vue local presentation/interaction state; ignored local preview/evidence files and loopback processes. No remote ref or external/live state. |
| Consumes | Immutable oracle; authority documents; 2026-08-01 audit; accepted JSON schemas and generated adapters; real loopback API; current Vue/Pinia/Naive UI implementation; pinned Node/npm and existing Go toolchain. |
| Produces | Raw schema-valid candidates/person-detail success; classified difference ledger; oracle-compatible production surfaces; focused regressions; production-bundle browser matrix; final zero-unclassified-difference record; phase commits; synchronized archived OpenSpec. |
| Dependencies | Commit `4bfbc19`; accepted backend/frontend capabilities named in proposal; current `94329c9` production baseline ancestry; immutable oracle. Dependency direction stays contracts → backend producer → strict frontend adapter → feature model → component. |
| Deliverables | Complete planning artifacts; RED/GREEN logs in tasks; backend fixes; query/ranking/inspector/co-star/accessibility/performance repairs; deterministic evidence; full gates; final report. |
| Acceptance | Exact commands and browser assertions in tasks; no response transforms; backend and pinned frontend gates green; complete production matrix; zero unclassified outward difference; no critical runtime/accessibility/artifact violation; strict OpenSpec/all-spec and diff checks green. |
| Non-goals | New capability, statistical or data-semantics change, contract/schema edit, prototype source copy, dependency addition, framework replacement, visual reinterpretation, sidecar regeneration before all gates, operations, or unrelated cleanup. |
| Operations deferred | Push, PR, merge, tag, release, deployment, host/service/public-route change, production data mutation, and legacy retirement. |
| Stop/rollback conditions | Stop on authority conflict, overlapping edits, out-of-scope path, required schema change, unreproducible difference, third failed hypothesis for one slice, or materially broader gate failure. Restore only the exact owned slice; do not reset, clean, or overwrite unrelated work. |

## Goals / Non-Goals

**Goals:**

- Make raw production candidates and person-detail flows contract-valid and reachable.
- Restore every oracle-present outward property unless a controlling authority explicitly defines a delta.
- Preserve approved additions without allowing them to perturb surrounding oracle geometry or interaction.
- Turn the oracle/delta distinction into deterministic, repeatable evidence rather than reviewer preference.
- Use TDD and smallest-owner changes so each repair is attributable and reversible.
- Pass the real production artifact, accessibility, responsiveness, performance, architecture, and full test gates.

**Non-Goals:**

- Replacing clean-room architecture with prototype implementation.
- Making the frontend tolerant of invalid backend success responses.
- Changing schemas to bless current invalid output.
- Recomputing backend statistics or production data in the browser.
- Removing approved sharing, refresh, dynamic catalog, SafeImage, or server-authoritative evidence.
- Treating visual modernization or additional data density as justification for an oracle difference.
- Deploying or mutating any external system.

## Decisions

### 1. Use one explicit oracle/delta ledger as the outward authority map

Every compared state will have a ledger entry with:

- mode, theme, viewport, state, and deterministic data identity;
- oracle URL/selector and current route/selector;
- expected preserved hierarchy, geometry, copy, style, and interaction;
- any approved delta selector, exact governing requirement, and its permitted local effect;
- automated assertions and screenshot paths;
- status: `OPEN`, `RED_REPRODUCED`, `GREEN_VERIFIED`, or `BLOCKED`.

An approved delta mask is valid only for the delta's own pixels/DOM and only after surrounding preserved bounds remain equal. A broad card, panel, mode, or viewport mask is forbidden. Live counts, request IDs, dates, and external image pixels may be normalized in evidence only when the displayed semantic value is held deterministic and the normalization is not shipped.

**Why:** The previous implementation gradually treated production additions and richer data as permission to redesign adjacent surfaces. A ledger prevents retroactive rationalization and gives each difference one owner.

**Alternative considered:** rely on reviewer screenshots. Rejected because it is non-repeatable and already allowed visible drift to pass.

### 2. Repair invalid success responses at the backend projection source

Candidates will not add frontend coercion. A focused backend test will first validate marshaled JSON member names against the accepted shape. The minimal implementation will project `PositionCount` into a wire-safe JSON-tagged type or add tags only if doing so does not leak transport concerns into domain types; pattern comparison with other projection envelopes decides the exact owner.

Person-detail will not relax the schema or adapter. A focused test will first prove a fresh personal response emits `warningCodes:null`. The minimal implementation will clone into an allocated empty slice at the service/projection boundary so JSON always emits `[]`; stale warning values remain unchanged.

Handler tests will validate full response envelopes, not only domain objects. Real loopback probes must pass before any visual ready-state work begins.

**Why:** Strict adapters are working as designed. Repairing producers restores cross-language contract integrity and prevents every downstream consumer from inventing normalization.

**Alternative considered:** frontend adapter normalization. Rejected because `frontend-foundation` explicitly forbids structural normalization and it would hide producer drift.

**Alternative considered:** schema allows PascalCase/null. Rejected because the accepted contracts and generated types already define the correct public wire.

### 3. Preserve the Vue architecture and restore surfaces one responsibility slice at a time

The implementation order is:

1. shared Header/Query shell;
2. ranking list and summary;
3. person inspector/Drawer;
4. co-star picker/tray and empty/single/pair/group analysis;
5. shared accessibility/theme/runtime consistency;
6. artifact/performance hardening.

For each slice:

- read the complete current component/style/test owner and the corresponding oracle rendered structure;
- record all observable differences before editing;
- write one focused failing component/source-contract test per behavior;
- make the smallest component/style change;
- run focused tests and the affected browser cases;
- update the ledger and create a phase-sized commit only after GREEN.

Markup may change when required to reproduce oracle semantics, but components must keep strict feature boundaries. Public Naive UI APIs and project-owned classes/tokens are allowed; private generated DOM selectors or variables are not.

**Why:** A wholesale CSS transplant would couple current architecture to prototype implementation and make failures impossible to attribute. Slice restoration preserves clean-room boundaries and supports RED/GREEN proof.

**Alternative considered:** copy oracle components/styles. Rejected by `AGENTS.md` and the clean-room baseline.

### 4. Approved production additions are non-disruptive extensions

The following remain because higher authorities require them:

- share action and feedback;
- dynamic catalog and production query controls;
- explicit refresh operation;
- real images and four-state SafeImage behavior;
- extra server-authoritative evidence required by PRODUCT/DESIGN;
- real loading/error/retry continuity;
- accessibility semantics and invisible hit areas.

They must obey their documented slots. If an addition currently changes preserved geometry, it will be moved into the authority-defined location, appended after the preserved block, or exposed through the approved disclosure without deleting capability. Extra detail metrics cannot force the oracle summary grid to collapse; they must occupy an additional responsive block after the preserved oracle metric structure. SafeImage slots must not change the dimensions of preserved identity/row content unless DESIGN explicitly reserves that image geometry.

**Why:** The user explicitly requires preserving approved formal capabilities while restoring all oracle-existing presentation.

**Alternative considered:** remove every addition for literal pixel identity. Rejected by the user's clarification and higher-authority PRODUCT/DESIGN requirements.

### 5. Query overlay behavior follows rendered oracle evidence plus higher authority

The compact correction from `4bfbc19` remains: below 780px the in-flow editor owns local vertical scrolling, the root viewport is locked, and only the Header paints chrome.

Desktop will be re-probed against the oracle using the same long-page state. If the oracle root remains locked while the overlay is open, the current desktop page-scroll behavior is an unapproved difference and will receive a focused RED test plus the smallest lifecycle extension. The edit must preserve overlay positioning, Draft continuity, close/apply/cancel focus, exact prior overflow restoration, and compact breakpoint cleanup.

**Why:** The completed compact change intentionally did not address desktop. This change has broader authority and browser evidence showing a desktop difference.

**Alternative considered:** keep desktop scroll because the prior bounded change called it a non-goal. Rejected: a non-goal of a smaller change cannot override immutable oracle behavior in a later approved restoration.

### 6. Responsive parity is tested at boundaries, not inferred from media queries

Required widths are 360, 390, 516, 768, 779, 780, 781, 917, 1024, 1185, and 1440. Representative heights include 844/900 for compact/intermediate and 768/900 for desktop, plus one short mobile editor case.

At 779/780/781 the harness will assert:

- topology and control size switch exactly once at 780;
- no document horizontal overflow;
- ranking and inspector bounds remain readable;
- no metric label/value collapses into single-character columns;
- rail/Drawer ownership changes without duplicate controls or state loss;
- focus and selected identity survive a live resize where applicable.

The current 780 inspector failure will be solved through an intermediate responsive metric composition, not by clipping, `overflow-x:hidden`, smaller-than-token text, or moving the breakpoint without authority.

**Why:** Source media queries can be correct while their content is unusable. Direct boundary rendering catches the failure.

### 7. Accessibility repairs preserve oracle-visible geometry

Axe findings are triaged by rule and target:

- search and quick-jump inputs receive proper programmatic labels without adding visible placeholder copy;
- score graphics use valid roles/attributes and non-color text/position semantics;
- contrast is repaired through accepted semantic tokens while preserving the oracle color character;
- 44×44 effective targets use pseudo-elements/wrappers that do not enlarge visible controls or overlap neighbors;
- Drawer/query focus, inertness, Escape, focus return, headings, landmarks, and IDs are tested in browser and components.

The oracle's own accessibility bugs are not copied. `frontend-accessibility` is a higher-authority intentional delta that permits invisible semantics and target geometry without visual drift.

**Why:** “Exact” means exact approved presentation, not preservation of inaccessible implementation defects.

**Alternative considered:** waive shared oracle violations. Rejected by PRODUCT/DESIGN WCAG 2.2 AA requirements.

### 8. Performance fixes follow observable root causes and cannot alter appearance

The current production artifact exceeds the accepted initial-JS gzip ceiling and mobile ranking has a large initial layout shift. Work proceeds only after profiling:

- inspect the Rollup/Vite chunk graph and current deferred imports;
- identify which eagerly imported feature or Naive UI modules keep the main chunk above 300 KiB;
- move only already-isolated mode/detail modules behind stable dynamic boundaries;
- preserve skeleton/ready hierarchy so deferred code does not introduce a new visible loading state;
- reserve final result dimensions or keep stable shell boundaries to reduce compact ranking CLS.

No package or lockfile change is allowed. FCP/CLS/long-task samples are repeated after each relevant change. The production bundle, not dev mode, is measured.

**Why:** Broad code splitting can change loading behavior and itself break parity. Profiling and stable boundaries avoid that.

### 9. Deterministic browser comparison is quality evidence, not production code

The existing ignored audit harness will be replaced under `frontend/.tmp/oracle-parity-restoration-2026-08-01/`. It may use locally available browser tooling but will not add a frontend dependency or enter the production artifact. The harness will:

- serve the immutable oracle and exact production `dist` on loopback;
- use deterministic production-shaped responses for visual state comparison;
- separately run raw live API flows without interception;
- record screenshots, computed bounds/style tokens, focus/inert/overflow, axe, console/network, and interaction outcomes;
- generate contact sheets and a machine-readable ledger summary.

Canonical repository regressions remain Vitest/Go tests and existing build/artifact scripts. Browser evidence proves rendered parity for final acceptance; it does not become another production runtime or request layer.

**Why:** Frontend dependency policy explicitly excludes Playwright, while rendered browser evidence is still mandatory. Ignored quality tooling satisfies the one-off acceptance need without changing the product dependency graph.

**Alternative considered:** add Playwright/Puppeteer to frontend devDependencies. Rejected because this change has no approved dependency addition and the package policy forbids it.

### 10. Full gates use pinned tools and deterministic test scheduling

Frontend commands run with Node `24.18.0` and npm `11.16.0`. The known full-suite `app.mount` timeout is treated as a gate defect, not ignored: reproduce under the pinned runtime, profile whether worker contention is the cause, and repair the test/setup or deterministic worker policy without weakening assertions or increasing timeouts blindly.

The existing architecture failure (`App.vue` store instantiation) is investigated against `frontend/ARCHITECTURE.md`; if still present under the pinned full check, it must be fixed within the listed app composition owners before parity acceptance.

Backend checks use the repository's Go check entry. Contract generation outputs remain untouched unless a drift check proves their authoritative inputs changed—which this change does not permit.

Phase commits stage exact owned paths only. No push or remote action occurs.

**Why:** Passing focused tests is insufficient. The formal rewrite's acceptance boundary is the pinned full gate and production artifact.

## Data and Control Flow

```text
accepted JSON schema / generated wire (read-only)
        ↓
Go domain result
        ↓
Go projection / MarshalEnvelope       ← repair casing and non-nil arrays here
        ↓
raw loopback HTTP success
        ↓
strict TypeScript adapter              ← remains strict; no normalization
        ↓
feature model / coordinator
        ↓
Vue presentation slice                 ← restore oracle outward behavior here
        ↓
production dist + deterministic browser matrix
        ↓
oracle/delta ledger + zero-unclassified-difference gate
```

No flow points back from components into contract generation or statistical computation.

## Error Handling

- Invalid backend projection values fail focused/full backend contract tests before frontend execution.
- Strict frontend adapters continue to map invalid success responses to local errors; tests prove no accepted invalid shape.
- Browser harness errors are case-scoped and recorded with URL, phase, console/network evidence, and screenshot; a fatal record blocks completion.
- If an approved delta prevents direct pixel comparison, only its exact selector is classified and surrounding bounds remain asserted.
- If a UI change fixes one viewport but breaks another, the slice stays RED and is not committed.
- If a third minimal hypothesis fails in one slice, implementation stops and the design is revisited rather than stacking another patch.

## Testing Strategy

### Backend

- Projection unit tests for exact JSON member spelling and empty-array semantics.
- Handler tests validating complete success envelope shape.
- Existing candidates/person-detail package tests.
- Full backend check and contract artifact tests.
- Raw loopback schema probes after rebuilding/restarting the local candidate.

### Frontend unit/integration

- Query overlay scroll/focus/copy/slot behavior.
- Ranking summary, toolbar, visible sort direction, rows, pagination, and responsive class contracts.
- Inspector metric composition, detail continuity, Drawer lifecycle.
- Candidate picker/tray and co-star topology/controls/charts/works.
- Accessible names/ARIA/source-level token and hit-area contracts.
- App composition/architecture and deterministic mount.
- Full 378+ test suite under pinned tools, typecheck, build, architecture/wire/artifact checks.

### Browser

- Complete deterministic matrix from the delta spec.
- Raw live ranking and co-star flows with no response interception.
- 779/780/781 and 200% zoom cases.
- Keyboard, Escape, focus return, inertness, wheel/touch ownership where tooling permits real events.
- Light/Dark axe, overflow, console, resource, image, and network-origin audits.
- Performance navigation/FCP/CLS/long-task/resource measurements against production dist.

## Risks / Trade-offs

- **[Risk] “Exact” conflicts with an approved formal addition.** → The ledger cites authority and isolates the addition; if surrounding oracle geometry cannot remain unchanged, stop and reconcile the specification before code.
- **[Risk] Live data cannot match oracle fixture values.** → Use deterministic production-shaped responses for visual comparison and separate raw live contract/end-to-end checks; never ship fixtures.
- **[Risk] Oracle and current render different anti-aliasing pixels despite equivalent geometry.** → Use same browser/fonts/device scale; combine screenshots with computed geometry/style/DOM semantics; classify only proven renderer noise, never broad masks.
- **[Risk] Large CSS changes create cross-surface regressions.** → Work by component owner, use project classes/tokens, run affected matrix after every slice, and commit only GREEN slices.
- **[Risk] Production additions inherently consume space.** → Use their authority-defined stable slot or append/disclose after preserved content; do not compress preserved blocks.
- **[Risk] Backend repair reveals more live producer drift.** → Validate complete envelopes and add a probe for every operation; amend scope only if another already-accepted producer violation is reproducible and path-bounded.
- **[Risk] Fixing critical accessibility changes visible output.** → Prefer labels, roles, relationships, semantic tokens, and invisible hit areas; any visible change must be required by DESIGN and entered as an intentional delta.
- **[Risk] Bundle splitting creates new loading flicker.** → Split only at existing feature boundaries and keep stable shells; production-browser comparison must remain unchanged.
- **[Trade-off] Comprehensive matrix is expensive.** → Run focused cases per slice and the full matrix only at milestones/final acceptance; retain machine-readable resumable evidence.
- **[Trade-off] One inline owner is slower than parallel work.** → Required by user preference; sequential slices reduce merge/authority risk.

## Migration Plan

1. Commit and strict-validate this complete planning block.
2. Establish a clean baseline under pinned tools and record pre-existing gate failures.
3. Implement backend candidates repair through RED/GREEN, run backend checks, and commit.
4. Implement backend person-detail repair through RED/GREEN, run backend checks, and commit.
5. Rebuild/restart only local loopback candidates as needed; verify raw schema probes and no audit transforms.
6. Generate the complete difference ledger from the current production bundle and oracle.
7. Restore Query/Header, ranking, inspector, and co-star slices sequentially, each with RED/GREEN, focused browser evidence, and a phase commit.
8. Repair accessibility/runtime findings and run full responsive/theme/state matrix.
9. Profile/fix artifact size, suite determinism, architecture gate, and layout stability without outward drift.
10. Run pinned full backend/frontend/contract/OpenSpec/diff gates and final production-browser matrix.
11. Sync the accepted delta into `frontend-oracle-fidelity`, archive this change, strict-validate all specs, and commit lifecycle output.

Rollback at any implementation phase reverts only that phase's exact local commit or owned uncommitted slice. It never rewrites remote history or cleans unrelated files. No deployment migration exists.

## Open Questions

None. The user confirmed that formal development must reproduce the oracle's external behavior and may differ only in internal implementation plus already-approved additions; repository authorities define those additions and their constraints.
