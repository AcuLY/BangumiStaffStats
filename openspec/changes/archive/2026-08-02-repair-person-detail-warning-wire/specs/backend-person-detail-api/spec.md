## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Existing capability correction; no contract or semantic expansion. |
| Owner | Backend. |
| Writable paths | `backend/internal/persondetail/service.go`, `backend/internal/persondetail/service_test.go`, this delta, and later synchronization into `openspec/specs/backend-person-detail-api/spec.md`. |
| Read-only protected inputs | `contracts/schemas/person-detail/**`, person-detail goldens and generated consumers, frontend adapters, all other Backend paths, and production data. |
| Deletion complement | No deletion. |
| Mutable refs | Local and remote repair branch plus the exact production application refs declared by the parent change; no data, contract, Nginx, timer, or legacy refs. |
| Consumes | Existing person-detail success schema and admitted collection freshness state. |
| Produces | A contract-conforming fresh personal success envelope and automated regression evidence. |
| Dependencies | Existing `contracts-person-detail-api`, `backend-public-collection-source`, `backend-person-detail-api`, and transactional operations deployment capability. |
| Deliverables | `warningCodes: []` for fresh personal detail, unchanged stale behavior, and unchanged global behavior. |
| Acceptance | RED on the deployed nil-slice implementation; GREEN on the corrected implementation; complete Product workflow; live schema-valid response and rendered detail. |
| Non-goals | Contract relaxation, nullable warnings, frontend fallback, new warning codes, statistics changes, cache-key changes, or collection refresh changes. |
| Operations deferred | Any operation beyond the exact user-authorized application deployment in the parent change, including Archive update, Nginx/systemd/timer changes, tag/release, merge, and legacy retirement. |
| Stop/rollback conditions | Stop on protected-input drift, unrelated dirty paths, failed regression/schema/Product gate, or any need to alter the existing contract. Roll back production only through the existing application rollback command. |

## ADDED Requirements

### Requirement: Personal detail collection warnings SHALL have a total array wire shape

For every successful personal-scope `POST /api/v1/person-detail` response, the Backend producer SHALL serialize `meta.collection.warningCodes` as the array required by the existing person-detail success schema. A fresh collection SHALL use the empty array and a stale collection SHALL use the existing singleton warning array. The frontend and every generated consumer SHALL continue validating the unchanged contract; they SHALL NOT accept `null` as a compatibility fallback.

#### Scenario: Fresh personal collection has no warnings
- **WHEN** a personal-scope person-detail request succeeds using a fresh admitted collection with no warning codes
- **THEN** the response SHALL contain `meta.collection.stale: false` and `meta.collection.warningCodes: []`
- **AND** the response SHALL validate against the existing person-detail success schema

#### Scenario: Stale personal collection retains its warning
- **WHEN** a personal-scope person-detail request succeeds using an admitted stale collection
- **THEN** the response SHALL contain `meta.collection.stale: true` and `meta.collection.warningCodes: ["COLLECTION_STALE"]`

#### Scenario: Null warning collection is produced
- **WHEN** a successful personal detail envelope would serialize `meta.collection.warningCodes` as `null`
- **THEN** Backend regression and contract validation SHALL fail before artifact or production admission

#### Scenario: Global detail remains collection-free
- **WHEN** a global-scope person-detail request succeeds
- **THEN** the existing global envelope SHALL remain unchanged and SHALL NOT gain personal collection metadata
