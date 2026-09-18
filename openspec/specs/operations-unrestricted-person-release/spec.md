# operations-unrestricted-person-release Specification

## Purpose

Release the reviewed unrestricted-person-entry feature through the existing single-host deployment workflow with verified immutable candidate, bounded activation, public and non-interference readback, and a narrowly authorized installed readiness-helper update, while keeping script publication user-owned.

## Requirements

### Requirement: Reviewed immutable candidate before activation

The operations owner SHALL deploy only a committed and reviewed candidate satisfying the affected source, contract, generated-consumer, artifact and browser gates. It SHALL verify the bundle's complete checksum inventory, linux/amd64 API image identity and compatible Backend/Frontend statements before invoking the existing deploy mechanism. Source revisions, CI identities and bundle metadata MUST be actual observed values.

#### Scenario: Rejected candidate
- **WHEN** a required check fails or artifact identity differs from the accepted commit
- **THEN** no production application pointers are changed and the failure is reported without substituting fabricated acceptance.

### Requirement: Bounded production activation and recoverability

Activation SHALL use project bgmss-v2, root /srv/bgmss-v2, API 18080 and Prometheus 19090 with the existing pinned Prometheus image. It SHALL retain the old app, wait for candidate readiness and switch the frontend last. It MUST NOT modify Nginx, Archive current.json or unrelated services. Failed activation or failed post-activation feature checks SHALL invoke existing application rollback and verify restoration without data rollback.

#### Scenario: New API is not ready
- **WHEN** the candidate cannot become ready against the current Archive
- **THEN** the existing deploy recovery restores the previous app and frontend and no new frontend remains active against the old API.

#### Scenario: Functional acceptance fails after switching
- **WHEN** candidate readiness passed but the user-visible feature fails acceptance
- **THEN** existing rollback-app restores the verified previous release and health/public routes are read back before reporting rollback success.

### Requirement: Public feature and non-interference verification

After activation, the owner SHALL verify live/ready/catalog/metrics/Prometheus via the normal operations check and verify the public built app, application entry for anime and the other four subject types, target-present and target-absent detail behavior and continued browsing. It SHALL verify legacy /old/ and byte-preservation of Nginx/Compose. Errors MUST remain distinct from empty participation. Script publication SHALL remain user-owned; installation documentation, a script download and a bundled copy SHALL NOT be release gates. Final reporting SHALL distinguish implemented, tested, committed, integrated, built and deployed states.

#### Scenario: Release is accepted
- **WHEN** the accepted candidate is active and all scoped public and operational readbacks pass
- **THEN** report the real deployment revision, public application URL and actual checks, without claiming unperformed tests.

### Requirement: Narrow installed readiness-helper update

The operations owner MAY update `/srv/bgmss-v2/operations/lib/common.sh` only by the user-authorized default readiness-attempt substitution from 30 to 75. The owner SHALL first verify the exact preimage and preserve a byte/metadata-identical workspace backup, then read back the installed reviewed bytes/hash and shell syntax and verify unrelated protected state and running services are unchanged. Every other helper byte, explicit override, probe bound, polling interval, resource cap and 20-second user query budget SHALL remain unchanged. The update SHALL NOT restart a service or replace any other installed script/configuration. Exact accepted-commit operations identity SHALL still be required by the later rehearsal.

#### Scenario: Helper preimage differs beyond the permitted default
- **WHEN** the installed helper or proposed replacement has a difference beyond the single authorized default-attempt substitution
- **THEN** stop without applying the update or bypassing the identity check.

#### Scenario: Helper update fails verification
- **WHEN** installed bytes, syntax or protected-state readback fail after the update
- **THEN** restore the verified backup without restarting services and read back the restored preimage before reporting rollback.

### Requirement: Temporary resource isolation

Temporary QA SHALL bind only free loopback 18081/15174 under the dedicated workspace root; a real-data QA API SHALL disable ArchiveUpdater and never mutate production data. Local toolchain/build preparation SHALL use dedicated workspace paths and an isolated named builder without replacing system or Hermes tools. Existing credentials SHALL be used without being exposed or copied.

#### Scenario: Temporary resource collision
- **WHEN** an intended QA port, root or builder is already owned by another process/task
- **THEN** stop and revise the recorded allocation rather than kill or overwrite its owner.
