## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | specified: approved; implemented: no; verified: main semantic/dependency review, strict change/all validation, and doctor passed |
| Owner | Contracts owner writes and verifies; Updater is read-only consumer. |
| Writable paths | `contracts/goldens/archive/index.json`, `contracts/goldens/archive/producer/**`, Contracts task markers. |
| Read-only protected inputs | `contracts/schemas/archive/**`, all existing goldens, updater/backend code, root specs, other changes/state. |
| Deletion complement | None. |
| Mutable refs | None. |
| Consumes | The corrected closed Archive contract and SQLite v1 authority. |
| Produces | Closed, indexed synthetic producer inputs and expected results. |
| Dependencies | Accepted `contracts-archive-manifest` after exited `correct-archive-subject-semantics`; no runtime implementation dependency. |
| Deliverables | Positive/accounting/failure cases, expected logical rows/counts/identity, updated exact index. |
| Acceptance | Closed inventory/hash verification and independent semantic review before updater apply. |
| Non-goals | Full downloaded Archive, schema changes, producer/backend implementation, activation or operations. |
| Operations deferred | Real acquisition, production data/root, scheduling, retention and deployment. |
| Stop/rollback conditions | Schema/meaning need or index drift stops this block; remove only its new candidate bytes. |

## ADDED Requirements

### Requirement: Contracts SHALL define producer cases before implementation

The Contracts owner SHALL first add strict, language-neutral cases under
`producer/**` for a complete seven-source valid build, identical regeneration,
identical duplicate, contract-permitted unresolved raw position,
malformed/unknown-field record, conflicting duplicate, missing required
reference, missing/extra source, and digest/size mismatch. Expected evidence
SHALL fix each input digest, exclusive accounting result, canonical logical
rows/counts, dataVersion inputs/result, and stable producer outcome. Every file
SHALL be regular, non-symlink, root-contained, and exactly indexed; no
downloaded full dump, secret, user data, pointer, or `current.json` is allowed.

#### Scenario: Contracts handoff precedes updater work
- **WHEN** all case bytes, expected results, hashes, and the closed index pass independent Contracts review
- **THEN** the Updater owner MAY consume them read-only
- **AND** any needed schema/semantic change SHALL stop for a separate Contracts-authority amendment rather than be implemented privately

#### Scenario: A producer failure case is evaluated
- **WHEN** one declared record/source/digest invariant is violated
- **THEN** the case SHALL name one bounded first failure and assert that no final Archive candidate exists
