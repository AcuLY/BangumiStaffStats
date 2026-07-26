## Why

Every pushed revision currently fails before product gates because the workflow
compares `uv --version` to one historical presentation string. uv 0.11.32 now
adds build metadata to that human output even though the installed semantic
version is correct. The same step mixes several ad-hoc parsers inline and the
pinned official actions now emit Node 20 deprecation warnings.

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
| Acceptance | Focused validator negatives; complete artifact tests; workflow policy/residue gates; strict OpenSpec; a fresh pushed GitHub Actions run passing every step. |
| Non-goals | Changing toolchain versions, artifact semantics, permissions, publishing, deployment, caching, or production behavior. |
