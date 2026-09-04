## Context

Candidates currently require one canonical `input.positionKey`; Backend builds a
single-position core and the frontend treats every row as that one identity.
The requested “全部职位” view needs one person-level union across the ordered
query positions while preserving independent counts and single-position views.

## Goals / Non-Goals

**Goals:** strict nullable all-mode wire; one Backend-ranked row per person;
unioned works/series and ordered actual identities; default all-mode UI; exact
single-mode, latest-only, share, and selection-limit preservation.

**Non-Goals:** query ranking AND changes, client aggregation, analysis formula
changes, new dependency, another endpoint, deployment, or production mutation.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Local cross-component implementation; heavy accumulated gates deferred |
| Owner | Contracts -> Backend -> Frontend; primary agent accepts |
| Writable paths | Exact proposal paths plus existing active-change ownership-transfer notes |
| Read-only protected inputs | Other operation wires/services, catalog membership, updater/Archive data, external state |
| Deletion complement | Preserve single mode/counts/selection/share/errors/tests; remove only redundant picker label |
| Mutable refs | Current worktree; loopback Backend only after focused checks |
| Consumes | Ordered PositionResults, statistics evaluator/sort, generated contracts, one selection owner |
| Produces | Nullable all-mode DTOs, aggregated Backend core/page, default all-mode UI |
| Dependencies | Existing generators/runtime cache/Vue/Naive UI; no package |
| Deliverables | Schema/OpenAPI/goldens/generated, Go/TS/Vue, focused tests/build/browser |
| Acceptance | Correct union/rank/identity order, unchanged single mode, desktop/compact usability |
| Non-goals | Ranking/query/analysis/dependency/deploy redesign |
| Operations deferred | Complete gates, sync/archive, Git integration, release/deploy |
| Stop/rollback conditions | Cross-wire drift, client ranking, union/order/limit/single-mode failure |

Dependency direction is `Contracts -> generated Go/TypeScript -> Backend
authority -> strict adapter/coordinator -> picker/selection`. Frontend never
constructs a mixed ranking.

## Decisions

1. `input.positionKey` and response `data.positionKey` become `string|null`;
   null is the closed all-position discriminator. It does not enter Query state
   or masquerade as a canonical PositionKey.
2. Every item gains ordered `positionKeys`. Single mode returns exactly the
   current key; all mode returns every applied position for which that person is
   a candidate, in query order.
3. All mode unions each person's eligible subject IDs across their matching
   PositionResults, then runs the existing statistics evaluation and stable
   sort once. A person appears once; workCount and averages use the union.
   PositionCounts remain independent and unchanged.
4. Cache input identity encodes nullable positionKey. Views remain outside the
   core key; all and single cores cannot collide.
5. CandidatePicker uses a local Select value for null, shows “全部职位 · N 人”
   first, and labels mixed rows with their returned positions. Row activation
   atomically toggles the returned identity set through the existing selection
   model. Default first-two selection consumes the same item positionKeys.
6. Share candidate input permits null and replays it exactly. Existing shares
   with strings remain valid; no version bump is required because the wire
   envelope already carries typed Candidates input.

Alternatives rejected: frontend fan-out/merge creates a second ranking
authority; duplicate person-position rows make person ranking ambiguous; a
magic string pollutes canonical PositionKey semantics.

## Risks / Trade-offs

- **Large union core** -> one bounded cached core, existing executor/timeouts,
  focused cost tests, no per-position request fan-out.
- **Identity limit on a mixed row** -> selection replacement remains atomic and
  exposes the existing limit error; no partial identity addition.
- **Generated graph drift** -> run isolated Candidates generators/checks and
  assert unrelated operation inventories unchanged.
- **Old share compatibility** -> string input remains unchanged and covered.

## Migration Plan

Update PRODUCT/DESIGN and strict contracts first; regenerate consumers; update
Backend and focused tests; update frontend state/UI; rebuild only the loopback
Backend and browser-check after focused gates. Root-spec sync/archive, Git
integration, and deployment remain deferred. Rollback restores exact declared
paths and the prior loopback binary only.

## Open Questions

None.

