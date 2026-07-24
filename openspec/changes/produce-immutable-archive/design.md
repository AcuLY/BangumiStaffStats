## Context

The foundation exposes only a read-only contract adapter and terminating CLI.
The producer now needs to consume public upstream data without becoming a
scheduler or activation tool. Dependency direction is strictly
`contracts-archive-goldens -> updater-archive-producer -> accepted
backend-archive-consumer smoke`; no backend package imports updater code and no
producer owner writes backend or contract authority.

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/dependency review, strict change/all validation, and doctor passed; committed: determined by containing Git history; pushed/released/deployed: no |
| Owner | Contracts owner completes and hands off goldens; Updater owner applies producer; main agent reviews/accepts. |
| Writable paths | Exactly the planning, Contracts, and Updater owner sets in `proposal.md`; owners are sequential and disjoint. |
| Read-only protected inputs | Archive schemas, remaining contracts, accepted consumer, guides/specs, other code/changes, refs/remotes, hosts, and production. |
| Deletion complement | None. |
| Mutable refs | None during apply. |
| Consumes | Corrected accepted Archive/updater contracts, corrected Contracts corpus, exact public sources, and accepted `backend/cmd/archive-smoke`. |
| Produces | Indexed synthetic cases and one closed inactive Archive version after every staging gate. |
| Dependencies | The two accepted foundations plus accepted/exited `correct-archive-subject-semantics` and accepted `implement-backend-archive-consumer`; PyYAML `6.0.3`. |
| Deliverables | Acquisition, streaming builder, strict gates, manifest/finalization, consumer smoke, tests/docs/lock. |
| Acceptance | Synthetic matrix, disposable complete-source smoke, reproducibility, consumer, Python/dependency/OpenSpec/inventory gates. |
| Non-goals | Activation/current pointer, schedule/daemon/lock/restart, business endpoints/catalog enrichment, operations. |
| Operations deferred | Production roots/credentials, periodic runs, activation/retention/rollback/restart/deploy. |
| Stop/rollback conditions | Any drift or gate failure removes only owned staging, leaves no final candidate, and preserves every prior version/input. |

## Goals / Non-Goals

**Goals:** Build one contract-conforming Archive with exhaustive accounting and
an independent Go acceptance gate; keep same semantic inputs stable.

**Non-Goals:** Write/read `current.json`, mutate a prior database, infer new
catalog/cast semantics, run resident work, or publish to production.

## Decisions

### Use two sequential ownership blocks

Contracts first adds compact synthetic source/expected cases under its owned
golden subtree and closes `index.json`. Only after main acceptance may Updater
consume them. If a case needs a new schema or contract meaning, Contracts stops
and proposes that authority change; Updater never edits or privately replaces
it.

### Acquire exact public inputs into a private staging root

The one-shot request resolves `bangumi/Archive` `aux/latest.json` to one exact
release ZIP identity and a supplied `bangumi/common` ref to one exact commit.
HTTPS origin/redirects, response status, declared/actual size, SHA-256, ZIP
member inventory/type/size, and common bytes are bounded and verified before
parsing. Tests inject local streams and deny network; one explicit acceptance
smoke may download the complete sources into disposable staging.

### Stream into a fresh database

`ZipFile.open` and bounded line-by-line strict JSON decoding feed batched
standard-library `sqlite3` transactions in deterministic identity order. Each
physical line enters exactly one of imported/duplicate/invalid/unresolved;
identical duplicates and contract-permitted raw unknown positions are counted,
while malformed/conflicting/dangling-required facts fail. No old database,
row-count shortcut, bulk in-memory materialization, pandas, or ORM is used.

After indexes, the candidate passes the corrected canonical schema SQL digest
and actual 35-object `sqlite_schema` seal, foreign-key/integrity checks,
manifest counts and quality invariants, read-only reopen, and deterministic
logical-row digests. The authority supplies dataVersion and digest order:
semantic inputs, final SQLite, then manifest.

### Validate before inactive publication

All work remains under one unique staging directory below the same absolute,
canonical output root and filesystem as `versions/`, with the fixed
`versions/<dataVersion>/{manifest.json,bangumi.sqlite}` layout inside staging.
The accepted `backend/cmd/archive-smoke` loads that candidate without a pointer,
applies full-data runtime invariants, returns bounded JSON identity, and closes
the store. Compatibility-matrix exact expected integers remain minimal-golden
contract assertions, never arbitrary full-dataset gates.

Only after smoke and every other fallible gate pass is the closed version
directory renamed into the previously absent inactive output path. Rename is
the commit point: no validation or cancellation decision occurs afterward, and
cross-device copy, merge, replace, or partial-file fallback is forbidden. A
same-dataVersion existing version is independently validated and returns
no-change; any other pre-existing or raced collision fails without mutation.
The development producer requires one writer per output root; host-level
serialization remains the deferred operations lock. Neither smoke nor producer
reads or writes `current.json`.

### Admit only PyYAML

PyYAML `6.0.3` is the sole added runtime dependency, owned only by updater
common parsing and invoked through `safe_load` plus strict post-parse shape
validation. PyPI records the 2025-09-25 release, MIT license, Python 3.14
support and wheels; the canonical repository documents safe loading. Standard
library has no YAML parser; ruamel.yaml is a larger round-trip stack and a
custom YAML subset is unsafe maintenance. Lock/version/license/wheel/import
gates are mandatory; removal follows removal of common YAML parsing.

## Risks / Trade-offs

- [Upstream drift or archive bomb] → exact identities, size/member bounds, no
  links/traversal, streamed reads, and fail closed.
- [Minimal exact sentinels reject full data] → accepted `archive-smoke` keeps
  them in golden tests and applies only runtime invariants to producer output.
- [Same dataVersion produces different physical SQLite bytes] → require stable
  logical rows/dataVersion, accept one validated immutable version, never
  overwrite a collision.
- [Rename crosses a filesystem or a second writer races] → keep staging below
  the same output root, forbid copy/replace fallback, require one development
  writer, and defer host serialization to the operations lock.

## Migration Plan

Create/accept goldens, apply producer in staging, run local and complete-source
gates, then hand off the inactive version. No deployment or rollback action is
performed; failure removes only the unpublished staging directory.

## Open Questions

None; accepted `backend/cmd/archive-smoke` is an explicit pre-apply dependency.
