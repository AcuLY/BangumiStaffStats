## Why

The production data path currently requires a separately built Python updater,
an updater container, host wrapper, and systemd timer even though the service is
single-host, query volume is low, and replacement runs at night. The user wants
one Go backend to schedule, build, and activate the weekly Archive without
Python or systemd and without introducing a large concurrency control plane.

## What Changes

- **BREAKING** Reimplement official Archive acquisition, extraction, catalog
  compilation, SQLite construction, manifest/dataVersion creation, quality
  checks, staging, and publication in Go inside the Backend repository module.
- Add one Backend-owned weekly scheduler: an asynchronous startup check followed
  by Sunday 04:15 UTC+8 runs, serialized by one in-process mutex and bounded by
  one six-hour context deadline.
- Add a short maintenance window around activation only. Building and opening
  the candidate happen while the API serves normally; activation waits for
  ordinary in-flight work to finish, atomically replaces `archive.Store`, then
  closes and deletes the old version.
- **BREAKING** Replace Backend single-assignment Archive state and duplicate
  startup admission with minimal contained immutable/read-only open plus safe
  Store replacement. No ORM, request leases, reference-count framework,
  distributed lock, leader election, persistent work queue, or multi-version
  rollback slot is added.
- **BREAKING** Remove production and artifact dependence on the Python updater
  image, updater Compose service, host update wrapper, update-status file,
  systemd updater service/timer, and standalone data rollback. The API Archive
  mount becomes writable because the same process owns staged construction and
  cleanup.
- Preserve the existing Archive schema, dataVersion algorithm, query/statistics
  behavior, public API, frontend behavior, and anonymous Bangumi collection
  requests.

The Go-embedded weekly refresh is an `INTENTIONAL_DELTA` authorized by this user
request. Public product/UI behavior is `PRESERVE_ORACLE` against immutable
oracle `644b7748674e553f863d0ffd61d029f86fdc0717`.

## Capabilities

### New Capabilities

- `backend-archive-builder`: Go-owned acquisition, deterministic SQLite build,
  embedded weekly scheduling, inactive publication, and live activation.

### Modified Capabilities

- `backend-archive-consumer`: replace single startup publication and full
  admission with minimal direct open and atomic Store replacement.
- `backend-runtime-foundation`: make the API process own one bounded background
  scheduler/builder lifecycle.
- `backend-build-artifact`: package builder inputs and runtime into the single
  Backend image.
- `backend-observability`: emit and expose Go builder/update state directly
  rather than reading Python `update-status.json`.
- `contracts-producer-runtime-inputs`: bind the same closed producer inputs to
  the Backend artifact instead of an Updater artifact.
- `contracts-artifact-compatibility`: remove the separate Updater component and
  bind producer compatibility to the Backend component.
- `contracts-application-release-identity`: remove the Updater image identity
  from the application release and bind builder identity to the Backend image.
- `contracts-archive-manifest`: preserve the manifest/dataVersion contract while
  changing the production producer from Python to Go.
- `contracts-archive-goldens`: make the existing producer goldens the Go
  builder's parity authority.
- `contracts-position-catalog`: preserve catalog/cast/quality outputs while
  moving their producer to Go.
- `contracts-update-status`: retire the cross-process status-file contract in
  favor of in-process Backend observability.
- `operations-single-host-deployment`: run only API and Prometheus, give API the
  Archive write mount, and remove updater/systemd/update-wrapper topology.
- `updater-runtime-foundation`: retire the Python package/CLI runtime.
- `updater-archive-producer`: transfer producer behavior to
  `backend-archive-builder` and retire Python ownership.
- `updater-build-artifact`: retire the separate Updater image and evidence.
- `updater-packaged-producer-inputs`: transfer packaged input consumption to the
  Backend artifact.
- `updater-development-status`: transfer lifecycle reporting to Backend
  observability without a status-file handoff.
- `updater-position-catalog`: preserve catalog/cast/quality semantics in the Go
  builder while retiring Python ownership.

## Impact

- **Status:** local specification and implementation only; not committed,
  pushed, merged, released, or deployed.
- **Owner:** Backend owns acquisition/build/schedule/activation; Contracts owns
  artifact/input handoffs; Operations owns the reduced single-image topology;
  the primary agent owns cross-component reconciliation and acceptance.
- **Writable paths:**
  `openspec/changes/backend-embed-go-archive-builder/**`,
  `backend/cmd/api/**`, `backend/internal/{architecture,archive,archivebuild,app,httpapi,observability}/**`,
  `backend/{build,Dockerfile,README.md,go.mod,go.sum,scripts/check.sh}`,
  exact producer-input/catalog files copied or generated under
  `backend/internal/archivebuild/testdata/**`, `contracts/artifacts/**`,
  `contracts/schemas/{artifacts,update-status}/**`,
  `contracts/goldens/{artifacts,update-status}/**`,
  `updater/**`,
  `operations/{compose.yaml,env.example,README.md,bin,lib,systemd,test}/**`,
  `.github/workflows/{ci.yml,operations-preview.yml}`,
  `AGENTS.md`, `openspec/config.yaml`,
  `tmp-formal-development/{formal-development-master-plan.md,backend-development-implementation-guide.md,backend-operations-implementation-guide.md}`,
  and exact affected root specs during sync/archive.
- **Read-only protected inputs:** `PRODUCT.md`, `DESIGN.md`, frontend product
  code, query/statistics semantics, public API contracts, existing real Archive
  bytes, unrelated dirty worktrees, remotes, hosts, production, and legacy
  services. Python updater source/tests are read-only reference until Go parity
  is accepted; only the final accepted cleanup task may delete them.
- **Deletion complement:** after focused Go parity, only `updater/**`,
  `operations/systemd/bgmss-archive-update.{service,timer}`,
  `operations/bin/{update,rollback-data}`, and exact updater-only artifact
  fixtures/workflow assertions may be deleted. No Archive data or unrelated
  repository path is deleted during development.
- **Mutable refs:** local `codex/embed-go-archive-builder` and its dedicated
  worktree only; no remote refs.
- **Consumes:** official `bangumi/Archive` latest document/release ZIP,
  fixed `bangumi/common` catalog input, existing Archive schema/contracts,
  display/staff-set config, current pointer/version, and modernc SQLite.
- **Produces:** one Go API image that can build and hot-activate Archive
  versions, the unchanged manifest/SQLite contract, reduced Compose/runtime
  definitions, and deterministic tests.
- **Dependencies:** smoke-removal commit `411f54b`; existing Archive contracts,
  query StoreProvider/dataVersion cache boundaries, and Go SQLite driver. The
  already locked YAML module may be promoted to a direct Backend dependency;
  no ORM or scheduler library is introduced.
- **Deliverables:** strict-valid OpenSpec, Go builder/scheduler/activation code,
  synthetic parity fixtures, reduced artifacts/operations definitions, focused
  tests, complete affected gates when accumulated work is ready, and exact
  lifecycle reporting.
- **Acceptance:** Go produces contract-equivalent SQLite/manifest results from
  approved fixtures; startup and scheduled no-change work; a candidate swaps
  without listener restart; an active request completes before old Store close;
  old version cleanup follows successful swap; production definitions contain
  no Python updater image/service or systemd Archive timer.
- **Non-goals:** ORM adoption, changing statistics/query/public API/UI,
  authenticated Bangumi collection requests, distributed/multi-replica
  scheduling, leader election, a job dashboard, durable retry queue, long-term
  two-version rollback, or unrelated cleanup.
- **Operations deferred:** push, PR, merge, tag, release, real Archive download,
  host write, production activation, live version deletion, public routing, and
  legacy retirement require separate explicit authorization.
- **Stop/rollback conditions:** stop on Archive schema/dataVersion/quality/query
  drift, unbounded memory on complete-source streaming, unsafe path deletion,
  overlapping edits, or failed focused parity. Repository rollback is parent
  `411f54b`; development never mutates a real Archive root.

Apply is blocked until proposal, specs, design, and tasks pass strict validation
and main-agent review.
