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

## MODIFIED Requirements

### Requirement: The HTTP lifecycle SHALL be bounded and cancellation-safe

The standard-library server SHALL enforce 5s read-header, 10s read, 125s write,
60s idle, 64 KiB header, 120s request, and existing 5s graceful-shutdown
bounds. It SHALL propagate client/process cancellation and the derived
deadline to downstream work. If the deadline wins before response commit, it
SHALL emit 504 `UPSTREAM_TIMEOUT`, `retryable=true`, initialized empty
`fieldErrors`, request ID, and no dataVersion. If client or shutdown
cancellation wins before commit, it SHALL write no synthetic status or body.
After commit, timeout, cancellation, or panic SHALL NOT overwrite or append
another response. A pre-commit panic SHALL become one sanitized
`INTERNAL_ERROR`. Serving SHALL stop without leaked goroutines after shutdown.

#### Scenario: Work is canceled or exceeds its deadline
- **WHEN** a test handler waits on its request context and the client cancels, the deadline expires, or process shutdown begins before or after commit
- **THEN** downstream observes the exact context outcome, only an uncommitted deadline emits the bounded 504 envelope, cancellation emits no synthetic response, and no committed response is overwritten
- **AND** serving finishes within its bound while race/leak checks pass
