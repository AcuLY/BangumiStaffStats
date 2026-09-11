## Context

The fix belongs to the externally managed collection client. This consumer already preserves top-level SubjectType and uses immutable Archive facts for statistics; it must only upgrade the accepted library and verify the boundary.

## Goals / Non-Goals

Goal: use published v0.1.2 and verify that nested valid-type drift no longer fails a personal query. Non-goals: local replacement, new dependency, new DTO, statistical inference, frontend change or production rollout.

## Change boundary

| Field | Decision |
| --- | --- |
| Status | Specified, requiring primary review and strict validation. |
| Owner | Primary agent. |
| Writable paths | Exact paths in proposal.md Impact. |
| Read-only protected inputs | All paths outside that list, especially concurrent frontend work and earlier timeout changes outside the necessary files. |
| Deletion complement | No source deletion; only archive this completed change. |
| Mutable refs | None in this consumer repository. |
| Consumes | Verified published package v0.1.2 and its existing MIT license/API. |
| Produces | Version pin/assertions, adapter regression and accepted docs/specs. |
| Dependencies | accept-reclassified-subject-types in the library repository and its v0.1.2 publication. |
| Deliverables | Scoped local upgrade and service evidence. |
| Acceptance | Module graph/sum, tests/race/vet/build, strict specs/diff and real local query. |
| Non-goals | Additional package behavior or UI/operations changes. |
| Operations deferred | No production or consumer remote integration; existing local API restart only. |
| Stop/rollback conditions | Preserve unrelated work; stop on tag, scope or regression mismatch. |

## Decisions

Use the normal Go module download/checksum path after the package PR is green, reviewed, merged and tagged. Update both fixed-version assertions. Add an httptest regression through the real publiccollection adapter using the observed 631949/2/6 shape. The returned SubjectType remains anime; statistical inclusion remains the Archive/query layer's decision.

The patch changes no exported API, import boundary, dependency requirement or license. Retain current limiter and timeout settings. A temporary local module replacement would violate the accepted consumer contract and is not used.

## Risks / Trade-offs

Publishing a tag is irreversible in normal module caching: verify its exact merged commit before admission. Long collections can still encounter independent network failures; keep existing bounded retries and report measured results without guaranteeing upstream availability.

## Migration Plan

Admit the published tag, update and test the consumer, synchronize/archive specs, rebuild and briefly restart only the local API using the existing launcher. No production deployment.
