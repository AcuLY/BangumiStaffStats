# frontend-node-toolchain Specification

## Purpose

Define the exact supported Node runtime, repository version pins, NVM default,
and verification boundary used by the formal frontend toolchain.

## Requirements

### Requirement: The project SHALL use exact Node 24.18.0

The repository SHALL contain `.nvmrc` and `.node-version`, both with exact
content `24.18.0\n`. NVM SHALL have Node `v24.18.0` installed and
`alias/default` SHALL resolve to `24.18.0`.

#### Scenario: Exact runtime is available

- **WHEN** a developer initializes NVM and enters the repository
- **THEN** `nvm use` SHALL select Node `v24.18.0` and both version files SHALL agree

#### Scenario: Install or pins differ

- **WHEN** Node `24.18.0` is unavailable or either pin/default differs
- **THEN** acceptance SHALL fail without editing application code or normalizing to a floating alias

### Requirement: Runtime verification SHALL use fresh or absolute resolution

Acceptance SHALL verify explicit clean-NVM-shell, project-pin, absolute Node,
npm, and OpenSpec execution under Node `24.18.0`. The inherited PATH of the
already-running Codex process MAY remain Node 20 and SHALL be reported as a
restart caveat rather than silently treated as the fresh-shell result.

#### Scenario: Fresh resolution passes

- **WHEN** the clean shell and project checks run after installation
- **THEN** every authoritative runtime path/version SHALL identify Node `v24.18.0`

#### Scenario: A stale process still reports Node 20

- **WHEN** the current task host retains its pre-change PATH
- **THEN** the result SHALL be labeled process-local stale state and SHALL NOT override fresh-shell or absolute-path evidence

### Requirement: The update SHALL preserve unrelated state

The change SHALL use standard NVM installation/default commands, SHALL NOT
edit startup files or migrate globals, and SHALL leave application source,
manifests, older runtimes, other aliases, remotes, and production untouched.

#### Scenario: Standard update succeeds

- **WHEN** NVM installs and selects Node `24.18.0`
- **THEN** only declared repository pins and NVM-managed install/cache/default state MAY change

#### Scenario: Unexpected mutation appears

- **WHEN** an unrelated repository, shell, global-package, alias, remote, or production change is observed
- **THEN** the operation SHALL stop, restore the prior default/pins where exact, and retain the installed runtime instead of deleting broadly
