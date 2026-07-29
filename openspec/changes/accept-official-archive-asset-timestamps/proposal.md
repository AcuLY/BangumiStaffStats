## Why

The only authorized production updater run fetched the official
`aux/latest.json` successfully but rejected the current asset because the
updater incorrectly requires the timestamp embedded in the dump filename to
equal GitHub's asset `created_at` second. That equality is not an upstream
contract and is false for most recent official releases, including the current
2026-07-28 asset by one second.

## What Changes

- Treat the canonical dump filename timestamp and GitHub asset timestamps as
  independently validated official metadata instead of requiring them to be
  equal.
- Preserve the exact field set, canonical dump-name grammar, official
  repository/API/download URL bindings, asset ID, size, SHA-256 digest,
  content type, bounded label/node identity, valid timestamps, and
  `updated_at >= created_at`.
- Add focused regression coverage using the exact current official
  2026-07-28 metadata and negative cases proving every retained identity gate.
- Produce a new exact-head artifact for a separately reviewed amendment of
  `activate-single-host-production`; this change performs no second updater
  invocation or host mutation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `updater-archive-producer`: Remove the unsupported filename-time equals
  asset-created-time condition while preserving all authoritative asset,
  origin, digest, size, and timestamp validation.

## Impact

| Field | Declaration |
|---|---|
| Status | Approved for focused apply after strict validation and recorded zero-P0/P1 planning review; production run `1f1ef640-6ece-4c53-8cf1-2df480746891` remains the safe failure baseline. |
| Owner | Main agent owns specification, direct implementation under the user's latest no-unnecessary-subagent rule, audit, Actions/artifact acceptance, Git, and later activation amendment. |
| Writable paths | This change and its archive destination; `updater/src/bangumi_staff_stats_updater/producer/acquisition.py`; `updater/tests/producer/test_acquisition.py`; the accepted-product revision literal in `operations/bin/build-bundle.sh`; `openspec/specs/updater-archive-producer/spec.md`; and the four existing activation artifacts `openspec/changes/activate-single-host-production/{proposal.md,design.md,tasks.md,specs/operations-single-host-deployment/spec.md}`. |
| Read-only protected inputs | Every other repository path; accepted origin/redirect/TLS/proxy/size/digest/ZIP/common/catalog/data/public behavior; current `myserver` state; upstream `bangumi/Archive`; all artifacts and external state. |
| Deletion complement | No file, dependency, artifact, host object, or external state. Existing exact test-temporary cleanup only. |
| Mutable refs | This change's task state, one implementation commit A, one artifact-pin commit B, and the branch push. Production refs and runtime state remain immutable here. |
| Consumes | Official `bangumi/Archive` README/current and recent `aux/latest.json` Git objects as read-only evidence; existing strict acquisition implementation/tests; failed production run evidence; green B2 private deployment. |
| Produces | One narrowly corrected latest-asset identity rule, focused regression tests, and one admitted replacement `linux/amd64` artifact. |
| Dependencies | Complete artifacts/zero-P0/P1 review → direct implementation commit A → pin exact A in artifact commit B → green exact-head Development Actions and artifact → separate activation amendment authorizing deployment and one new updater invocation. |
| Deliverables | Strict-valid OpenSpec, focused code/tests, green Actions, admitted replacement artifact, synchronized/archive lifecycle, and activation handoff. |
| Acceptance | Exact current official metadata with a one-second filename/created-time difference parses; arbitrary canonical filename timestamps remain independent of valid GitHub timestamps; malformed filename/timestamps, `updated_at < created_at`, field drift, origin/API/ID/content-type/size/digest/label/node drift still fail; no dependency or behavior outside acquisition identity changes; full Actions and artifact inventory/checksums pass. |
| Non-goals | No origin expansion, URL relaxation, digest/size weakening, time-skew window, release fallback, cache bypass, retry framework, proxy change, data semantic/product/API/frontend change, second updater run, host integration, public cutover, or legacy retirement. |
| Operations deferred | Replacement artifact deployment, one newly authorized updater invocation, systemd/logrotate installation, Nginx cutover, and rollback drill remain in `activate-single-host-production`. |
| Stop/rollback conditions | Stop if the implementation changes more than the unsupported cross-field equality and focused tests, if any retained negative gate regresses, or if Actions/artifact identity fails. Revert only the candidate repository bytes; leave B2 private production and old public traffic unchanged. |

External behavior classification: **PRESERVE_ORACLE** at
`644b7748674e553f863d0ffd61d029f86fdc0717`; this fixes internal acquisition of
official data without changing product behavior. The change reads but does not
mutate another repository or external state. All artifacts are complete,
strictly valid, reviewed, and approved for the declared focused apply.
