## Context

`implement-query-result-set` owns normalized queries, filters, exact identities,
and deterministic raw Subject/person set algebra. It deliberately excludes
statistics, series aggregation, sorting, search, and pagination. This change
adds the next pure domain layer: one language-neutral oracle corpus and one Go
authority that future endpoint changes can project without recalculation.

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/dependency review and strict validation passed; committed/pushed/released/deployed: no |
| Owner | Contracts owner creates the approved corpus first; Backend owner implements against that fixed handoff; main agent decides, audits, and accepts. |
| Writable paths | Planning: `openspec/changes/implement-statistics-series-sort-evidence/**`. Contracts: `contracts/goldens/statistics/**` plus its task markers. Backend: `backend/internal/statistics/**`, `backend/internal/architecture/dependencies_test.go`, `backend/scripts/check.sh`, `backend/README.md`, plus its task markers. Main acceptance: acceptance task markers only. |
| Read-only protected inputs | Exact protected inputs in `proposal.md`, including `implement-query-result-set`, all accepted contracts/goldens, query/archive/http packages, authorities, oracle, editor state, refs/remotes, other repositories, hosts, and production. |
| Deletion complement | None. |
| Mutable refs | None during apply. |
| Consumes | Accepted immutable query results/contributions, validated read-only Archive facts, the reviewed statistics corpus, and protected authority/oracle evidence. |
| Produces | Closed statistics goldens; immutable subject/series units; rating, preference, distribution, timeline, summary/evidence results; strict sorted indexes. |
| Dependencies | Exact direct apply dependency: `implement-query-result-set`. Drafting is allowed; all mutation waits for its accepted exit. Contracts handoff then precedes Backend mutation. |
| Deliverables | Two capabilities, corpus/index/verifier, dependency-clean Go package, tests and gate/inventory updates. |
| Acceptance | Exact corpus math/provenance; complete subject/series/personal/global/sort matrices; cancellation, immutability, determinism, fuzz/property and race evidence; full Backend and strict OpenSpec gates. |
| Non-goals | HTTP/OpenAPI/DTOs, search/page handlers, cache, collection client, frontend, query-set changes, Archive/schema/catalog production, or operations. |
| Operations deferred | Production roots, activation/rollback, scheduling, services/proxies, monitoring rollout, secrets, migration, release, deployment, cutover, and legacy deletion. |
| Stop/rollback conditions | Stop on dependency/handoff/authority/path drift, corpus disagreement, unproven decimal behavior, comparator-law failure, data mutation/race/nondeterminism, or any failed gate. Remove only owned unstaged candidate bytes. |

The implementation dependency direction is:

```text
future query/application projection
  -> statistics Evaluator
       -> accepted query ResultSet types
       -> accepted archive.Store read-only facts/index input

statistics never imports httpapi, generated wire, collection client, cache,
frontend, or updater packages.
```

The statistics package may expose an immutable series index built from fixed,
bounded read-only `archive.Store` queries and a pure evaluator over accepted
query results. It does not publish global mutable state; the later application
owner decides the lifecycle and cache of an index tied to one `dataVersion`.

## Goals / Non-Goals

**Goals:**

- Make every accepted metric and intermediate value reproducible from stable
  evidence without frontend repair.
- Preserve approved oracle behavior while pinning intentional data corrections
  to their accepted decisions.
- Make subject/series aggregation and every sort profile deterministic,
  cancelable, immutable, and directly testable before API work.
- Give later rankings/detail/partners/co-star changes one compact complete core
  that search and pagination can project.

**Non-Goals:**

- Add or change any HTTP route, public DTO, OpenAPI schema, frontend behavior,
  collection source, query cache, or operational artifact.
- Re-run filters or identity set algebra, infer cross-work cast participation,
  implement search/page, or choose endpoint-specific response shapes.
- Reuse prototype TypeScript as production code or introduce a shared runtime
  statistics library across languages.

## Decisions

### Contracts cases precede code and encode exact arithmetic

`contracts/goldens/statistics/**` will be a small JSON-only corpus with a
hash-closed index. Each case declares its version, behavior classification,
authority references, bounded facts, selected operation/profile, and exact
expected values/evidence/order. Integer hundredths represent normalized
two-decimal outputs. Reduced signed rational pairs represent exact preference
and intermediate values where a terminating decimal is not guaranteed.

A zero-dependency verifier checks inventory/hashes, schemas encoded as explicit
structural predicates, reduced rationals, case referential closure, formula
invariants, component/order invariants, and deterministic canonical output.
The Contracts verifier is a contract check, not a second production runtime.
The Go package computes the same cases. Future TypeScript adapters may validate
returned shapes/values against selected cases but must not reimplement the
algorithms.

Alternatives rejected:

- copying a bulk prototype fixture, because it contains personal/brittle data
  and obscures individual rules;
- snapshotting Go output, because that would let implementation define its own
  expectation;
- ordinary JSON floating values for every intermediate, because cross-language
  binary rounding would make equality ambiguous.

### Normalize source decimals once, then use exact values

At the statistics boundary, a source score becomes one validated exact decimal
value. The implementation will use standard-library exact integer/rational
operations (or an equivalent fixed-point representation proven by the same
goldens) for sums, division, floor-to-hundredths, positive half-up
round-to-hundredths, comparison, and evidence. No external decimal library is
planned.

Average is `floor(sum/count, 2 decimals)`. Overall is computed from that
normalized average as `(n*average+25)/(n+5)` and rounded positive-half-up to two
decimals. Preference retains an arbitrary-precision exact rational mean and
weight. Exported rational members and JSON use canonical reduced base-10
strings so valid shortest-decimal inputs cannot overflow `int64` or lose
precision in JavaScript; formatting to two decimals belongs to a later
transport/presentation projection. The bounded golden corpus may use JSON
safe-integer members as compact expectations without imposing that bound on
production values. All unrated/invalid boundaries happen before aggregation,
and zero evidence remains distinct from exact neutral evidence.

Alternatives rejected:

- direct `float64` floor/round, because mathematical `8.20` already regressed to
  `8.19` in the oracle implementation;
- rounding the raw average instead of flooring, because it contradicts the
  accepted product rule;
- weighting overall by Bangumi vote count, because `ratingCount` is filtering
  and display evidence only.

This adds no module, bundle, binary dependency, license surface, or network
access. The acceptance gate is the full exact-decimal corpus plus randomized
equivalence/boundary tests and a complete-data characterization.

### Build one immutable versioned series index

The Backend owner will build a `dataVersion`-bound immutable index from
validated positive Subject IDs, subject types/dates, and relation facts. Only
anime components merge, through undirected edges of relation IDs
`2,3,4,5,6,9,10,11,12`; other/cross-type/invalid/missing edges never expand a
component. Union-find construction is input-order independent, and canonical
materialization sorts every component and assigns the minimum positive Subject
ID.

Sequel order and representative remain a separate versioned rule. The corpus
pins the oracle weights: same-type directed IDs `1,3,4,6,11` give source/target
`+5/-5`; same-type IDs `2,5,12` give `-5/+5`; IDs
`7,8,9,10,14,99` give both endpoints `+1`. Members order by score descending,
canonical partial date ascending, then Subject ID ascending. A known shorter
precision precedes a longer date with the same known prefix and a wholly
missing date is last. The approved first-two correction swaps them when their
score difference is below `15` and the initially first date is later. Complete
members and matched members are separate: only matched raw Subjects affect
ratings, latest collection update, contributions, and cooperation, while
complete members explain the component.

Alternatives rejected:

- making the representative the minimum ID, because Series ID stability and
  representative display order are different contracts;
- grouping directly from matched Subjects, because it loses complete-member
  evidence and makes results query-dependent;
- merging participants before raw intersection, because it invents
  cooperation between different works.

### Materialize compact statistical units before aggregation

The evaluator receives an accepted immutable query result and a version-matched
series index/fact view. It materializes canonical subject or series units once.
Each unit carries stable identity, complete/matched member IDs, rating-source
values, partial date, collection update, exact contributions, and character
evidence. Metrics, distributions, timelines, preference, summaries, and sort
keys consume these same units; no helper rebuilds a subtly different set.

Subject mode uses one raw Subject per unit. Series mode first calculates the
normalized value inside each matched series, then gives each valid series one
outer observation. Preference similarly averages comparable differences inside
series before equal outer weighting. A series has no synthetic quarterly
timeline. All slices are canonicalized before publication and returned values
are immutable or copied on projection.

Alternatives rejected:

- independent helpers over raw rows, because duplicate derived statistics were
  an accepted defect;
- returning only final average/overall/preference, because later UI explanation
  requires actual evidence;
- computing endpoint-specific DTOs here, because public wire belongs to later
  endpoint changes.

### Sort immutable indexes with named total-order profiles

Sort profiles are closed names corresponding to the data-guide table:
person-count, person-average, person-overall, person-preference,
work-or-series-selected-metric, and person-combination. A profile constructs a
comparison key with explicit validity bits, exact numeric values, fixed
secondary directions, and final ascending stable identity. Only the primary
value's comparison changes for ascending versus descending; no implementation
reverses a fully sorted list.

Sorting returns a new index of stable entity IDs and never filters or mutates
the complete core. Tests enumerate pairwise/triple comparator laws, missing
values in both directions, ties, shuffled inputs, repeated runs, and page-boundary
slices. This prepares stable ranks but does not assign HTTP ranks or perform
search/page projection.

Alternatives rejected:

- generic reflection/map-driven comparators, because they obscure missing and
  tie semantics;
- `>=` or stable-sort dependence on input order, because neither forms a unique
  strict total order;
- per-endpoint comparator copies, because the accepted defect was inconsistent
  chains.

### Keep cancellation and publication phase-bound

Series loading/indexing, unit materialization, aggregation, distribution,
evidence assembly, and sorting each check the caller context at bounded
intervals. Builders keep results private until the phase completes; cancellation
or a data error returns no partial result. Archive access remains fixed,
argument-bound, read-only, and closable. Tests cancel every major phase and
check goroutine/resource cleanup, input reuse, and race safety.

## Oracle Comparison

The Contracts owner extracts only bounded facts and expected outcomes needed to
prove approved behavior; each preserved case records oracle commit
`644b7748674e553f863d0ffd61d029f86fdc0717` and the relevant historical helper.
No production implementation imports or copies prototype TypeScript.

- `PRESERVE_ORACLE`: valid-work counting, five units at score 5, normalized
  overall formula, series equal weighting, sequel-order behavior, and raw
  Subject intersection before merge.
- `INTENTIONAL_DELTA`: exact decimal arithmetic, valid score `[1,10]`,
  all-unrated nulls, valid-rating weight, `.5`-up buckets, unified quarterly
  `6.66`, minimum-ID Series ID, explicit preference evidence, missing-last and
  strict stable-ID ordering, and removal of deprecated priors/duplicate
  derivations.
- `NEW_CAPABILITY`: the closed cross-language corpus, immutable Go statistical
  core/evidence, cancellation gates, and comparator-law suite.

Any oracle mismatch not already classified by an accepted higher authority
stops apply; it is not silently turned into another delta.

## Risks / Trade-offs

- [The query-result dependency exposes a different final type shape] → Draft
  against semantics now; after that change exits, main-agent review reconciles
  names/adapters inside this change before apply without changing behavior.
- [Exact rational work costs more than `float64`] → Normalize once, keep compact
  integer forms for common hundredth values, benchmark complete accepted input,
  and optimize representation only if corpus equivalence remains exact.
- [Series relation graph is large] → Build one immutable index per accepted
  `dataVersion`, use bounded read-only scans and compact sorted IDs, and measure
  memory/time without inventing a production SLO.
- [Representative rules are easy to conflate with component identity] → Store
  Series ID, member order, and representative as separate fields and golden
  invariants.
- [Map or relation input order leaks nondeterminism] → Canonicalize every
  boundary and run shuffled, repeated, concurrent, and race-enabled tests.
- [Goldens accidentally become a second API schema] → Keep them domain-only;
  later OpenAPI changes explicitly map from domain fields.

## Migration Plan

1. Wait until `implement-query-result-set` is accepted and exited; record its
   exact result types/goldens and protected hashes.
2. Contracts owner adds and verifies the closed corpus twice, then hands off an
   unstaged exact-path candidate for main-agent acceptance.
3. Backend owner implements only the declared package/inventory paths against
   the unchanged corpus and runs targeted plus repository-wide gates.
4. Main agent audits preserve/delta classifications, formulas, dependency
   direction, immutable evidence, comparator laws, and exact path inventory,
   then re-runs all gates.
5. Lifecycle operations such as staging, commit, sync, and archive occur only
   after acceptance under the repository workflow. Push/release/deploy remain
   unauthorized.

Rollback before lifecycle completion removes only the unstaged owned corpus or
Backend candidate. There is no data migration, active snapshot mutation,
service change, or production rollback in this change.

## Open Questions

None at proposal time. Concrete Go type names may be aligned to the accepted
`implement-query-result-set` result after its exit; that mechanical adaptation
must preserve every reviewed requirement and exact writable boundary.
