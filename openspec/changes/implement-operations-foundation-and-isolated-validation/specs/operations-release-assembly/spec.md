# operations-release-assembly Specification

## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Investigated: complete; specified: complete only after strict validation and main-agent approval; implemented: no; verified: no; committed: no; pushed: no; released: no; deployed: no. |
| Owner | Operations release/workflow apply group. |
| Writable paths | `operations/package.json`, `operations/package-lock.json`, `operations/lib/**`, `operations/release/**`, `operations/schemas/release-*.schema.json`, `operations/test/helpers/**`, `operations/test/release/**`, `.github/workflows/operations.yml`, `.github/workflows/release.yml`, `.github/workflows/deploy.yml`, and only the exact root `.gitignore` addition `/operations/.tmp/`; generated output only below ignored `operations/.tmp/**`. |
| Read-only protected inputs | Root authorities and oracle; all OpenSpec outside this change; `VERSION`; `.github/workflows/ci.yml`; `contracts/artifacts/**`; accepted immutable Backend/Updater/Frontend artifact roots; all `backend/**`, `updater/**`, `frontend/**`, and other `contracts/**`; runtime/recovery/validation owner paths; external refs, registries, releases, environments, secrets, hosts, and production state. |
| Deletion complement | None. Generated release output may be removed only below a proven run-owned `operations/.tmp/**` root. |
| Mutable refs | Only the listed repository worktree files. Running tag, registry, GitHub Release, production Environment, SSH, or deploy mutations is not authorized by this capability apply. |
| Consumes | Archived `complete-integrated-development-acceptance` with exact status `development-acceptance-closed-by-authorized-ci-and-remote-evidence`; frozen product revision/tree `3f585cfe0a0dd61fe783a839528fef25470a58db`/`93e29a0c51c0305db8a43e7d029b8eaa3014a1b8`; acceptance implementation, green Actions, isolated remote targeted/exception/unexecuted-cell/cleanup/audit evidence; accepted product build definitions, statement/compatibility schemas and validators, toolchain/base identities; explicit prior-artifact status `not-materialized-for-authorized-closure`; `VERSION`; reviewed exact Actions/toolchain identities. This owner creates rather than consumes the new `linux/amd64` component artifacts. |
| Produces | A canonical accepted-development receipt; isolated-validation AMD64 candidate and tag-release candidate/published-release schemas, validators, and assemblers; checksum inventory; immutable AMD64 provenance; operations verification workflow; protected-tag release workflow; approval-gated deploy workflow; and negative policy tests. |
| Dependencies | `complete-integrated-development-acceptance`, `contracts-rewrite-baseline`, `contracts-application-release-identity`, `contracts-artifact-compatibility`, `backend-build-artifact`, `updater-build-artifact`, and `frontend-build-artifact`. Dependency direction is product artifacts and Contracts → Operations release assembly → runtime/validation consumers; Operations never writes upstream evidence. |
| Deliverables | The exact writable files, reproducibility/provenance/policy tests, and ephemeral candidate output below `operations/.tmp/**`. |
| Acceptance | Exact frozen-product and clean-controller identity gates; exact AMD64 double build from two isolated product checkouts; offline newly built component/compatibility verification; deterministic candidate/manifest/checksums; image graph and frontend/archive-smoke binding; negative tamper/mix/platform/path cases; locked dependency/tool audit; workflow permissions/triggers/action-pin/secret/data-flow audit; strict OpenSpec; exact paths; residue; and diff hygiene. |
| Non-goals | Product rebuild logic replacement, product semantic/schema changes, source edits, multi-architecture release, production build, mutable tags as authority, signing/attestation not consumed by deploy, publication during this apply, Environment/secret creation, SSH execution, or host activation. |
| Operations deferred | Executing the release workflow, pushing GHCR, creating a GitHub Release/tag, configuring GitHub Environments/secrets, dispatching deploy, and any production/legacy mutation. |
| Stop/rollback conditions | Stop before output on incomplete acceptance, dirty/mixed product or controller identity, frozen-source/build-contract drift, wrong platform/version, invalid newly built evidence, nondeterminism, unsafe archive/path, dependency/tool drift, secret exposure, workflow over-privilege, or any external mutation attempt. Roll back only uncommitted owned files and run-owned `operations/.tmp/**`; never rewrite upstream product/contracts/artifacts to make them pass. |

## ADDED Requirements

### Requirement: An accepted-development receipt SHALL anchor Operations

Operations SHALL contain one canonical, immutable
`operations/release/accepted-development.json` derived from the
main-agent-audited authorized CI/remote acceptance lifecycle bundle. The
receipt SHALL bind exact lifecycle status
`development-acceptance-closed-by-authorized-ci-and-remote-evidence`, frozen
product revision/tree, acceptance implementation revision, green Actions
head/tree/run ID and conclusion, archived acceptance lifecycle commit, remote
source/runtime identity and package/targeted test counts, the one narrowly
classified Linux fixture exception, the explicit unexecuted formal-cell set,
cleanup and zero-P0/P1 audit facts, root application version, and accepted
build/statement/compatibility contract digests. It SHALL record exact
`priorDevelopmentArtifacts.status=not-materialized-for-authorized-closure`,
contain no prior component/compatibility byte digest, and explain that
ephemeral CI output is not a reusable Operations input. The receipt SHALL
contain neither a formal result digest nor a synthesized
`development-accepted-operations-pending` verdict. Repository gates SHALL
verify every repository-resolvable field and fail if the receipt or its
recorded authority drifts.

#### Scenario: Operations reads the accepted receipt
- **WHEN** the canonical receipt, archived acceptance lifecycle evidence, Git objects, root version, and accepted contract/build digests all agree
- **THEN** its frozen product identity may authorize AMD64 validation assembly and later tag-baseline comparison

#### Scenario: Acceptance evidence is missing or reinterpreted
- **WHEN** a lifecycle/CI/remote/exception/unexecuted-cell/OID/contract fact is absent, changed, unresolved, a formal verdict or prior artifact identity is synthesized, or ephemeral CI output is marked deployable
- **THEN** Operations verification and release stop before building

### Requirement: Operations validation assembly SHALL rebuild the frozen accepted product identity

Operations SHALL admit only the exact product revision/tree frozen by the
archived authorized development-acceptance lifecycle bundle. A run-owned
isolated checkout of that identity SHALL prove clean index, tracked worktree,
modes, untracked
non-ignored set, and absence of content-hiding flags before invoking its
accepted build definitions. The operations controller revision/tree SHALL be
recorded separately and SHALL NOT replace the product identity embedded in
Backend, Updater, Frontend, or compatibility evidence. Accepted Darwin/ARM64
artifact bytes prove prior development acceptance but SHALL NOT be relabeled,
retagged, or reused as `linux/amd64`.

#### Scenario: The frozen product is rebuilt for isolated validation
- **WHEN** the archived authorized receipt, exact isolated product checkout, accepted build definitions/contracts/toolchains, and operations controller identity all pass
- **THEN** Operations may create fresh unpublished validation component statements and bytes whose product source is the frozen accepted revision/tree and whose target is `linux/amd64`

#### Scenario: Product or evidence drift is present
- **WHEN** the frozen product revision/tree differs, its isolated checkout is dirty, a build definition/contract/tool identity drifts, or an ARM64 artifact is offered as an AMD64 input
- **THEN** assembly fails before generating, retagging, uploading, or overwriting release output

### Requirement: The AMD64 validation candidate SHALL be reproducible and closed

The operations verification path SHALL invoke the frozen product's accepted
component build entrypoints twice from distinct isolated clean checkouts and
caches for target `linux/amd64`, independently validate the newly generated
statements, compare every component and compatibility byte, and assemble one canonical
`validation-candidate-v1.json`. The candidate SHALL bind application version,
product source revision/tree, operations controller revision/tree, target, all
three statement and artifact-set digests,
the compatibility-manifest digest, Backend and Updater OCI archive bytes and
verified OCI manifest/config identities, the Backend `archive-smoke` member,
the Frontend static tar, and one sorted checksum inventory. It SHALL declare
itself unpublished and SHALL contain neither a registry credential nor a
deployable mutable tag.

The coordinator SHALL use the exact admitted Node 24.18.0/npm 11.16.0 rather
than the host default, set the Docker default platform to `linux/amd64`, bind
the selected Buildx/BuildKit identities, and require real Backend, Updater, and
coordinator AMD64 execution smokes. An advertised platform without working
QEMU/binfmt execution SHALL fail closed.

#### Scenario: The same frozen AMD64 validation inputs are assembled twice
- **WHEN** two fresh builds and two validation-candidate assemblies use the same clean authority and exact toolchains
- **THEN** all component directories, compatibility manifest, candidate document, checksum inventory, and release payload bytes are byte-identical

#### Scenario: An artifact set is mixed or not AMD64
- **WHEN** a component has another source/tree/platform, the OCI graph is not one `linux/amd64` image, `archive-smoke` is absent or mismatched, or Frontend/compatibility evidence differs
- **THEN** no validation candidate is emitted and no existing content address is changed

#### Scenario: The host default toolchain or AMD64 emulator is unsuitable
- **WHEN** PATH selects another Node/npm, Docker defaults to the host platform, the admitted builder lacks AMD64, or a generated-image smoke cannot execute through the admitted binfmt path
- **THEN** the build stops without accepting statements, assembling a candidate, or relabeling an ARM64 result

### Requirement: A tag release candidate SHALL build the tagged commit

The release workflow SHALL NOT publish or promote the earlier isolated
validation candidate. For a protected version tag, it SHALL check out and
build the tag's own exact commit twice, as required by the operations guide.
Before build it SHALL verify the tag commit descends from the frozen accepted
product, its product/build/contract inputs remain byte-identical to the
accepted baseline, and every intervening change is confined to accepted
`contracts/acceptance/**` control-plane restoration/fixes through exact commit
`b56ce858733b18875df3101a423c6d1b356eed54`, the exact archived
development-acceptance lifecycle/main-spec paths, or accepted Operations and
OpenSpec lifecycle paths. Every product/build/non-acceptance-Contracts
authority blob and executable mode SHALL remain byte-identical to the frozen
baseline. Newly built component statements and compatibility evidence SHALL
bind the tag commit revision/tree. One canonical tag-release candidate SHALL
also bind the frozen accepted-product receipt and the tag's Operations
controller identity.

#### Scenario: A reviewed Operations tag is prepared for release
- **WHEN** the tag/version, exact tag checkout, accepted-baseline authority comparison, exact acceptance-control plus Operations/lifecycle delta, two clean `linux/amd64` builds, and new evidence all pass
- **THEN** a tag-release candidate bound to that one tag commit may proceed to publication

#### Scenario: The tag differs in product or build semantics
- **WHEN** any product/build/non-acceptance-Contracts authority differs from the accepted baseline or an intervening path is outside the exact acceptance-control/Operations/lifecycle scope
- **THEN** the workflow fails before registry login or release output

### Requirement: The published release manifest SHALL bind final distribution identities

`release.yml` SHALL derive one canonical `release-manifest.json` only from an
accepted tag-release candidate and the final immutable GHCR digests returned for
the exact Backend and Updater images. The manifest SHALL include the protected
release tag, root application version, frozen accepted-product receipt,
tag release source revision/tree, Operations controller revision/tree,
`linux/amd64`,
both image digests, Frontend archive digest/size, release checksum digest,
compatibility-manifest digest, exact OpenAPI digest, Archive
manifest/SQLite/domain/cast compatibility, and the reviewed Prometheus image
digest. Production deployment SHALL accept only this published form and
SHALL reject a local candidate, tag-only image, unknown field, non-canonical
JSON, or digest/compatibility mismatch.

#### Scenario: A tag release is promoted without changing bytes
- **WHEN** the final registry image identities are proven to contain the candidate image configs/layers and every other candidate byte is unchanged
- **THEN** one canonical published manifest and checksum set binds all final distribution identities

#### Scenario: Registry or manifest identity drifts
- **WHEN** a returned image digest, image content, release tag/version, source identity, Frontend checksum, Prometheus pin, or compatibility field disagrees
- **THEN** release creation fails closed and deploy cannot consume the partial state

### Requirement: Operations verification SHALL remain read-only

`.github/workflows/operations.yml` SHALL run on relevant pull requests,
ordinary pushes, and manual verification with `contents: read` only. It SHALL
install exact reviewed tools, use frozen locks, run release/runtime/validation
policy tests, build and compare local `linux/amd64` artifacts, assemble and
verify an unpublished candidate, and audit residue. It SHALL not read secrets,
log in to a registry, upload a release, use OIDC, select an Environment, use
SSH, invoke a host, or activate any deployment.

#### Scenario: An ordinary branch is verified
- **WHEN** the operations workflow runs for a pull request or branch push
- **THEN** all output remains runner-local and the workflow has no publication or host-mutation authority

#### Scenario: Read-only policy is weakened
- **WHEN** permissions, triggers, actions, commands, environments, secret data flow, or uploads add release/deploy authority
- **THEN** repository-owned workflow policy tests fail

### Requirement: Release publication SHALL be tag-bound and least-privileged

`.github/workflows/release.yml` SHALL run only for a protected `v*` tag whose
value exactly equals root `VERSION` and whose commit is the checkout it builds.
It SHALL use pinned third-party Action commits, one release concurrency key,
job-scoped minimum `contents: write` and `packages: write`, fresh reproducible
AMD64 assembly, exact registry login scope, immutable image digest
verification, and one GitHub Release containing the Frontend tar,
`release-manifest.json`, compatibility manifest, and checksums. It SHALL not
use a self-hosted runner, production secret, SSH, deployment Environment,
`latest`, source build on the server, or unverified attestation.

#### Scenario: A protected version tag is released
- **WHEN** tag/version/source, double builds, evidence, registry digests, canonical manifest, and checksums all pass
- **THEN** the workflow may publish exactly the two digest-addressed images and one immutable release asset set from that commit

#### Scenario: A release is rerun or partially exists
- **WHEN** the version/tag, GHCR names, or GitHub Release already resolve to conflicting bytes or provenance
- **THEN** the workflow stops without replacing, blessing, or deleting the conflicting state

### Requirement: Deploy automation SHALL consume rather than rebuild

`.github/workflows/deploy.yml` SHALL be manual, concurrency-serialized, and
gated by the GitHub `production` Environment. Only its deploy job may read the
declared SSH secret. It SHALL accept a strict release version plus
release-manifest digest, download and verify the existing published release,
and invoke one root-managed fixed remote command with only those bounded
arguments. It SHALL not check out product source on the server, build, pass
arbitrary shell text/path/host values, follow a mutable tag, or maintain a
second deployment implementation. The remote command's final success/failure
SHALL determine the Actions result.

#### Scenario: An approved existing release is dispatched
- **WHEN** Environment approval, concurrency, manifest/checksum verification, and bounded arguments pass
- **THEN** deploy invokes the single fixed server entry and reports its final result

#### Scenario: Dispatch input could become a command
- **WHEN** version/digest input is malformed, contains metacharacters, selects a different host/path, or lacks a complete immutable release
- **THEN** the job fails before SSH and exposes no secret

### Requirement: Release tooling SHALL not leak or retain secrets

Release tooling, manifests, archives, image layers, build arguments, logs,
test fixtures, workflow artifacts, and generated checksums SHALL contain no
SSH key, registry credential, Environment secret, user token, host credential,
or non-public Vite value. Repository examples SHALL name only secret
interfaces and use inert placeholders. Tools SHALL redact bounded diagnostic
values and SHALL never dump complete environments.

#### Scenario: Secret-shaped input reaches a release surface
- **WHEN** policy fixtures place a canary credential in environment, config, build args, logs, or candidate bytes
- **THEN** the gate fails and the canary appears in no accepted output

#### Scenario: Normal release evidence is audited
- **WHEN** the closed output inventory and logs are scanned
- **THEN** only public release identities, digests, compatibility facts, and inert interface names are present
