## Context

The authoritative staff-set grammar is
`staffset:{book|anime|music|game|real}:{slug}`, where `slug` is a 1–64
character lower-kebab token and the full key is at most 96 bytes. The minimum
valid key is therefore 15 characters (`staffset:book:a` or
`staffset:real:a`). `schema.sql` currently uses `BETWEEN 17 AND 96`, while the
query schema admits the authoritative grammar. This is a shared-contract
defect, not a catalog-specific policy choice.

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main authority/dependency review and strict planning gates passed |
| Owner | Delegated correction owner implements; main agent reviews and accepts. |
| Writable paths | Exact proposal path set only. |
| Read-only protected inputs | Active Updater implementation, catalog change, all other code/contracts/state, refs/remotes, external state, and production. |
| Consumes | Query/guide grammar, corrected unpublished Archive v1, canonical and producer corpus seals, Go consumer. |
| Produces | One corrected lower bound and propagated identities/binding. |
| Dependencies | Raw-domain correction exited; producer Contracts accepted; correction exits before producer/catalog acceptance. |
| Non-goals | New staff-set behavior, grammar change, version bump, API/UI/operations. |
| Stop/rollback conditions | Stop on formal v1, overlap, path drift, or failed regeneration/test; preserve disjoint dirty work. |

## Goals / Non-Goals

**Goals:**

- Make SQLite accept every key allowed by the governing 1–64 slug grammar.
- Preserve the fixed schema/table/index/version shape while propagating the
  changed SQL definition through all identities.
- Add regression evidence at both inclusive bounds and immediately outside
  them.

**Non-Goals:**

- Activate a staff set or populate production staff-set rows.
- Change key syntax, query normalization, catalog semantics, or schema version.
- Modify the in-progress Updater implementation.

## Decisions

### Correct SQLite to the governing grammar

The lower bound becomes 15. Raising the product/query minimum to three
characters was rejected because it contradicts the accepted guide and would
reduce future extension compatibility only to accommodate a DDL arithmetic
error.

### Keep draft v1 and regenerate every dependent identity

No formal/public/activated/released/deployed v1 exists. The table and explicit
object count remain unchanged at 35, but canonical SQL and the stored object
definition digest change. The builder therefore regenerates compatibility,
dataVersion, SQLite, manifest, pointer, vector, root index, and producer-case
identities in dependency order. Both clean runs must be byte-deterministic.

### Test the bound through real SQLite

Tooling creates isolated valid parent/member rows and verifies that 15- and
96-character keys insert while 14- and 97-character keys fail. The Go consumer
loads the regenerated canonical fixture and is bound to the new schema/object
seals. No catalog compiler implementation is added here.

## Risks / Trade-offs

- [Many fixture bytes change for one DDL character] → fixed path sets, exact
  old/new identity inventory, two deterministic regeneration passes.
- [Updater reads seals while correction runs] → paths are disjoint; it consumes
  Contracts dynamically and final acceptance waits for the correction commit.
- [A malformed key passes the DDL glob] → catalog/query strict grammar remains
  the syntax authority; this change only fixes the contradictory length bound.
- [A v1 escaped] → stop and version the schema instead of redefining v1.

## Migration Plan

1. Main approves strict artifacts and confirms the active Updater diff is
   disjoint.
2. Correction owner updates DDL/tooling, regenerates both fixed corpora, and
   rebinds Go tests.
3. Main reruns material gates, synchronizes the two delta specs, archives the
   change, and creates one local commit.
4. Updater owner rebases its acceptance evidence on the new committed seals.

## Open Questions

None. The accepted grammar fixes the correct lower bound at 15.
