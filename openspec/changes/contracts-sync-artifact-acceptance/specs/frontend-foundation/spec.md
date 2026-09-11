## MODIFIED Requirements

### Requirement: Production artifacts SHALL remain fixture-free and bounded

The build SHALL emit one HTML entry, no source map or test/fixture/user snapshot,
no prototype/workbench/fixed-user marker, no direct upstream URL/Axios, and no
frontend statistical formula. The reachable initial JavaScript gzip SHALL be
below 350 KiB.

#### Scenario: Production artifact passes

- **WHEN** artifact and bundle checks inspect a clean build
- **THEN** one HTML entry and the bounded fixture-free chunk graph SHALL pass

#### Scenario: Forbidden content is bundled

- **WHEN** another HTML, fixture, prototype marker, upstream URL, source map, or statistical implementation is reachable
- **THEN** acceptance SHALL fail

#### Scenario: Initial JavaScript reaches the budget

- **WHEN** the initial JavaScript gzip sum reaches or exceeds 358400 bytes
- **THEN** the artifact check SHALL fail
