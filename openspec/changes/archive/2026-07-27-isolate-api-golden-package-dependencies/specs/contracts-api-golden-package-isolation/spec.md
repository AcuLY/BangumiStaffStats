# contracts-api-golden-package-isolation Specification

## Purpose

Define package-local dependency ownership for API-golden verifiers so each
closed contract package runs from its own lock without a sibling project
install.

## ADDED Requirements

### Requirement: API-golden verifiers SHALL resolve only declared package-local dependencies

Each verifier below `contracts/goldens/api/{catalog,rankings,candidates,
person-detail,partners,co-star}` SHALL load `ajv@8.20.0` and
`ajv-formats@3.0.1` through normal ESM package resolution from its own exact
manifest and lock. A verifier SHALL NOT derive a dependency root from an
environment variable, construct a `node_modules` file URL, load from
Frontend or another sibling package, use `NODE_PATH`, or fall back to a
repository/global install.

The six package manifests and locks SHALL remain the dependency authorities.
Changing import ownership SHALL NOT change schema/OpenAPI/golden bytes,
business assertions, output facts, or generated wire.

#### Scenario: One package is installed independently

- **WHEN** any API-golden package receives only its own exact locked install
  and tracked repository contract inputs
- **THEN** `npm run verify` SHALL execute its complete existing assertions
  without any Frontend or sibling package installation

#### Scenario: A sibling dependency is reintroduced

- **WHEN** a verifier names a sibling/root `node_modules`, Frontend path,
  environment-controlled tool root, URL-built package file, or undeclared
  provider
- **THEN** the source-policy gate SHALL fail before the masked verifier can be
  accepted

### Requirement: Package isolation SHALL be a permanent repository gate

The repository's existing Contracts/CI policy test SHALL enumerate exactly the
six API-golden packages, verify their exact AJV dependency declarations and
package-local import shapes, and reject missing, extra, or reordered package
coverage. The final integrated acceptance SHALL additionally perform fresh
package-local installs and real verifier commands inside its isolated clone.

#### Scenario: Frontend happens to be installed

- **WHEN** a developer or CI job has an unrelated `frontend/node_modules`
- **THEN** the static policy SHALL still reject any verifier source that could
  consume it, and package-local verification SHALL remain authoritative

#### Scenario: All isolated packages pass

- **WHEN** all six exact package installs and verifier commands succeed with
  no sibling install available
- **THEN** the Contracts owner gate MAY continue, while any package failure or
  generated-root residue remains blocking
