## Task Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: yes; verified: main diff audit plus exact uv/Python lock, 44 tests, mypy/Ruff, wheel/install, CLI/contract, path, strict OpenSpec, and residue gates passed; committed: determined by containing Git history; pushed/released/deployed: no |
| Owner | One updater implementation subagent owns tasks 2–4; main owns planning, acceptance, archive, staging, and commits. |
| Writable paths | `updater/**` and this file's task markers only during apply. |
| Stop conditions | Stop on planning HEAD/index/contract drift, overlapping writer, wrong tool/dependency version, out-of-scope mutation, non-termination, or failed gate. |

## 1. Planning — main

- [x] 1.1 Rebind the final Node/Impeccable/Wave 1A baseline, current Python/uv/dependency versions, owner model, and protected paths.
- [x] 1.2 Strict-validate and approve proposal/design/spec/tasks in the shared Wave 1B planning checkpoint.

## 2. Package and CLI — updater owner

- [x] 2.1 Verify approved planning HEAD, empty index, shared Archive/root-spec presence, sibling writer boundaries, and absent `updater/` runtime before writing.
- [x] 2.2 Create the exact 12-file src-layout package, metadata, lock, README, local ignore policy, typed version, equivalent module/console entry points, and import-purity tests.
- [x] 2.3 Implement exact terminating help/version/doctor/contract-check behavior, stable JSON/status mapping, output redaction/bounds, and no resident/producer/operations commands.

## 3. Shared Archive adapter — updater owner

- [x] 3.1 Implement strict contained read-only loading of the indexed Archive schemas, compatibility, DDL identity, manifest/pointer evidence, and golden tree with no private authority.
- [x] 3.2 Implement version/source-accounting/canonical-dataVersion validation in the shared precedence and tests for every approved positive/negative case.
- [x] 3.3 Prove whole-bundle `contract-check` success/failure mapping and that tests/CLI make no public-network, contract, current-pointer, or runtime-store mutation.

## 4. Quality and handoff — updater owner

- [x] 4.1 Using exact uv `0.11.32` and CPython `3.14.6` in updater-local disposable roots, perform frozen install, pytest, strict mypy, Ruff lint/format, wheel build/inspection/install, import, and both entry-point smoke tests.
- [x] 4.2 Verify exact dependencies/persistent paths, contract/sibling protection, strict OpenSpec, Git diff checks, no unexpected network, and no cache/temp/venv/build residue.
- [x] 4.3 Mark completed apply tasks and hand main an unstaged candidate with concise commands/results; do not stage, commit, archive, push, or start producer/operations work.

## 5. Acceptance and lifecycle — main

- [x] 5.1 Audit the complete updater diff and rerun material lock/install/test/type/lint/build/CLI/contract/path/OpenSpec gates.
- [x] 5.2 Make only simple in-envelope corrections if needed, then update status, sync/archive, stage the exact accepted envelope, and include it in the Wave 1B foundation commit.
- [x] 5.3 Verify final history and no push/release/deploy; hand the accepted foundation to later producer changes.
