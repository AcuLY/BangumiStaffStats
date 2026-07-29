## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Proposed focused modification to the existing operations capability. |
| Owner | Main agent directly owns specification, implementation, audit, Actions, and lifecycle. |
| Writable paths | Exact proposal writable paths only. |
| Read-only protected inputs | Product source/contracts/artifacts, other operations definitions, upstream data, and all host/external state. |
| Deletion complement | No persistent object or dependency; exact existing test temporaries only. |
| Mutable refs | Change/lifecycle task state and narrow branch commits/push only. |
| Consumes | Existing disk-backed Archive bind mount, updater Compose projection, failed production evidence, and SQLite's documented Unix temporary-directory selection. |
| Produces | Exact updater-only SQLite temporary-directory projection and verification. |
| Dependencies | Reviewed change → focused implementation/tests → exact-head Actions → separate activation handoff. |
| Deliverables | Proposal deliverables only. |
| Acceptance | Requirement scenarios and unchanged existing operations requirements. |
| Non-goals | Product/data semantics, resource-limit changes, host action, public cutover, or legacy mutation. |
| Operations deferred | Host installation and a new updater invocation remain in the activation change. |
| Stop/rollback conditions | Stop on projection widening, product drift, failed Actions, or external mutation. |

## ADDED Requirements

### Requirement: Production updater SQLite temporary storage SHALL use the Archive disk

The production updater SHALL set exactly
`SQLITE_TMPDIR=/var/lib/bgmss/archive` so SQLite file-backed temporary tables
and indices use the existing writable, disk-backed Archive bind mount instead
of the bounded `/tmp` tmpfs. This input SHALL apply only to updater. API and
Prometheus SHALL receive no `SQLITE_TMPDIR`; the updater's `/tmp` tmpfs,
resource limits, security controls, Archive mount, proxy behavior, and
publication transaction SHALL remain unchanged.

#### Scenario: Direct updater projection uses disk-backed SQLite temporary storage
- **WHEN** Compose renders a valid direct updater release
- **THEN** updater SHALL receive the exact fixed `SQLITE_TMPDIR`, API and Prometheus SHALL not receive it, and all three services SHALL retain their existing networks and resource/security settings

#### Scenario: Proxy updater projection uses the same disk-backed SQLite temporary storage
- **WHEN** Compose renders a valid proxy updater release
- **THEN** updater SHALL receive both the exact fixed `SQLITE_TMPDIR` and the exact dedicated proxy input while API and Prometheus receive neither

#### Scenario: SQLite temporary storage authority widens
- **WHEN** the value differs, resolves outside the Archive mount, appears on API or Prometheus, replaces `/tmp`, changes a resource/security/mount boundary, or becomes operator-controlled release state
- **THEN** operations verification and deployment SHALL fail before another production updater invocation
