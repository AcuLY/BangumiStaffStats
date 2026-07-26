## Context

The Query contract originally created the root ignore file and therefore
recorded its complete bytes in `manifest.json`. The repository later moved to
capability-owned exact additions. The root file is now a shared registry, while
Query continues to own only:

1. `/contracts/goldens/query/node_modules/`
2. `/contracts/goldens/query/.cache/npm/`
3. `/contracts/goldens/query/.cache/go-build/`
4. `/contracts/goldens/query/.cache/go-mod/`
5. `/contracts/goldens/query/.cache/go-path/`
6. `/contracts/goldens/query/.tmp/`

Whole-file equality now conflicts with accepted ownership and caused the first
real integrated owner-gate failure.

## Goals / Non-Goals

Goals:

- Keep all six Query transient rules exact, anchored, ordered, and present
  exactly once.
- Keep the root file strict UTF-8 with LF-only endings and a final LF.
- Permit other lines without interpreting them as Query authority.
- Make missing, duplicate, reordered, or broadened Query ownership fail before
  contract generation.

Non-goals:

- Editing or validating the semantics of another owner's ignore rules.
- Reopening Query wire/schema/vector/codegen semantics.
- Changing the Query dependency/toolchain or cleanup allowlist.

## Decisions

### Bind an owned ordered rule projection, not shared file bytes

The verifier decodes the root file with fatal UTF-8, rejects CR and a missing
final LF, then extracts only lines under
`/contracts/goldens/query/`. The extracted array must equal the six fixed rules
in exact order. This simultaneously rejects a missing, duplicate, reordered,
or additional/broadened Query rule while leaving other owners' lines outside
the projection.

The manifest records exactly `path`, `encoding`, `lineEndings`, `finalLf`,
`ownedRules`, and `ownedRulesSha256`. The digest is over the canonical
UTF-8/LF representation of the six ordered rules with one final LF; it is not
a digest of the evolving shared root file.

### Keep negative coverage local and deterministic

The verifier exercises its projection helper against synthetic documents for
missing, duplicate, swapped, broadened, CRLF, invalid UTF-8, and no-final-LF
cases, plus a valid document containing unrelated owner rules. It does not
write `.gitignore` or invoke a mutable repository operation.

## Risks / Trade-offs

- Another owner could add a broad rule outside the Query prefix. Query does not
  own that policy; root baseline and the adding capability must verify it.
- A broad rule such as `/contracts/goldens/query/**` is inside the Query prefix
  and therefore fails the exact projection.
- The manifest and verifier self digest change. Only those two closed evidence
  objects may change.

## Migration Plan

1. Implement and run the locked Query verifier in disposable owned state.
2. Update the owned-rule descriptor and final verifier self identity.
3. Run the full Query codegen/cleanup sequence twice as required and prove no
   generated residue.
4. Main agent audits, syncs, archives, and commits this correction.
5. Rebuild development artifacts against the corrected product revision before
   rerunning integrated acceptance.

## Open Questions

None.
