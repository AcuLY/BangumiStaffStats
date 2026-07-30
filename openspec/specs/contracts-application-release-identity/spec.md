# contracts-application-release-identity Specification

## Purpose
TBD - created by archiving change close-release-readiness-identities. Update Purpose after archive.
## Requirements
### Requirement: One root version SHALL identify the application release candidate

Repository-root `VERSION` SHALL be strict UTF-8 containing exactly `v0.1.0`
plus one LF. Every distributable Backend, Updater, and Frontend artifact SHALL
bind that value and the exact clean source revision/tree. Language package
versions may remain independently meaningful but SHALL NOT replace or
contradict the application version.

#### Scenario: Clean component artifacts are built
- **WHEN** each component is built twice from the same clean revision/tree
- **THEN** its version-bearing bytes and evidence SHALL be reproducible and all three statements SHALL report `v0.1.0`

#### Scenario: Version authority or source identity is dirty
- **WHEN** VERSION is malformed, differs from the required release candidate, or build inputs do not match the declared clean revision/tree
- **THEN** the build SHALL fail before emitting a usable statement

### Requirement: Backend binary and artifact identities SHALL agree

Distributable `bgmss-api` and `archive-smoke` binaries SHALL contain link-time
`Version=v0.1.0` and the exact 40-hex source revision. Source/development
execution MAY use `dev` and `unknown`. API observability build metadata, bundle
metadata, OCI version/revision labels, Backend component statement, and SPDX
package `versionInfo` SHALL agree with the binary identity.

`archive-smoke --build-info` SHALL be an exclusive, side-effect-free mode that
emits one canonical JSON object containing version and revision. It SHALL
reject Archive-validation arguments in the same invocation. Normal
Archive-validation mode and API behavior SHALL remain unchanged.

#### Scenario: Packaged binaries are inspected
- **WHEN** both binaries and the OCI image are read from a Backend artifact
- **THEN** binary inspection, build-info output, labels, metadata, statement, and SPDX SHALL agree on version/revision

#### Scenario: Build flags or evidence disagree
- **WHEN** either binary lacks identity or any label/metadata/evidence value differs
- **THEN** Backend artifact verification SHALL fail

### Requirement: Updater and Frontend artifacts SHALL bind version without UI change

Updater bundle/image metadata, OCI labels, component statement, and SPDX
package `versionInfo` SHALL bind the root application version. Frontend static
artifact metadata, component statement, and SPDX SHALL bind the same version.
No frontend template, component, style, copy, interaction state, route,
responsive rule, or runtime behavior SHALL change to expose it.

#### Scenario: Updater and Frontend artifacts are verified
- **WHEN** their immutable artifact directories are inspected
- **THEN** every version-bearing evidence record SHALL equal `v0.1.0` and the source identity

#### Scenario: Frontend release binding changes presentation
- **WHEN** a version implementation changes a frontend UI/runtime source path or rendered oracle behavior
- **THEN** acceptance SHALL reject the change
