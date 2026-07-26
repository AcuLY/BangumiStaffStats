## Capability Boundary

| Field | Contract |
|---|---|
| Status | Tightened offline component evidence; not released or deployed. |
| Owner | Contracts. |
| Writable paths | Exact component statement schema/emitter/validator and affected Contracts artifact tests declared by this change. |
| Read-only protected inputs | Product artifacts/source, other component semantics, remotes, hosts, and production. |
| Deletion complement | None. |
| Mutable refs | None during apply. |
| Consumes | Canonical producer-runtime input manifest v1 and existing Updater component metadata. |
| Produces | Required logical manifest digest in every Updater component statement. |
| Dependencies | Existing component statement v1 and compatibility validator. |
| Deliverables | Schema/emitter/validator rule and positive/negative fixtures. |
| Acceptance | Schema/manual validation, emitter test, missing/duplicate/wrong-path negatives, full artifact/coordinator tests. |
| Non-goals | Changing Backend/Frontend statements, component compatibility semantics, packaging, release, or deploy. |
| Operations deferred | Release assembly, transfer, deployment, and activation. |
| Stop/rollback conditions | Fail closed on absent/ambiguous input or any unrelated statement compatibility change. |

## ADDED Requirements

### Requirement: Updater component evidence SHALL bind the producer runtime manifest

Every `component: updater` statement SHALL contain exactly one sorted input
whose path is `contracts/producer-runtime-inputs-v1` and whose digest equals the
canonical producer-runtime manifest used by the artifact build. The Contracts
statement emitter SHALL derive it only from the exact manifest digest supplied
in Updater build metadata. The JSON schema and independent offline validator
SHALL reject an absent, duplicate, misnamed, malformed, or reordered binding.
Backend and Frontend input requirements SHALL remain unchanged.

#### Scenario: An Updater artifact is verified offline
- **WHEN** its statement contains the exact producer-runtime manifest input
- **THEN** Contracts binds that digest into the component and final compatibility evidence

#### Scenario: Embedded runtime authority is unbound
- **WHEN** the manifest input is missing, duplicated, misnamed, malformed, or differs from build metadata
- **THEN** component verification fails before compatibility assembly or smoke
