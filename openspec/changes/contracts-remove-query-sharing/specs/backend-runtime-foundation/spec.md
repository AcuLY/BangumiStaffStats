## MODIFIED Requirements

### Requirement: Query DTOs SHALL be generated only at the HTTP boundary

Exact `oapi-codegen/v2@v2.8.0` with `models,skip-prune` SHALL consume a
backend-local deterministic projection of the shared OpenAPI authority and
generate only `backend/internal/httpapi/wire/query_wire.gen.go`. The projector
SHALL copy the OpenAPI document and six schemas, delete only schema-root
`$id`/`$schema`, prove all 14 components, and use locked Redocly `2.40.0` to
fully dereference them below `backend/.tmp/`. It SHALL copy the accepted
contract package metadata/lock into a backend-local temporary tool root and
SHALL never install, write, or leave generated state below `contracts/**`.
Check mode SHALL independently reproduce the bundle and Go output, prove byte
stability against shared manifest evidence, and compare the committed file.

#### Scenario: Generated query model is current

- **WHEN** generation check runs against the unchanged shared contract and accepted lock
- **THEN** the bundle SHALL match shared byte/hash evidence and the non-empty Go output SHALL contain all 14 components and match the committed file

#### Scenario: Generation drifts or expands scope

- **WHEN** output differs, is header-only, mutates contracts, leaves a projection/tool install, or includes handlers/clients/private schemas
- **THEN** acceptance SHALL fail

### Requirement: Go SHALL consume selected query cases directly

Tests SHALL decode shared positive and structural-negative query cases through
generated DTOs and a strict one-value JSON decoder. They SHALL NOT implement
normalization, digest, catalog, result, or statistics.

#### Scenario: Minimum positive cases are consumed

- **WHEN** the valid personal and global cases are decoded
- **THEN** both SHALL be accepted through the generated adapter

#### Scenario: Selected structural negatives are consumed

- **WHEN** the declared unknown-field, forbidden-field, unsupported-version, or trailing-data cases run
- **THEN** each SHALL be rejected with its contract-declared identity
