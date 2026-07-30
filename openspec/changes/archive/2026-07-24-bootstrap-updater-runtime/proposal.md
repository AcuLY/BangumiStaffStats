## Why

The formal rewrite needs an installable, terminating Python updater boundary
before implementing the immutable Archive producer. This foundation proves
that Python consumes the same Archive schemas and indexed golden cases as the
future Go consumer without pulling production acquisition, build, activation,
or scheduling into the first runtime wave.

## What Changes

- Create a Python `3.14.6` src-layout package under `updater/`, version `0.1.0`,
  with equivalent console and `python -m` entry points.
- Add deterministic `doctor` and
  `contract-check --contracts-root <path>` commands; both terminate.
- Add a read-only Archive contract adapter that validates the shared bundle,
  selected indexed cases, and the canonical dataVersion function.
- Lock exact runtime/development/build dependencies with uv `0.11.32` and add
  clean install, wheel, pytest, strict mypy, Ruff, import-purity, and CLI gates.
- Keep all interpreter, environment, cache, build, and temporary state below
  disposable updater-local roots and commit none of it.

Behavior classification:

- `PRESERVE_ORACLE`: no UI, API, visible copy, or statistical result changes.
- `INTENTIONAL_DELTA`: the mutable resident prototype loader is not retained;
  the formal updater begins as a one-shot installable package.
- `NEW_CAPABILITY`: Python Archive-contract consumption, stable CLI shell,
  canonical dataVersion evidence, and executable package-quality gates.

## Capabilities

### New Capabilities

- `updater-runtime-foundation`: Defines the installable Python foundation,
  terminating CLI, read-only Archive contract adapter, dependency/tooling
  boundary, and quality gates.

### Modified Capabilities

None.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: yes; verified: main diff audit plus exact uv/Python lock, 44 tests, mypy/Ruff, wheel/install, CLI/contract, path, strict OpenSpec, and residue gates passed; committed: determined by containing Git history; pushed/released/deployed: no |
| Owner | Main owns spec, acceptance, lifecycle, and simple corrections. One updater implementation subagent owns `updater/**` and this change's apply task markers. |
| Writable paths | Planning: this five-file change. Apply: `updater/**` and task checkboxes. Lifecycle: exact archive and `openspec/specs/updater-runtime-foundation/spec.md`. |
| Protected inputs | `contracts/**`, root specs/archives, Node/Impeccable/design context, backend/frontend changes and outputs, `.vscode/**`, formal guides, remotes, and production. |
| Dependencies | Accepted Wave 1A Archive contract; uv `0.11.32`; CPython `3.14.6`; `jsonschema==4.26.0`; `pytest==9.1.1`; `mypy==2.3.0`; `ruff==0.16.0`; `hatchling==1.31.0`. |
| Acceptance | Frozen install/build; exact CLI output/exit behavior; indexed contract cases and dataVersion vector; pytest/mypy/Ruff; wheel/import smoke; strict OpenSpec/Git/path gates; no disposable residue. |
| Non-goals | Archive/common acquisition, full SQLite producer, catalog/cast/statistics, publication/activation/current pointer, resident worker/scheduler/lock, backend/frontend edits, operations, or legacy deletion. |
| Stop conditions | Stop on contract/spec drift, overlapping writer, wrong tool/dependency version, unexpected network/path mutation, non-terminating command, or failed gate. Preserve the bounded candidate; do not reset or broadly clean. |
