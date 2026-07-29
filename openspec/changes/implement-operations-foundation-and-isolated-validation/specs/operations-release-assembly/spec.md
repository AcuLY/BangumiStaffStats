# operations-release-assembly Specification

## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Investigated: complete; specified: complete only after strict validation and main-agent approval; implemented: no; verified: no; committed: no; pushed: no; released: no; deployed: no. |
| Owner | Operations release/workflow apply group. |
| Writable paths | `operations/.gitignore`, `operations/package.json`, `operations/package-lock.json`, `operations/lib/**`, `operations/release/**`, `operations/schemas/release-*.schema.json`, `operations/test/helpers/**`, `operations/test/release/**`, `.github/workflows/operations.yml`, `.github/workflows/release.yml`, `.github/workflows/deploy.yml`, and only the exact root `.gitignore` addition `/operations/.tmp/`; generated output only below ignored `operations/.tmp/**`. |
| Read-only protected inputs | Root authorities and oracle; all OpenSpec outside this change; `VERSION`; `.github/workflows/ci.yml`; `contracts/artifacts/**`; accepted immutable Backend/Updater/Frontend artifact roots; all `backend/**`, `updater/**`, `frontend/**`, and other `contracts/**`; runtime/recovery/validation owner paths; external refs, registries, releases, environments, secrets, hosts, and production state. |
| Deletion complement | None. Generated release output may be removed only below a proven run-owned `operations/.tmp/**` root. |
| Mutable refs | Only the listed repository worktree files. Running tag, registry, GitHub Release, production Environment, SSH, or deploy mutations is not authorized by this capability apply. |
| Consumes | Final acceptance-free Product revision/tree with exact-head green Development Actions; corrected descendant Harness implementation revision/tree; descendant archived `refresh-integrated-development-acceptance` revision/tree with exact status `development-acceptance-closed-by-authorized-ci-and-remote-evidence`; exact ancestry and Product/Harness byte-and-mode difference proof restricted to receipt-declared acceptance/lifecycle paths; immutable Product and Harness source archives/inventories; Product-owned Updater targeted evidence; Harness-owned package/supervisor/targeted evidence with no accepted exception; superseded failed-run/unexecuted-cell/cleanup/audit evidence; thirteen Product build definitions including `updater/build/runtime_prune.py`; statement/compatibility schemas and validators, toolchain/base identities; explicit prior-artifact status `not-materialized-for-authorized-closure`; `VERSION`; reviewed exact Actions/toolchain identities. This owner creates rather than consumes the new `linux/amd64` component artifacts. |
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
main-agent-audited refreshed CI/remote acceptance lifecycle bundle. The
receipt SHALL bind exact lifecycle status
`development-acceptance-closed-by-authorized-ci-and-remote-evidence`, final
acceptance-free Product revision/tree, descendant Harness implementation
revision/tree, descendant Harness archive revision/tree, exact Product →
Harness implementation → Harness archive ancestry, and exact-head green
Development Actions whose head/tree equal Product. It SHALL bind two immutable
source archives produced with exact internal prefix `source/`, with
size/mode/content-inventory digests; one complete sorted
Git byte-and-mode difference inventory whose allowed paths are closed to the
acceptance harness and its exact active/archived lifecycle/main-spec paths;
Product-owned Updater targeted command/count/TAP/log evidence; Harness-owned
package verification, supervisor and selected targeted command/count/TAP/log
evidence, with every accepted test passing and no accepted exception. The
selected-target manifest SHALL retain the corrected H3 task order and exactly
21 names. It SHALL include these three names in positions eight through ten:

- `Linux process inventory uses only bounded procfs evidence and exact argv/cwd identity`
- `owned Linux cleanup rejects PID reuse or argv drift before signaling`
- `Darwin process inventory preserves absolute ps and lsof behavior`

It SHALL exclude the three superseded names
`Backend query measurement rejects loopback or broader network access before execution`,
`Backend materialization command remains primary while every safe authority check and boundary evidence completes`,
and `Backend-check sandbox permits ephemeral loopback HTTP and denies public TCP`,
plus every test declared to skip on Linux. The receipt SHALL also bind remote
runtime/container identities; superseded failed-run classifications; the
explicit unexecuted formal-cell set; cleanup and
zero-P0/P1 audit facts; and root application version. It SHALL bind exactly
thirteen Product-revision build definitions, with
`updater/build/runtime_prune.py` ordered between `updater/build/check.py` and
`updater/build/smoke.py`, plus Product-bound statement/compatibility contract
digests and `VERSION`. It SHALL record exact
`priorDevelopmentArtifacts.status=not-materialized-for-authorized-closure`,
contain no prior component/compatibility byte digest, and explain that
ephemeral CI output is not a reusable Operations input. The receipt SHALL
contain neither a formal result digest nor a synthesized
`development-accepted-operations-pending` verdict. Repository gates SHALL
verify every repository-resolvable field, recompute ancestry and the complete
Product/Harness Git difference inventory, and fail if the receipt or any
recorded authority drifts. Harness evidence SHALL never be represented as
having run from Product.

Each source-archive identity SHALL mean the actual transferred bytes produced
by exact argv
`git archive --format=tar --prefix=source/ --output=<run-owned-file> <revision>`.
Its archive mode is the outer run-owned transfer file mode; its closed member
inventory binds the `source/` path prefix, each Git-derived member type/mode,
size, and content digest. An unprefixed controller-only tar is a different
artifact and SHALL NOT satisfy or be conflated with this field. Verification
SHALL hash and count the complete run-owned file without buffering the full
archive into a bounded diagnostic capture.

Accepted `testEvidence` SHALL contain only the final successful Product and
Harness executions: every selected test passes, no exception/waiver object is
present, and Harness package, supervisor, and selected-target evidence binds
the Harness implementation revision. Every earlier failed or interrupted
attempt SHALL be represented only in a separate closed
`supersededAttempts` inventory that binds its run/evidence identity,
classification, unexecuted scope, cleanup result, and non-acceptance status.
Each attempt SHALL retain its actual historical source revision. Parsing SHALL
reject Product or the later archive as that source; repository verification
SHALL prove strict Product `<` source `<=` final Harness ancestry. Multiple
failed runs MAY share one source revision, but every superseded run ID SHALL
remain unique and disjoint from both accepted run IDs.
The evidence-bundle descriptor SHALL declare its schema/path/size/digest and
the exact accepted and superseded run identities it contains.

The acceptance audit SHALL bind its scope, Product/Harness/archive revisions,
the exact Development Actions log digest, all other required reviewed
evidence/program digests, and zero P0/P1 result. Protected-state
evidence SHALL bind the exact projection algorithm and executed seal-program
digest, the exact transmitted before/after raw-byte descriptors, and their
equal semantic seal digest. A count alone, an unscoped audit, a mutable Docker
projection, or a serialized script template that was not the executed bytes
SHALL fail closed.

#### Scenario: Operations reads the accepted receipt
- **WHEN** the canonical receipt, Product → Harness implementation → Harness archive ancestry, exact allowed Product/Harness byte-and-mode delta, separately attributed evidence, Git objects, root version, and thirteen accepted contract/build authorities all agree
- **THEN** its frozen product identity may authorize AMD64 validation assembly and later tag-baseline comparison

#### Scenario: Acceptance evidence is missing or reinterpreted
- **WHEN** a lifecycle/CI/remote/superseded-failure/unexecuted-cell/OID/contract fact is absent, changed, unresolved, an accepted test has any exception or failure, a failed attempt enters accepted test evidence, a source archive is unprefixed or only partially captured, an evidence/audit/protected-state identity is unscoped or ambiguous, Actions differs from Product, ancestry fails, a non-allowed Product/Harness path differs, Harness evidence is attributed to Product, a formal verdict or prior artifact identity is synthesized, or ephemeral CI output is marked deployable
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
verified OCI manifest/config identities, the Backend `archive-smoke` member
extracted from its verified binary bundle with exact source member/path,
size/digest/mode, the Frontend static tar, and one sorted payload-checksum
inventory. It SHALL declare
itself unpublished and SHALL contain neither a registry credential nor a
deployable mutable tag.

Each validation or tag candidate SHALL contain exactly one immutable
`accepted-development.json` ordinary single-link file with mode `0444`, whose
bytes are canonical schema version `operations-accepted-development-v1`,
validate against
`operations/schemas/release-accepted-development-v1.schema.json`, match the
fixed accepted-development digest, and match the candidate receipt descriptor.
Candidate verification SHALL open this exact path once with `O_NOFOLLOW`,
bind descriptor and pathname device/inode/link/mode/size/time identity, perform
one bounded read from that descriptor for hash and parse, `fstat` before and
after, and reject replacement, mutation, truncation, growth, a second pathname
read, or separate digest/parse bytes.

The coordinator SHALL use the exact admitted Node 24.18.0/npm 11.16.0 rather
than the host default, set the Docker default platform to `linux/amd64`, bind
the selected Buildx/BuildKit identities, and require real Backend, Updater, and
coordinator AMD64 execution smokes. An advertised platform without working
actual AMD64 execution SHALL fail closed. Native AMD64 runners SHALL execute
directly; only a different host MAY use an exact admitted and recorded
QEMU/binfmt path.

#### Scenario: The same frozen AMD64 validation inputs are assembled twice
- **WHEN** two fresh builds and two validation-candidate assemblies use the same clean authority and exact toolchains
- **THEN** all component directories, compatibility manifest, candidate document, checksum inventory, and release payload bytes are byte-identical

The validation candidate's payload-checksum inventory SHALL cover only its
immutable payload/receipt/component/compatibility files. It SHALL exclude the
candidate JSON and inventory itself. After both are canonicalized, a separate
closed complete-file inventory stored outside the addressed candidate
directory SHALL enumerate every candidate file and derive its content address;
neither that inventory nor the address SHALL be embedded into any covered
file.

#### Scenario: An artifact set is mixed or not AMD64
- **WHEN** a component has another source/tree/platform, the OCI graph is not one `linux/amd64` image, `archive-smoke` is absent or mismatched, or Frontend/compatibility evidence differs
- **THEN** no validation candidate is emitted and no existing content address is changed

#### Scenario: The host default toolchain or AMD64 execution path is unsuitable
- **WHEN** PATH selects another Node/npm, Docker defaults to the host platform, the admitted builder lacks AMD64, or a generated-image smoke cannot execute natively on AMD64 or through the admitted emulator on a different host
- **THEN** the build stops without accepting statements, assembling a candidate, or relabeling an ARM64 result

### Requirement: A tag release candidate SHALL build the tagged commit

The release workflow SHALL NOT publish or promote the earlier isolated
validation candidate. For a protected version tag, it SHALL check out and
build the tag's own exact commit twice, as required by the operations guide.
Before build it SHALL verify the tag commit descends from the frozen accepted
product, its product/build/contract inputs remain byte-identical to the
accepted baseline, and every intervening change is confined to the exact
receipt-recomputed Product/Harness acceptance/lifecycle difference inventory
or accepted Operations/OpenSpec lifecycle paths. Broad `openspec/**` or
prefix-only allowance is forbidden. Every product/build/non-acceptance-
Contracts authority blob and executable mode SHALL remain byte-identical to
the frozen baseline; `contracts/acceptance/**` SHALL match the admitted Harness
implementation. Newly built component statements and compatibility evidence
SHALL bind the tag commit revision/tree. One canonical tag-release candidate
SHALL also bind the frozen accepted-product receipt and the tag's Operations
controller identity.

The verifier SHALL classify every receipt-declared Product/Harness difference
independently of the final Product-to-tag diff. Acceptance-harness,
acceptance-lifecycle, refresh-lifecycle, and development-acceptance main-spec
paths SHALL match their required Harness or archive state including absence,
type, bytes, and executable mode. Receipt-declared
`operations-acceptance-planning` paths are not frozen to their Harness bytes:
they may evolve while this change is active, but a release tag SHALL contain
only the terminal archived lifecycle: the active change is absent; exactly one
date-prefixed archive contains all seven declared change artifacts and no
extra artifact; and all three exact Operations main specs exist as ordinary
Git blobs. Missing artifacts, active/archive coexistence, multiple archive
directories, or a non-ordinary final artifact SHALL fail. The verifier SHALL
then reject every additional Product-to-tag path outside the exact Operations
lifecycle set; broad `openspec/**` allowance remains forbidden. Deleting or
reverting a frozen Harness/archive path back to its Product state SHALL
therefore fail even when that path disappears from the final Product-to-tag
difference.

The Harness-to-archive acceptance-refresh move SHALL preserve every one of its
five active change artifacts exactly: each archived counterpart must have the
same Git blob, executable mode, and SHA-256 as the active file at Harness.
Only the synchronized root development-acceptance main spec may take its
archive-revision authority independently.

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
manifest/SQLite/domain/cast compatibility, the verified standalone
`archive-smoke` release asset's source member/size/digest/mode, and the
reviewed Prometheus image digest. The manifest-bound payload-checksum
inventory SHALL include only immutable distribution payload files such as the
Frontend archive, compatibility manifest, `archive-smoke`, and any reviewed
SBOM/provenance documents; it SHALL exclude `release-manifest.json` and the
inventory itself. The manifest's own digest SHALL be verified as the immutable
GitHub release asset identity and required deploy input, outside the inventory,
so no document contains its own digest. Production deployment SHALL accept
only this published form and
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
verify an unpublished candidate, and audit residue. Only after verification,
it MAY upload exactly one named sealed validation handoff containing the
candidate archive, its SHA-256 file, complete external inventory, and one
canonical `actions-provenance.json`. That provenance SHALL bind the exact
repository/repository ID, trusted push/manual event, head revision/tree,
run ID/attempt, workflow ID/name/path/ref/SHA, executed workflow
blob/mode/SHA-256, and descriptors for the other three handoff files. The
executed workflow bytes SHALL equal `.github/workflows/operations.yml` at the
candidate head. The exact four-file handoff SHALL use
`actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`
(`v7.0.1`) with one-day retention and no overwrite. That handoff is ephemeral
Actions transport only and SHALL be reverified before isolated remote use;
release and deploy SHALL reject it. The workflow SHALL not read secrets, log
in to a registry, upload a GitHub Release, use OIDC, select an Environment,
use SSH, invoke a host, or activate any deployment.

#### Scenario: An ordinary branch is verified
- **WHEN** the operations workflow runs for a pull request or branch push
- **THEN** all output remains runner-local except the one sealed one-day validation handoff, and the workflow has no release, registry, deploy, or host-mutation authority

#### Scenario: Read-only policy is weakened
- **WHEN** permissions, triggers, actions, commands, environments, secret data flow, or any upload exceeds the exact sealed validation handoff
- **THEN** repository-owned workflow policy tests fail

### Requirement: Release publication SHALL be tag-bound and least-privileged

`.github/workflows/release.yml` SHALL run only for a protected `v*` tag whose
value exactly equals root `VERSION` and whose commit is the checkout it builds.
It SHALL use pinned third-party Action commits and one release concurrency key.
One `prepare` job with `contents: read` only SHALL perform the fresh
reproducible AMD64 assembly and upload one closed candidate through exact
`actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`
(`v7.0.1`). A dependent `publish` job alone SHALL receive job-scoped minimum
`contents: write` and `packages: write`, download only that named candidate
through exact
`actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c`
(`v8.0.1`), revalidate its complete inventory and source authority before
registry login, verify immutable image digests, and create one GitHub Release
containing the Frontend tar, standalone `archive-smoke`,
`release-manifest.json`, compatibility manifest, and payload checksums. It
SHALL not use a self-hosted runner, production secret, SSH, deployment
Environment, `latest`, source build on the server, or unverified attestation.

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

The deploy job SHALL have an exact closed four-step program: bounded-input
validation and immutable-manifest verification SHALL have no step-level
environment; release download SHALL have exactly
`GH_TOKEN=${{ github.token }}`; and the transaction step SHALL have exactly
`BGMSS_PRODUCTION_SSH_PRIVATE_KEY`,
`BGMSS_PRODUCTION_SSH_HOST`, and
`BGMSS_PRODUCTION_SSH_KNOWN_HOST`. The job-level environment SHALL have exactly
`ACCEPTED_DEVELOPMENT_SHA256`, `FINAL_PRODUCT_REVISION`,
`FINAL_PRODUCT_TREE`, `RELEASE_MANIFEST_DIGEST`, and `RELEASE_VERSION`; no step
may override any of them. No extra step, shell startup variable such as
`BASH_ENV`/`ENV`, GitHub command-file write, indirect environment/PATH
mutation, or other job/step environment member is admissible.

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
