## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: current Python/tool research, final baseline rebind, main semantic review, targeted/all strict validation, and OpenSpec doctor passed; committed: planning status is determined by the containing Git history; pushed/released/deployed: no |
| Owner | One updater subagent implements; main specifies, audits, accepts, and finalizes. |
| Writable paths | `updater/**`, own task markers, and exact accepted OpenSpec lifecycle paths. |
| Protected inputs | Shared contracts/specs, Node/Impeccable/design context, sibling paths, editor state, external/remote/production state. |
| Operations deferred | Producer scheduling/publication/activation, push, PR, tag, release, deploy, production services/config/secrets, migration, and legacy deletion. |

## ADDED Requirements

### Requirement: The updater SHALL be one exact installable package

The `updater/` project SHALL be a Python `>=3.14.6,<3.15` src-layout package
named `bangumi-staff-stats-updater`, importable as
`bangumi_staff_stats_updater`, version `0.1.0`, with typed marker and equivalent
`bgmss-updater` / `python -m bangumi_staff_stats_updater` entry points.
Imports SHALL have no filesystem, network, subprocess, logging, environment, or
background side effect.

#### Scenario: Locked package installs

- **WHEN** the committed lock is installed with CPython 3.14.6
- **THEN** package and wheel versions SHALL agree and both entry points SHALL import and terminate

#### Scenario: Package scope expands unexpectedly

- **WHEN** an unapproved path, import side effect, background task, or nested package authority appears
- **THEN** acceptance SHALL fail

### Requirement: The CLI SHALL be terminating, deterministic, and truthful

The CLI SHALL expose only help, version, `doctor`, and
`contract-check --contracts-root`. It SHALL use stable compact JSON and exact
exit statuses, separate stdout/stderr by success/error, sanitize usage and
unexpected exceptions, and never claim producer/publication/activation work.

#### Scenario: Both entry points run foundation commands

- **WHEN** module and console entry points invoke version, doctor, or a valid contract check
- **THEN** their semantic output and status SHALL be identical and bounded

#### Scenario: Input, expectation, usage, or internal failure occurs

- **WHEN** one of those error classes is triggered
- **THEN** the CLI SHALL emit only its stable JSON code on stderr with exit 1, 2, or 70 as specified

### Requirement: Contracts SHALL remain the sole Archive authority

The adapter SHALL consume the supplied repository `contracts/` root read-only,
require contained regular non-symlink indexed inputs with matching hashes, and
strictly parse/validate the shared schemas, compatibility matrix, DDL identity,
manifest/pointer evidence, and selected goldens. It SHALL NOT vendor, generate,
edit, or cache a schema/golden or create/open a runtime Archive/current pointer.

#### Scenario: Shared contract root is valid

- **WHEN** the tracked closed bundle is supplied
- **THEN** structural/index/hash/schema gates SHALL pass without modifying any contract byte

#### Scenario: Root escapes, links, or drifts

- **WHEN** an input escapes the root, is a link/special file, is missing/extra, or has the wrong hash
- **THEN** the adapter SHALL fail as `CONTRACT_INPUT_INVALID`

### Requirement: Producer-side validation SHALL preserve shared outcomes

The adapter SHALL validate the supported version tuple, seven source
identities, source accounting, canonical DDL digest, and fixed-order
`bgmss-archive-data-version-v1` preimage in the shared precedence. Tests SHALL
execute every approved positive/negative path without copying or mutating it.

#### Scenario: Minimal manifest and dataVersion vector are valid

- **WHEN** the shared minimal manifest and vector run
- **THEN** both SHALL produce `VALID` and the exact canonical dataVersion assertions

#### Scenario: Selected negative case runs

- **WHEN** a schema, source-accounting, unsupported-version, or dataVersion-mismatch case runs
- **THEN** it SHALL produce the indexed stable identity for that case

### Requirement: Dependencies SHALL be exact and removable

The sole runtime dependency SHALL be `jsonschema==4.26.0`. The exact development
and build tools SHALL be pytest `9.1.1`, mypy `2.3.0`, Ruff `0.16.0`, Hatchling
`1.31.0`, and uv `0.11.32`; the complete graph SHALL be committed in `uv.lock`
from official sources. No other direct runtime/framework/network/database/queue
dependency is admitted.

#### Scenario: Frozen graph installs and builds

- **WHEN** clean development and runtime environments are created from the lock
- **THEN** locked wheels SHALL install, one local project wheel SHALL build, and runtime metadata SHALL contain only the intended dependency

#### Scenario: Resolver or source drifts

- **WHEN** a version/source/hash/direct dependency differs or an sdist build is required unexpectedly
- **THEN** acceptance SHALL fail rather than silently updating the lock

### Requirement: Quality and cleanup SHALL be reproducible

The foundation SHALL pass pytest, strict mypy, Ruff lint/format, wheel
inspection/install/import, both CLI entry points, and strict OpenSpec/Git
checks. Tool state SHALL remain under `.cache`, `.tmp`, or `.venv` and those
exact roots SHALL be absent at candidate handoff.

#### Scenario: Clean quality matrix passes

- **WHEN** the documented checks run with local-only product execution
- **THEN** every required test/build/type/lint/CLI gate SHALL pass and the persistent inventory SHALL be exact

#### Scenario: Tool state or network escapes

- **WHEN** test/runtime execution reaches public network or writes cache/build/environment state elsewhere
- **THEN** acceptance SHALL fail without broadly cleaning unrelated paths

### Requirement: The foundation SHALL remain one-shot and path-disjoint

Updater apply SHALL modify only `updater/**` and its own task markers while
backend/frontend owners may run in parallel. It SHALL implement no producer,
activation, scheduler, daemon, lock, or operations behavior.

#### Scenario: Three foundation owners run in parallel

- **WHEN** each owner writes only its declared runtime root
- **THEN** the candidates MAY be implemented concurrently and accepted independently

#### Scenario: Producer or operations behavior is proposed

- **WHEN** the foundation attempts acquisition/build/publication/activation scheduling, host mutation, or a sibling path write
- **THEN** apply SHALL stop before that mutation
