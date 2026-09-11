## Why

The pinned v0.1.1 client rejects a same-ID collection record when its nested metadata has a different supported subject type. The repaired package retains the top-level collection type and fetched zhong_mo's complete 7,179-record collection successfully. The user authorized publication of v0.1.2 and the local backend upgrade after restoring local service.

## What Changes

- INTENTIONAL_DELTA: consume immutable public tag v0.1.2, with no replace or pseudo-version.
- Verify the production adapter retains a valid record with collection type 2 and nested metadata type 6.
- Update dependency assertions and accepted documentation/specification; preserve the approved 5/s burst-10 and 10/90/20/120/125-second policies.
- PRESERVE_ORACLE: no UI or statistical change relative to current product authorities and oracle 644b7748674e553f863d0ffd61d029f86fdc0717.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `backend-public-collection-source`: v0.1.2 admission and supported nested type drift compatibility.

## Impact

| Field | Decision |
| --- | --- |
| Status | Specified; apply waits for published immutable tag and reviewed strict-valid artifacts. |
| Owner | Primary agent. |
| Writable paths | backend/go.mod; backend/go.sum; backend/internal/architecture/dependencies_test.go; backend/scripts/check.sh; backend/internal/publiccollection/transport_test.go; backend/README.md; openspec/specs/backend-public-collection-source/spec.md; this change and its archive. |
| Read-only protected inputs | All other code, generated contracts, frontend concurrent work, PRODUCT.md, DESIGN.md, data decisions, master plan/guides, other active changes. |
| Deletion complement | No source deletion. |
| Mutable refs | None in BangumiStaffStats; current master and existing dirt preserved. |
| Consumes | Separately reviewed/published bangumi-collection-go v0.1.2; existing anonymous adapter and archive authority. |
| Produces | Fixed consumer module graph, regression, docs and verified local API. |
| Dependencies | External package maintenance change accept-reclassified-subject-types and its explicitly authorized v0.1.2 publication; no other product changes. |
| Deliverables | Local upgrade and exact validation evidence. |
| Acceptance | Module origin/version/sum and unchanged dependency graph; focused publiccollection/architecture tests; Linux full Go tests/race/vet/build; strict specs/diff; local service smoke and real zhong_mo ranking. |
| Non-goals | Protocol patches in the adapter, local module replacements, statistics changes, frontend changes, fixing unrelated umbrella-test failures. |
| Operations deferred | No production deployment or BangumiStaffStats push/merge. Existing local API may be briefly restarted after verification; frontend process stays running. |
| Stop/rollback conditions | Stop on tag mismatch, overlapping concurrent backend edits, new dependency changes or failed relevant acceptance. Preserve prior timeout edits; do not reset, stash, clean or stage unrelated work. |

The library's PR/merge/tag/release is separately authorized by the user in this session and handled in its own repository; this consumer change does not grant additional external mutation rights.
