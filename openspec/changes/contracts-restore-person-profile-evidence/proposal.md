## Why

Ranking work cards currently flatten exact cast evidence into a repeated slash-separated paragraph instead of the accepted two-row role list. Real biographies already exist in the official Archive dump, but the producer drops them and the detail endpoint therefore returns a statistical fallback instead of the available biography.

## What Changes

- PRESERVE_ORACLE: restore ranking work/series cards to `配音角色`, character name plus role tag, at most two measured rows and `… +N` with complete accessible overflow. Ordinary staff positions are not repeated on these cards. Oracle: `644b7748674e553f863d0ffd61d029f86fdc0717`; accepted data decisions line 138. Exact server contribution identities/counts remain authoritative.
- INTENTIONAL_DELTA: preserve a bounded, normalized plain-text person summary from official Archive input and return it through the existing optional `person.summary` field. This completes the accepted backend guide's Archive profile contract without live Bangumi profile requests or hardcoded biographies.
- **BREAKING Archive format**: advance only SQLite schema to 2. Rebuild inactive immutable candidates from the original inputs; do not edit existing snapshots. Manifest/pointer versions and the dataVersion algorithm remain unchanged. Producer contract validation owns the new tuple; no Backend admission layer is added.
- Reconcile generated fixture/schema/artifact identities with the new canonical DDL using reproducible tooling.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `contracts-archive-manifest`: SQLite v2 and bounded person summary storage.
- `contracts-archive-goldens`: reproducible biography and version-transition evidence.
- `backend-person-detail-api`: production Archive summary propagation.
- `frontend-person-inspector`: oracle role list and genuine biography presentation.

## Impact

| Field | Boundary |
|---|---|
| Status | Planning; apply blocked until all artifacts pass strict validation and primary review |
| Owner | Primary owns planning, Backend implementation and final acceptance; one Contracts owner and one Frontend role-list owner |
| Writable paths | Exact implementation inventory in design.md; this change; the four named root specs during sync; DESIGN.md only for the accepted role-list rule |
| Read-only protected inputs | PRODUCT.md, existing data decisions and guides, oracle, existing query/statistics/public wire contracts, unrelated dirty files, existing Archive versions, live production, secrets and other repositories |
| Deletion complement | Only superseded role-summary formatting code; preserve real cast evidence, card geometry repairs, role navigation, current data and unrelated changes |
| Mutable refs | None; current master worktree only, no staging/commit/push/merge |
| Consumes | Official person.jsonlines, shared canonical DDL/goldens, existing optional summary wire field, existing adaptive layout helper and Vue/Naive UI |
| Produces | SQLite v2 candidates and fixtures, real optional summary, bounded role lists, exact test/build/browser evidence |
| Dependencies | Contract v2 before producer/consumer verification; independent frontend role block after planning; existing dependencies only |
| Deliverables | Reviewed strict-valid plan, implementation, regenerated evidence, focused/full affected gates, local rendered checks, synced/archived delta when complete |
| Acceptance | Shared Archive verifier and fixture regeneration; contract artifact tests; Backend check.sh; Frontend npm ci/check; real desktop/mobile role and biography checks; git diff --check |
| Non-goals | New runtime network enrichment, arbitrary HTML rendering, old fixture biographies, statistics or query changes, remote deployment, general UI cleanup |
| Operations deferred | Existing live/production processes and pointers remain protected; fresh local candidate and isolated loopback validation are permitted, activation requires a concrete target/rollback review |
| Stop/rollback conditions | Stop on concurrent overlap, authority/fixture drift, unbounded content, data mutation or acceptance failure. Preserve previous binary/snapshot and undo only this change's hunks if rollback is needed |

This change owns the later SQLite v2 delta after `backend-embed-go-archive-builder`'s v1 parity work. Its historical fixed v1 seals are not an alternative production contract. Existing pending loading/theme/query work is preserved; only the role-list presentation and Archive biography blocks above are superseded here.
