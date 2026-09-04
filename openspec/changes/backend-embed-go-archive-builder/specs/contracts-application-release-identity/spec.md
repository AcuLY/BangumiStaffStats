## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Modified by `backend-embed-go-archive-builder` from three distributable components to Backend plus Frontend. |
| Owner | Contracts owns release identity; Backend and Frontend emit their component evidence. |
| Writable paths | This delta spec and exact application-version/component-statement validators, fixtures, and tests declared by the change. |
| Read-only protected inputs | Root `VERSION`, product/UI behavior, Archive compatibility authority, unrelated contracts/artifacts, production, hosts, remotes, and archived OpenSpec. |
| Deletion complement | Updater release-identity fixture/schema branches and assertions only after Backend builder identity is bound. |
| Mutable refs | Local `codex/embed-go-archive-builder` only. |
| Consumes | Root version, clean source revision/tree, Backend builder/input evidence, and Frontend artifact evidence. |
| Produces | One two-component application release identity with builder identity carried by Backend. |
| Dependencies | `backend-build-artifact`, `contracts-producer-runtime-inputs`, and `contracts-artifact-compatibility`. |
| Deliverables | Updated validators/schemas/fixtures proving Backend and Frontend agreement without an Updater component. |
| Acceptance | Both distributable component statements bind one version/source; Backend additionally binds its embedded builder inputs; no Updater identity is required. |
| Non-goals | Changing `VERSION`, exposing version in the UI, changing Archive/public API semantics, or release publication. |
| Operations deferred | Tag, registry, release, deployment, and live image retirement. |
| Stop/rollback conditions | Stop on mixed source/version/input identity or frontend presentation drift; roll back owned local changes. |

## MODIFIED Requirements

### Requirement: One root version SHALL identify the application release candidate

Repository-root `VERSION` SHALL be strict UTF-8 containing exactly `v0.1.0`
plus one LF. Every distributable Backend and Frontend artifact SHALL bind that
value and the exact clean source revision/tree. Language package versions MAY
remain independently meaningful but SHALL NOT replace or contradict the
application version. No separate Updater artifact identity SHALL be required.

#### Scenario: Clean component artifacts are built
- **WHEN** Backend and Frontend are each built twice from the same clean revision/tree
- **THEN** their version-bearing bytes and evidence SHALL be reproducible and both statements SHALL report `v0.1.0`

#### Scenario: Version authority or source identity is dirty
- **WHEN** `VERSION` is malformed, differs from the required release candidate, or build inputs do not match the declared clean revision/tree
- **THEN** the build SHALL fail before emitting a usable statement

### Requirement: Backend binary and artifact identities SHALL agree

The distributable `bgmss-api` binary SHALL contain link-time `Version=v0.1.0`
and the exact 40-hex source revision. Source/development execution MAY use
`dev` and `unknown`. API observability build metadata, bundle metadata, OCI
version/revision labels, Backend component statement, and SPDX package
`versionInfo` SHALL agree with the binary identity. Backend evidence SHALL also
bind the exact producer-runtime manifest and governed catalog-input identity
embedded for the Go Archive builder. No second distributable Backend command
or separate Updater identity SHALL be required or emitted.

#### Scenario: Packaged binary is inspected
- **WHEN** the API binary and OCI image are read from a Backend artifact
- **THEN** binary inspection, labels, metadata, statement, SPDX, and embedded builder-input evidence SHALL agree on version, revision, and input identity

#### Scenario: Build flags or evidence disagree
- **WHEN** the API binary lacks identity or any label, metadata, dependency, or builder-input evidence value differs
- **THEN** Backend artifact verification SHALL fail

## ADDED Requirements

### Requirement: Frontend artifact SHALL bind version without UI change

Frontend static artifact metadata, component statement, and SPDX package
`versionInfo` SHALL bind the root application version and exact source
identity. No frontend template, component, style, copy, interaction state,
route, responsive rule, or runtime behavior SHALL change to expose it.

#### Scenario: Frontend artifact is verified
- **WHEN** its immutable artifact directory is inspected
- **THEN** every version-bearing evidence record SHALL equal `v0.1.0` and the accepted source identity

#### Scenario: Frontend release binding changes presentation
- **WHEN** a version implementation changes a frontend UI/runtime source path or rendered oracle behavior
- **THEN** acceptance SHALL reject the change

## REMOVED Requirements

### Requirement: Updater and Frontend artifacts SHALL bind version without UI change

**Reason**: The Updater artifact is removed and release assembly now has only Backend and Frontend components.

**Migration**: Carry builder/input identity in the Backend statement and apply `Frontend artifact SHALL bind version without UI change` to the remaining presentation component.
