# contracts-artifact-compatibility Specification

## Purpose
Define strict cross-language component evidence, deterministic compatibility assembly, artifact-only local smoke, and development-only CI authority.

## Capability Boundary

| Field | Declaration |
|---|---|
| Status | investigated: complete; specified: complete after strict validation; implemented and verified: complete; committed: `c1e0623ddd14ba678a32b082d7e16d2e66017606`; pushed: `origin/codex/formal-rewrite`; released: no; deployed: no |
| Owner | Contracts owner within the combined Frontend/Contracts apply group; it alone assembles cross-component compatibility. |
| Writable paths | `contracts/artifacts/**` and `.github/workflows/ci.yml`. Generated local output is confined to ignored `contracts/artifacts/.tmp/**`. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, `tmp-formal-development/**`, oracle `644b7748674e553f863d0ffd61d029f86fdc0717`, root OpenSpec outside this change, `contracts/openapi/openapi.yaml`, `contracts/schemas/**`, `contracts/goldens/**`, Backend/Updater/Frontend source and owner-local artifact outputs, external repositories, refs/remotes, registries, hosts, secrets, and production state. |
| Deletion complement | None. |
| Mutable refs | None. |
| Consumes | Strict owner-local component statements/artifacts; accepted Archive/OpenAPI schemas and valid-minimal fixture; existing component test/build commands. |
| Produces | Statement/manifest schemas and validators, final compatibility manifest, artifact checksum/SBOM verification, artifact-only local smoke coordinator, and test/build-only CI. |
| Dependencies | Exact direct IDs: `produce-immutable-archive`, `derive-position-catalog-and-cast`, `implement-backend-archive-consumer`, `implement-backend-http-and-observability`, `implement-image-proxy`, `implement-query-result-set`, `implement-statistics-series-sort-evidence`, `expose-dynamic-catalog`, `admit-public-collection-client`, `implement-bounded-query-cache`, `expose-rankings`, `expose-candidates`, `expose-person-detail`, `expose-partners`, `expose-co-star`, `implement-frontend-query-shell`, `implement-frontend-ranking-results`, `implement-frontend-person-inspector`, `implement-frontend-co-star-vertical`, `harden-frontend-design-and-accessibility`; all active changes must also be completed/archived before apply. |
| Deliverables | Versioned JSON schemas, canonical assembler/verifier, negative fixtures/tests, smoke coordinator, local-output ignore rules, and `.github/workflows/ci.yml`. |
| Acceptance | Offline strict validation, tamper/mix/path negative cases, deterministic repeated assembly, artifact-only smoke, CI policy audit, exact paths, no residue, strict OpenSpec, and diff hygiene. |
| Non-goals | Modifying component source, defining product behavior, signing/publication, release/deploy, Compose, activation, or production configuration. |
| Operations deferred | Production Compose/nginx/systemd/timers, secrets/TLS/host paths, Archive activation/restart/rollback/cleanup, registry/release/deploy/SSH, production monitoring/SLO, cutover/migration/retirement. |
| Stop/rollback conditions | Stop on incomplete dependencies, unapproved spec, component/path overlap, malformed/mixed/nondeterministic evidence, source-dependent smoke, publication/deploy/activation logic, or protected/external mutation. Roll back only uncommitted owned files and ignored `.tmp` output. |

## Requirements

### Requirement: Component statements SHALL be strict cross-language handoffs

Contracts SHALL define one versioned closed schema for Backend, Updater, and
Frontend component statements. Each statement SHALL bind exactly one component
to one clean candidate source revision/tree identity, target OS/architecture,
pinned toolchain and base-image facts where applicable, accepted Archive and
OpenAPI compatibility facts, a complete sorted artifact inventory, checksum
inventory digest, and SPDX SBOM digest. It SHALL contain only normalized
relative paths and deterministic values and SHALL reject duplicate/unknown
fields, absolute or escaping paths, host/user identity, timestamps, randomness,
and undeclared artifacts.

Backend, Updater, and Frontend are statement producers. Contracts is the schema
and validation authority and SHALL NOT rewrite a producer statement to make it
valid.

#### Scenario: Three valid component statements are offered

- **WHEN** each owner supplies a schema-valid statement whose recorded files,
  sizes, digests, source identity, platform, toolchain, and compatibility facts
  match its immutable artifact directory
- **THEN** Contracts accepts each statement without reading or modifying that
  owner's product source

#### Scenario: A statement is unsafe or does not describe its directory

- **WHEN** a statement has an unknown/duplicate field, unsafe path,
  host-dependent value, missing/extra file, wrong size/digest, or substituted
  component identity
- **THEN** validation fails before any final manifest is written

### Requirement: The compatibility manifest SHALL have one Contracts authority

Contracts SHALL assemble canonical JSON only after all three component
statements pass. The manifest SHALL bind their statement, artifact,
checksum-inventory, and SBOM digests to one source identity and compatible
target platform, the accepted Archive manifest/SQLite schema compatibility,
and the exact OpenAPI digest used by Backend and Frontend. The manifest SHALL
reject mixed source identities or platforms, unsupported Archive ranges,
OpenAPI drift, missing components, duplicate components, and any component
evidence not already validated.

No Backend, Updater, or Frontend build helper SHALL decide or emit the final
cross-layer compatibility result.

#### Scenario: A compatible artifact set is assembled twice

- **WHEN** the same three validated statements are assembled in different
  input order
- **THEN** the canonical manifest bytes and SHA-256 digest are identical

#### Scenario: Independently valid components are incompatible together

- **WHEN** component statements disagree on source identity, target platform,
  Archive compatibility, or OpenAPI digest
- **THEN** assembly fails closed and emits no usable compatibility manifest

### Requirement: Checksums and SPDX SBOMs SHALL describe immutable bytes

Each component SHALL have one sorted SHA-256 inventory covering every
distributed file and one deterministic SPDX 2.3 JSON document describing the
exact component artifact digest and complete locked runtime dependency closure.
Contracts SHALL validate both offline. SPDX namespaces/IDs SHALL derive from
content, not random values; the document SHALL omit build host paths,
credentials, environment dumps, and nondeterministic timestamps.

#### Scenario: Artifact evidence is complete and unchanged

- **WHEN** the verifier reads an assembled component directory
- **THEN** every non-evidence artifact appears exactly once in the checksum
  inventory, every digest/size matches, and the SPDX document describes that
  same artifact and its locked runtime closure

#### Scenario: A file, checksum, or SBOM is altered

- **WHEN** a file is added, removed, renamed, or modified, or an SPDX package or
  described digest is missing or changed
- **THEN** offline verification fails before smoke

### Requirement: Local smoke SHALL execute artifacts rather than source

The smoke coordinator SHALL use a new disposable root, read-only Contracts
fixtures, and only assembled artifacts. It SHALL run updater `doctor` and
`contract-check`; start the built API against a disposable materialization of
the accepted valid-minimal Archive and verify `/livez`, `/readyz`, and
`/metrics`; and serve the built static frontend on loopback while verifying its
entry document and every referenced asset. It SHALL terminate processes and
remove disposable state on success or failure.

The smoke SHALL NOT import or mount product source, modify an existing Archive
root or pointer, run updater `produce`, activate an Archive, use Compose, or
make undeclared external network requests.

The checked-in coordinator, smoke helpers, validators, and accepted fixture are
test control-plane inputs. Before invoking them, the coordinator SHALL prove
that their canonical checkout is clean, its `HEAD` and tree exactly equal the
assembled manifest source identity, and every invoked control-plane path is a
tracked regular non-symlink file from that tree. A dirty, substituted, or
mismatched helper/fixture SHALL fail before a product process starts.
The clean-checkout proof SHALL compare raw Git blob bytes and executable modes,
reject content-hiding `assume-unchanged` and `skip-worktree` flags, and remain unaffected by repository-local
attributes, filters, exclude configuration, or an untracked ignore-control
file.
Product subprocesses SHALL use disposable working directories with product source
absent from import/search paths and no source mount.
The coordinator SHALL invoke each attested smoke helper successfully under its
sanitized environment, including `PYTHONSAFEPATH=1` and without ambient
`PYTHONPATH`. A Python helper MAY load only its attested sibling control-plane
modules by an explicit path derived from the helper's own real location; it
SHALL NOT make `updater/src`, the repository root, or any product-source
directory importable.

#### Scenario: An assembled compatible set is smoked

- **WHEN** the coordinator is run from outside the source tree with the source
  unavailable on module/search paths
- **THEN** updater, API health/metrics, and frontend static checks pass from
  immutable artifacts and the supplied read-only fixture

#### Scenario: Smoke requires source or mutates its fixture

- **WHEN** an artifact imports source, escapes its artifact/fixture root,
  modifies artifact or fixture bytes, leaves a process behind, or attempts an
  undeclared network request
- **THEN** smoke fails, performs bounded cleanup, and reports no successful
  artifact set

#### Scenario: The coordinator launches the Updater smoke with a sanitized environment

- **WHEN** the coordinator invokes the checked-in Updater smoke helper from a
  disposable working directory with `PYTHONSAFEPATH=1`, no ambient
  `PYTHONPATH`, and product source absent from import paths
- **THEN** the helper resolves only its attested sibling control-plane module
  and completes the immutable Updater artifact smoke

#### Scenario: The smoke control plane differs from the assembled candidate

- **WHEN** the checkout is dirty, its revision/tree differs from the manifest,
  or an invoked helper, validator, or accepted fixture is untracked, a symlink,
  or differs from `HEAD`
- **THEN** the coordinator fails before starting updater, API, or frontend
  smoke and emits no successful compatibility result

### Requirement: CI SHALL test and build without publication authority

The repository SHALL contain one GitHub Actions CI workflow with `contents:
read` only, pinned action revisions, exact toolchains, existing component
checks, reproducibility builds, compatibility assembly, and local smoke.
Container output SHALL remain local with `push=false`. The workflow SHALL have
no write permission, OIDC, secret-dependent step, environment, registry login,
package/release upload, tag, release, deploy, SSH, production host, or
activation action.
Its final residue gate SHALL cover all four owned artifact roots and fail for
every untracked or generated path outside their tracked files and declared
`.tmp/**` subtrees.

#### Scenario: CI policy is audited

- **WHEN** Contracts tests parse the workflow permissions, triggers, actions,
  commands, environments, and data flow
- **THEN** only test/build/local-smoke behavior is accepted and any
  publication, release, deployment, credential, activation authority, or
  undeclared non-temporary residue fails the test

### Requirement: Artifact compatibility SHALL remain development-only

The capability SHALL make no production readiness, resource, SLO, release,
deployment, migration, activation, or rollback-drill claim. It SHALL create no
Compose file, production configuration, registry/release/deploy workflow,
secret, remote mutation, or `update_activated` event.

#### Scenario: Development artifacts pass all gates

- **WHEN** reproducibility, checksum, SBOM, compatibility, smoke, CI policy, and
  strict validation pass
- **THEN** the only allowed conclusion is that local development artifacts are
  ready for integrated development acceptance and operations remain unstarted
