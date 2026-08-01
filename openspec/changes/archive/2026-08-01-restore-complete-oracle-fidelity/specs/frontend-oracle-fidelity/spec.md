## Capability Boundary

| Field | Boundary |
| --- | --- |
| Status | Existing fidelity capability is tightened into an executable restoration and acceptance boundary; no new product capability is introduced. |
| Owner | Frontend presentation owner, with primary-agent authority review and inline implementation because the user disallows subagents. Backend producer repairs remain governed by their existing backend capabilities. |
| Writable paths | `openspec/changes/restore-complete-oracle-fidelity/**`; the exact backend/frontend/test/evidence paths declared by this change's proposal and design; final main-spec synchronization only after implementation acceptance. |
| Read-only protected inputs | Oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717`; `PRODUCT.md`; `DESIGN.md`; `.impeccable/design.json`; surface brief; accepted contracts, schemas, goldens, generated wire files, and specs; formal-development authorities; completed compact-scroll change; updater, operations, external repos, remotes, hosts, services, and production state. |
| Deletion complement | No product capability, route, business field, API, accepted test, or explicitly approved production addition is deleted. An oracle-incompatible duplicate presentation may be removed only when its underlying approved capability remains available in its authority-defined slot. |
| Mutable refs | Local presentation/interaction source and tests in the declared owners, backend success projection values in the declared producer boundaries, local topic-branch commits, and ignored loopback browser evidence. |
| Consumes | Immutable oracle, accepted intentional-delta authorities, deterministic production-shaped data, raw loopback API, current production bundle, and the accepted frontend/browser gates. |
| Produces | Raw contract-valid reachable flows, a classified difference ledger, oracle-compatible surfaces, deterministic comparison evidence, focused regressions, and zero-unclassified-difference acceptance. |
| Dependencies | `backend-candidates-api`; `backend-person-detail-api`; `frontend-query-shell`; `frontend-ranking-results`; `frontend-person-inspector`; `frontend-co-star-vertical`; `frontend-design-system`; `frontend-accessibility`; `frontend-build-artifact`; committed compact-scroll correction `4bfbc19`; immutable oracle. |
| Deliverables | Delta requirement, detailed repair design/tasks, backend/frontend repairs, RED/GREEN tests, raw live probes, complete browser matrix, final evidence ledger, and synchronized archived change. |
| Acceptance | Raw success envelopes validate without transforms; focused/backend/frontend full gates pass under pinned tools; production bundle passes the complete mode/theme/viewport/state browser matrix with no unclassified difference, critical axe finding, overflow, runtime/resource failure, or initial-JS size violation; strict OpenSpec and diff checks pass. |
| Non-goals | New product behavior, contract/schema changes, prototype source reuse, visual reinterpretation, statistical changes, dependency additions, external/live operations, or unrelated refactoring. |
| Operations deferred | Push, PR, merge, release, deployment, host/service/public-route mutation, production data mutation, and legacy retirement remain out of scope. |
| Stop/rollback conditions | Stop on authority conflict, unapproved scope expansion, overlapping edits, required contract/schema change, unreproducible evidence, third failed hypothesis for one slice, or a gate failure requiring unrelated work. Roll back only the exact owned slice without destructive Git operations. |

## MODIFIED Requirements

### Requirement: Existing formal surfaces SHALL match the approved oracle

The formal SPA SHALL reproduce the outward appearance and interaction of the approved oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717` for the header, query editor, ranking results, person inspector, candidate picker, co-star analysis, and site footer at every supported breakpoint and in Light and Dark themes. Clean-room architecture, real transport, server-authoritative data, and internal component boundaries MAY differ without changing outward behavior.

Every observed outward behavior SHALL be classified before acceptance:

- `PRESERVE_ORACLE` behavior SHALL match the immutable oracle in visible hierarchy, geometry, typography, colors, copy, controls, state boundaries, responsive transitions, focus, dismissal, scrolling, and interaction.
- `INTENTIONAL_DELTA` behavior SHALL cite an explicit controlling requirement in `PRODUCT.md`, `DESIGN.md`, an accepted data decision, or an accepted capability. The delta MAY differ only inside its authorized slot and SHALL NOT move, resize, reorder, restyle, rename, or behaviorally alter surrounding preserved oracle elements.
- `NEW_CAPABILITY` behavior SHALL require an explicitly approved capability before implementation. This restoration introduces none.

An implementation-originated difference without a controlling authority SHALL be a defect and SHALL NOT be reclassified as polish, modernization, enrichment, or production necessity after the fact.

#### Scenario: Architectural rewrite is visually compatible

- **WHEN** the same deterministic mode, theme, viewport, state, and user-visible data are rendered through the production bundle and oracle
- **THEN** every preserved element SHALL match the oracle in visible hierarchy, geometry, typography, colors, copy, controls, responsive transitions, focus behavior, scroll ownership, and interaction
- **AND** internal feature, store, request, adapter, and component boundaries MAY differ without an outward redesign

#### Scenario: Production additions coexist with compatibility

- **WHEN** production data, dynamic catalogs, sharing, collection refresh, SafeImage states, or real loading/error recovery add behavior absent from the prototype
- **THEN** the addition SHALL identify its exact governing authority and authorized visible slot
- **AND** only the addition itself MAY differ
- **AND** adjacent preserved oracle content SHALL retain its oracle position, size, order, visual treatment, responsive behavior, and interaction

#### Scenario: Difference has no governing authority

- **WHEN** a rendered or interactive difference is neither an oracle match nor an already-approved intentional delta
- **THEN** acceptance SHALL fail
- **AND** implementation output, reviewer preference, extra data availability, or a claim of improvement SHALL NOT authorize it

#### Scenario: Accessibility does not enlarge oracle-visible controls

- **WHEN** an oracle control is visibly smaller than the required effective hit target
- **THEN** the visible control SHALL retain oracle geometry
- **AND** invisible non-overlapping geometry SHALL provide the required target size
- **AND** accessible names, roles, focus indicators, relationships, and status semantics MAY be added without changing preserved visible output

#### Scenario: Site footer preserves the oracle contract

- **WHEN** the SPA renders any supported route
- **THEN** its site-information navigation SHALL expose “问题反馈” followed by the oracle separator and “粤ICP备2024321317号”
- **AND** the links SHALL use the oracle destinations and safe external-tab behavior
- **AND** the navigation SHALL remain centered, wrapping, keyboard-visible, and touch-target-safe in Light and Dark themes at desktop and mobile widths
- **AND** implementation terminology about query scope or Archive version SHALL NOT replace or accompany that oracle footer content

### Requirement: Fidelity SHALL be regression-tested

Compatibility SHALL be verified against the fixed oracle rather than reviewer preference. Acceptance SHALL use the production bundle, deterministic production-shaped data, raw contract-valid API flows, and one explicit difference ledger. Audit-only response normalization, production-bundled fixtures, unexplained selector masks, and development-server-only evidence SHALL NOT satisfy final acceptance.

The required viewport matrix SHALL include `360`, `390`, `516`, `768`, `779`, `780`, `781`, `917`, `1024`, `1185`, and `1440` CSS pixels at representative heights. Both modes and both themes SHALL cover applicable initial, loading, ready, empty, search-empty, error, retry, pagination, sorting, query-editor, person-Drawer, and candidate-Drawer states. The 779/780/781 boundary SHALL be directly compared.

Each browser record SHALL capture or assert screenshot/computed geometry, page and local overflow, focus and inert state, duplicate IDs, landmarks/headings, control names, console errors, unhandled rejections, failed required resources, direct upstream requests, and accessibility results. Approved delta regions MAY be compared separately only when the ledger names their governing requirement and proves their surrounding preserved geometry is unchanged.

#### Scenario: Raw production flow is accepted

- **WHEN** candidates and person-detail success flows are exercised through the unmodified loopback API and production bundle
- **THEN** every success envelope SHALL validate against its accepted schema
- **AND** co-star and person-detail ready states SHALL become reachable without network interception, response normalization, fixture injection, or adapter weakening

#### Scenario: Fidelity repair is accepted

- **WHEN** the repair candidate is ready
- **THEN** both modes and themes SHALL be recorded at every required viewport and applicable named state
- **AND** every difference SHALL resolve to either exact oracle preservation or one cited intentional delta
- **AND** zero unclassified outward differences SHALL remain

#### Scenario: Responsive boundary is compared

- **WHEN** the same ready state is rendered at 779, 780, and 781 CSS pixels
- **THEN** the compact-to-standard topology SHALL change at the accepted boundary
- **AND** no text, metric, image, control, inspector, rail, chart, or work browser SHALL clip, collapse, overlap, duplicate, or create page-level horizontal overflow

#### Scenario: Interaction parity is compared

- **WHEN** query overlays and mobile Drawers are opened, operated, dismissed, or crossed through a responsive breakpoint
- **THEN** focus entry/return, Escape and control dismissal, inertness, mask/panel geometry, local and background scroll ownership, Draft/result continuity, and restored page position SHALL match the oracle except for a cited higher-authority delta

#### Scenario: Accessibility and runtime gates execute

- **WHEN** the complete candidate matrix is audited
- **THEN** it SHALL contain no critical axe violation, unnamed control, invalid or prohibited ARIA, duplicate ID, broken label relation, page-level overflow, uncaught console error, unhandled rejection, failed required resource, broken image state, or direct Bangumi upstream request
- **AND** any preserved visibly small oracle control SHALL still provide the effective target required by the accessibility capability without visible geometric drift

#### Scenario: Production artifact is the acceptance target

- **WHEN** browser fidelity is signed off
- **THEN** the checked production artifact SHALL be the exact artifact rendered by the final matrix
- **AND** pinned full frontend/backend gates, artifact inventory, initial-JavaScript ceiling, strict OpenSpec validation, and `git diff --check` SHALL pass
- **AND** remaining evidence SHALL not depend on ignored response transforms or stale screenshots
