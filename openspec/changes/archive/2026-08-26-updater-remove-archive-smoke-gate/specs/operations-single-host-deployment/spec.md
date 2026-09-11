## Capability Boundary

| Field | Boundary |
|---|---|
| Status | Modified repository deployment topology; live migration deferred |
| Owner | Operations |
| Writable paths | `operations/**`, this delta and lifecycle root spec |
| Read-only protected inputs | Product artifacts/semantics, live host, secrets, data, legacy stack and unrelated services |
| Deletion complement | Remove only Backend tool payload/link/mount/transaction definitions; no live object deletion |
| Mutable refs | Local topic branch only |
| Consumes | API/Updater OCI images, Frontend archive, minimal Archive and release metadata |
| Produces | Smoke-free clean-install/development bundle and host command topology |
| Dependencies | Accepted product artifacts -> Operations |
| Deliverables | Bundle/Compose/deploy/update/rollback/validation/tests/docs without tool topology |
| Acceptance | Bash syntax, runtime test, isolated source checks and residual-reference audit |
| Non-goals | Live cross-boundary activation, host cleanup, data/schema/product changes |
| Operations deferred | Exact production migration and rollback across pre-removal updater revision |
| Stop/rollback conditions | Stop on live mutation, lost data rollback, stale tool dependency or non-smoke topology drift |

## MODIFIED Requirements

### Requirement: Actions SHALL produce one bounded AMD64 deployment bundle

The already registered Development manual-dispatch entry SHALL call one
same-revision reusable read-only workflow that builds the accepted Product once
for `linux/amd64` and uploads one short-lived bundle containing API and updater
OCI archives, frontend static archive, minimal Archive fixture,
source/version metadata, and SHA-256 inventory. Push and pull-request runs
SHALL NOT call the bundle workflow. It SHALL NOT publish a registry image,
release, tag, deployment, credential, receipt, attestation graph, second
reproducibility build, or Backend command/tool payload.

The Development workflow policy SHALL continue to require exactly five
reviewed SHA-pinned external Actions and SHALL admit exactly one local
same-revision reusable workflow reference:
`./.github/workflows/operations-preview.yml`. It SHALL reject every other
local path, URL, Docker action, mutable external reference, YAML anchor, or
alias.

#### Scenario: Bundle build succeeds
- **WHEN** the exact branch head passes Development Actions and all component single-build commands and checksum generation succeed
- **THEN** one one-day artifact SHALL contain only the declared deployment files and bind the exact head/tree/version

#### Scenario: Bundle input or build fails
- **WHEN** the source is dirty/mismatched, a component build fails, an expected file is absent, or checksum generation fails
- **THEN** no bundle SHALL be admitted for remote validation

#### Scenario: Workflow authority differs from the reviewed caller
- **WHEN** the Development workflow contains an external Action outside the five reviewed immutable releases or a local reference other than the one same-revision operations workflow
- **THEN** the CI policy gate SHALL fail before product or bundle admission

### Requirement: Host commands SHALL install, update, check, and roll back

State-changing host commands SHALL share one non-waiting fixed lock. Bundle
installation SHALL verify checksums, install versioned bytes, start and verify
API, and switch frontend last. Archive update SHALL keep the updater one-shot,
atomically switch `current.json`, restart/verify API, and restore the previous
pointer on failure. Application and data rollback SHALL remain separate and
health checks SHALL be read-only. Application deployment and rollback SHALL
operate on release env/frontend state without any Backend command/tool payload,
tool link, executable argument, or tool mount.

Deploy SHALL accept only the root, bundle, version, project, loopback ports,
pinned Prometheus image, and reviewed profile inputs. It SHALL NOT accept,
preserve, or write application proxy mode/URL/network inputs. Root/project/
ports/Prometheus/profile topology SHALL remain immutable, and application
rollback SHALL restore the exact previous accepted env/frontend state without
introducing proxy or tool state.

As a one-time upgrade input only, an existing current env MAY contain the exact
closed retired `proxy` transport trio with a canonical URL/network pair. Deploy
SHALL recognize it before the lock but SHALL perform migration only after
acquiring and rechecking the shared lock. It SHALL require the exact installed
retired overlay and existing external network, save the original bytes, rewrite
the same old images/topology without proxy state, force-recreate API and
Prometheus from base Compose, and verify readiness. If this normalization
fails, it SHALL restore the original env and recover only through that validated
legacy overlay. Once normalization succeeds, the verified clean old release
SHALL replace both rollback slots and the overlay SHALL be removed before
candidate activation; candidate recovery and later application rollback SHALL
never restore legacy proxy state. Any partial, modified, direct-mode, generic
proxy, or otherwise noncanonical legacy state SHALL fail before the lock.

#### Scenario: Deployment becomes ready
- **WHEN** bundle checksums pass, images load, the current Archive is valid, and the candidate API becomes ready
- **THEN** the candidate env and frontend link SHALL become current while the previous accepted env/frontend values remain available for rollback

#### Scenario: Proxy mode changes explicitly
- **WHEN** deploy is asked to select either a direct or proxy transport mode
- **THEN** it SHALL reject the obsolete argument before the state lock, Docker call, release creation, or state mutation

#### Scenario: Existing transport mode is preserved
- **WHEN** deploy inspects a proxy-free release or the exact closed retired proxy release admitted for one-time migration
- **THEN** it SHALL preserve all non-proxy release authority
- **AND** no transport mode, URL, or network SHALL be persisted into the candidate or retained after successful normalization

#### Scenario: Obsolete proxy arguments are supplied
- **WHEN** deploy receives a proxy transport, URL, network, or any unknown argument
- **THEN** it SHALL reject the request before the state lock, Docker call, release creation, or state mutation

#### Scenario: Exact legacy proxy release is upgraded
- **WHEN** current state is one exact closed retired proxy release and the validated legacy overlay/network remain available
- **THEN** deploy SHALL establish and verify the same old release base-only under the shared lock before candidate work
- **AND** successful deployment SHALL retain only that clean old release as previous state and remove the retired overlay

#### Scenario: Legacy normalization or candidate readiness fails
- **WHEN** base-only normalization of the old release fails
- **THEN** deploy SHALL restore the exact raw legacy env and recover with the validated legacy overlay
- **WHEN** normalization succeeds but candidate readiness later fails
- **THEN** deploy SHALL recover the verified clean old release without the overlay or proxy state

#### Scenario: Candidate readiness fails
- **WHEN** candidate API readiness fails after an application or data switch
- **THEN** the command SHALL restore and verify the previous accepted state before returning nonzero

#### Scenario: Concurrent mutation is attempted
- **WHEN** another deployment, update, or rollback owns the lock
- **THEN** the new command SHALL exit without changing application, frontend, or data state

## ADDED Requirements

### Requirement: Operations topology SHALL not carry Archive smoke tools

New deployment bundles, release directories, Compose definitions, updater
arguments/mounts, application links, rollback transactions, isolated
validation, and host checks SHALL contain no dedicated Archive smoke command or
Backend tool payload. Existing live legacy tool links/releases are not writable
under this development change and SHALL NOT be treated as proof that a new
smoke-free revision can safely cross the breaking updater interface.

#### Scenario: A clean smoke-free bundle is assembled
- **WHEN** Operations assembles and validates a new deployment bundle
- **THEN** its closed inventory SHALL contain no Backend tool archive, release `tools` directory, tool symlink, executable mount, or smoke argument

#### Scenario: A live pre-removal topology is encountered
- **WHEN** a future activation sees a current or rollback updater revision that requires the removed command
- **THEN** activation SHALL stop until a separately authorized migration binds exact rollback and retirement behavior
- **AND** this development change SHALL not delete or rewrite those live legacy bytes
