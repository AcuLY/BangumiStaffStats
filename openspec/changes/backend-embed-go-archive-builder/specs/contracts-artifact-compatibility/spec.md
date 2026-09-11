## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Modified by `backend-embed-go-archive-builder` from Backend/Updater/Frontend assembly to Backend/Frontend assembly. |
| Owner | Contracts owns schemas, validators, compatibility assembly, artifact smoke coordination, and CI policy. |
| Writable paths | This delta spec, `contracts/artifacts/**`, and exact `.github/workflows/ci.yml` assertions declared by the change. |
| Read-only protected inputs | Product/design/query semantics, accepted Archive/OpenAPI/catalog contracts, component product source, real Archive data, production, hosts, remotes, and archived OpenSpec. |
| Deletion complement | Updater component schema branches, fixtures, statement emitter, smoke coordination, and updater-only CI assertions after Backend binding passes. |
| Mutable refs | Local `codex/embed-go-archive-builder` only. |
| Consumes | Strict Backend and Frontend artifacts/statements from one clean source identity, Backend producer-input evidence, and accepted Archive/OpenAPI compatibility. |
| Produces | Two-component compatibility manifest, validators, checksums/SBOM verification, artifact-only smoke, and read-only CI policy. |
| Dependencies | `backend-build-artifact`, `contracts-producer-runtime-inputs`, `contracts-application-release-identity`, and Frontend artifact authority. |
| Deliverables | Updated two-component schemas/fixtures/coordinator/tests and CI without Python Updater build or smoke. |
| Acceptance | Backend and Frontend assemble deterministically in either order; Backend binds builder inputs; smoke uses artifacts only; CI needs no uv/Python updater environment. |
| Non-goals | Weakening artifact evidence, modifying product behavior, publication/deploy authority, or removing unrelated development tooling. |
| Operations deferred | Registry, release, deploy, activation, host mutation, and live image retirement. |
| Stop/rollback conditions | Stop on mixed identity, missing Backend input binding, source-dependent smoke, nondeterminism, or protected mutation; roll back owned local output only. |

## ADDED Requirements

### Requirement: Backend component evidence SHALL bind the producer runtime manifest

Every `component: backend` statement SHALL contain exactly one sorted input
whose path is `contracts/producer-runtime-inputs-v1` and whose digest equals the
canonical manifest used to embed the Go Archive-builder inputs. The Backend
build metadata, JSON schema, and independent offline validator SHALL agree on
that digest and the governed catalog-input identity. They SHALL reject an
absent, duplicate, misnamed, malformed, reordered, or mismatched binding.

#### Scenario: A Backend artifact is verified offline
- **WHEN** its statement and build metadata contain the exact producer-runtime and catalog identities
- **THEN** Contracts binds those identities into the Backend component and final compatibility evidence

#### Scenario: Embedded runtime authority is unbound
- **WHEN** a required manifest/catalog binding is missing, duplicated, malformed, misnamed, reordered, or differs from built evidence
- **THEN** component verification fails before compatibility assembly or smoke

## MODIFIED Requirements

### Requirement: Component statements SHALL be strict cross-language handoffs

Contracts SHALL define one versioned closed schema for Backend and Frontend
component statements. Each statement SHALL bind exactly one component to one
clean candidate source revision/tree identity, target OS/architecture, pinned
toolchain and base-image facts where applicable, accepted Archive and OpenAPI
compatibility facts, a complete sorted artifact inventory, checksum inventory
digest, and SPDX SBOM digest. The Backend statement SHALL additionally bind
the exact producer-runtime and governed catalog identities embedded for the Go
Archive builder. Statements SHALL contain only normalized relative paths and
deterministic values and SHALL reject duplicate/unknown fields, absolute or
escaping paths, host/user identity, timestamps, randomness, and undeclared
artifacts.

Backend and Frontend are statement producers. Contracts is the schema and
validation authority and SHALL NOT rewrite a producer statement to make it
valid. No `component: updater` statement SHALL be admitted.

#### Scenario: Two valid component statements are offered
- **WHEN** Backend and Frontend each supply a schema-valid statement whose files, sizes, digests, source identity, platform, toolchain, and compatibility facts match its immutable artifact directory
- **THEN** Contracts accepts both statements without reading or modifying product source

#### Scenario: A statement is unsafe or does not describe its directory
- **WHEN** a statement has an unknown/duplicate field, unsafe path, host-dependent value, missing/extra file, wrong size/digest, substituted component identity, or names the retired Updater component
- **THEN** validation fails before any final manifest is written

### Requirement: The compatibility manifest SHALL have one Contracts authority

Contracts SHALL assemble canonical JSON only after the Backend and Frontend
component statements pass. The manifest SHALL bind their statement, artifact,
checksum-inventory, and SBOM digests to one source identity and compatible
target platform, the accepted Archive manifest/SQLite schema compatibility,
the Backend producer-input identity, and the exact OpenAPI digest used by
Backend and Frontend. It SHALL reject mixed source identities or platforms,
unsupported Archive ranges, OpenAPI drift, missing components, duplicate or
retired components, and any evidence not already validated.

No Backend or Frontend build helper SHALL decide or emit the final cross-layer
compatibility result.

#### Scenario: A compatible artifact set is assembled twice
- **WHEN** the same two validated statements are assembled in different input order
- **THEN** the canonical manifest bytes and SHA-256 digest are identical

#### Scenario: Independently valid components are incompatible together
- **WHEN** Backend and Frontend disagree on source identity, target platform, Archive compatibility, producer-input identity, or OpenAPI digest
- **THEN** assembly fails closed and emits no usable compatibility manifest

### Requirement: Local smoke SHALL execute artifacts rather than source

The smoke coordinator SHALL use a new disposable root, read-only Contracts
fixtures, and only assembled Backend and Frontend artifacts. It SHALL start the
built API against a disposable writable materialization of the accepted
valid-minimal Archive and verify `/livez`, `/readyz`, and `/metrics`; it SHALL
serve the built static frontend on loopback while verifying its entry document
and every referenced asset. It SHALL terminate processes and remove disposable
state on success or failure.

Smoke SHALL NOT import or mount product source, run a Python updater helper,
perform real Archive acquisition, modify an existing Archive root, use
Compose, or make undeclared external network requests. The checked-in
coordinator, smoke helpers, validators, and accepted fixture remain attested
control-plane inputs: their checkout SHALL be clean, match the assembled source
identity, contain only tracked regular non-symlink invoked paths, compare raw
Git bytes/modes, reject content-hiding flags, and remain unaffected by local
attributes, filters, excludes, or ignore-control files. Product subprocesses
SHALL run from disposable working directories with source absent from search
paths and mounts.

#### Scenario: An assembled compatible set is smoked
- **WHEN** the coordinator runs outside the source tree with source unavailable on module/search paths
- **THEN** API health/metrics and frontend static checks pass from immutable artifacts and the supplied fixture

#### Scenario: Smoke requires source or mutates protected input
- **WHEN** an artifact imports source, escapes its artifact/fixture root, mutates read-only contract/input bytes, writes outside disposable Archive state, leaves a process, or attempts an undeclared network request
- **THEN** smoke fails, performs bounded cleanup, and reports no successful artifact set

#### Scenario: The smoke control plane differs from the assembled candidate
- **WHEN** the checkout is dirty, its revision/tree differs, or an invoked helper, validator, or fixture is untracked, linked, or differs from `HEAD`
- **THEN** the coordinator fails before starting API or frontend smoke and emits no successful compatibility result

### Requirement: CI SHALL test and build without publication authority

The repository SHALL contain one GitHub Actions CI workflow with `contents:
read` only, pinned action revisions, exact Go/Node/npm/BuildKit toolchains,
Backend and Frontend component checks, reproducibility builds, two-component
compatibility assembly, and local smoke. It SHALL not install Python/uv for a
product Updater or build/verify an Updater component. Container output SHALL
remain local with `push=false`. The workflow SHALL have no write permission,
OIDC, secret-dependent step, environment, registry login, package/release
upload, tag, release, deploy, SSH, production host, or activation action. Its
final residue gate SHALL cover the Backend, Frontend, and Contracts artifact
roots and fail for every untracked/generated path outside tracked files and
declared `.tmp/**` subtrees.

#### Scenario: CI policy is audited
- **WHEN** Contracts tests parse workflow permissions, triggers, actions, commands, environments, component inventory, and data flow
- **THEN** only Backend/Frontend test, build, compatibility, and local-smoke behavior is accepted
- **AND** any Updater build, Python product environment, publication, deployment, credential, activation authority, or undeclared residue fails

### Requirement: CI toolchain identity SHALL be parsed semantically

The read-only artifact workflow SHALL verify exact Node 24.18.0, npm 11.16.0,
Go 1.26.5, Buildx 0.34.1, BuildKit 0.27.1, and the accepted pinned BuildKit
image through one tested repository-owned validator. The validator SHALL reject
malformed, ambiguous, missing, wrong-package, wrong-version,
conflicting-current-builder, wrong-driver, empty-node, or wrong-image evidence.
No uv identity or setup-uv action SHALL be required.

The workflow SHALL pin the accepted checkout v7.0.1, setup-go v7.0.0,
setup-node v7.0.0, and setup-buildx v4.2.0 releases by exact 40-hex commits. It
SHALL retain read-only permissions, remaining component gates, reproducibility,
compatibility assembly, local smoke, and residue audit without adding
publication or deployment authority.

setup-go SHALL install reviewed Go 1.26.4 as a bootstrap, not as the admitted
final GOROOT. Before any product gate, one exact preparation command SHALL
select Go 1.26.5 through `GOTOOLCHAIN=go1.26.5+auto` and an isolated
runner-temporary module cache. The semantic validator SHALL admit exact Go
1.26.5 from the same environment without accepting command stderr. The Backend
source gate SHALL independently use the bootstrap to select Go 1.26.5 inside
its component-owned module cache.

#### Scenario: Toolchain evidence is exact
- **WHEN** Node, npm, Go, Buildx, BuildKit, and the BuildKit image report the accepted semantic identities
- **THEN** CI accepts them without requiring Python or uv and continues to product gates

#### Scenario: Toolchain evidence is malformed or semantically wrong
- **WHEN** any output is malformed, ambiguous, names the wrong package, or reports a version/image outside the exact pins
- **THEN** the workflow fails before building artifacts

#### Scenario: Backend requires a component-contained final Go toolchain
- **WHEN** setup-go installed reviewed Go 1.26.4 and CI proceeds to the Backend source gate
- **THEN** the gate selects exact Go 1.26.5 inside `backend/.cache/go-mod` rather than use an external setup-go GOROOT

#### Scenario: Exact Go requires a first isolated download
- **WHEN** preparation selects Go 1.26.5 and emits one-time download progress before validation
- **THEN** preparation completes in the isolated runner cache and the subsequent validator remains stderr-free and fail-closed

### Requirement: Component compatibility SHALL bind release and rule identity

Every Backend and Frontend component statement SHALL contain
`applicationVersion=v0.1.0`. Its Archive compatibility object SHALL bind the
exact supported `domain-raw-v1` and `cast-exact-v1` pair plus the SHA-256
digest of the tracked compatibility matrix. The Backend statement SHALL also
bind the accepted producer-runtime/catalog identity. Contracts SHALL validate
these fields against root `VERSION` and tracked authorities rather than trust
producer-supplied arbitrary strings.

The final compatibility manifest SHALL carry the same application version,
rule pair/matrix digest, and Backend producer identity once, and SHALL reject a
missing component, retired Updater component, mixed version, mixed pair/digest,
or artifact/SBOM metadata disagreement.

#### Scenario: Two matching components assemble
- **WHEN** Backend and Frontend bind the root version and exact Archive pair and Backend binds the accepted producer identity
- **THEN** canonical assembly succeeds identically regardless of input order

#### Scenario: One component has a mixed identity
- **WHEN** one application version, rule token, matrix digest, or required Backend producer identity differs
- **THEN** assembly fails and emits no usable compatibility manifest

## REMOVED Requirements

### Requirement: Updater component evidence SHALL bind the producer runtime manifest

**Reason**: The Updater component statement and artifact are retired.

**Migration**: Apply `Backend component evidence SHALL bind the producer runtime manifest` and assemble only Backend plus Frontend.
