## ADDED Requirements

### Requirement: Frontend architecture paths SHALL be platform-stable

The Frontend architecture checker SHALL compare repository-relative source and
inventory paths in canonical POSIX form on every supported host. Windows-native
execution SHALL enforce the same exact inventory, ownership, and dependency
rules as Linux and SHALL NOT require WSL.

The production-artifact checker SHALL canonicalize emitted relative paths before
matching `/v2/` HTML references, without changing the accepted base path or file
set.

#### Scenario: Windows source ownership is checked
- **WHEN** `check:architecture` runs under pinned Node 24.18.0 on Windows
- **THEN** `src/app/App.vue` SHALL remain the root store owner and all other
  source paths SHALL be evaluated against the unchanged architecture rules

#### Scenario: Persistent files are added by accepted changes
- **WHEN** an active specified Frontend change adds a persistent source or test file
- **THEN** the exact path SHALL be registered without weakening inventory equality

#### Scenario: Production entry mounts under full-suite contention
- **WHEN** the fixture-free mount test runs inside the complete parallel Frontend suite
- **THEN** it SHALL retain all production-entry assertions and use a bounded
  timeout sufficient for measured transform contention

#### Scenario: Windows production references are checked
- **WHEN** the production artifact contains `/v2/assets/...` references on Windows
- **THEN** each reference SHALL resolve against the exact `dist/assets/...` file
  and all existing artifact constraints SHALL still run
