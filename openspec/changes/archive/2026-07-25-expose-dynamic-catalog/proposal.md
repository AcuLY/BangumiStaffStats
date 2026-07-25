## Why

The immutable Archive and HTTP substrate are accepted, but no production
contract or Go route exposes the snapshot's dynamic catalog to clients. The
catalog/cast derivation must exit first so this change can define one strict
wire and a read-only Go projection without static position enums, private
mapping, or partial responses.

## What Changes

- Add a Contracts-owned OpenAPI `GET /api/v1/catalog` operation and a closed
  API-golden corpus covering the exact success envelope, dynamic positions,
  groups, selection rules, filter/sort capabilities, dormant staff sets,
  unknown rows, transport failures, and deterministic ordering.
- Add a Backend-owned read-only catalog projection over the accepted
  `archive.Store`, plus the exact HTTP route, generated wire binding,
  cancellation/error mapping, bounded observability, and runtime composition.
- Return the active snapshot `dataVersion` with all five subject types,
  canonical positions, display groups, selection rules, and capability
  matrices. The endpoint accepts no body, query, fragment, client
  `dataVersion`, or user identity and never performs statistics.
- Reject or fail closed on unknown/invalid catalog domain rows and never
  synthesize a position, shorten a group, infer capability from a key, or
  expose unresolved raw credits. An empty active staff-set configuration is
  valid, while synthetic staff-set goldens prove the wire is extensible
  without a handler enum change.
- Modify the accepted HTTP-runtime scope and observability inventories only
  enough to admit this one exact read-only business route.

Behavior classification:

- `NEW_CAPABILITY`: the strict catalog API, Contracts goldens, Go read model,
  and production route are required by PRODUCT and the backend development
  guide and did not exist in oracle commit
  `644b7748674e553f863d0ffd61d029f86fdc0717`.
- `PRESERVE_ORACLE`: none; this change implements no rendered interface.
- `INTENTIONAL_DELTA`: none beyond the already approved dynamic-catalog
  semantics produced by `derive-position-catalog-and-cast`.

## Capabilities

### New Capabilities

- `contracts-catalog-api`: Strict OpenAPI wire and closed cross-language API
  goldens for `GET /api/v1/catalog`.
- `backend-dynamic-catalog`: Read-only Archive projection, validation, and
  exact HTTP delivery of the dynamic catalog.

### Modified Capabilities

- `backend-http-runtime`: Admit the exact catalog route to the accepted
  standard-library HTTP runtime while preserving every existing lifecycle,
  request-ID, timeout, health, image, and error rule.
- `backend-observability`: Add `catalog` to the closed route/operation and
  terminal-event inventories without adding sensitive or high-cardinality
  data.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/authority/path review and strict OpenSpec gates passed; committed/pushed/released/deployed: no |
| Owner | Contracts owner applies `contracts-catalog-api` first and stops for main-agent acceptance. Only then may one Backend owner apply `backend-dynamic-catalog` and the two approved runtime deltas. Main agent reviews and accepts both blocks. |
| Writable paths | Planning: `openspec/changes/expose-dynamic-catalog/**`. Contracts block: exactly `contracts/openapi/openapi.yaml`, `contracts/goldens/api/catalog/**`, and Contracts task markers in this change. Backend block: exactly `backend/internal/catalog/catalog.go`, `backend/internal/catalog/catalog_test.go`, `backend/internal/catalog/store.go`, `backend/internal/catalog/store_test.go`, `backend/internal/httpapi/catalog_handler.go`, `backend/internal/httpapi/catalog_handler_test.go`, `backend/internal/httpapi/handler.go`, `backend/internal/httpapi/handler_test.go`, `backend/internal/httpapi/middleware.go`, `backend/internal/httpapi/middleware_test.go`, `backend/internal/httpapi/wire/catalog.gen.go`, `backend/internal/httpapi/wire/catalog_contract_test.go`, `backend/internal/observability/events.go`, `backend/internal/observability/events_test.go`, `backend/internal/observability/metrics.go`, `backend/internal/observability/metrics_test.go`, `backend/internal/app/run.go`, `backend/internal/app/run_test.go`, `backend/internal/architecture/dependencies_test.go`, `backend/scripts/generate-catalog-wire.sh`, `backend/scripts/prepare-catalog-wire.mjs`, `backend/scripts/prepare-query-wire.mjs`, `backend/scripts/check.sh`, `backend/README.md`, and Backend task markers in this change. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, `tmp-formal-development/**`, `openspec/specs/**`, all other changes and task markers, `contracts/schemas/**`, all Contracts files outside the exact Contracts set, accepted Archive/query goldens, all updater/frontend files, all backend files outside the exact Backend set including `backend/internal/archive/**`, `backend/go.mod`, and `backend/go.sum`, Git refs/remotes, external repositories/services/hosts, and production. |
| Deletion complement | None. No existing contract, golden, source, test, route, metric, event, generated declaration, or accepted behavior may be deleted, renamed, or weakened. |
| Mutable refs | None during apply. Owners shall not stage, commit, sync/archive, switch/amend refs, push, tag, release, deploy, or activate production. |
| Consumes | The exited `derive-position-catalog-and-cast` output and root capabilities; the exited `implement-backend-archive-consumer` read-only `archive.Store`/identity contract; the exited `implement-backend-http-and-observability` HTTP, error, request-ID, cancellation, health, event, and metric contracts; accepted shared query/error wire; PRODUCT/DESIGN and the backend/master guides. |
| Produces | Contracts: one authoritative OpenAPI catalog operation and closed API goldens. Backend: one immutable catalog DTO projection and exact `GET /api/v1/catalog` route using only the published read-only Store, plus generated binding and bounded runtime evidence. |
| Dependencies | The direct dependencies are exactly `derive-position-catalog-and-cast`, `implement-backend-archive-consumer`, and `implement-backend-http-and-observability`. Apply is blocked until all three are main-agent accepted, synchronized, archived, and absent from active changes. Contracts completes and is main-agent accepted before Backend starts. |
| Deliverables | Proposal/design/tasks/delta specs; strict OpenAPI operation/components; catalog success/error goldens and verifier evidence; generated Go wire; catalog model/store projection; exact handler/runtime integration; unit/contract/fuzz/race/architecture tests; scoped documentation. |
| Acceptance | Strict OpenAPI and closed-golden validation; exact five-type/order/group/reference/selection/capability/dormant-staff-set wire; unknown/corrupt row and not-ready/cancel/method/query/body failure cases; no static position enum or raw-credit leak; deterministic Store projection; `Cache-Control: no-cache`; request ID/dataVersion/envelope correctness; terminal event exactly once; bounded metrics; generation `--check`; Go unit/full/race/vet/build/architecture gates; strict change/all OpenSpec validation, doctor, diff/inventory/residue checks. |
| Non-goals | Rankings, candidates, person detail, partners, co-star, query normalization/statistics/cache, collection access, frontend selector/UI/state, images, Archive/updater changes, active staff-set policy, admin/catalog mutation, client version handshake, user input, sharing, operations, release, or deployment. |
| Operations deferred | Production roots/credentials, pointer activation/reload/rollback, schedule/lock, retention, restart orchestration, nginx/systemd/Compose, monitoring/alerting, release, deployment, migration, and cutover. |
| Stop/rollback conditions | Stop before mutation if any dependency has not exited, Contracts handoff differs, the index is nonempty, owner paths overlap, or implementation needs a protected path/schema/dependency. Stop before response publication on any unknown/invalid/contradictory catalog row, dangling reference, identity mismatch, context failure, or contract/generation drift. Remove only new owned disposable output; preserve all accepted files, snapshots, refs, and external state. |

The change neither reads nor mutates another repository or external service.
Apply remains blocked until proposal, specs, design, and tasks pass strict
validation and explicit main-agent review, and until the three exact
dependencies have exited.
