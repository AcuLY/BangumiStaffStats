## Context

The accepted query shell already owns `/co-star`, Applied Query, queryRevision,
sharing, and candidates as the mode's primary query operation. The page still
lacks its production feature. Exact changes `expose-candidates`,
`expose-partners`, and `expose-co-star` own the server contracts, generated
DTOs, statistics, ranks, evidence, and pagination; this change consumes those
outputs and owns only frontend state and presentation.

Oracle `644b7748674e553f863d0ffd61d029f86fdc0717` supplies comparison evidence for
the candidate picker, selected tray, empty/single/multi topology, information
hierarchy, density, and responsive layout. `PRODUCT.md` and `DESIGN.md` override
the prototype where formal operation boundaries differ.

| Boundary | Declaration |
|---|---|
| Status | Specified and main-agent approved. Group 1 is accepted at `9eae3216`, Group 2A at `f7233647`, and the co-star contract/runtime at `8b9d623a` plus archive `a15073fb`. Group 2B feature implementation is committed at `77b335ae` and undergoing its final oracle-correction audit; shared integration remains gated on explicit main-agent handoff. |
| Owner | One Frontend implementation agent; main agent audits and accepts. |
| Writable paths | Exactly the paths declared in `proposal.md`; feature-owned work stays under `frontend/src/features/co-star/**`, with only the listed API, coordinator/share, app, shared primitive, check, architecture, and test integration files mutable. |
| Read-only protected inputs | Higher authorities, oracle, contracts/backend/updater, contract-owned generated DTOs and generators, non-listed frontend files, other changes, refs/remotes, external repositories, and production state. |
| Deletion complement | Delete only new files created in declared API/co-star/test paths; hunk-revert existing integration files. |
| Mutable refs | None during apply. |
| Consumes | Exact changes `bootstrap-frontend-foundation`, `implement-frontend-query-shell`, `implement-frontend-ranking-results`, `implement-frontend-person-inspector`, `expose-candidates`, `expose-partners`, and `expose-co-star`. |
| Produces | Strict frontend drivers/adapters and one complete `/co-star` production surface. |
| Dependencies | Direction is contract DTOs/endpoints and accepted shell/shared primitives → frontend adapters/coordinator → co-star feature → App route. No frontend feature may import backend/contracts or generated DTOs directly. |
| Deliverables | Candidate rail/drawer, identity tray, partners, pair/group analysis, share restore, tests, and browser evidence. |
| Acceptance | Contract drift/adapter, state, component, integration, full frontend, responsive Light/Dark, focus, overflow, console, and network gates. |
| Non-goals | Statistics, backend/contracts, new dependency/state/request layer, person detail, fixtures, operations, entry migration, or prototype cleanup. |
| Operations deferred | Hosting fallback, service/process configuration, monitoring setup, deployment, release, cutover, secrets, and activation. |
| Stop/rollback conditions | Stop on dependency drift, shared-file ownership overlap, authority conflict, need for frontend statistics, undeclared paths/dependencies, or external mutation; retain last accepted state and revert only owned files/hunks. |

## Goals / Non-Goals

**Goals:**

- Deliver one server-authoritative `/co-star` workflow for 0, 1, and 2–10
  selected people while preserving the approved oracle hierarchy.
- Keep candidate, partners, and co-star requests independently cancelable,
  revision-bound, latest-only, and locally recoverable.
- Preserve ordered `personId + positionKey` identities across mode switches and
  sharing, clearing them only after a semantically different query succeeds.
- Meet the DESIGN responsive, dual-theme, keyboard, focus, reduced-motion,
  target-size, overflow, image, loading, and status contracts.

**Non-Goals:**

- Computing or correcting ranks, intersections, summaries, leaders, matrices,
  tags, ratings, preferences, work aggregates, or pagination in the browser.
- Adding a package, a second state/request owner, fixtures, backend/contract
  work, private collection access, operations, or deployment.

## Decisions

1. **One feature controller, three independent resources.** `features/co-star`
   owns candidate view state, ordered selected identities, and partners/co-star
   view state; the accepted query coordinator remains the only queryRevision,
   sequence, AbortController, and commit authority. Candidates are the primary
   `/co-star` query result. Selection count dispatches locally to empty,
   partners, or co-star, while each network resource retains its last accepted
   content and local error. A monolithic App component and a second Pinia/query
   owner were rejected because they would duplicate authority and couple
   unrelated pending surfaces.

2. **Contract-owned generation, feature-owned strict adaptation.** The
   deterministic DTOs and drift scripts from `expose-candidates`,
   `expose-partners`, and `expose-co-star` remain read-only inputs. API adapters
   strictly decode unknown success/error envelopes into feature models and
   enforce scope-specific structural omission; components never import
   generated DTOs. Handwritten wire types or permissive casts were rejected
   because they bypass contract drift and closed unions. No library is added.

3. **The tray is the sole identity mutation surface.** Candidate activation
   toggles exactly the current `personId + positionKey`; tray controls remove an
   identity or whole person and preserve first-selected person/identity order.
   Candidate rows locally overlay current selection and other selected
   identities without sending selection to `/candidates`. A partners-row
   activation adds the returned target's actual contributing identities and
   transitions to pair analysis. Analysis cards are read-only. Duplicate people,
   10-person, and 20-identity limits are enforced before request and still
   strictly decoded if returned as server errors. Duplicate selectors and
   server-side sessions were rejected by the DESIGN One Owner Rule and share
   contract.

4. **Operation topology follows selection count and server view boundaries.**
   Zero people render the approved “尚未选择人物” action. One person requests
   `/partners` and renders source, complete partner count, fixed leaders, and
   server-ranked paginated rows; candidate-position filtering refreshes the
   whole partner analysis, while ordinary view requests preserve summary and
   leaders. Two people render pair analysis; three through ten render group
   analysis with the returned pair matrix. Participants, summaries, tags,
   ratings, preference, contribution provenance, work items, and pagination are
   displayed unchanged. The upper-triangle matrix may be mirrored into an
   accessible visual table as a shape-only lookup, but the frontend SHALL NOT
   derive best-pair, counts, averages, or other evidence. The prototype's local
   best-pair decoration and single-person locally computed common-work pane are
   intentional deltas; partner activation instead enters the authoritative
   pair response.

5. **Pending and failure are surface-local.** Candidate changes keep tray and
   accepted analysis visible; identity changes keep rail/tray and participant
   count visible; co-star work-view changes keep participants, summary,
   evidence, and matrix visible. Debounce does not enter pending. Superseded
   completions cannot commit, and cancellation/failure retains the previous
   accepted content with a local retry. `refreshCollection` is never sent by
   partners/co-star or any view-only request. Whole-page loading and response
   clearing were rejected because they violate PRODUCT continuity.

   The shared client exposes only immutable `status` plus a read-only header
   accessor to operation error decoders. Partners/co-star accept only canonical
   integer `Retry-After` values from 1–60 seconds and may perform at most one
   abortable bounded-jitter retry for a retryable 429 or `SERVER_BUSY`; missing
   or invalid delay metadata fails locally without guessing. Explicit
   collection refresh is never sent by these operations and never enters this
   retry path.

6. **Share serializes intent, never response.** The frontend consumes the
   existing generated v1 co-star share contract, whose accepted payload already
   carries ordered selected identities and the co-star operation/view needed to
   restore the visible topology. It excludes Draft, response bodies,
   sequence/request/revision/digests, theme, Drawer, focus, and loading. Restore
   validates payload and business limits, consumes it once through the ordinary
   application/coordinator path, and removes the fragment after that one attempt
   whether application succeeds, defers, or fails. The restored people are
   rehydrated from the authoritative candidate/analysis response rather than
   names stored in the share payload. A server share API and local persisted
   session were rejected.

7. **Oracle comparison is evidence-based.** Preservation is checked against
   oracle screenshots/behavior for candidate rail/drawer, tray, state topology,
   data hierarchy, copy, density, and navigation. Intentional deltas are the
   server-authoritative operation boundaries described above. New capability
   evidence covers real DTO traffic, cancellation/revision/share restore, and
   error states. CSS remains feature-owned, desktop rail widths follow
   348/320/300px, compact selection uses the bottom Drawer below 780px, and
   shared chart/media primitives are extracted only when two production
   consumers require them.

8. **App owns persistent mode panels and compact picker placement.** The App
   constructs candidates, partners, and co-star drivers plus one
   `CoStarSelection`; selection count dispatches to empty, partners, or
   pair/group without destroying either mode panel. Both stable tabpanels remain
   mounted and switch with `hidden` plus `inert`, keeping Header tab ownership,
   selection, and accepted results intact. Below 780px the picker entry moves
   into Header context, closes the query editor before opening the bottom
   Drawer, and restores focus to the exact surviving opener.

9. **Deferred production surfaces expose truthful recovery.** Loading a
   deferred ranking, candidate, co-star, or person-detail module may fail
   independently while Header navigation remains usable. The shared state
   presentation may reuse the oracle's existing result-state vocabulary and
   dimensions, but it is not a redesign. A control labeled as retry SHALL
   cause a fresh production-artifact recovery attempt; calling a browser-cached
   rejected `import()` promise again is not recovery. Acceptance intercepts one
   built module request as 503, restores it to 200, activates retry, and proves
   the surface loads without a stuck failure state. An implementation may use a
   cache-distinct module request or an explicit page-refresh recovery, provided
   it preserves route/share intent and introduces no service worker, package,
   global request layer, or oracle-visible layout change.

## Risks / Trade-offs

- **[Risk] Contract changes land while frontend apply is active** → Start each
  operation only from a strict-valid generated projection and stop on drift;
  never patch generated DTOs in this change.
- **[Risk] Shared App/coordinator/style files overlap another active owner** →
  Delay shared integration until that owner commits and hands off; feature-owned
  files may proceed independently.
- **[Risk] Fast selection changes expose stale analysis** → Sequence and abort
  per resource, tag every result with queryRevision and canonical input, and
  accept only the latest matching response.
- **[Risk] Dense matrix/charts overflow or lose keyboard meaning** → Restrict
  horizontal scroll to the matrix/shared table, label every row/cell/series,
  and browser-check the full DESIGN viewport/theme matrix.
- **[Trade-off] Mirroring an upper-triangle matrix duplicates cells visually**
  → Treat it as presentation-only indexing of unchanged server metrics; do not
  infer best-pair or aggregate values.

## Migration Plan

1. Consume the accepted generated candidates DTOs; implement strict
   adapter/driver, coordinated resource, candidate rail/drawer, tray, limits,
   and 0-person state without touching active overlapping shared files.
2. From accepted `expose-partners`, implement the strict partners
   adapter/resource and 1-person surface without waiting for co-star wire.
3. After exact `expose-co-star` handoff, implement 2–10-person pair/group
   analysis, share restore, and App/shared-file integration.
4. Complete focused/full tests and oracle-responsive browser acceptance; roll
   back by removing new owned files and reverting only this change's shared
   hunks if any gate fails.

## Open Questions

None. Operations remain deferred and no external authorization is required.
