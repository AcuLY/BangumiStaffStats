## Why

The accepted query-result change stops at deterministic raw Subject/person and
identity sets. Downstream ranking, detail, partner, and co-star APIs still need
one Go-owned authority for ratings, series units, preference evidence,
summaries, and strict total ordering before they can expose stable results.

## What Changes

- Add a closed, hash-indexed, language-neutral statistics corpus before Backend
  implementation. It fixes valid-score and missing-value semantics, exact
  decimal truncation, the five-unit neutral prior, rating distributions,
  series connected components, preference evidence, summaries, and every
  approved sort chain.
- Add a pure, cancellation-aware Go statistics package over the accepted raw
  query result and read-only Archive facts. It produces immutable subject or
  series statistical units, metrics, evidence, aggregate summaries, chart
  inputs, and deterministic sorted indexes without HTTP, pagination, or cache.
- Preserve the approved oracle behavior for multi-position/person result-set
  inputs, the five neutral samples at score 5, unweighted arithmetic means,
  series equal weighting, and “intersect raw Subjects before series merge.”
- Implement accepted intentional corrections: reliable decimal fixed-point
  truncation (`8.20` remains `8.20`, `[6,7,7] -> 6.66`), `0`/`null`/missing
  exclusion, invalid-score rejection, `.5`-up rating buckets, stable Series ID,
  explicit preference evidence, missing-last ordering, and stable-ID final
  tie-breaks.

Externally observable behavior is `PRESERVE_ORACLE` for approved rating,
neutral-prior, series-equal-weight, and raw-intersection semantics at immutable
oracle `644b7748674e553f863d0ffd61d029f86fdc0717`.
It is `INTENTIONAL_DELTA` where `PRODUCT.md` and accepted
`DR-DATA-RATING-001`, `RATING-002`, `BACKEND-001`,
`RATING-COUNT-001`, `DISTRIBUTION-001`, `TIMELINE-001`,
`SERIES-001`, `SERIES-002`, `PREFERENCE-001`, `SORT-001`,
`CANDIDATE-001`, `METADATA-001`, and `DERIVED-001` require the
corrections above. The cross-language corpus and Go-only statistical authority
are `NEW_CAPABILITY`.

## Capabilities

### New Capabilities

- `contracts-statistics-goldens`: Closed cross-language statistical inputs,
  exact outputs, provenance, inventory, and zero-dependency verification.
- `backend-statistics-authority`: Go ratings, series, preference, summary,
  evidence, and strict-order domain authority over accepted query results.

### Modified Capabilities

None.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/dependency review and strict validation passed; committed/pushed/released/deployed: no |
| Owner | One Contracts owner first writes and verifies `contracts-statistics-goldens`; after accepted handoff, one Backend owner implements `backend-statistics-authority`; the main agent decides, audits the specification, and performs final acceptance. |
| Writable paths | Planning: `openspec/changes/implement-statistics-series-sort-evidence/**`. Apply Contracts: `contracts/goldens/statistics/**` and only this change's Contracts task markers. Apply Backend: `backend/internal/statistics/**`, `backend/internal/architecture/dependencies_test.go`, `backend/scripts/check.sh`, `backend/README.md`, and only this change's Backend task markers. Main acceptance may update only this change's acceptance task markers. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, `tmp-formal-development/**`, immutable oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717`, root OpenSpec specs, every other active/archived change including `implement-query-result-set`, `contracts/openapi/**`, `contracts/schemas/**`, every golden root except the owned new `contracts/goldens/statistics/**`, `backend/internal/query/**`, `backend/internal/archive/**`, `backend/internal/httpapi/**`, all other backend/frontend/updater paths, `.vscode/**`, Git refs/remotes, other repositories, hosts, and production state. |
| Deletion complement | None. No existing file may be deleted, renamed, or replaced outside the exact owned paths. |
| Mutable refs | None during apply. Owners do not stage, commit, archive, update a branch/ref, push, open a pull request, tag, release, deploy, or activate production. |
| Consumes | Accepted immutable outputs and types from `implement-query-result-set`; validated read-only Archive Subject ratings, partial dates, relations, and exact contribution evidence already reachable through accepted Backend boundaries; `PRODUCT.md`, the accepted data decisions, and the fixed oracle solely as protected comparison evidence. |
| Produces | A closed statistics golden corpus and verifier; immutable Go subject/series units; average, rated count, overall, preference, distribution, timeline, summary/evidence values; stable series components/representatives; and strict sorted indexes. |
| Dependencies | Exact direct apply dependency: `implement-query-result-set`. Drafting may complete now, but neither Contracts nor Backend apply may start until that change is accepted, archived/exited, and its owned result types and goldens are stable. |
| Deliverables | Two capability specs; indexed JSON-only statistics cases and verifier; pure Go domain implementation and tests; narrowly updated architecture/check/inventory documentation; exact acceptance evidence. |
| Acceptance | Corpus verification twice; approved-oracle preserve/delta provenance; subject/series and personal/global matrices; empty/all-unrated/`8.20`/`[6,7,7]`/five-neutral-sample/series-equal-weight/bucket-boundary/preference-zero cases; every approved sort chain in both directions with missing-last and stable-ID ties; cancellation, immutability, shuffled-input/repeated-run determinism, fuzz/property and race tests; complete Backend test/race/vet/build/check gates; strict change/all OpenSpec validation and `openspec doctor`. |
| Non-goals | HTTP routes or DTO/OpenAPI changes; search, pagination, handler ranking or cache projection; collection fetching/admission; cache; frontend/UI; query filtering or identity-set changes; Archive production/schema/catalog changes; operations. |
| Operations deferred | Production roots, activation/reload/rollback, scheduling, services/proxies, monitoring rollout, secrets, migration, release, deployment, cutover, and legacy-system deletion. |
| Stop/rollback conditions | Stop before mutation unless the direct dependency has exited, all four planning artifacts are strict-valid and main-reviewed, owned paths are disjoint, and protected inputs match the reviewed inventory. Stop on authority ambiguity, oracle/golden mismatch, cross-language disagreement, invalid decimal or sort semantics, data race, path drift, or any failed gate. Rollback may remove only this change's unstaged owned candidate or reverse its exact unstaged hunks; preserve all accepted dependency and user state. |

This change touches no other repository or external mutable state. Any push,
pull request, tag, release, deployment, host mutation, or production activation
requires later explicit authorization. Apply is blocked until proposal, specs,
design, and tasks pass strict validation and main-agent review, and until the
exact direct dependency has exited.
