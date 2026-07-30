## Context

Archive v1 is still contract evidence only: the repository contains inert
goldens but no produced, published, activated, released, or deployed formal
snapshot. Its current `subject` table has nullable `air_date` constrained only
to a day-shaped string and has no NSFW column. That cannot safely implement
`PRODUCT.md`'s `includeNSFW` contract or accepted `DR-DATA-DATE-001`.

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: yes; verified: owner gates, independent read-only review, and main acceptance passed; committed: determined by containing Git history; pushed/released/deployed: no |
| Owner | Contracts implementation owner; main agent owns review, affected-change reconciliation, and acceptance. |
| Writable paths | Exactly the apply paths in `proposal.md`; planning writes only this change directory. |
| Read-only protected inputs | Product/design/data authorities, root specs, archived and other active changes, all product/runtime code, local editor/cache state, refs/remotes, external repositories, hosts, and production. |
| Deletion complement | None; preserve the exact 31 indexed golden paths and every unrelated path. |
| Mutable refs | None during apply. |
| Consumes | Existing Archive v1 contract/tooling/corpus, `PRODUCT.md`, backend guide §§3/8/10, accepted `DR-DATA-DATE-001`, and shared-query semantics. |
| Produces | One corrected pre-production v1 contract bundle and master DAG. |
| Dependencies | Completed Archive/query contract changes and proof that no formal/public v1 exists. Main must amend the active consumer, producer, and query-result specs before apply. |
| Deliverables | DDL/documentation/matrix/tooling updates, canonical SQLite schema-object seal, fatal UTF-8 JSON decoding, process-level Go telemetry isolation, deterministic regenerated corpus/vector identities, and master-plan row/edges/count. |
| Acceptance | Builder check and byte-equivalent regeneration, pinned verifier, canonical schema-object mutation rejection, fatal UTF-8 rejection, strict semantic insertion matrix, matrix sentinels, process-level telemetry write denial, closed-index/digest/vector checks, no residue, targeted strict validation. |
| Non-goals | Runtime implementation, a v2 format, new dependency, full Archive acquisition, query/statistics code, or operations. |
| Operations deferred | Activation, migration, schedule, retention, restart, rollback, release, deployment, and production data remain absent. |
| Stop/rollback conditions | Stop if a formal/public v1 exists, an affected active spec is unreconciled, authority/scope drifts, or any deterministic/strict gate fails; propose v2 if the version precondition fails and revert only owned unstaged bytes. |

Dependency direction is
`PRODUCT + accepted decision -> contracts-archive-manifest -> backend consumer /
updater producer -> backend query result`; runtime code never becomes contract
authority. No library or external-state change is required.

## Goals / Non-Goals

**Goals:**

- make NSFW a required authoritative subject fact with a safe exact filter;
- preserve null, year, month, and day date states without inventing components;
- reject malformed and impossible Gregorian dates at the SQLite boundary;
- retain schema version 1 only under a provable pre-first-production exception;
- regenerate every derived identity and executable fixture assertion;
- place the correction before all current Archive consumers/producers/queries.

**Non-Goals:**

- no backend/updater/query implementation or private compatibility shim;
- no support for free-form dates, time zones, ranges, seasons, or inferred dates;
- no schema v2, dual-v1 reader, data migration, or operations work;
- no new golden path or dependency.

## Decisions

### Keep v1 only before the first formal snapshot

`PRAGMA user_version`, `sqliteSchemaVersion`, and manifest schema version remain
1. The canonical `schemaSqlDigest` changes, so the regenerated dataVersion,
SQLite digest, manifest digest, pointer identity, vector, and index distinguish
the corrected bytes. Old draft fixtures are replaced, not accepted in parallel.

This is narrower than ordinary compatibility policy and is allowed only because
no formal/public v1 exists. If that claim cannot be proven at apply preflight,
the change stops and a v2 compatibility tuple is required. After this correction
is accepted, later semantic reinterpretation again requires a new version.

### Store one canonical date plus explicit compact precision

The `subject` columns become:

```text
nsfw                INTEGER NOT NULL  -- exactly 0 or 1
air_date             TEXT NULL
air_date_precision   INTEGER NULL     -- 1=year, 2=month, 3=day
```

Canonical text is exactly `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, with year
`0001..9999`. Precision and text are both null or both non-null and must agree
exactly. The producer derives precision only from the exact registered shape
of the authoritative raw `date` string; this records source precision and does
not invent a missing component. Month is `01..12`; day is checked against the
month's real length with the Gregorian leap rule `(year % 400 = 0) OR (year %
4 = 0 AND year % 100 != 0)`. Exact byte content, separators, and ASCII digits
reject trailing data. The DDL explicitly rejects embedded NUL before using
SQLite text functions, whose length/pattern behavior otherwise stops at NUL.

The DDL uses an explicit NUL rejection plus integer/substr/arithmetic checks
rather than SQLite `date()` normalization, whose permissive rollover would
weaken the contract.
Separate year/month/day columns were rejected as wider and easier to partially
populate; deriving precision only from text was rejected because the accepted
decision requires precision to remain an explicit fact. Text precision labels
were rejected because integer codes are smaller and query predicates remain
unambiguous.

The old `idx_subject_type_date_id` is replaced by required
`idx_subject_filter_date_id(subject_type, nsfw, air_date_precision, air_date,
subject_id)`. It supports the common safe/type/date path and makes the new
columns visible to required-object verification without adding a second index.

### Define filtering without inference

The producer must map an authoritative boolean; missing, null, non-boolean, or
coerced NSFW input cannot default to safe. In the read model:

- effective `includeNSFW=false` requires `nsfw=0`;
- effective `includeNSFW=true` applies no NSFW exclusion and admits both 0/1;
- no mode means “NSFW only.”

A `subjectDate` month range considers only precision 2/3 and compares the
explicit `YYYY-MM` portion. Null and precision 1 are excluded whenever that
filter is active. Timeline/quarter derivation also accepts only precision 2/3;
year-only data never becomes January or Q1.

### Regenerate the same closed corpus deterministically

The minimal fixture expands from two to four subjects: one safe day-precision,
one NSFW month-precision, one safe year-precision, and one safe null-date row.
Source accounting and table counts change accordingly. Existing relations and
credits retain their meanings.

The compatibility matrix keeps the v1 tuple, replaces the subject index name,
and expands its four sentinels to nine: the four existing invariants plus safe
count, NSFW count, month-filter-eligible count, year-only preservation, and
null/precision consistency. The tooling self-test executes a table-driven
rejection matrix for invalid NSFW values, malformed/trailing/impossible dates,
year zero, non-leap February 29, and every null/precision mismatch.

All 31 indexed files are regenerated in place where their bytes depend on the
DDL. The data-version vector receives the new schema digest and expected
dataVersion; every SQLite/manifest/pointer/index digest is recomputed from final
bytes. A generate-then-check cycle and a second clean generation must produce
the same directory byte seal.

### Insert one dependency correction into the master DAG

The master plan adds `correct-archive-subject-semantics` after
`define-archive-manifest-contract` plus `define-shared-query-wire`, changes the
main-repository count from 27 to 28, and makes it an exact direct dependency of
`implement-backend-archive-consumer`, `produce-immutable-archive`, and
`implement-query-result-set`. Transitive downstream edges remain unchanged.

Before apply, main must amend those three active changes so their compiled
contract constants, producer mapping, and query semantics consume the corrected
contract. This Contracts change does not edit their artifacts or code.

### Isolate Go telemetry per verifier process

The existing Archive verifier discovers Go's non-settable telemetry mode and
directory safely, and already runs each Go-starting child through a macOS
`sandbox-exec` profile that denies writes beneath that directory. Its final
whole-directory byte-equality assertion is not a valid ownership proof:
persistent editor-owned Go processes can update the same global directory
while the verifier's own children remain correctly denied.

The shared directory's before/after seals therefore remain diagnostic evidence
only. After discovery accepts either `off` or `local`, every actual Go or
`gofmt` executable invocation, including those launched by nested verifier
logic, must be wrapped directly by the reviewed telemetry-subpath write-denial
profile. The wrapper is unconditional because another process may change the
shared mode after discovery. Environment variables or caller self-attestation
cannot bypass that wrapper. Path/profile mismatch, unavailable `sandbox-exec`,
or a non-zero wrapper result fails closed. The verifier never changes telemetry
mode, interprets/deletes counters, authorizes upload, or stops/configures
unrelated processes.

This aligns the Archive gate with the accepted `contracts-query-wire` boundary.
Waiting for a quiet global snapshot, trusting an inherited-sandbox environment
flag, changing the expected digest, redirecting the user's home/config
directory, or terminating editor processes were rejected as forgeable, flaky,
or intrusive.

### Decode contract JSON bytes strictly

Node's string-form `readFileSync(..., "utf8")` replaces malformed UTF-8 with
U+FFFD before `JSON.parse`. Because some schema strings legitimately permit
U+FFFD, matching a digest to malicious or corrupt raw bytes could otherwise
turn an encoding error into accepted JSON and diverge from strict consumers in
other languages.

The verifier reads bytes first and uses a fatal UTF-8 decoder before parsing
every file-backed JSON authority or fixture. An executable negative self-test
must prove malformed bytes fail before schema validation; it adds no golden
path. Requiring each caller to remember a separate encoding check was rejected
because all contract JSON should share one fail-closed boundary.

### Bind actual SQLite object definitions

The manifest's `schemaSqlDigest` identifies canonical `schema.sql`, but a
matching claim and SQLite byte digest do not prove that the database was
created from that DDL. Required table/index names and sentinels alone can still
accept a database whose `CHECK`, `STRICT`, foreign-key, or index definition was
weakened.

The compatibility matrix therefore records one canonical schema record: the
exact `schema.sql` SHA-256 plus the explicit-object seal produced by executing
it. The object preimage starts with
`bgmss-sqlite-schema-objects-v1\n`, then `count=<decimal>\n`, followed by every
`sqlite_schema` row whose `type` is `table|index|view|trigger`, whose `sql` is
non-null, and whose name is not SQLite-reserved. Rows use SQLite `BINARY` order
by `(type,name,tbl_name)`. Each row appends the fixed fields
`type|name|table|sql` as
`<field>=<UTF-8-byte-length>:<raw-UTF-8-bytes>\n`. Corrected v1 has exactly 35
explicit objects: 20 tables and 15 indexes.

Verifier, fixture builder, future producer, and consumer compute the seal from
the actual database and require it to equal the matrix value; the verifier also
requires the manifest's `schemaSqlDigest` to equal the matrix/file digest.
Missing, altered, or extra explicit schema objects fail at the existing
`SQLITE_REQUIRED_OBJECT_MISSING` stage. A disposable mutation self-test builds
with the NUL constraint weakened and proves the seal differs and is rejected.
Copying an expected digest into `archive_meta`, parsing DDL independently in
each language, or relying only on sentinel rows were rejected because none
independently binds the stored schema definitions.

## Risks / Trade-offs

- [Same numeric version could conceal two meanings] → permit only the
  pre-production exception, replace all draft evidence, gate on no public v1,
  and rely on the changed schema digest/dataVersion; otherwise use v2.
- [Redundant text and precision could disagree] → one table-level consistency
  check, negative self-tests, integrity checks, and a zero-mismatch sentinel.
- [Calendar edge cases drift across languages] → canonical ASCII forms and
  explicit Gregorian arithmetic in the language-neutral DDL/tooling.
- [Safe filtering accidentally treats true as NSFW-only] → fixtures contain
  both classes and sentinels plus downstream query goldens assert both modes.
- [Contracts land before runtime adapters] → reconcile active specs first,
  preserve their apply blocks, then adapt/re-run each owner after this exits.
- [A shared telemetry directory changes concurrently] → compare snapshots only
  for diagnostics; accept solely on the enforced per-process write-denial
  sandbox and fail closed on any missing wrapper/inheritance proof.
- [Node replaces malformed JSON bytes] → one shared fatal UTF-8 decoder and an
  invalid-byte self-test run before any schema or digest-based acceptance.
- [SQLite object names survive weakened definitions] → compare a fixed
  language-neutral seal of every actual explicit `sqlite_schema` definition
  against the compatibility matrix before sentinels/counts.

## Migration Plan

1. Main reviews/amends all four artifacts and reconciles the three affected
   active changes; no apply starts before that gate.
2. Contracts owner proves no formal/public v1 and the exact 31-path corpus.
3. Amend DDL/docs/matrix/tooling, regenerate only the declared fixture paths,
   and update the master DAG.
4. Run deterministic contract acceptance and leave runtime code untouched.
5. Main accepts/syncs/archives this change, then starts fresh owner turns to
   adapt and rerun consumer, producer, and query candidates.

There is no production migration or rollback. Before commit, rollback is the
owned unstaged contract candidate; discovery of any existing formal v1 converts
the plan to a separately reviewed v2 change.

## Open Questions

None.
