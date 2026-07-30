## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | specified correction; implementation and verification pending |
| Owner | Bounded correction owner for the accepted Go consumer; main agent accepts |
| Writable paths | Only `backend/internal/archive/contract.go`, `backend/internal/archive/golden_test.go`, `backend/internal/archive/contracttest/archive_contract_test.go`, `backend/internal/archive/mutation_test.go`, `backend/internal/archive/state_test.go`, and declared OpenSpec paths |
| Read-only protected inputs | All other backend code, producer candidate, updater/catalog/frontend, other contracts/specs, refs/remotes, hosts, and production |
| Deletion complement | Only the exact active-to-archive OpenSpec move; no backend deletion |
| Mutable refs | The single accepted local correction commit; stash lifecycle belongs to the recovery owner |
| Consumes | Corrected `contracts-archive-manifest`, matrix, DDL, and fixed-path canonical corpus |
| Produces | Matching consumer schema seal and contract-test evidence |
| Dependencies | Contracts correction complete in the same candidate and producer candidate isolated |
| Deliverables | Corrected seal constant and raw-domain/canonical-corpus tests |
| Acceptance | Targeted/full/race/vet/build and all shared golden outcomes pass |
| Non-goals | Producer, query/statistics implementation, HTTP changes, writes, activation, or compatibility fallback |
| Operations deferred | Restart, deploy, release, host mutation, and production |
| Stop/rollback conditions | Stop on contract drift, extra backend path, fallback need, or consumer mutation of Archive bytes |

## ADDED Requirements

### Requirement: Consumer SHALL bind only the corrected raw-domain Archive v1

The Go consumer SHALL bind its schema-object count/digest to the corrected
compatibility matrix and SHALL execute the unchanged-path-set canonical corpus.
Contract tests SHALL query the corrected minimal fixture and prove that raw
cast roles and relation codes are SQLite integers, all five normalized subject
types are readable, code `2` and code `3` retain their stored source direction,
and no discarded text-normalized draft value is accepted.

The consumer SHALL remain read-only and SHALL not derive series or cast-query
semantics while loading. It validates the corrected shared authority; later
backend domain work applies the accepted main/all and series predicates.

#### Scenario: Corrected canonical bundle is loaded

- **WHEN** the corrected manifest, SQLite bytes, schema digest, object seal,
  dataVersion, and table counts agree
- **THEN** the existing candidate loader SHALL accept the bundle
- **AND** contract queries SHALL return the exact numeric raw-domain sentinels

#### Scenario: Discarded draft identity is supplied

- **WHEN** a bundle carries the prior draft schema/object/dataVersion identity
  or text-normalized cast/relation data
- **THEN** the existing fixed validation precedence SHALL reject it
- **AND** no fallback tuple or content rewrite SHALL run
