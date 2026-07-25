## Context

`contracts/goldens/archive/valid/minimal/bangumi.sqlite` is a bounded synthetic
Archive with three anime positions, the common `production` category, and a
compact featured group. Its catalog rows currently predate the exited
`updater-position-catalog` algorithms: legacy selection rules, cast-to-cast
membership, old cast labels/names/order, capability subsets, an unnamespaced
featured key with 10-based member order, and no Bangumi group for the stored
common category.

The governed row algorithms instead use canonical rules; empty member lists
for ordinary staff/cast positions; `声优（仅主役）`/`声优` with null
non-Chinese cast names and 10-step order; all five fixed capabilities for
these selectable staff/cast positions; `shortcut:anime:featured`; zero-based
group-member order; and `bangumi:anime:production`. Backend catalog validation
intentionally requires the structural invariants. Archive loading cannot
detect the semantic mismatch because the Archive tables close field shape and
bounds rather than cross-table governed catalog meaning.

## Change Boundary

| Boundary | Declaration |
|---|---|
| Status | Reviewed design; implementation and verification pending. |
| Owner | One implementation agent, followed by main-agent acceptance. |
| Writable paths | Exact generator/canonical-corpus/test paths plus only the two verifier seal literals, two stale expected outcomes and the co-star participant literals `1/2` → `100/101` in `backend/internal/app/run_test.go`, deletion of the seven obsolete base-normalization SQL statements in `backend/internal/query/archive_loader_test.go`, and one Backend test-inventory line declared in the proposal; no Backend production file. |
| Read-only protected inputs | Archive/API schemas and verifier logic outside the two seals, producer corpus, Updater compiler, Backend production code, every other `run_test.go` request/expectation/assertion, all producer-test-only query fixture extensions/resealing logic, checker logic outside the one inventory line, frontend, guides, siblings, external state. |
| Deletion complement | None; generated canonical path set must remain exactly the preflight index set. |
| Mutable refs | None. |
| Consumes | Canonical rule semantics from `updater-position-catalog` and current Archive/catalog loaders. |
| Produces | One self-consistent canonical corpus and an unchanged-fixture cross-boundary test. |
| Dependencies | Existing repository toolchains only. |
| Deliverables | Generator correction, regenerated seals, integration test, command evidence. |
| Acceptance | Deterministic regeneration, closed inventory, cross-language verifiers, Go tests/race/full check, strict OpenSpec, runtime smoke. |
| Non-goals | Legacy normalization, schema/public behavior changes, unrelated fixture refresh, operations. |
| Operations deferred | All release/deploy/activation/production-data work. |
| Stop/rollback conditions | Stop on protected edits, nondeterminism, inventory growth, compatibility broadening, overlap, or external mutation; restore only owner-created unstaged bytes through the generator/preimages. |

## Decisions

### 1. Apply governed row algorithms to the bounded fixture

The governed Updater is the Archive producer authority for catalog rows.
Backend already validates its canonical rule identity/value form and its unit
tests reject alternatives. The fixture generator will apply the same
position, member, group, group-member, capability, and selection-rule
algorithms to the fixture's already declared three positions, one common
category, and compact featured membership.

This is bounded row parity, not a request to run the full production
`CatalogConfiguration`: the tiny fixture intentionally lacks the complete
five-type common source, full featured references, and cast anchor required by
that configuration. No game/full-production entities are invented. The
existing synthetic semantic inputs remain authoritative; only their stale row
realization is corrected. `backend/internal/catalog/store.go` remains
byte-identical.

### 2. Regenerate all and only the closed canonical corpus

Changing SQLite bytes changes the SQLite digest, dataVersion, manifest digest,
pointer, derived negative bundles/vectors, and root index. The existing
generator must rebuild every affected canonical byte instead of hand-patching
binary or JSON output. The preflight root-index path set is the exact permitted
output inventory; `producer/**` is separate and protected. A second clean
generation must be byte-identical. Only after the final root index and sorted
path/digest table are fixed may their two computed seal literals replace the
old constants in the Archive verifier; no verifier branch, algorithm, input,
or failure behavior changes.

### 3. Add an actual component-boundary regression

The test loads the checked-in `valid/minimal` bundle without SQL mutation,
projects catalog data, and exercises the application catalog route. It asserts
ready 200 and catalog 200 with the Store dataVersion and schema-valid canonical
API rules. This prevents separate Archive/catalog unit fixtures from drifting
again. The new test remains in a disjoint file, and only its exact path is
added to the Backend checker's closed source inventory; no checker logic is
changed. The existing application route test's two obsolete
`CAPABILITY_NOT_AVAILABLE` expectations become `503 NOT_READY`: canonical
fixture rows now truthfully advertise partners/co-star capability, while the
deliberately minimal Archive still has no analytics rows. The co-star request's
obsolete nonexistent participant IDs `1/2` become the fixture's existing
`100/101`, so entity validation cannot mask the intended dependency boundary.
No other request or assertion in that already modified test file belongs to
this change.

The query package's producer-catalog fixture helper previously rewrote the same
seven legacy base rows before adding its own staff74/staffset/custom rows.
Those normalization statements are now conflicts or duplicates because the
checked-in base is canonical. They are removed rather than made conditional;
all producer-test-only additions and bundle resealing remain byte-for-byte
owned by that test. This makes the helper express only its actual extension
delta and prevents it from masking future base-fixture drift.

## Dependency Direction

```text
governed Updater rule semantics (read-only)
                 ↓
Contracts canonical Archive fixture
                 ↓
Backend archive.Store → catalog.Project → HTTP route
```

Contracts do not import Backend code; Backend consumes Contracts bytes
read-only. No frontend or external dependency is introduced.

## Non-Goals

- Supporting historical or fixture-only catalog rule dialects.
- Changing Archive SQL schema, OpenAPI, generated wire, Updater production
  code, Backend production code, or public response semantics.
- Deployment, release, activation, or production Archive generation.
