## Capability Boundary

| Field | Declaration |
|---|---|
| Status | specified; implementation pending |
| Owner | Contracts |
| Writable paths | `contracts/artifacts/**` |
| Read-only protected inputs | Component source/output outside Contracts, external state |
| Deletion complement | None; ignored `.tmp` cleanup only |
| Mutable refs | None |
| Consumes | Root VERSION, exact Archive tuple, three component statements |
| Produces | Version/rule-bound component validation and final manifest |
| Dependencies | Existing `contracts-artifact-compatibility`, updated Archive authority |
| Deliverables | Schemas, validators, assembler, fixtures, tests |
| Acceptance | Strict validation, repeated canonical assembly, mixed-version/rule negatives, artifact smoke |
| Non-goals | Rewriting component evidence or product behavior |
| Operations deferred | Signing, publishing, deploying, activation |
| Stop/rollback conditions | Stop on missing/mixed identity, schema ambiguity, nondeterminism, or protected mutation |

## ADDED Requirements

### Requirement: Component compatibility SHALL bind release and rule identity

Every Backend, Updater, and Frontend component statement SHALL contain
`applicationVersion=v0.1.0`. Its Archive compatibility object SHALL also bind
the exact supported `domain-raw-v1` and `cast-exact-v1` pair plus the
SHA-256 digest of the tracked compatibility matrix. Contracts SHALL validate
these fields against root `VERSION` and that tracked matrix rather than
trusting producer-supplied arbitrary strings.

The final compatibility manifest SHALL carry the same application version and
rule pair/matrix digest once, and SHALL reject a missing component, mixed
version, mixed pair/digest, or a component statement whose artifact/SBOM
metadata disagrees.

#### Scenario: Three matching components assemble
- **WHEN** all validated components bind the root version and exact Archive pair
- **THEN** canonical assembly SHALL succeed identically regardless of input order

#### Scenario: One component has a mixed identity
- **WHEN** one application version or rule token differs
- **THEN** assembly SHALL fail and emit no usable compatibility manifest
