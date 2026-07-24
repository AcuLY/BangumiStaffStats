## Why

The Archive contract already promises rejection of invalid timestamps and a
UTC `generatedAt`, but its Node contract path checks only lexical shape while
the Go consumer additionally parses calendar/time semantics. URL bounds also
diverge because JSON Schema applies Unicode string length while the Go
candidate counts UTF-8 bytes, so producer and consumer acceptance is unsafe until one
language-neutral rule and executable evidence close both gaps.

## What Changes

- **BREAKING (pre-production contract correction):** retain manifest schema
  version 1, but define `generatedAt` as the exact UTC form
  `YYYY-MM-DDTHH:mm:ss[.1..6]Z` with a real Gregorian date and valid
  `00..23:00..59:00..59` time; impossible dates/times fail
  `MANIFEST_SCHEMA_INVALID` before accounting or compatibility.
- Define both manifest URL bounds as `12..2048` Unicode scalar values after
  fatal UTF-8 decoding and strict JSON-string decoding, never UTF-8 bytes,
  UTF-16 code units, or unvalidated surrogate units.
  Thus `https://😀` is too short even though it is 12 UTF-8 bytes, while
  `https://` plus 2039 `a` characters plus `😀` is valid at exactly 2048
  scalar values even though it is 2051 bytes. A legal JSON surrogate pair
  decodes to one scalar; an isolated high or low surrogate is invalid.
- Add one indexed, language-neutral manifest-string vector and deterministic
  ephemeral mutations so Node contract verification, a Python probe, and an
  isolated Go probe must report the same stable outcomes. The active Go
  consumer and Python producer may not receive final acceptance until each
  executes that same vector through its runtime contract boundary.
- Add the named schema formats `bgmss-utc-generated-at-v1` and
  `bgmss-unicode-scalar-url-v1`, backed by in-repository custom Ajv validators
  for exact timestamp arithmetic and the Unicode-scalar URL guard. Do not add
  `ajv-formats` or any other dependency.
- Insert this hardening after the completed Archive subject correction and
  before final consumer/producer acceptance; do not implement either runtime,
  activate an Archive, or perform operations in this change.

Behavior classification:

- `PRESERVE_ORACLE`: no product, UI, statistical, or responsive behavior from
  oracle `644b7748674e553f863d0ffd61d029f86fdc0717` changes.
- `INTENTIONAL_DELTA`: draft contract acceptance is corrected to enforce the
  existing root `contracts-archive-manifest` requirements for UTC generated
  time, malformed-field rejection, JSON Schema 2020-12 string length, stable
  first failure, and closed cross-language goldens.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contracts-archive-manifest`: make timestamp semantics and Unicode URL
  bounds exact and cross-language, with one indexed vector and stable
  `MANIFEST_SCHEMA_INVALID` outcomes.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; planning strict validation: passed; main-agent review: passed; implemented/runtime-verified/committed/pushed/released/deployed: no |
| Owner | One Contracts owner applies schema, documentation, tooling, and golden-vector changes; the main agent owns dependency reconciliation, planning review, and final acceptance. |
| Writable paths | Planning: `openspec/changes/harden-archive-manifest-string-semantics/**` only. Proposed apply: `contracts/schemas/archive/archive-manifest.schema.json`, `contracts/schemas/archive/README.md`, `contracts/schemas/archive/tooling/build_sqlite_fixtures.py`, `contracts/schemas/archive/tooling/verify.mjs`, `contracts/goldens/archive/index.json`, new `contracts/goldens/archive/vectors/manifest-string-semantics.json`, `tmp-formal-development/formal-development-master-plan.md`, and this change's task markers only. Disposable verification writes: `contracts/schemas/archive/.cache/**`, `contracts/schemas/archive/.tmp/**`, and `contracts/schemas/archive/tooling/node_modules/**`, all absent at exit. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, implementation guides and decisions, all root specs, archived changes, `correct-archive-subject-semantics/**`, every other active change, every other `contracts/**` path including the existing 31 golden files, all `backend/**`, `updater/**`, and `frontend/**`, Git refs/remotes, external repositories, hosts, and production. |
| Deletion complement | Preserve every accepted baseline path and byte except the declared index update. Remove only canonically contained disposable verification roots at exit; on failed unpublished apply, the new vector candidate may also be removed. No existing golden, schema, runtime, authority, or unrelated file may be deleted. |
| Mutable refs | None during planning or apply; no stage, commit, archive, branch/ref update, or push belongs to the implementation owner. |
| Consumes | The completed and accepted/exited `correct-archive-subject-semantics` result, root `contracts-archive-manifest`, corrected 31-file golden baseline, current schema/tooling, JSON Schema 2020-12 length semantics, and read-only consumer evidence. |
| Produces | One amended Archive manifest string contract, custom no-dependency Ajv timestamp/scalar validators, one indexed shared vector, deterministic Node/Python/Go conformance evidence, and dependency ordering that blocks consumer/producer final acceptance. |
| Dependencies | `define-archive-manifest-contract` and the completed `correct-archive-subject-semantics` correction are accepted/exited before apply. `implement-backend-archive-consumer` and `produce-immutable-archive` remain blocked from final acceptance until this hardening exits and each proves runtime conformance to the indexed vector in its own writable scope. |
| Deliverables | Exact timestamp/calendar/time and Unicode-scalar-length rules; schema/docs/tooling changes; one new vector plus updated closed index; fatal-UTF-8, surrogate, and boundary probes in Node, Python, and isolated Go; master-DAG row/count/edges; no runtime implementation. |
| Acceptance | Preserve the 31 accepted baseline golden paths/bytes, add exactly one indexed vector for 32 indexed paths, prove all timestamp boundaries, scalar counts, UTF-8-byte diagnostics, legal surrogate-pair decoding, isolated high/low-surrogate rejection, and stable outcomes in Node/Python/Go; the raw-byte recipe keeps the JSON string delimiters and replaces one `archiveAssetUrl` payload with exact bytes `C3 28`; reject impossible timestamp and below/above-bound URLs as `MANIFEST_SCHEMA_INVALID`; accept the exact 2048-scalar multibyte URL; pass deterministic builder, pinned verifier, strict targeted/all OpenSpec when unrelated drafts permit, scope/inventory/residue gates. |
| Non-goals | No manifest/SQLite/dataVersion version bump, URL-origin policy redesign, backend/updater implementation, edits to active changes or root specs, new dependency, full Archive acquisition, activation, query/frontend work, or broad cleanup. |
| Operations deferred | No `current.json`, production root, acquisition run, scheduling, locking, activation, migration, retention, restart, rollback operation, release, deployment, host, secret, or production-data action. |
| Stop/rollback conditions | Stop before mutation if the completed correction has not exited, the accepted 31-path baseline or protected bytes drift, a runtime owner overlaps writable paths, active consumer/producer blocking is absent, or any deterministic/strict gate fails. Revert only owned unstaged candidate bytes and remove only validated disposable roots/new unpublished vector; never use reset-hard, checkout rollback, git clean, broad deletion, or external writes. |

This change touches no other repository or mutable external state. Any push,
pull request, tag, release, deployment, host mutation, or Archive activation
requires a separate explicit authorization. Apply is blocked until proposal,
specs, design, and tasks pass strict validation and main-agent review.
