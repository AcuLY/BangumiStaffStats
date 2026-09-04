## Capability Boundary

- **Status:** local intentional Backend candidate-mode delta.
- **Owner:** Backend candidates API.
- **Writable paths:** exact candidate request/core/build/view/cache/service/
  projection files and focused tests, generated wire consumers, this change,
  root spec later.
- **Read-only protected inputs:** query membership/statistics formulas, other
  Backend operations, updater/Archive contents, external state.
- **Deletion complement:** preserve every single-position/count/error behavior.
- **Mutable refs:** current worktree and later loopback Backend process.
- **Consumes:** normalized ordered PositionResults and accepted nullable input.
- **Produces:** immutable all-position core and projected page.
- **Dependencies:** existing statistics/runtime cache; no package.
- **Deliverables:** Go implementation/tests/live local response.
- **Acceptance:** unioned works, ordered identities, stable ranks, bounded cache.
- **Non-goals:** query ranking AND or analysis changes.
- **Operations deferred:** full gates/lifecycle/Git/deployment.
- **Stop/rollback conditions:** wrong union/order/rank/count or single-mode drift.

## MODIFIED Requirements

### Requirement: Backend SHALL compute candidate sets independently per ordered position

For one normalized query and immutable Archive/usable collection, the Backend
SHALL apply common filters once and evaluate candidate membership independently
for every ordered query position. Per-position counts and single-position lists
SHALL remain independent. For all-position mode, the Backend SHALL union each
person's eligible subjects across every PositionResult where they are a
candidate, emit that person once with ordered matching positionKeys, and compute
workCount/averages from the union. Multi-position ranking AND semantics SHALL
not collapse either mode.

#### Scenario: A person matches only the second position
- **WHEN** a two-position query has a person eligible only for the second position
- **THEN** single counts remain independent and all mode includes that person with only the second key

#### Scenario: A person matches both positions
- **WHEN** their contributions overlap on one subject and differ on another
- **THEN** all mode SHALL de-duplicate the subject union and emit both ordered keys

### Requirement: Backend SHALL project candidate views after complete ranking

The Backend SHALL validate scope-specific sort values, apply the accepted
strict total order with missing metrics last and stable person ID tie-breaking,
assign ranks before search, and perform checked pagination for both nullable all
mode and single mode. View fields SHALL not alter cached core identity or
recompute ordered position counts.

#### Scenario: Missing average under ascending order
- **WHEN** an all-mode candidate lacks the selected average metric
- **THEN** the candidate SHALL remain after every valid value with deterministic rank

### Requirement: Candidate core SHALL use bounded immutable cache semantics

The candidate core key SHALL include operation version, dataVersion,
queryDigest, nullable current-position input digest, and only for personal scope
the collection digest. It SHALL exclude search, sort, order, page, and pageSize.
All and single cores SHALL not collide. Published/read values SHALL remain
immutable, and cache admission failure SHALL not change a successful result.

#### Scenario: Two all-mode pages use one core
- **WHEN** two null-position requests differ only by page
- **THEN** they SHALL share one all-mode core and receive independent pages

