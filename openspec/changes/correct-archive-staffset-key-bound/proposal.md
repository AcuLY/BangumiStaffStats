## Why

The accepted query contract and backend guide allow a staff-set slug of one
character, so `staffset:book:a` and `staffset:real:a` are valid 15-character
PositionKeys. Draft Archive SQLite v1 incorrectly requires
`length(staff_set.set_key) >= 17`, which would reject those legal keys when the
catalog compiler is introduced. No formal/public/activated Archive v1 exists,
so the shared authority must be corrected before the immutable producer exits.

## What Changes

- Change only the lower `staff_set.set_key` DDL length bound from `17` to `15`;
  keep the upper bound `96`, key family, table shape, schema version, manifest
  version, and dataVersion algorithm unchanged.
- Add deterministic SQLite/tooling evidence that exact 15- and 96-character
  keys are admitted and 14- and 97-character keys are rejected.
- Regenerate the fixed 32-file canonical Archive corpus and the separately
  closed 15-case producer corpus because the canonical SQL/object seals and
  derived identities change.
- Rebind the read-only Go consumer to the corrected schema/object seals and
  exercise the corrected bound through real SQLite.

Behavior classification: `INTENTIONAL_DELTA` for an unpublished draft-v1
authority defect. Product behavior and the prototype oracle remain otherwise
preserved.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contracts-archive-manifest`: correct the legal `staff_set.set_key` lower
  bound and regenerate all dependent identities/evidence.
- `backend-archive-consumer`: bind startup validation to the corrected schema
  seal and boundary evidence.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main authority/dependency review plus strict change/all validation and doctor passed |
| Owner | One delegated correction owner applies Contracts and bounded Go consumer changes; main agent reviews, accepts, synchronizes, archives, and commits. |
| Writable paths | Planning: `openspec/changes/correct-archive-staffset-key-bound/**`. Apply: `contracts/schemas/archive/schema.sql`, `compatibility-matrix.json`, `README.md`, `tooling/build_sqlite_fixtures.py`, `tooling/verify.mjs`; `contracts/goldens/archive/index.json` and its exact 32 indexed paths; `contracts/goldens/archive/producer/index.json` and its exact 15 indexed cases; `backend/internal/archive/contract.go`, `golden_test.go`, `contracttest/archive_contract_test.go`, `mutation_test.go`, `state_test.go`; and this change's task markers. Final sync/archive: only the two modified root specs and `openspec/changes/archive/2026-07-25-correct-archive-staffset-key-bound/**`. |
| Read-only protected inputs | Producer schemas, all other Contracts/backend files, active producer Updater code and tests, catalog/query/frontend code, guides/decisions, other changes/tasks, refs/remotes, external repositories/hosts/services, and production. |
| Deletion complement | Only the active change directory may move to its exact dated archive path; no product path or golden path may be deleted. |
| Mutable refs | Main agent may create one accepted local correction commit after review; no other ref mutation. |
| Consumes | Accepted query PositionKey grammar, backend guide staff-set rule, corrected Archive/raw-domain authority, canonical 32-file corpus, accepted 15-case producer corpus, and read-only Go consumer. |
| Produces | Corrected unpublished SQLite v1 bound, regenerated canonical/producer identities, and matching Go consumer binding. |
| Dependencies | `correct-archive-raw-domain-semantics` has exited; producer Contracts are accepted at `bb2c3bf1`; this correction MUST exit before `produce-immutable-archive` runtime acceptance or catalog apply. |
| Deliverables | DDL/tooling/corpus correction, boundary sentinels, Go binding/tests, exact before/after identities, synchronized root specs, archived change, and one local commit. |
| Acceptance | 15/96 accepted and 14/97 rejected through real SQLite; 35-object shape retained; both closed corpora regenerate deterministically; Go targeted/full/race/vet/CGO0 and strict OpenSpec/diff/inventory/residue gates pass. |
| Non-goals | Changing PositionKey grammar, activating staff sets, catalog/query behavior, producer feature implementation, version bump, operations, release, or deployment. |
| Operations deferred | Acquisition, scheduling, activation/current mutation, retention/rollback, restart, monitoring, release, deployment, and production. |
| Stop/rollback conditions | Stop on formal v1 evidence, path-set drift, owner overlap, need for another semantic choice, failed deterministic regeneration, protected-path mutation, or any acceptance failure. Preserve current commits and dirty Updater work; never reset-hard, clean, push, release, deploy, or activate. |

Apply is blocked until these artifacts remain strict-valid and the delegated
owner proves that the active Updater diff is disjoint and protected.
