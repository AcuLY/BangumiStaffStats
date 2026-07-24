## Context

The accepted Archive contract says malformed timestamps are rejected and
`generatedAt` is UTC. The current manifest schema only constrains lexical
shape, however, and the Node verifier compiles Ajv with
`validateFormats: false`; its semantic pass checks source accounting and the
fixed common commit but not the calendar. Consequently
`2024-13-99T25:61:61Z` reaches `VALID` on the Node JSON path while the Go
candidate's `time.Parse` rejects it.

The same contract gives both URL fields JSON Schema `minLength: 12` and
`maxLength: 2048`, but the Go candidate uses byte-counting `len`.
`https://😀` is 9 Unicode scalar values/12 UTF-8 bytes and therefore must be
rejected; `https://` plus 2039 `a` characters plus `😀` is 2048 scalar
values/2051 bytes and therefore must be accepted by manifest-string
validation. Generic JSON decoding adds another divergence: fatal raw UTF-8
does not reject the ASCII JSON escape `\uD800`, Node/Python can retain an
isolated surrogate, and Go `encoding/json` replaces it with U+FFFD. The
contract must therefore validate the decoded scalar sequence before counting.

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; planning/main review: passed; implemented: complete; Contracts verification: passed; downstream Go/Python runtime verification: pending in their owning changes; committed/pushed/released/deployed: no |
| Owner | Contracts owner applies the exact contract/tool/vector paths; main agent reviews, records dependency ordering, and performs final acceptance. Runtime owners adapt later under their existing changes. |
| Writable paths | Planning: this change directory only. Apply: exactly the persistent and disposable paths listed in `proposal.md`; no runtime or active-change path. |
| Read-only protected inputs | Product/design/guides/decisions, root specs, archived changes, completed correction artifacts, other active changes, existing 31 golden files, all other Contracts files, all backend/updater/frontend code, refs/remotes, external systems, hosts, and production. |
| Deletion complement | Preserve the accepted baseline. Remove only canonical disposable roots at exit and, on failed unpublished apply, the new vector candidate; no accepted path is deleted. |
| Mutable refs | None during planning or apply. |
| Consumes | Accepted/exited `correct-archive-subject-semantics`, root `contracts-archive-manifest`, corrected 31-path corpus, current schema/tooling, and read-only Node/Go divergence evidence. |
| Produces | Exact string semantics, no-dependency Ajv timestamp/scalar validators, one indexed vector, three-language contract evidence, and consumer/producer acceptance ordering. |
| Dependencies | Accepted Archive contract and completed correction. This hardening must exit before final acceptance of the active Archive consumer or producer. |
| Deliverables | Schema/docs/tooling/vector/index changes, exact vector cases/counts, deterministic builder/verifier checks, isolated Python/Go probes, master-DAG row/count/edges, and no runtime implementation. |
| Acceptance | Exact 32-path closed index, unchanged accepted 31 golden bytes, all 25 string cases plus one raw-byte recipe agreeing in three languages, strict surrogate handling, deterministic generation, pinned verifier, strict OpenSpec/scope/residue gates. |
| Non-goals | Runtime implementation, new dependency, manifest/SQLite/dataVersion version redesign, origin policy, URL normalization, UI/query/statistics work, or operations. |
| Operations deferred | Any acquisition, production path, current pointer, activation, migration, schedule, lock, retention, restart, release, deploy, host, secret, or production-data action. |
| Stop/rollback conditions | Stop on correction/baseline/dependency/owner/path drift or any failed gate. Revert only owned unstaged bytes; remove only the validated disposable roots/new unpublished vector; never rewrite protected or external state. |

Dependency direction is:

```text
define-archive-manifest-contract
  -> correct-archive-subject-semantics
  -> harden-archive-manifest-string-semantics
  -> implement-backend-archive-consumer
  -> produce-immutable-archive
```

The producer also depends directly on this hardening so it cannot rely only
on a consumer smoke to prove its own manifest writer. Query-result work
receives the rule transitively through the consumer. Contracts remains the
authority; Go and Python do not share runtime validation code.

Oracle comparison is not a visual or product shadow test: the oracle commit is
protected and no externally visible product behavior changes. Preservation is
shown by a zero frontend/product/statistics diff; the intentional contract
delta is shown by the newly fixed cross-language vectors.

## Goals / Non-Goals

**Goals:**

- make every accepted `generatedAt` both lexically canonical and
  calendar/time-valid in exact UTC;
- require decoded JSON strings to contain only Unicode scalar values and count
  those scalar values in every language;
- retain fatal UTF-8 and stable manifest-stage rejection precedence;
- add one small closed shared vector rather than private runtime fixtures;
- block consumer and producer final acceptance until both execute that vector;
- retain manifest schema version 1 only under the pre-production proof.

**Non-Goals:**

- no URL fetch/origin/redirect, IDNA, percent-encoding, or normalization rule;
- no backend or updater implementation in this change;
- no new schema version, dataVersion input, or SQLite byte change;
- no `ajv-formats`, date library, or other dependency;
- no full Archive, activation, operations, release, or deployment.

## Decisions

### Validate one exact UTC timestamp subset with a custom Ajv format

The schema retains its ASCII pattern and adds the named format
`bgmss-utc-generated-at-v1`. The verifier registers that format before strict
schema compilation and enables format assertions. Its validator parses fixed
numeric fields and applies explicit Gregorian arithmetic:

- year `0001..9999`;
- month `01..12`;
- day within the real month length using the Gregorian leap rule;
- hour `00..23`, minute/second `00..59`;
- year 1900 is not a leap year and year 2000 is a leap year;
- hour 24, minute 60, and leap second 60 are invalid;
- optional fractional seconds contain exactly 1 through 6 digits;
- uppercase terminal `Z` only, with no offset, whitespace, rollover, or
  normalization.

The vector independently fixes year `0000`, 1900/2000 leap behavior, hour 24,
minute 60, second 60, and fractional precision 0/1/6/7 so no language library
can silently choose a different boundary. Format failure remains a manifest
schema failure, so the stable outcome is
`MANIFEST_SCHEMA_INVALID` before source accounting, compatibility,
dataVersion, filesystem, digest, or SQLite work. The existing pattern remains
useful to every generic schema consumer, while the named format and vector
carry the semantic subset that regex cannot safely express.

A custom Ajv format is selected over `ajv-formats`. The latter would add a new
direct dependency and lockfile surface, while a standard RFC 3339 validator
does not by itself encode this contract's UTC-only spelling, 1..6 fraction,
year, and no-leap-second choices; the pattern and extra policy would still be
required. `Date.parse` is also rejected because normalization and
implementation-defined edge behavior are not a contract proof. Explicit
arithmetic is small, dependency-free, and identical to the Python/Go probes.
`package.json` and `package-lock.json` therefore remain protected and the
existing Ajv/quicktype pins remain unchanged.

### Validate Unicode scalar sequences before counting URL bounds

Every file-backed manifest is first read as bytes and decoded with fatal UTF-8,
then parsed as strict JSON. Fatal byte decoding is necessary but not sufficient:
an isolated `\uD800` or `\uDC00` is ASCII source bytes yet does not decode to a
Unicode scalar value. Before length or pattern acceptance, the Node validator
scans UTF-16 for correctly paired surrogates, Python rejects every decoded
value in `U+D800..U+DFFF`, and Go validates raw JSON string escapes before
`encoding/json` can replace an isolated surrogate with U+FFFD. A legal high/low
surrogate pair decodes to one Unicode scalar value and counts as one.

After that guard, URL length is the number of Unicode scalar values.
JavaScript scalar iteration after surrogate validation, Python Unicode `len`, and Go
`utf8.RuneCountInString` agree for validated scalar text. UTF-8 byte length and
UTF-16 code-unit length are diagnostic vector facts only and never decide
acceptance. The verifier uses a small in-repository Ajv semantic guard rather
than another package.

The schema attaches the named format `bgmss-unicode-scalar-url-v1` to both URL
properties while retaining their existing patterns and length keywords. The
verifier registers this format before strict compilation alongside
`bgmss-utc-generated-at-v1` and enables format assertions. Thus the scalar
guard is part of the manifest schema boundary rather than an untracked
post-schema helper.

The existing HTTPS prefix, NUL/CR/LF exclusions, and
`/subject_staffs.yml` suffix remain unchanged. This is not URL parsing or
canonicalization. A raw malformed UTF-8 mutation fails
`MANIFEST_SCHEMA_INVALID` before JSON parsing; a valid multibyte string is
then bounded at inclusive `12..2048` scalar values.

### Add one indexed vector and keep mutations disposable

After the completed correction exits, the accepted baseline has exactly 31
indexed files. Apply adds only
`vectors/manifest-string-semantics.json`, updates `index.json`, and requires
exactly 32 indexed regular non-symlink files. The prior 31 paths and bytes are
preserved. The vector itself is a structurally valid `VALID` indexed case;
each contained mutation records the target field, literal value, expected
scalar length, expected UTF-8 byte length, and expected manifest-string
outcome.

The vector stores each mutation as an ASCII `jsonStringLiteral` so legal and
illegal surrogate escapes reach every manifest decoder with identical raw
spelling. A valid-scalar case additionally records its expected scalar count
and UTF-8 byte length; an isolated-surrogate case records null counts and
`MANIFEST_SCHEMA_INVALID`. The closed vector has these 25 string case ids:

```text
generated-at-valid-no-fraction
generated-at-invalid-fraction-0
generated-at-valid-fraction-1
generated-at-valid-fraction-6
generated-at-invalid-fraction-7
generated-at-valid-min-year
generated-at-valid-max-year
generated-at-invalid-year-zero
generated-at-invalid-1900-leap-day
generated-at-valid-2000-leap-day
generated-at-invalid-impossible-fields
generated-at-invalid-hour-24
generated-at-invalid-minute-60
generated-at-invalid-second-60
generated-at-invalid-offset
archive-url-invalid-ascii-min-minus-one
archive-url-valid-ascii-min
archive-url-invalid-multibyte-short
archive-url-valid-multibyte-max
archive-url-invalid-multibyte-max-plus-one
common-url-valid-multibyte-max
common-url-invalid-multibyte-max-plus-one
archive-url-valid-surrogate-pair
archive-url-invalid-isolated-high-surrogate
archive-url-invalid-isolated-low-surrogate
```

The same vector also contains one `manifest-invalid-raw-utf8` byte-mutation
recipe. Starting from the otherwise-valid minimal manifest, the recipe keeps
the `archiveAssetUrl` JSON string delimiters in place and replaces exactly the
payload bytes between them with hex `C3 28`; this is the invalid two-byte
sequence consisting of a leading `C3` byte followed by non-continuation byte
`28`. Its expected outcome is `MANIFEST_SCHEMA_INVALID` at fatal UTF-8 decode,
before JSON parsing. The fixture builder emits the canonical vector and
recomputes its index digest. The Node verifier checks exact keys/order/case set, parses each
`jsonStringLiteral` through the strict manifest boundary, recomputes scalar and
byte facts only for valid scalar values, and asserts `VALID` or
`MANIFEST_SCHEMA_INVALID`. It invokes one Python probe and one isolated Go
probe against the same tracked bytes; the Go probe uses the existing direct
telemetry-write-denial wrapper and all generated probe files stay under the
approved `.tmp` root. The raw-byte recipe is materialized only ephemerally,
because malformed UTF-8 cannot itself be a valid tracked JSON value.

No private persistent Node, Python, or Go fixture is permitted.

### Keep runtime adaptation in the owning active changes

This Contracts change does not write `backend/**`, `updater/**`, or another
active change. Before apply, the main agent separately reconciles the consumer
and producer planning so both name this change as a hard prerequisite and
execute the exact indexed vector through their real runtime boundaries:

- the consumer must pass it through fatal byte decode plus `decodeManifest`,
  rejecting isolated surrogate escapes before `encoding/json` replacement and
  replacing byte-count URL bounds with scalar-count bounds while retaining
  the exact timestamp behavior;
- the producer must pass it through the Python manifest finalizer so generated
  timestamps and both URL fields cannot escape the same contract.

An isolated Go probe proves the language-neutral rule during Contracts apply;
it does not claim that the backend candidate is adapted. Neither downstream
change receives final acceptance until its runtime proof exists.

### Retain v1 only while no formal manifest v1 exists

This hardening closes behavior already required by the root contract and
changes no manifest field or dataVersion input. Because the producer has not
created a formal/public/activated Archive v1, the manifest schema version
remains 1 and existing valid golden bundle bytes remain unchanged. If apply
preflight finds any produced, published, activated, released, or deployed
formal v1, apply stops and a versioned compatibility proposal is required.

The master plan adds this change after the completed correction, changes the
main-repository count from 28 to 29, and adds exact direct prerequisites to
consumer and producer. The Wave 5 direct-19 inventory remains unchanged
because the dependency is transitive.

## Risks / Trade-offs

- [Custom formats are not enforced by generic code generation] → keep the
  lexical patterns and length keywords, make both named formats normative, and
  require the same indexed vector at Contracts, consumer, and producer
  acceptance.
- [Language length APIs count different units] → store both expected counts,
  use only validated scalar count for decisions, and fail on any three-way
  disagreement.
- [Fatal UTF-8 is mistaken for complete Unicode validation] → exercise legal
  paired and illegal isolated surrogate escapes through raw manifest string
  literals; require Go validation before replacement decoding.
- [A valid 2048-scalar URL exceeds 2048 bytes] → keep existing bounded
  manifest-file limits, exercise the exact counterexample, and forbid a hidden
  byte cap at the field boundary.
- [Timestamp libraries disagree on year zero or leap seconds] → reject both
  explicitly and use field arithmetic rather than library normalization.
- [The dirty correction candidate is mistaken for an accepted baseline] →
  require accepted/exited correction state plus the exact 31-path/hash preflight
  before any apply write.
- [Contracts evidence is mistaken for runtime completion] → report the Go
  probe as isolated only and keep both active runtime acceptances blocked.
- [Index regeneration rewrites unrelated fixtures] → compare all prior 31
  paths and digests before/after and stop on any byte drift.

## Migration Plan

1. Main agent reviews all four artifacts, proves the subject correction is
   accepted/exited, and separately records the consumer/producer acceptance
   blocks; no apply starts before that gate.
2. Contracts owner preflights branch/HEAD/index/dirty scope and seals the exact
   accepted 31-file baseline.
3. Add the schema format/scalar rules, documentation, vector generator,
   verifier, and one new vector; update only its index entry and master-DAG
   record.
4. Run deterministic builder checks, pinned Node verification, shared Python
   and sandboxed isolated-Go probes, strict OpenSpec, diff, inventory, and
   residue gates.
5. Main agent independently reviews the candidate and hands the indexed vector
   to the existing runtime changes. Sync/archive/stage/commit remain separate
   lifecycle actions.

There is no production migration. Before acceptance, rollback removes only the
new unpublished vector and owned schema/tool/index/master-plan edits plus
validated disposable roots. If a formal v1 or protected-byte drift is found,
retain all evidence, stop, and propose a versioned contract instead.

## Open Questions

None. Main-agent review and approval are gates, not unresolved semantics.
