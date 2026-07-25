## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | Integration acceptance amendment; implementation pending. |
| Owner | Backend test implementation agent. |
| Writable paths | `backend/internal/catalog/*_test.go`, new `backend/internal/app/catalog_archive_integration_test.go`, only the two stale partners/co-star expected outcomes and co-star participant literals `1/2` → `100/101` in `backend/internal/app/run_test.go`, only deletion of the seven obsolete base-catalog normalization SQL statements in `backend/internal/query/archive_loader_test.go`, only the canonical-base fixture-helper corrections in `backend/internal/{ranking,candidates,partners,persondetail,costar}/service_test.go` declared below, and only that new path's inventory line in `backend/scripts/check.sh`. |
| Read-only protected inputs | Backend production code, every other `run_test.go` request/expectation/assertion, every query helper statement that adds staff74/staffset/custom test data or reseals its bundle, every service test outside the exact helper corrections, and all checker logic outside the one inventory line, canonical Archive fixture, schemas/goldens/verifiers, Updater, frontend, external state. |
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
API projection for the bounded governed positions, groups, capabilities, and
rules. The Backend checker's closed inventory SHALL include the new disjoint
integration-test path; no checker logic is changed. Because those rows now
advertise the accepted partners/co-star capabilities, the existing application
route test SHALL expect both requests to pass capability admission and stop at
the deliberately missing analytics boundary with `503 NOT_READY`, rather than
the obsolete `400 CAPABILITY_NOT_AVAILABLE`. That co-star request SHALL use
the fixture's existing participants `100/101`, not the obsolete nonexistent
`1/2`, so entity validation cannot mask the dependency boundary.

The test SHALL fail if Contracts again emits a governed catalog row shape that
the bounded fixture contract does not permit. Backend's existing rejection of
the superseded fixture-only rule/member/group forms SHALL remain intact; no
compatibility normalizer or alternate dialect is admitted.

Backend tests that extend the canonical fixture SHALL treat its corrected
catalog rows as the base. A helper MAY remove only its now-obsolete SQL that
normalized the seven legacy staff/cast/shortcut rows; it SHALL preserve every
statement that adds producer-test-only staff74, staff-set, capability, custom
group data, and bundle identity resealing. The helper SHALL NOT rewrite the
canonical base into a second dialect.

Service tests SHALL likewise express only their intentional delta from the
canonical base. Ranking, candidates, and partners negative-capability helpers
SHALL delete exactly one corresponding `cast:anime:main` capability row,
verify one affected row, decrement the copied manifest count, and reseal.
Partners SHALL retain its extra-person delta but SHALL NOT reinsert the
canonical positive staff capability. Person detail SHALL use the corrected
copy without mutation. Co-star SHALL retain only its person-102 cast-credit
delta, verify exactly one affected row, and reseal. No helper SHALL normalize
already canonical rules or represent unsupported capability as `supported=0`.

#### Scenario: The checked-in minimal Archive crosses the runtime boundary

- **WHEN** the unmodified bundle is loaded and the catalog route is requested
- **THEN** readiness and catalog both return 200, dataVersion agrees, and the
  response validates against the accepted catalog wire/golden semantics
- **AND** no test setup updates catalog SQL after loading

#### Scenario: Corrected capabilities reach the next runtime boundary
- **WHEN** the existing application route test requests partners and co-star
  through the corrected minimal Archive
- **THEN** both routes return `503 NOT_READY` for unavailable analytics
- **AND** neither route is rejected as `CAPABILITY_NOT_AVAILABLE`
- **AND** the co-star request uses existing fixture people `100/101`

#### Scenario: Contracts and runtime drift again

- **WHEN** Archive accepts a nominally valid bundle whose catalog rows violate
  the governed Updater/catalog identity semantics
- **THEN** the cross-boundary test SHALL fail before commit
- **AND** the failure SHALL not be hidden by Backend translation or a
  test-local database rewrite

#### Scenario: A query test extends the canonical fixture
- **WHEN** the producer-catalog query helper prepares staff74/staff-set/custom
  test rows
- **THEN** it SHALL add only those test-specific rows to the already canonical
  base and reseal the copied bundle
- **AND** it SHALL contain no legacy base-row normalization statements

#### Scenario: A service test needs one unsupported capability
- **WHEN** ranking, candidates, or partners prepares its existing negative
  cast-main capability case
- **THEN** it deletes exactly that one capability row and reseals the copied
  manifest with the exact decremented table count
- **AND** no canonical positive capability, rule, or unrelated row changes

#### Scenario: A service test needs no catalog delta
- **WHEN** person detail loads the corrected base or co-star prepares only its
  person-102 cast-credit case
- **THEN** person detail performs no fixture rewrite and co-star changes exactly
  one cast-credit row before resealing
- **AND** neither helper rewrites canonical selection rules or capabilities
