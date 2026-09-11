## Capability Boundary

- **Status:** New local Backend capability; specified but not yet implemented, committed, pushed, released, or deployed.
- **Owner:** Backend owns acquisition, deterministic construction, scheduling, inactive publication, activation, and cleanup; Contracts remains the semantic authority and Operations only supplies the writable Archive mount.
- **Writable paths:** `backend/internal/archivebuild/**`, the exact Backend app/archive integration named by this change, and this change's planning artifacts.
- **Read-only protected inputs:** `PRODUCT.md`, `DESIGN.md`, public API/query/statistics behavior, `contracts/schemas/archive/**`, `contracts/schemas/catalog/**`, accepted goldens, real Archive bytes, unrelated worktrees, remotes, hosts, and production.
- **Deletion complement:** This capability may replace only its own staging directory and, after successful activation, validated non-current `versions/dv1-<64hex>` directories below the configured Archive root; it SHALL NOT delete the active version, an unvalidated path, or unrelated data.
- **Mutable refs:** Local `codex/embed-go-archive-builder` only.
- **Consumes:** Official Bangumi Archive latest metadata/release ZIP, the fixed Bangumi common commit, the governed catalog pair, Archive/catalog contracts and goldens, the current Archive pointer/version, and the existing modernc SQLite driver.
- **Produces:** `versions/<dataVersion>/{bangumi.sqlite,manifest.json}`, an atomically activated current pointer and Store, bounded in-process update state, and deterministic parity evidence.
- **Dependencies:** Parent `411f54b`, `contracts-archive-manifest`, `contracts-archive-goldens`, `contracts-position-catalog`, existing Archive StoreProvider/cache boundaries, and the Backend artifact/runtime changes in this change.
- **Deliverables:** Go acquisition/builder/catalog/manifest/staging code, the simple scheduler and activation path, focused fixture tests, and one later accumulated complete-source acceptance run.
- **Acceptance:** Existing producer/catalog goldens pass through the real Go builder; startup/no-change/failure/swap/cleanup scenarios pass; the API listener is not restarted; no Python updater or systemd timer is required.
- **Non-goals:** ORM adoption, authenticated collection requests, query/API/UI/statistical changes, distributed scheduling, leader election, durable queues, request leases, reference-count frameworks, long-term rollback slots, or unrelated cleanup.
- **Operations deferred:** Real Archive download/build, host writes, live deletion, push, PR, merge, release, deployment, routing, and legacy retirement require separate authorization.
- **Stop/rollback conditions:** Stop before publication on schema/dataVersion/catalog/quality drift, unbounded source loading, unsafe deletion target, overlapping edits, or failed parity; before activation leave the current Store/pointer/version unchanged, and during activation restore the old Store if pointer replacement fails.

## ADDED Requirements

### Requirement: Go acquisition SHALL resolve the exact bounded production inputs

One Backend-owned Go run SHALL resolve the official Archive latest document,
one exact release ZIP, one fixed common commit, and the governed catalog pair.
It SHALL preserve the accepted latest-document field set, canonical
`dump-YYYY-MM-DD.HHMMSSZ.zip` name, official download/API URL bindings,
positive JSON-safe asset ID, content type, canonical timestamps, bounded size,
SHA-256, and approved HTTPS destination/redirect hosts. It SHALL validate the
ZIP as the exact accepted nine-member regular-file inventory and SHALL extract
only the seven contract source basenames used by the builder.

The common input SHALL be the exact
`https://raw.githubusercontent.com/bangumi/common/<commit>/subject_staffs.yml`
bytes for the tracked production commit. The two repository catalog YAML files
SHALL be embedded in or otherwise bound to the accepted Backend artifact,
parsed with fatal UTF-8 and duplicate-key rejection, and canonicalized before
their digest enters identity. Acquisition SHALL stream bounded bytes into one
run-owned staging directory below the configured Archive root; it SHALL not
load the release ZIP or complete JSONLines sources into memory.

Direct mode SHALL ignore ambient HTTP, HTTPS, ALL, and NO proxy variables.
When `BGMSS_HTTPS_PROXY` is present it SHALL retain the accepted credential-free
canonical `http://HOST:PORT` grammar and use that value only as the HTTPS
transport proxy without bypassing destination TLS, host, redirect, size, or
digest checks. The proxy value SHALL not enter logs, status, errors, identity,
or manifest bytes.

#### Scenario: Exact official inputs are acquired
- **WHEN** latest metadata, the release asset, ZIP inventory, fixed common input, and governed catalog inputs all match their accepted identities
- **THEN** the Go builder SHALL expose the seven verified source streams plus exact Archive/common/catalog identities to construction
- **AND** the other two accepted ZIP members SHALL not become SQLite inputs

#### Scenario: Acquisition identity or container is invalid
- **WHEN** an origin, redirect, field, URL binding, timestamp, size, digest, common commit, ZIP member, path, duplicate key, or cancellation gate fails
- **THEN** the run SHALL remove only its own staging data, publish nothing, and leave the current Archive unchanged

#### Scenario: Dedicated proxy is absent or configured
- **WHEN** the dedicated proxy is absent or is one accepted canonical value while generic proxy/bypass variables are present
- **THEN** absent configuration SHALL use direct HTTPS and accepted configuration SHALL use only that proxy while every destination identity and TLS gate remains unchanged

### Requirement: Go construction SHALL stream and account the seven source domains exactly

The builder SHALL create a fresh SQLite v1 from the seven required JSONLines
sources in their contract order. It SHALL strictly decode one bounded JSON
object per physical line, preserve JSON-safe integer and finite-number domains,
and classify every line exactly once as `imported`, identical `duplicate`,
`invalid`, or `unresolved`. It SHALL use bounded reads and SQLite-backed or
otherwise bounded intermediate state; it MUST NOT read a complete source into
memory, update an old database, infer missing facts, or fabricate placeholders.

Subject types SHALL map only `1/2/3/4/6` to
`book/anime/music/game/real`. Subject NSFW, canonical partial dates and
precision, score buckets, vote totals, public/meta tags, people, careers,
characters, directed positive JSON-safe relation codes, and exact staff credits
SHALL retain the accepted producer semantics. Empty nullable subject name/date
values SHALL become SQL null, and the current bounded infobox Chinese-name
fallback SHALL remain unchanged.

A syntactically valid relationship with a missing required Archive identity
SHALL count once as `invalid`, create no dangling row, and SHALL not fail the
otherwise valid build. A staff credit whose position is absent from common
SHALL remain raw, non-selectable, and `unresolved`. Malformed records, unknown
fields, wrong raw domains, and conflicting duplicates SHALL record the first
stable fatal outcome and prevent final publication; byte-identical duplicates
SHALL not insert a second row.

#### Scenario: Accepted seven-source golden is built
- **WHEN** the real Go builder consumes any valid indexed producer case
- **THEN** dataVersion, exclusive source accounting, all 20 table counts, four quality counts, eight logical-row digests, and candidate permission SHALL match the golden exactly

#### Scenario: Missing relationship identity is encountered
- **WHEN** one syntactically valid relationship refers to an absent subject, person, character, or exact subject-character pairing
- **THEN** that line SHALL be counted once as `invalid`, excluded from SQLite/logical rows, and the otherwise valid candidate SHALL remain publishable

#### Scenario: Fatal source evidence is encountered
- **WHEN** a source is missing/extra, its size/digest differs, or a physical line is malformed, unknown-field, wrong-domain, or a conflicting duplicate
- **THEN** the Go builder SHALL return the indexed first stable failure and SHALL not publish a candidate

### Requirement: Go catalog, cast, and quality derivation SHALL preserve accepted semantics

The builder SHALL compile every valid common position/category dynamically for
all five subject types and SHALL produce the accepted exact staff positions,
capabilities, selection rules, category groups, featured shortcuts, anime/game
cast shortcuts, fallback groups, and dormant staff-set projection from the
governed catalog configuration. Multi-parent display references SHALL not
duplicate canonical position entities. The active empty staff-set configuration
SHALL produce no staff-set rows.

The global `valid_cv` set SHALL contain each person with any valid
`subject-persons` relationship, independent of common-position resolution. An
anime/game cast row SHALL exist only when `subject-characters` and
`person-characters` share the exact `(subjectId, characterId)`, all referenced
entities exist, and the person belongs to that global set. The row SHALL retain
raw role `1..6`, source order, `eligible=1`, and `provenance=exact`; main SHALL
mean role `1` and all SHALL mean roles `1..6`. Relations, series, another work,
or same-character inference SHALL not create cast.

`NO_CHARACTERS`, `NO_CAST_RELATIONS`, `FILTERED_BY_VALID_CV`, and
`UNKNOWN_STAFF_POSITION` SHALL match the accepted definitions and bounded
quality evidence. A closure violation, unmapped role, invalid group reference,
or quality mismatch SHALL block the candidate rather than partially compile it.

#### Scenario: Governed catalog and cast golden is built
- **WHEN** the complete derivation fixture crosses the real Go builder
- **THEN** every catalog/group/rule row, roles `1..6`, exact cast edge, filtered edge, unknown raw position, and quality sample SHALL match the accepted catalog evidence

#### Scenario: Inference would be required
- **WHEN** a person-character relationship exists only on another related or series work, or the person is outside the global whitelist
- **THEN** the target subject SHALL receive no cast row and the relevant quality classification SHALL remain visible

### Requirement: Go identity and manifest finalization SHALL remain contract-equivalent

The builder SHALL use the authoritative SQLite DDL, supported compatibility
tuple, `bgmss-archive-data-version-v1`, and the existing acyclic canonical
preimage. `dataVersion` SHALL depend only on Archive release/digest, common
commit/digest, manifest and SQLite schema versions, schema SQL digest,
`domain-raw-v1`, `cast-exact-v1`, and canonical catalog-config digest.
Generated time, paths, physical SQLite bytes, pointer state, and run timing
SHALL not enter dataVersion.

The manifest SHALL preserve its strict field set, exact source accounting,
table/quality counts, canonical UTC generated-time and Unicode-scalar URL
semantics, SQLite filename/size/digest, and canonical UTF-8/LF JSON bytes. The
Go finalizer SHALL execute the existing indexed dataVersion and manifest-string
vectors through its real runtime boundary. Callers SHALL not override the
supported domain/cast rule pair.

Construction SHALL perform only the necessary build-time database checks once:
transaction/constraint success, foreign-key closure, required schema identity,
the accepted table/quality invariants, and one SQLite integrity/read check.
It SHALL not invoke a standalone smoke executable, repeat whole-file digests,
rerun a whole Contracts-tree audit, or perform a second reopen/full-database
admission before publication.

#### Scenario: Identical semantic inputs are rebuilt
- **WHEN** the same Archive/common/schema/rules/catalog bytes are built in a different staging directory or at another generated time
- **THEN** dataVersion, accounting, table/quality evidence, and logical-row digests SHALL be identical

#### Scenario: Manifest strings cross the Go finalizer
- **WHEN** every indexed valid/invalid timestamp, Unicode-scalar, surrogate, and malformed-UTF-8 recipe is presented to the real Go finalizer
- **THEN** each outcome and canonical valid bytes SHALL match `contracts-archive-manifest` without a Python runtime finalizer

### Requirement: Candidate publication SHALL have one staging commit point

All acquisition, construction, manifest, and candidate-open work SHALL remain
inside one run-owned staging directory on the same filesystem as `versions/`.
The closed candidate SHALL contain exactly `bangumi.sqlite` and
`manifest.json`. If the same validated dataVersion is already current or
present, the run SHALL return no-change without rebuilding or overwriting it.
Otherwise one atomic no-replace directory rename SHALL be the only inactive
publication commit point.

No fallible build gate SHALL run after that rename. A collision SHALL not be
overwritten or merged, and failure/cancellation before publication SHALL remove
only the owned staging directory. This capability SHALL not retain a permanent
previous-version slot or expose standalone data rollback.

#### Scenario: Candidate is published
- **WHEN** every build gate passes, the final version path is absent, and same-filesystem rename succeeds
- **THEN** exactly one inactive `versions/<dataVersion>/{bangumi.sqlite,manifest.json}` directory SHALL appear atomically

#### Scenario: Existing version or collision is observed
- **WHEN** the exact dataVersion is already current/present or a non-identical target collides with publication
- **THEN** an accepted existing version SHALL produce no-change and a collision SHALL fail without overwriting either target or current data

### Requirement: Backend scheduling SHALL be simple, in-process, and catch up after downtime

The API process SHALL start one background scheduler after normal startup. It
SHALL perform one asynchronous freshness check on every process start and then
run at Sunday 04:15 in a fixed UTC+8 location using the Go standard time
package. One scheduler goroutine SHALL serialize runs; each run SHALL use one
six-hour context derived from process lifetime, and shutdown SHALL cancel the
active run and stop the timer.

Schedule state SHALL not be persisted. The startup check and deterministic
latest/dataVersion comparison SHALL catch up after downtime. The implementation
SHALL not add systemd/cron integration, a scheduler dependency, a second lock,
a task queue, a durable retry system, leader election, or multi-instance
coordination.

#### Scenario: Service starts after missing a weekly run
- **WHEN** the API starts and official/latest semantic identity differs from current
- **THEN** the asynchronous startup check SHALL begin one bounded build while the API continues serving the current Archive

#### Scenario: Scheduled run overlaps no other run
- **WHEN** Sunday 04:15 arrives while the sole scheduler run is idle
- **THEN** exactly one update attempt SHALL run and the next timer SHALL be calculated after it terminates

#### Scenario: Process stops during construction
- **WHEN** shutdown or the six-hour deadline cancels an update
- **THEN** owned staging SHALL be removed, current data/readiness SHALL remain unchanged, and no persisted scheduler recovery state SHALL be required

### Requirement: Activation SHALL briefly drain ordinary work and replace the Store without restart

Download, construction, and candidate direct-open SHALL occur while ordinary
requests continue using the current Store. The candidate SHALL be opened
contained, immutable/read-only/query-only and SHALL pass one lightweight
identity/read query before activation. Activation alone SHALL enter the
app-owned maintenance write gate, wait for ordinary HTTP handlers plus the
existing bounded executor's queued/running work to drain, and briefly block new
ordinary work. No request-lease, reference-count, or generalized reload
framework SHALL be introduced.

Inside the gate the Backend SHALL atomically replace Archive State with the
already-open candidate, atomically replace `current.json`, update readiness and
dataVersion, and restore the old Store if pointer replacement fails. It SHALL
not restart the listener/process. After successful activation it SHALL close
the old Store, release the gate, and delete every validated non-current version
directory so that only current remains. Cleanup failure SHALL keep the healthy
new Store active and be retried by the next run; it SHALL never delete current
or roll back a healthy activation.

#### Scenario: Overnight replacement succeeds
- **WHEN** a candidate is open and ready and ordinary/executor work has drained
- **THEN** State, pointer, readiness, and new-request Store selection SHALL move to the candidate without listener restart
- **AND** the old Store SHALL close before validated non-current versions are removed

#### Scenario: Build or candidate open fails
- **WHEN** acquisition, construction, manifest finalization, or candidate direct-open fails before the maintenance gate
- **THEN** current Store, pointer, readiness, and current version bytes SHALL remain unchanged while the failure is reported through Backend observability

#### Scenario: Pointer activation fails after Store exchange
- **WHEN** replacing `current.json` fails inside the maintenance gate
- **THEN** Archive State SHALL be restored to the still-open old Store, the candidate SHALL not become current, and old data SHALL not be deleted

### Requirement: Runtime and dependency scope SHALL remain minimal

The production capability SHALL run entirely in the single Go Backend image.
Standard packages SHALL own HTTP, ZIP, SHA-256, JSON, files, timing, and
synchronization; the existing `modernc.org/sqlite` driver SHALL own SQLite; and
the already locked `go.yaml.in/yaml/v3` module MAY become a direct Backend
dependency solely for governed YAML parsing and duplicate-key inspection.

The image SHALL not contain or invoke the Python updater, its package/CLI,
`archive-smoke`, an ORM, a JSON Schema runtime, a scheduler library, or a second
producer service. Fixture-driven focused tests SHALL run during development;
one complete current Archive build and Backend-read query SHALL run only in the
accumulated acceptance batch, not after every small edit.

#### Scenario: Single Backend artifact is accepted
- **WHEN** focused Go parity, scheduling, activation, and cleanup tests pass and the accumulated complete-source gate is invoked
- **THEN** one Backend image SHALL provide the production builder without Python updater or systemd dependencies
- **AND** no query, API, frontend, collection-authentication, or statistical behavior change SHALL be claimed
