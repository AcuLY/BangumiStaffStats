## Decisions

### Validate tool identity in one repository-owned program

The workflow SHALL execute one Node validator. Its pure parsers SHALL admit:

- `process.version` exactly `v24.18.0`;
- npm semantic version exactly `11.16.0`;
- the documented `go version` grammar with Go exactly `1.26.5`;
- JSON from `uv self version --output-format json` with `package_name: "uv"`
  and version exactly `0.11.32`;
- the documented Buildx version output with version exactly `0.34.1`; and
- exactly one non-conflicting current `docker-container` builder whose every
  node uses BuildKit `0.27.1` and the pinned image/digest.

Human annotations, commit dates, target triples, and platform inventories are
informational and SHALL not replace or weaken the semantic checks. Malformed,
ambiguous, duplicate-conflicting, missing, or wrong-version evidence fails.

### Keep the workflow auditable

The workflow retains read-only permissions and all existing build/smoke gates.
The policy test SHALL require the exact five action commit references, the
single validator invocation, and absence of the old inline/presentation check.
No action major tag is used at runtime.

### Separate the reviewed Go bootstrap from the selected product toolchain

setup-go SHALL install Go 1.26.4 only as the immutable bootstrap executable.
One explicit preparation step SHALL run `go version` with
`GOTOOLCHAIN=go1.26.5+auto` and a runner-temporary `GOMODCACHE`. This step may
show Go's one-time download progress but does not admit the identity. The
semantic validator SHALL then run with the same environment and retain its
existing fail-closed rule that rejects any command stderr. The admitted
identity remains exact Go 1.26.5 without writing into a component source tree.
The Backend source gate SHALL then run in its existing ordinary mode: the
1.26.4 bootstrap remains on `PATH`, while `backend/scripts/check.sh`
independently selects Go 1.26.5 into `backend/.cache/go-mod` and removes that
disposable state on completion.

The preparation step SHALL occur immediately before the validator and SHALL
discard only `go version` stdout; no parser or version comparison moves into
YAML. The workflow SHALL NOT point the Backend gate at setup-go's external 1.26.5
GOROOT and SHALL NOT weaken the Backend component's module-cache containment
check. The two downloads intentionally prove two independent boundaries: CI
admits the selected semantic version before product gates, and Backend admits
the same final version inside its own controlled cache.

## Verified release pins

| Action release | Commit |
|---|---|
| `actions/checkout` v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-go` v7.0.0 | `b7ad1dad31e06c5925ef5d2fc7ad053ef454303e` |
| `actions/setup-node` v7.0.0 | `820762786026740c76f36085b0efc47a31fe5020` |
| `astral-sh/setup-uv` v9.0.0 | `c771a70e6277c0a99b617c7a806ffedaca235ff9` |
| `docker/setup-buildx-action` v4.2.0 | `bb05f3f5519dd87d3ba754cc423b652a5edd6d2c` |

These commits were resolved from the repositories' release tags during
specification. Future upgrades require another reviewed change.

## Risks

- Tool output formats can evolve. Pure focused parsers make such drift
  diagnosable without weakening exact semantic versions.
- A newer action release can alter behavior. Exact release commits keep the
  executed action immutable.
