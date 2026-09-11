> Supersession (2026-09-08): `contracts-remove-query-sharing` retires the query-sharing feature and overrides the sharing-specific requirements, preservation clauses, and acceptance assumptions below. URL fragments are cleared without parsing or replay. Header now has an always available same-tab “回到旧版” link to `https://search.bgmss.fun/old/` immediately left of theme. Exact accepted workspace recovery remains frontend-local through validated v2 JSON session storage; v1 fragment-based storage is discarded. Completed evidence below remains historical, and unrelated requirements are unchanged.

## Capability Boundary

- **Status:** local intentional presentation and initial-state delta.
- **Owner:** Frontend co-star vertical, primary agent.
- **Writable paths:** exact candidate rail/toolbar/row/focus CSS, App ordinary
  candidate-success/share guard, focused co-star tests, PRODUCT/DESIGN/sidecar,
  this change, root spec later.
- **Read-only protected inputs:** Backend candidate order/counts, query
  coordinator/API/contracts, selection limits, analysis computations, unrelated
  components, Backend/updater/Archive, and external state.
- **Deletion complement:** preserve all controls, candidates, selection actions,
  share states, loading/errors, analysis, and tests.
- **Mutable refs:** current local worktree only.
- **Consumes:** accepted backend candidate order/current position and existing
  one-owner selection state.
- **Produces:** consistent toolbar/row/focus presentation and default first-two
  selection on ordinary accepted queries.
- **Dependencies:** existing App/co-star topology and Naive UI public APIs.
- **Deliverables:** docs/CSS/App/tests/browser/build evidence.
- **Acceptance:** visible row borders, aligned controls, unclipped outward ring,
  state-safe backend-ranked first-two selection, responsive no-overflow.
- **Non-goals:** candidate ranking/statistics/API/schema/dependency changes.
- **Operations deferred:** full gate, lifecycle, Git integration, deployment.
- **Stop/rollback conditions:** selection/share/order/focus/overflow/test drift.

## ADDED Requirements

### Requirement: Ordinary co-star candidate initialization SHALL be bounded and state-safe

Selected identities SHALL remain the single ordered `personId + positionKey`
state owned by the existing selection model. After an ordinary primary co-star
candidates query is accepted, if that selection is empty, the shell SHALL
select up to the first two candidate items in accepted backend order using each
item's complete returned `positionKeys`. It SHALL greedily include only complete
person identity sets whose combined total remains within 20 identities; it
SHALL skip an item rather than truncate identities and SHALL not expose an
automatic skip as a user-action limit error. This default SHALL immediately enter
the existing one-person or multi-person analysis state without a second
selection owner or client-side reranking.

Exact share replay SHALL restore its encoded empty, partner, or analysis state
without this default overwriting or transiently substituting it. A retained
selection on same-query refresh SHALL not be overwritten. Candidate
search/sort/order/page/page-size/current-position view changes SHALL not apply
the default. Compact layout SHALL keep the person picker Drawer closed.

#### Scenario: Ordinary candidate query returns at least two people

- **WHEN** a non-share primary co-star query succeeds with empty selection and
  at least two accepted candidate items
- **THEN** up to two backend-ordered people whose complete returned identities
  fit the 20-identity bound SHALL be selected and existing analysis SHALL start
- **AND** no client-side reranking or mobile Drawer opening occurs

#### Scenario: Ordinary candidate query returns fewer than two people

- **WHEN** the accepted ordinary response contains zero or one candidate
- **THEN** all available candidates up to two SHALL be selected and the normal
  zero/one-person topology SHALL remain valid

#### Scenario: Second default person would exceed identity limit

- **WHEN** the first complete identity set fits but adding the second would
  exceed 20 identities
- **THEN** only the first complete person SHALL be selected without truncation
- **AND** no user-action limit error SHALL be published

#### Scenario: Selection or share state already owns the result

- **WHEN** a same-query refresh retains selection, a candidate view-only request
  completes, or an exact co-star share is replayed
- **THEN** the existing/encoded selection SHALL remain exact and SHALL NOT be
  replaced by the current candidate page's first two items

### Requirement: Candidate workspace visual controls SHALL remain consistent

The candidate search, sort selector, and order control SHALL use a consistent
visible height and aligned control geometry. The sort selector SHALL retain
enough inline space for its visible option text; constrained layouts SHALL move
search to its existing full-width row without horizontal overflow. Every
candidate row SHALL expose a visible neutral 1px border when unselected and a
brand-derived border when selected, without layout shift. The desktop rail's
attention/focus indication SHALL render outside the rail content edge so no
internal control can cover or clip it; forced-colors SHALL retain a visible
system focus color.

#### Scenario: Candidate rail is inspected or focused

- **WHEN** the desktop candidate rail is highlighted and candidate controls are
  visible against its edges
- **THEN** the complete outer ring SHALL remain visible above/outside child
  painting and every candidate row SHALL retain a visible boundary

#### Scenario: Toolbar crosses responsive widths

- **WHEN** the candidate toolbar renders at desktop, constrained desktop, and
  compact widths
- **THEN** search, sort text, and order controls SHALL remain aligned and
  readable with no clipped label or horizontal overflow
- **AND** the order control SHALL visibly retain its current “升序 / 降序” text
  and direction icon plus its complete accessible name at every supported width
- **AND** its icon SHALL use a straight vertical stem rather than a chevron, and
  its default/hover/focus surface SHALL match the adjacent Naive Select

`frontend-refine-ranking-detail-and-picker` supersedes only the compact Drawer
host. The default selection SHALL continue to leave the new accordion collapsed,
and candidate order/toolbar/boundary behavior remain unchanged.
