## Why

The accepted wire and Archive foundations do not yet provide the backend-owned
query normalization and result-set semantics needed by later statistics,
collection, cache, and API changes. This change adds that narrow domain layer
after the Archive subject contract and dynamic position/cast data are complete.

## What Changes

- Normalize raw `SharedQueryV1` JSON into the accepted Effective Query and
  `queryDigest`, using the pinned query-wire vectors rather than generated
  transport numerics as a second authority.
- Build deterministic, unpaginated result sets from the published read-only
  Archive plus an optional immutable personal collection overlay.
- Apply scope, NSFW, date, score, rating-count, tag, collection-status, and
  collection-update filters; resolve exact staff/cast/staff-set identities; and
  implement per-position candidates, multi-position person AND, identity work
  union, participant intersection, and Subject-ID de-duplication.
- Add language-neutral result-set goldens, including personal/global isolation,
  exact tag logic, missing-score behavior, corrected NSFW/partial dates,
  identity evidence, and the `442 != 449` participation boundary.
- Admit pinned Go Unicode normalization and RFC 8785 libraries with exhaustive
  accepted-vector gates.

Downstream behavior is `PRESERVE_ORACLE` for multi-position AND, per-person
identity union, and multi-person raw-Subject intersection at oracle
`644b7748674e553f863d0ffd61d029f86fdc0717`; `INTENTIONAL_DELTA` for
personal/global isolation, normalized exact tags, missing-score exclusion,
dynamic exact identities, and actual-participation counts under `PRODUCT.md`
and `DR-DATA-GLOBAL-001`, `SCOPE-001`, `TAG-001`, `FILTER-001`,
`POSITION-001`, `CAST-002`, and `COUNT-001`; and `NEW_CAPABILITY` for the Go
authority, shared domain goldens, and contract-identical digest output.

## Capabilities

### New Capabilities

- `backend-query-result-set`: Go query normalization, filtering, identity
  resolution, deterministic set algebra, and read-only Archive integration.
- `contracts-query-goldens`: Language-neutral inputs and expected result-set
  outputs shared by the Go authority and future consumers.

### Modified Capabilities

None.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/dependency review and strict validation passed; committed/pushed/released/deployed: no |
| Owner | Contracts owner writes `contracts-query-goldens`; one Backend owner consumes them and implements `backend-query-result-set`; main agent reviews and accepts both blocks. |
| Writable paths | Planning: `openspec/changes/implement-query-result-set/**`. Apply Contracts: `contracts/goldens/query-domain/**`. Apply Backend: `backend/internal/query/**`, `backend/go.mod`, `backend/go.sum`, `backend/internal/architecture/dependencies_test.go`, `backend/scripts/check.sh`, `backend/README.md`, and this change's task markers. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, `tmp-formal-development/**`, root OpenSpec specs, all other active/archived changes, `contracts/openapi/**`, `contracts/schemas/**`, `contracts/goldens/query/**`, `contracts/goldens/archive/**`, accepted `contracts/goldens/catalog/**`, `backend/internal/archive/**`, `backend/internal/httpapi/**`, every other backend/frontend/updater path, `.vscode/**`, Git refs/remotes, other repositories, hosts, and production. |
| Deletion complement | None. |
| Mutable refs | None during apply; no staging, commit, archive, branch/ref update, or push. |
| Consumes | Accepted shared-query schemas/vectors; the corrected Archive v1 subject facts; the accepted published `archive.Store`; accepted catalog selection plans and exact cast facts; and a caller-supplied immutable personal collection overlay for tests/future adapters. |
| Produces | Effective Query plus `queryDigest`, deterministic raw-Subject/person/identity/contribution result sets, and indexed query-domain goldens. |
| Dependencies | Exact apply dependencies: `define-shared-query-wire`, `correct-archive-subject-semantics`, `implement-backend-archive-consumer`, and `derive-position-catalog-and-cast`. Drafting may finish now; apply waits until all four exit. |
| Deliverables | Two capability specs, closed golden inventory, Go domain/repository implementation, pinned dependency/license gates, tests, architecture/inventory updates, and documentation. |
| Acceptance | Existing query normalization/digest/Unicode/RFC 8785 vectors; every new result-set golden; Archive/catalog integration; personal/global non-access tests; cancellation/determinism/read-only/race tests; full backend test/race/vet/build and strict OpenSpec gates. |
| Non-goals | Final averages/overall/preference/distributions, series aggregation, ranking/sorting/search/pagination, HTTP routes or response DTOs, collection fetching/admission, caching, frontend work, Archive production, or schema repair inside this change. |
| Operations deferred | Production data roots, activation/reload/rollback, scheduling, services/proxies, monitoring rollout, secrets, release, deployment, migration, and legacy removal. |
| Stop/rollback conditions | Stop before apply unless all dependencies are accepted and Archive v1 exposes authoritative NSFW plus strict partial-date precision without invented components. Stop on authority/dependency/path/dirty-state drift, golden mismatch, unbounded or write-capable SQL, leaked personal access in global scope, dependency/license failure, or any acceptance failure; discard only this owned unstaged candidate and preserve published Archive and protected state. |

This change touches no other repository or external mutable state. Push, pull
request, tag, release, deployment, host mutation, and production activation
remain separate explicit authorization gates. The four planning artifacts
passed strict validation and main-agent review; apply remains blocked until
every exact dependency above has exited.
