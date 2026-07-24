## Context

The shared-query contract already fixes normalization, Unicode 15.1, RFC 8785,
and digest bytes. The Archive consumer exposes one validated read-only store,
while the catalog/cast dependency will expose typed selection plans. This
change connects those authorities without adding an endpoint, cache, or final
statistical calculation.

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/dependency/library review and strict validation passed; committed/pushed/released/deployed: no |
| Owner | Contracts owner creates goldens; Backend owner implements after that handoff; main agent reviews/accepts. |
| Writable paths | Exactly the planning, Contracts, Backend, task-marker paths in `proposal.md`. |
| Read-only protected inputs | Exactly the authorities, accepted dependencies, other code/changes, editor state, refs/remotes, other repositories, hosts, and production listed in `proposal.md`. |
| Deletion complement | None. |
| Mutable refs | None during apply. |
| Consumes | Shared query vectors, corrected Archive v1, published `archive.Store`, typed catalog selection plans, synthetic immutable collection overlays. |
| Produces | Effective queries/digests, raw result sets/identity evidence, and query-domain goldens. |
| Dependencies | `define-shared-query-wire`, `correct-archive-subject-semantics`, `implement-backend-archive-consumer`, `derive-position-catalog-and-cast`; all must exit before apply. |
| Deliverables | Closed goldens, Go normalizer/result-set package, dependency/check/doc updates, tests. |
| Acceptance | Contract-vector, domain-golden, Archive integration, isolation, cancellation, determinism, race, full backend, and strict OpenSpec gates. |
| Non-goals | Final statistics/series/sort/page, HTTP, collection fetch, cache, frontend, schema correction, or producer work. |
| Operations deferred | Activation, scheduling, services, monitoring rollout, migration, release, and deployment. |
| Stop/rollback conditions | Stop on dependency/authority/path drift or failed gates; remove only the unstaged owned candidate and preserve accepted data/state. |

Dependency direction is `query -> archive`; query does not import HTTP,
application, generated wire, collection-client, or cache packages. Contracts
goldens precede Backend implementation and never import runtime code.

## Goals / Non-Goals

**Goals:** reproduce the accepted Effective Query/digest bytes, create one
scope-safe raw result-set authority, preserve exact contribution evidence, and
make its set algebra deterministic and directly testable.

**Non-Goals:** compute display metrics or series, expose transport DTOs, fetch a
collection, optimize with a cache, or repair upstream Archive schema here.

## Decisions

### Normalize from preserved raw JSON

The domain normalizer accepts the original query JSON and decodes closed domain
types with `json.Number`; it does not consume generated `float32` fields or
import `httpapi/wire`. It applies the accepted TrimV1, Unicode 15.1
assigned-scalar gate, NFKC/default fold, defaults, catalog validation, and
query-digest projection, then compares directly with existing shared vectors.

Pin `golang.org/x/text v0.40.0` for NFKC/folding and generate the Unicode 15.1
assigned-range table from the protected official file. Pin
`github.com/gowebpki/jcs v1.0.1` for RFC 8785. The standard library lacks both
NFKC/default folding and ECMAScript-compatible JCS numbers; handwritten
normalization/canonicalization and importing the Node verifier were rejected.
As reviewed on 2026-07-24, JCS `v1.0.1` is the latest tagged release, is
Apache-2.0 licensed, and adds no runtime dependency; its small, low-activity
implementation is accepted only behind complete pinned RFC vectors. Both
modules are Backend-owned runtime dependencies, add no frontend bytes, and
must pass complete pinned Unicode/RFC vectors, `go mod verify`, license checks,
generated-table drift checks, and a binary-size benchmark. Replacement requires
a later reviewed change passing the same gates.

### Separate loading from pure set algebra

Fixed, argument-bound `SELECT` statements stream corrected subject facts,
rating buckets, tags, people, and exact contributions through the accepted
`archive.Store`. The loader publishes nothing until complete. Pure functions
then filter and combine typed facts, so language-neutral JSON cases can test
semantics while selected integration cases traverse the real Store.

Personal evaluation receives an immutable synthetic/domain collection snapshot
already bound to the effective UID; global evaluation has no collection input
and must not call a collection accessor. This preserves the DAG: the future
client-admission change only supplies the overlay.

### Keep the result core raw and deterministic

Positions remain opaque keys resolved by typed catalog plans. Each plan yields a
candidate-person set, raw Subject set, and exact staff/cast contribution
evidence. Ranking persons are the intersection across requested positions;
their works are the union across those identities. Participant helpers union
one person's identities, intersect people at raw Subject level, and never merge
series. Every exposed slice is sorted by stable numeric/key order and immutable
after return.

`mergeSeries` remains in Effective Query/digest but does not alter this raw
set; the dependent statistics change owns series and metrics. Search, sort,
rank, and pagination are absent, so view changes cannot alter this core.

### Use small, closed cross-language goldens

`contracts/goldens/query-domain/**` contains a hash-indexed manifest, synthetic
facts/collections, expected normalized query/digest, and expected eligible,
candidate, identity, ranking, participation, and intersection sets. It
references existing query/catalog/Archive authorities instead of copying them.
The `442 != 449` case uses bounded synthetic facts plus oracle provenance, not
the bulk personal fixture.

Oracle comparison preserves multi-position and identity set algebra. The
accepted data decisions explicitly authorize exact-tag, scope-isolation,
missing-score, dynamic-position, and actual-participation differences. The Go
authority and shared domain corpus are new capabilities.

## Risks / Trade-offs

- [Archive subject semantics are incomplete] → apply is blocked on
  `correct-archive-subject-semantics`; NSFW is never inferred from tags and
  partial dates are never fabricated.
- [Unicode/JCS dependency drift] → exact pins, exhaustive authoritative
  vectors, generated-table check, module/license verification.
- [Large unfiltered result sets allocate proportionally] → stream fixed
  queries, check cancellation, avoid duplicate copies, and characterize
  complete-Archive memory/time without claiming a production SLO.
- [Map iteration leaks nondeterminism] → stable sorted output and repeated,
  shuffled, and race runs.

## Migration Plan

After all four dependencies exit, implement and accept the Contracts block,
then the Backend block, both unstaged. Archive/sync/commit happens only after
main-agent acceptance. Rollback removes only these owned candidate files; no
snapshot, external state, or production system changes.

## Open Questions

None. The Archive subject defect is a known apply dependency, not an
implementation choice in this change.
