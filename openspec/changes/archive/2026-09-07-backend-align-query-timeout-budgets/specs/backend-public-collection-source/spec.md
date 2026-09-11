## Capability Boundary

| Field | Scope |
| --- | --- |
| Status | Specified; apply follows strict validation and primary review. |
| Owner | Capability prefix owner, implemented by primary agent. |
| Writable paths | Corresponding exact capability source/test/doc paths in proposal.md Impact and this delta. |
| Read-only protected inputs | Higher authorities, contracts, dependency module, other active changes and unrelated dirty work. |
| Deletion complement | No source deletion. |
| Mutable refs | None. |
| Consumes | Existing capability and the user-approved budgets. |
| Produces | Bounded runtime/template behavior and focused tests. |
| Dependencies | Existing app composition and shared timeout ownership; no import boundary changes. |
| Deliverables | Updated implementation, docs and accepted specification. |
| Acceptance | Focused and affected-component gates in tasks.md. |
| Non-goals | Upstream DTO repair, new UI or dependencies. |
| Operations deferred | All production and remote actions; local restart is separately authorized in this session. |
| Stop/rollback conditions | Stop on conflict or overlap; preserve prior rate edit and unrelated work. |

## ADDED Requirements

### Requirement: Public collection attempts SHALL have an explicit bounded policy

The production anonymous provider SHALL apply a process-shared rate of five
requests per second with burst ten and a 10-second timeout for each outbound
HTTP attempt. Pagination, limiter waiting and retry backoff SHALL stay within
the independent 90-second complete-collection budget. Existing concurrency,
retry count, Retry-After behavior and sanitized failure handling SHALL remain.

#### Scenario: An outbound page attempt begins
- **WHEN** the production provider sends a collection page request
- **THEN** the request SHALL carry an effective deadline no later than ten seconds after attempt start or its parent worker deadline, whichever is earlier