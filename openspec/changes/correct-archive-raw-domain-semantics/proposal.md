## Why

The draft Archive v1 currently rewrites raw cast and relation integers into
incomplete text enums: cast roles `2` and `4` become values rejected by
`schema.sql`, roles `5` and `6` are unsupported, relation codes `2` and `3`
are reversed, and the producer adapter accepts only subject types `2` and `4`.
Because no formal Archive v1 has been produced or published, this is the last
safe point to correct the shared contract before the full producer is accepted.

## What Changes

- **BREAKING (draft v1 only)** Change `cast_credit.role_type` to preserve the
  upstream integer `1..6` exactly, and change
  `subject_relation.relation_type` to preserve every positive upstream integer
  code exactly. No text normalization or direction-dependent rewrite remains
  in stored raw facts.
- Require the Archive adapter and contract evidence to cover the complete
  subject-type mapping `1=book`, `2=anime`, `3=music`, `4=game`, `6=real`.
- Regenerate the corrected draft-v1 schema/object seals and every derived
  identity in dependency order: schema digest, dataVersion, SQLite bytes,
  manifest, inert pointer, and the unchanged-path-set canonical golden index.
- Update the accepted Go consumer's schema seal and contract tests so it
  accepts only the corrected draft-v1 corpus.
- Preserve all product behavior (`PRESERVE_ORACLE`, oracle
  `644b7748674e553f863d0ffd61d029f86fdc0717`). The raw numeric correction is an
  `INTENTIONAL_DELTA` governed by `DR-DATA-CAST-002`,
  `DR-DATA-SERIES-002`, and the active data/backend guides.
- Keep the current `produce-immutable-archive` candidate out of correction
  apply. A separate recovery owner first isolates it in a verified named Git
  stash, the correction owner applies and commits this change, then the
  recovery owner reapplies (without immediately dropping) the stash and the
  producer owner rebuilds the overlapping producer evidence against the new
  authority.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `contracts-archive-manifest`: Correct draft SQLite v1 raw cast/relation
  storage, complete five-type adaptation, derived identities, and canonical
  evidence.
- `backend-archive-consumer`: Bind the read-only consumer to the corrected
  schema seal and execute the corrected canonical corpus.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated: P1 authority conflict confirmed; specified: draft pending strict validation and main review; implemented/verified/committed/pushed/released/deployed: no |
| Owner | Main agent owns approval and recoverable producer isolation/recovery; one correction owner applies Contracts plus bounded Go consumer adaptation; the producer owner later rebuilds its candidate. |
| Writable paths | Planning: only `openspec/changes/correct-archive-raw-domain-semantics/**`. Apply after isolation: `contracts/schemas/archive/schema.sql`, `contracts/schemas/archive/compatibility-matrix.json`, `contracts/schemas/archive/README.md`, `contracts/schemas/archive/tooling/build_sqlite_fixtures.py`, `contracts/schemas/archive/tooling/verify.mjs`, `contracts/goldens/archive/index.json`, exactly the current 32 paths enumerated by that index with no path-set change, `backend/internal/archive/contract.go`, `backend/internal/archive/golden_test.go`, `backend/internal/archive/contracttest/archive_contract_test.go`, and this change's task markers. Final sync/archive may update only `openspec/specs/contracts-archive-manifest/spec.md`, `openspec/specs/backend-archive-consumer/spec.md`, and `openspec/changes/archive/2026-07-25-correct-archive-raw-domain-semantics/**`. |
| Read-only protected inputs | The isolated `produce-immutable-archive` candidate and its active change, `derive-position-catalog-and-cast`, all updater source, all backend paths outside the three exact files, all contracts outside the exact writable set, PRODUCT/DESIGN/guides/decisions, other changes/specs, external data/repositories/hosts/services, and production. |
| Deletion complement | Only the exact active change directory may disappear as the OpenSpec archive move to the declared dated path. The canonical 32-path set remains fixed and no product path is deleted. |
| Mutable refs | During later apply only: a named recoverable `refs/stash` entry created/applied/dropped by the recovery owner, and `refs/heads/codex/formal-rewrite` through one accepted local correction commit. No other ref. |
| Consumes | Accepted root Archive/consumer capabilities and canonical corpus; `DR-DATA-CAST-002`; `DR-DATA-SERIES-002`; the data/backend guides; read-only local dump evidence for roles `1..6`, relation codes, and subject types `1/2/3/4/6`. |
| Produces | One corrected but still unpublished Archive v1 authority, regenerated canonical identities/goldens, and matching Go consumer evidence. |
| Dependencies | Apply requires strict-valid artifacts, zero-P0/P1 main review, proof that no formal/public/activated/released/deployed v1 exists, all other owners quiescent on writable paths, and verified recoverable isolation of the producer candidate. |
| Deliverables | Two delta specs; corrected DDL/matrix/tooling/canonical corpus; bounded consumer seal/tests; exact before/after identity inventory; one local correction commit; producer recovery handoff. |
| Acceptance | Raw cast `1..6` round-trips as integers; every accepted positive relation code round-trips without text/direction mapping; all five subject types map exactly; schema/object seals and all derived identities agree; the canonical path set stays fixed; deterministic regeneration, shared verifier, Go targeted/full/race/vet/build, strict OpenSpec, diff/inventory/residue, and post-recovery stash/candidate checks pass. |
| Non-goals | Catalog/query semantics beyond existing accepted predicates, inferred cast, series traversal implementation, producer implementation/reacceptance, collection/API/frontend work, Archive activation, compatibility with the discarded draft bytes, or a second v1 tuple. |
| Operations deferred | Acquisition, scheduling, activation/current pointer mutation, retention/rollback operations, restart, deployment, release, and production remain later explicit work. |
| Stop/rollback conditions | Stop before mutation if a formal v1 exists, the producer snapshot cannot be proven/restored, the index path set changes, another owner overlaps, or authority requires a different semantic choice. Preserve the named stash and prior commit; do not reset-hard, checkout-rollback, clean, push, release, deploy, or activate. |

This change touches no other repository or external state. Apply is blocked
until proposal, specs, design, and tasks are strict-valid and main-agent
reviewed. Push, PR, tag, release, deployment, host mutation, and production
activation require separate later authorization.
