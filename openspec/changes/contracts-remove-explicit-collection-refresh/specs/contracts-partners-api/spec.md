## Capability Boundary

- **Status/Owner:** Modified; Contracts owns partners wire closure.
- **Writable paths:** Partners accepted spec and refresh-specific error fixtures/tests.
- **Read-only protected inputs:** Partners query/input/view/result semantics and archived changes.
- **Deletion complement:** Preserve strict closure, identity validation, scope-specific results, and collection metadata.
- **Mutable refs:** Local topic branch only.
- **Consumes/Produces:** Consumes shared query/partners components; produces the partners contract consumed by backend/frontend.
- **Dependencies/Deliverables:** Existing validators only; generic closure replaces refresh-specific wording.
- **Acceptance:** Partners contract checks and backend/frontend gates.
- **Non-goals/Operations deferred:** No partners evaluation change; no remote/live mutation.
- **Stop/rollback conditions:** Stop on contract conflict; roll back the isolated branch.

## MODIFIED Requirements

### Requirement: Partners wire SHALL be closed and scope-safe

`POST /api/v1/partners` SHALL accept a closed document containing `query`,
`input.source.personId`, a non-empty ordered-unique
`input.source.positionKeys`, optional `input.candidatePositionKey`, and optional
view. Source and candidate position keys SHALL belong to the effective query
and SHALL be treated as opaque catalog identities. Every undeclared member
SHALL be rejected.

Success SHALL return workUnit, source identity/metrics, complete summary with
fixed leaders, current items, pagination, request metadata, and personal-only
collection metadata. Global variants SHALL structurally omit all preference and
collection members.

#### Scenario: Candidate filter is omitted
- **WHEN** no candidatePositionKey is submitted
- **THEN** candidates from every query position SHALL be eligible without an `"all"` sentinel

#### Scenario: Global partner is returned
- **WHEN** a global request succeeds
- **THEN** preference and collection fields SHALL be absent rather than null
