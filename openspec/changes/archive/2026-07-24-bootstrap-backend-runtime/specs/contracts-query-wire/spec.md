## MODIFIED Requirements

### Requirement: Versioned single-authority contract bundle

The Contracts owner SHALL publish the v1 shared-query authority as JSON Schema
draft 2020-12 files under `contracts/schemas/query/**`, referenced by stable
named components in `contracts/openapi/openapi.yaml` using OpenAPI 3.1 and the
2020-12 dialect. Stable components SHALL include `SharedQueryV1`,
`EffectiveQueryV1`, and `QueryDigestProjectionV1` in addition to the named
input/view/error/share components. Every schema object SHALL reject undeclared
properties, every `$ref` SHALL resolve within the approved contract roots, and
the initial OpenAPI document SHALL define no business endpoint path or result
DTO.

Formal consumers SHALL generate from this authority without maintaining a
second schema source. A compatible generator MAY read the referenced authority
directly. A generator that cannot consume its external JSON Schema references
MAY instead use a deterministic consumer-local projection that copies the
authority, removes only proven generator-incompatible schema metadata, and
fully dereferences it with a pinned tool. Every projection SHALL be disposable,
shall preserve the exact 17-component semantic inventory, and shall neither
modify `contracts/**` nor be committed.

API query version selection SHALL be the `/api/v1` family plus versioned schema
IDs/component names; a query-body `schemaVersion` or other undeclared version
field SHALL be rejected. Share version selection SHALL use its explicit outer
`v1` marker.

#### Scenario: Both generators consume one authority

- **WHEN** the TypeScript 6 frontend generator reads the referenced authority directly and the Go foundation generates from its deterministic disposable projection
- **THEN** both types-only outputs SHALL cover all 17 named component schemas without unresolved references or schema-level errors
- **AND** no projection, schema copy, temporary tool installation, or generated consumer file outside its approved owner path SHALL persist

#### Scenario: An undeclared body version is submitted

- **WHEN** a v1 query contains `schemaVersion`, even when its value is `1`
- **THEN** v1 validation fails with the stable unknown-field classification
- **AND** the field is not ignored or used to select another schema

#### Scenario: A nested control plane is proposed

- **WHEN** apply output contains an `openspec/` root or generated OpenSpec skill set below `contracts/`, `backend/`, `frontend/`, `updater/`, `apps/`, or `packages/`
- **THEN** acceptance fails and no implementation commit is authorized
