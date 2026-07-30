## Why

The original pushed revisions failed before product gates because the workflow
compared `uv --version` to one historical presentation string. The first fresh
run after replacing that check confirmed the semantic validator and action
upgrades work, then exposed a second boundary mismatch: setup-go installs final
Go 1.26.5 outside the Backend-owned module cache, while the ordinary Backend
gate correctly requires the selected final toolchain to live inside that
cache.

## What Changes

- Replace presentation-string checks with one tested repository validator that
  parses each tool's structured or documented output and compares semantic
  versions and the exact BuildKit image.
- Use `uv self version --output-format json`; reject malformed JSON, a wrong
  package, or a wrong semantic version while allowing informational commit and
  target fields.
- Move current-builder/BuildKit validation out of inline YAML into the tested
  validator.
- Pin checkout v7.0.1, setup-go v7.0.0, setup-node v7.0.0, setup-uv v9.0.0,
  and setup-buildx v4.2.0 to their exact release commits.
- Treat setup-go's Go 1.26.4 as a reviewed bootstrap only. The validator SHALL
  prepare exact Go 1.26.5 through an isolated temporary module cache, then
  admit it with the fail-closed validator after one-time download diagnostics
  have finished. The Backend ordinary gate SHALL independently select exact Go
  1.26.5 through its component-owned module cache.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contracts-artifact-compatibility`: make exact CI toolchain admission
  semantic, deterministic, and independently tested.

## Impact

| Boundary | Declaration |
|---|---|
| Writable paths | `.github/workflows/ci.yml`, one repository-owned validator under `contracts/artifacts/bin/`, its focused tests under `contracts/artifacts/test/`, CI policy tests, this change's task/lifecycle paths. |
| Protected paths | Product components, package/module locks, artifact formats/producers, other workflows, secrets/permissions/triggers, release/deploy/operations, refs/remotes, hosts, and production. |
| Acceptance | Focused validator negatives; workflow bootstrap/cache policy; complete artifact tests; workflow policy/residue gates; strict OpenSpec; a fresh pushed GitHub Actions run passing every step. |
| Non-goals | Changing the selected product toolchain versions, artifact semantics, permissions, publishing, deployment, persistent/shared caching, or production behavior. |
