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

### Requirement: The repository proxy template SHALL accommodate query budgets

The repository Nginx location for `/v2/api/v1/` SHALL use a 130-second
`proxy_read_timeout`, leaving room for the backend's 120-second request and
125-second HTTP write bounds. Connection timeout and the accepted legacy-root
and `/v2/` route contract SHALL remain unchanged. Updating this template SHALL
NOT imply that a production vhost has been modified or deployed.

#### Scenario: A valid query takes longer than the old proxy wait
- **WHEN** an operator later deploys this reviewed template and an otherwise valid API response takes longer than 35 seconds but less than the backend request budget
- **THEN** the proxy SHALL not interrupt it because of the old 35-second upstream read timeout