## Why

Formal integrated acceptance at Harness
`865aba086a866ea6e3eecb0f30b5666145c87260` and Product
`49b24b11799ba4bbb8ddad400bd5245dc1716133` proved that the Rankings API
golden package cannot verify from its own locked install. Its verifier ignores
the package-local `ajv` and `ajv-formats` dependencies and instead loads
`frontend/node_modules`, which is absent in the isolated Contracts owner gate.
The same undeclared sibling dependency exists in Candidates, Person Detail,
Partners, and Co-Star. This owner defect must be fixed rather than hidden by
preinstalling Frontend or weakening final acceptance.

## What Changes

- Make the five affected API-golden verifiers resolve `ajv` and `ajv-formats`
  only through their own package manifests and locks.
- Remove every environment-controlled tool-root and literal sibling
  `node_modules` lookup from those verifiers.
- Add one repository test that closes all six API-golden package dependency
  boundaries, using the already-correct Catalog package as the reference.
- Re-run every API-golden package from an independent exact install with no
  Frontend install present, then re-seal development artifacts because source
  revision/tree identity changes.

No request, response, OpenAPI, schema, golden case, generated model, package
manifest, package lock, runtime behavior, or frontend appearance changes.

## Capabilities

### New Capabilities

- `contracts-api-golden-package-isolation`: package-local dependency ownership
  and regression gates for the six API-golden verifier packages.

### Modified Capabilities

None.

## Impact

### Status

- investigated: complete
- specified: complete
- implemented: no
- verified: no
- committed: no
- pushed: no
- released: no
- deployed: no

### Owner

- Specification, review, task markers, commit/archive lifecycle, candidate
  reseal, and final acceptance: main agent.
- Apply: one Contracts implementation subagent.

### Writable paths

- Apply implementation:
  - `contracts/goldens/api/rankings/verify.mjs`
  - `contracts/goldens/api/candidates/verify.mjs`
  - `contracts/goldens/api/person-detail/verify.mjs`
  - `contracts/goldens/api/partners/verify.mjs`
  - `contracts/goldens/api/co-star/verify.mjs`
  - `contracts/artifacts/test/ci-policy.test.mjs`
- OpenSpec lifecycle: only this change directory and its synchronized/archive
  output, owned by the main agent.

### Protected inputs

Every other path is read-only, especially all package manifests/locks,
Catalog, OpenAPI, schemas, golden cases/indexes, generated models,
Backend/Updater/Frontend/acceptance code, immutable artifacts, root documents,
sibling changes/specs, refs/remotes, external services, hosts, and secrets.

### Dependencies

The archived `expose-dynamic-catalog`, `expose-rankings`,
`expose-candidates`, `expose-person-detail`, `expose-partners`, and
`expose-co-star` API contract changes, plus the active
`complete-integrated-development-acceptance` owner-routing result. The
acceptance change is paused and read-only while this repair is active; this
change must be completed, synchronized, and archived before acceptance runs
again.

### Non-goals

Dependency upgrades, lock regeneration, business assertion changes, golden
resealing, generated-wire changes, frontend installation as a prerequisite,
acceptance-harness repair, publication, release, deployment, or operations.
