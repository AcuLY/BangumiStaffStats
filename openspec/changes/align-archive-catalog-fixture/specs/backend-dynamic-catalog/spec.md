## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | Integration acceptance amendment; implementation pending. |
| Owner | Backend test implementation agent. |
| Writable paths | `backend/internal/catalog/*_test.go` and new `backend/internal/app/catalog_archive_integration_test.go` only. |
| Read-only protected inputs | Backend production code, canonical Archive fixture, schemas/goldens/verifiers, Updater, frontend, external state. |
| Deletion complement | No deletion or disposable residue. |
| Mutable refs | None. |
| Consumes | Corrected checked-in canonical Archive bundle and existing catalog runtime. |
| Produces | Real unchanged-fixture projection/application regression coverage. |
| Dependencies | Existing Go packages/toolchain only. |
| Deliverables | Focused integration test and command evidence. |
| Acceptance | Repeated/race focused tests, full Backend check, runtime smoke, strict OpenSpec. |
| Non-goals | Backend production change or legacy rule normalization. |
| Operations deferred | Release, deploy, activation and production serving. |
| Stop/rollback conditions | Stop if production code, fixture mutation, contract relaxation, external write, or overlapping path is required. |

## MODIFIED Requirements

### Requirement: Acceptance SHALL prove cross-language parity and preserve scope

In addition to unit/golden/property acceptance, Backend tests SHALL load the
checked-in canonical `contracts/goldens/archive/valid/minimal` bundle through
the real Archive consumer without first rewriting any SQLite row. The loaded
Store SHALL project successfully through `catalog.Project`, and application
integration SHALL prove `/readyz` returns 200 and `GET /api/v1/catalog`
returns a strict 200 envelope with the same Store dataVersion and canonical
API rule projection.

The test SHALL fail if Contracts again emits a rule identity/value shape that
the governed Updater does not produce. Backend's existing rejection of the
superseded fixture-only rule form SHALL remain intact; no compatibility
normalizer or alternate dialect is admitted.

#### Scenario: The checked-in minimal Archive crosses the runtime boundary

- **WHEN** the unmodified bundle is loaded and the catalog route is requested
- **THEN** readiness and catalog both return 200, dataVersion agrees, and the
  response validates against the accepted catalog wire/golden semantics
- **AND** no test setup updates catalog SQL after loading

#### Scenario: Contracts and runtime drift again

- **WHEN** Archive accepts a nominally valid bundle whose catalog rows violate
  the governed Updater/catalog identity semantics
- **THEN** the cross-boundary test SHALL fail before commit
- **AND** the failure SHALL not be hidden by Backend translation or a
  test-local database rewrite
