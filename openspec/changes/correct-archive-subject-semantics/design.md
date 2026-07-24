## Context

Archive v1 is still contract evidence only: the repository contains inert
goldens but no produced, published, activated, released, or deployed formal
snapshot. Its current `subject` table has nullable `air_date` constrained only
to a day-shaped string and has no NSFW column. That cannot safely implement
`PRODUCT.md`'s `includeNSFW` contract or accepted `DR-DATA-DATE-001`.

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/dependency review and strict validation passed; committed/pushed/released/deployed: no |
| Owner | Contracts implementation owner; main agent owns review, affected-change reconciliation, and acceptance. |
| Writable paths | Exactly the apply paths in `proposal.md`; planning writes only this change directory. |
| Read-only protected inputs | Product/design/data authorities, root specs, archived and other active changes, all product/runtime code, local editor/cache state, refs/remotes, external repositories, hosts, and production. |
| Deletion complement | None; preserve the exact 31 indexed golden paths and every unrelated path. |
| Mutable refs | None during apply. |
| Consumes | Existing Archive v1 contract/tooling/corpus, `PRODUCT.md`, backend guide §§3/8/10, accepted `DR-DATA-DATE-001`, and shared-query semantics. |
| Produces | One corrected pre-production v1 contract bundle and master DAG. |
| Dependencies | Completed Archive/query contract changes and proof that no formal/public v1 exists. Main must amend the active consumer, producer, and query-result specs before apply. |
| Deliverables | DDL/documentation/matrix/tooling updates, deterministic regenerated corpus/vector identities, and master-plan row/edges/count. |
| Acceptance | Builder check and byte-equivalent regeneration, pinned verifier, strict semantic insertion matrix, matrix sentinels, closed-index/digest/vector checks, no residue, targeted strict validation. |
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
4 = 0 AND year % 100 != 0)`. Exact length, separators, and ASCII digits reject
trailing data.

The DDL uses explicit integer/substr/arithmetic checks rather than SQLite
`date()` normalization, whose permissive rollover would weaken the contract.
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
