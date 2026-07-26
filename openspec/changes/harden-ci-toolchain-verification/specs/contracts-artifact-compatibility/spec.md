## ADDED Requirements

### Requirement: CI toolchain identity SHALL be parsed semantically

The read-only artifact workflow SHALL verify exact Node 24.18.0, npm 11.16.0,
Go 1.26.5, uv 0.11.32, Buildx 0.34.1, BuildKit 0.27.1, and the accepted pinned
BuildKit image through one tested repository-owned validator. uv identity SHALL
come from `uv self version --output-format json`; informational commit, date,
and target fields SHALL not make the correct semantic version fail. The
validator SHALL reject malformed, ambiguous, missing, wrong-package,
wrong-version, conflicting-current-builder, wrong-driver, empty-node, or
wrong-image evidence.

The workflow SHALL pin the accepted checkout v7.0.1, setup-go v7.0.0,
setup-node v7.0.0, setup-uv v9.0.0, and setup-buildx v4.2.0 releases by their
exact 40-hex commits. It SHALL retain the existing read-only permissions,
component gates, reproducibility builds, compatibility assembly, local smoke,
and residue audit without adding publication or deployment authority.

setup-go SHALL install reviewed Go 1.26.4 as a bootstrap, not as the admitted
final GOROOT. Before any product gate, the semantic validator SHALL select Go
1.26.5 through `GOTOOLCHAIN=go1.26.5+auto` and an isolated
runner-temporary module cache. The Backend source gate SHALL independently use
the bootstrap to select Go 1.26.5 inside its existing component-owned module
cache; CI SHALL NOT weaken or bypass that containment gate.

#### Scenario: uv adds informational build metadata

- **WHEN** uv 0.11.32 reports its exact semantic identity in JSON and also
  includes commit/date/target information
- **THEN** CI SHALL accept the tool and continue to product gates

#### Scenario: Toolchain evidence is malformed or semantically wrong

- **WHEN** any output is malformed, ambiguous, names the wrong package, or
  reports a version/image outside the exact pins
- **THEN** the workflow SHALL fail before building artifacts

#### Scenario: Backend requires a component-contained final Go toolchain

- **WHEN** setup-go has installed the reviewed Go 1.26.4 bootstrap and CI
  proceeds to the Backend ordinary source gate
- **THEN** the gate SHALL select exact Go 1.26.5 inside
  `backend/.cache/go-mod`, rather than use an external setup-go GOROOT
