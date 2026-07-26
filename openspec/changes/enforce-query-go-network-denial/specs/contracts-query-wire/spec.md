## ADDED Requirements

### Requirement: Query Go codegen children SHALL deny network without sandbox nesting

The Query verifier SHALL remain the sole executor of its exact primary
generation, deterministic replay, formatting and compile-smoke Go children.
Every one of those four children SHALL run through the same exact
`/usr/bin/sandbox-exec` profile containing both `(deny network*)` and the
accepted Go telemetry-directory write denial. The verifier SHALL bind the
profile text and SHA-256, fixed clean-environment wrapper, exact argv/cwd/tool
identity and materialized-module pre/post seals.

The Query owner SHALL NOT depend on an outer macOS sandbox around
`--verify-codegen-projections`, because macOS rejects applying the child
sandbox from an already-sandboxed verifier. It SHALL NOT solve the nesting
failure by removing network denial, bypassing the inner wrapper, adding a
second Go executor or changing module/download/generated-output semantics.

#### Scenario: The verifier runs without an outer sandbox

- **WHEN** the locked Query flow invokes `--verify-codegen-projections`
  directly with its exact Node executable, argv, cwd, clean environment and
  timeout
- **THEN** all four Go children SHALL execute successfully through the exact
  inner profile containing `(deny network*)`
- **AND** their argv, environment, module seals and generated outputs SHALL
  match the accepted evidence

#### Scenario: Network denial is missing or moved to an outer wrapper

- **WHEN** the inner profile omits or changes `(deny network*)`, its
  text/digest differs, any Go child does not use it, or the verifier is wrapped
  in a second macOS sandbox
- **THEN** the Query owner gate SHALL fail
- **AND** no successful codegen or development-acceptance verdict may be
  emitted
