## Context

`contracts/goldens/archive/valid/minimal/bangumi.sqlite` currently stores
`select:staff:*` plus `positionId=*` and `select:cast:*` plus `roleType=*`;
it also makes `cast:anime:main` a member of the ordinary
`cast:anime:all` position and names its shortcut `featured:anime`. The exited
`updater-position-catalog` compiler instead stores `rule:staff:*` plus the
numeric value, `exclusive:cast:{type}` plus `1|1..6`, no member rows for
ordinary staff/cast positions, and `shortcut:{type}:featured`. Backend catalog
validation intentionally requires these canonical invariants. Archive loading
cannot detect the semantic mismatch because the Archive tables close field
shape and bounds rather than the cross-table governed catalog semantics.

## Change Boundary

| Boundary | Declaration |
|---|---|
| Status | Reviewed design; implementation and verification pending. |
| Owner | One implementation agent, followed by main-agent acceptance. |
| Writable paths | Exact generator/canonical-corpus/test paths declared in the proposal; no Backend production file. |
| Read-only protected inputs | Archive/API schemas and verifiers, producer corpus, Updater compiler, Backend production code, frontend, guides, siblings, external state. |
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

### 1. Correct the complete stale fixture shape, not the strict consumer

The governed Updater is the Archive producer authority for catalog rows.
Backend already validates its canonical rule identity/value form and its unit
tests reject alternatives. The fixture generator will emit the same rule form,
remove the obsolete cast-to-cast `catalog_position_member` row, and use the
canonical shortcut group key. These are one fixture-coherence correction;
ordinary staff/cast positions remain memberless and only staff sets own
position-member rows. `backend/internal/catalog/store.go` remains
byte-identical.

### 2. Regenerate all and only the closed canonical corpus

Changing SQLite bytes changes the SQLite digest, dataVersion, manifest digest,
pointer, derived negative bundles/vectors, and root index. The existing
generator must rebuild every affected canonical byte instead of hand-patching
binary or JSON output. The preflight root-index path set is the exact permitted
output inventory; `producer/**` is separate and protected. A second clean
generation must be byte-identical.

### 3. Add an actual component-boundary regression

The test loads the checked-in `valid/minimal` bundle without SQL mutation,
projects catalog data, and exercises the application catalog route. It asserts
ready 200 and catalog 200 with the Store dataVersion and schema-valid canonical
API rules. This prevents separate Archive/catalog unit fixtures from drifting
again.

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
