## MODIFIED Requirements

### Requirement: Query wire generation SHALL be deterministic and types-only

Exact `@hey-api/openapi-ts@0.99.0` with only bundled
`@hey-api/typescript` SHALL generate exactly
`src/api/generated/query-wire/types.gen.ts` from the shared OpenAPI authority.
The output SHALL cover all 14 named components and include no SDK, client,
runtime, schema copy, index barrel, store, or business logic. Configuration
SHALL set `entryFile: false`, `clean: true`, `source: false`, the `.gen`
filename suffix, `enums: false`, and `topType: 'unknown'`.

#### Scenario: Generated types are current

- **WHEN** check mode regenerates from the unchanged contract
- **THEN** the result SHALL contain the exact component inventory and byte-match the committed file

#### Scenario: Generation drifts or expands

- **WHEN** a component is missing, bytes differ, or another generated artifact/runtime appears
- **THEN** acceptance SHALL fail

### Requirement: The wire adapter SHALL reject incompatible unknown values

The sole adapter SHALL compile the authoritative JSON Schemas with strict Ajv
2020-12/formats, accept `unknown`, return generated-type-derived validated wire
aliases only after structural success, and map failure to bounded decode errors.
It SHALL not normalize, digest, interpret catalog membership, compute
statistics, or expose wire values directly to UI/store code.

#### Scenario: Shared positive values are consumed

- **WHEN** the declared query/error/view positive cases run
- **THEN** each SHALL validate and return the corresponding typed wire value

#### Scenario: Structural negative runs

- **WHEN** an unknown/forbidden field, unsafe integer/page, invalid UTF-8/JSON, or trailing-data case runs
- **THEN** the matching decoder SHALL reject it without mutating the input
