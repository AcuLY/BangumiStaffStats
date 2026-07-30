## Context

The accepted foundation is a single Vue/Pinia/Naive UI SPA with one native
fetch client and strict generated query-wire adapter. The dynamic catalog is
the only business endpoint available at this DAG point; ranking and co-star
response contracts intentionally arrive in later verticals. This change must
therefore complete the shared query shell and state machine without inventing
a result wire or shipping a fixture.

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main product/design/dependency/path review and strict validation passed; committed/pushed/released/deployed: no |
| Owner | One Frontend apply owner; main agent reviews and accepts. |
| Writable paths | Exactly the planning and Frontend apply sets in `proposal.md`. |
| Read-only protected inputs | Exactly the authorities, contracts, other work, undeclared files, refs/remotes, external state, and production in `proposal.md`. |
| Deletion complement | None. |
| Mutable refs | None. |
| Consumes | Accepted frontend foundation/query wire and exited catalog API. |
| Produces | Production query shell, strict catalog consumer, shared state, typed operation coordinator, tests/docs. |
| Dependencies | Exactly `bootstrap-frontend-foundation`, `expose-dynamic-catalog`, and `define-shared-query-wire`; all exit before apply. |
| Deliverables | Files and evidence listed in `proposal.md`. |
| Acceptance | State/adapter/frontend/browser/OpenSpec/diff gates listed in `proposal.md`. |
| Non-goals | Result UI/DTOs, formulas, series, candidate/identity/detail/partners/co-star implementations, other owners, or shipped fixture data. |
| Operations deferred | Production configuration, release, deploy, migration, monitoring, cutover. |
| Stop/rollback conditions | Stop on unmet dependency, authority/path drift, need for a wire/dependency, fixture leakage, or failed gate; remove only owned output. |

Dependency direction is:

`app shell -> query/catalog feature -> API mapper -> existing API client`
`-> generated Contracts types`.

Shared code imports no feature; API imports no app/feature; components never
import generated wire types or call fetch.

## Goals / Non-Goals

**Goals:**

- Preserve the approved Query Workspace outward behavior.
- Establish the only Draft/Applied/PositionKeys/revision owner.
- Prove latest-only, cancellation, no-op, and collection-refresh transitions.
- Consume the real dynamic catalog and keep production fixture-free.

**Non-Goals:**

- Define or consume ranking/candidate result DTOs before their Contracts
  changes, or render any later result vertical.
- Copy prototype stores/components or compute backend-authoritative values.
- Add a router, request, state, form, or validation library.

## Decisions

### Keep model, state, orchestration, and rendering separate

`features/query/model` owns form types, summaries, defaults, normalization,
structured validation, and semantic signatures. `QueryStore` owns only Draft,
Applied Query, PositionKeys, revision, dirty state, and field errors.
Operation-scoped view/resource slots live beside the application service, not
inside QueryStore. `executeQuery(operation)` owns snapshot, final validation,
abort/sequence, and atomic commit.

This avoids the prototype's global-store coupling and prevents a later
ranking/co-star feature from creating another query owner. A single larger
store was rejected because it would mix editable input, network lifecycle,
and result ownership.

### Use a typed operation port until result contracts exit

The coordinator accepts discriminated rankings/candidates drivers and passes
validated query, input/view, signal, sequence, and refresh intent. It preserves
typed payloads without interpreting them; later frontend verticals install the
real API adapters and resource mappers. Dev/test may inject deterministic
drivers. The production composition has no fallback data and fails closed as
capability unavailable until a real adapter is installed.

Calling undocumented endpoints, accepting `unknown` response maps, or shipping
an oracle fixture was rejected because each would create a competing wire or a
false production success.

### Generate and strictly map the catalog

The existing pinned generator produces catalog-only types from the exited
OpenAPI operation. `api/adapters/catalog.ts` is the sole generated catalog
import and maps a strict success envelope to immutable frontend entities.
`CatalogStore` owns `idle|pending|ready|error`, diagnostics, positions, groups,
and capabilities. Selector loading/error remains local and retryable.

Static positions, prefix parsing, and importing generated DTOs into components
were rejected because the catalog is dynamic and explicit.

### Centralize route/share application without a new router

The two static modes use a small History API owner in `app/routes.ts`.
Redirect, `?user=` Draft prefill, URL updates, popstate, and one-time share
consumption are handled there; replay invokes the ordinary application
service. Vue Router was rejected because two fixed paths do not justify a new
dependency or second state source.

The Header share action serializes only the current mode's last successful
Applied Query and accepted operation input/view into the existing versioned
fragment wire. It remains in a stable slot beside the mode switch, is disabled
without an Applied Query, ignores dirty Draft/pending attempts, copies through
the Clipboard API with the DESIGN success announcement, and exposes the same
read-only link in a lightweight fallback popover when copying is unavailable.
Successful personal application replaces `?user=` with the effective UID;
successful global application removes it. Neither URL update is a second
application trigger.

`app/theme.ts` is the only theme owner. It accepts only `light|dark`, reads and
writes only versioned key `bgmss-theme-v1`, never enters query URL/share state,
and drives `AppProviders` through Naive's public theme/override API plus one
document-level theme marker. Invalid or unavailable storage falls back safely
to Light. A second theme store, prototype `workbench` key, query-parameter
theme override, or private component-library selector was rejected.

### Rebuild the oracle surface from DESIGN, not prototype structure

`QueryWorkspace` coordinates disclosure and desktop/mobile containers;
summary, form, scope fields, advanced options, position selector, and actions
are leaf components with props/events. Local composables own focus/overlay
geometry only. Oracle comparison uses the documented viewport/state matrix
and immutable commit as visual evidence; the dynamic catalog, strict union,
structured errors, and fixture-free runtime are intentional deltas.

## Risks / Trade-offs

- [A later result contract needs a different port payload] → keep the port at
  validated query/input/view/metadata boundaries and stop for spec amendment
  rather than add loose JSON.
- [Catalog readiness blocks editing] → localize pending/error to the selector
  and preserve the rest of Draft.
- [Abort is ignored by a transport] → sequence and request identity remain the
  final commit gate.
- [Refresh failure makes old data look fresh] → remove it from visible ready
  during pending and restore it only with explicit failure feedback.
- [Oracle layout drifts during clean-room rebuild] → compare desktop/mobile,
  Light/Dark, open/collapsed/error/loading states and a fresh console.

## Migration Plan

1. Apply only after the three exact dependencies exit and this change is
   strict-valid and main-agent approved.
2. Generate/map catalog, then implement model/stores/service, then route/UI.
3. Run focused state/contract tests, full frontend gates, and browser matrix.
4. Stop with an unstaged candidate for main-agent acceptance. Archive/commit
   is a separate lifecycle action.

Rollback removes only newly owned files and restores only recorded preimages
inside the apply set. It changes no ref, contract, external service, or
production state.

## Open Questions

None. A need for an undocumented result endpoint, response field, or extra
dependency stops apply for a new Contracts/main-agent decision.
