# Integrated development acceptance

This package makes one read-only, fail-closed development decision for an
already accepted Bangumi Staff Stats product candidate. It runs the fixed
Contracts, Backend, Updater, Frontend, artifact, full-Archive, API, browser,
oracle, performance, and residue matrix. It does not repair product code and
does not perform operations work.

## Formal invocation

Run the CLI from the clean, committed harness/control checkout with Node
24.18.0 and npm 11.16.0. Every file argument must be an absolute canonical
path:

```sh
node contracts/acceptance/bin/acceptance.mjs verify-package
node contracts/acceptance/bin/acceptance.mjs validate-input /absolute/path/acceptance-input.json
node contracts/acceptance/bin/acceptance.mjs run /absolute/path/acceptance-input.json
```

`verify-package` checks the fixed persistent-file inventory, exact package and
lock identities, the single direct development dependency, and the absence of
persistent `.tmp` and `node_modules` state. `validate-input` is a cheap
closed-schema check. `run` repeats admission and then executes the complete
matrix; validating a document alone is never acceptance evidence.

For a retained diagnostic result, validate its canonical document with:

```sh
node contracts/acceptance/bin/acceptance.mjs validate-result /absolute/path/result.json
```

Remove only a harness-created run root whose ownership marker is intact:

```sh
node contracts/acceptance/bin/acceptance.mjs cleanup /absolute/path/to/contracts/acceptance/.tmp/run-0123456789abcdef01234567
```

Do not replace this command with a broad recursive repository cleanup.

## Frozen inputs

The strict input document has `schemaVersion: 1` and supplies only immutable
local identities:

- `product`: clean accepted product-candidate root, revision, and tree.
- `harness`: later clean harness/control root, revision, and tree.
- `artifacts`: exact Backend, Updater, and Frontend artifact roots plus their
  compatibility manifest.
- `archive`: one inactive official full-Archive version root and dataVersion,
  plus a separate frozen provenance root, canonical `provenance.json`, and its
  reviewed digest.
- `oracle`: fixed revision
  `644b7748674e553f863d0ffd61d029f86fdc0717`, its tree, and sealed npm cache.
- `tools`: exact paths, versions, and SHA-256 identities for current
  Git/Node/npm/Go/uv/Python/Docker/tar and the historical Query-golden
  Node/npm/Go/gofmt family; Docker also declares its local Unix endpoint.
- `caches`: one immutable cache root, its canonical manifest and digest, and
  exact npm, Go module, uv, and browser children.
- `browser`: the admitted Chromium name, version, executable path, and digest.

All paths and identities are caller-selected and frozen before the run.
Preparing the reviewed, lockfile-complete caches is a separate prerequisite;
it is not a matrix cell and is not acceptance evidence.

### Cache compatibility authority

The cache manifest's `productCandidate.revision` is retained as the immutable
`preparedFromRevision`. It may equal the accepted product revision or precede
it; neither case is trusted by declaration alone. Before any seed or process,
the harness proves the same closed set of 16 raw authorities:

- 11 Product package locks at both the preparation and accepted Product
  revisions;
- the acceptance-harness package lock at the accepted Harness revision;
- the Frontend package lock at the fixed Oracle revision;
- Product `backend/go.mod` and `backend/go.sum` at both Product revisions,
  with only the actual `go.sum` digest bound by the Go validation document;
- Product `updater/uv.lock` at both Product revisions, bound in the required
  direction through the uv validation document and its separate closure plan.

Every Git source must be the exact `100644` blob read from the named object ID
with replacement refs and lazy fetching disabled. The 13 npm records must
appear in the exact manifest/inventory order with matching digests and package
counts. Frozen npm and Go files must be single-link `0444` regular files. uv
has no invented frozen lock copy: its two admitted authorities are the
validation document and the separately sealed closure plan.

The proof is recorded twice. `admission.sources` owns the canonical
`preAdmission` phase; `residue.cleanup` owns `postCleanup` after all runtime
cleanup and cache resealing. Each phase includes the four revision identities,
exact counts, all authority records, cache seals, and a phase-specific digest.
The final result stores a closed `identities.cacheCompatibility` descriptor
that binds the evidence-relative path, canonical evidence-file SHA-256, and
both phase digests. The evidence envelope deliberately has no self-digest.

## Offline and read-only boundary

The formal run is networkless except for bounded loopback listeners and an
isolated local Docker network used between accepted components. It must not
contact package registries, Git remotes, Bangumi, image upstreams, analytics,
or any other public origin. Browser and dependency bytes are pre-provisioned;
the harness never downloads them.

Product and harness checkouts, artifacts, the full Archive, provenance, caches,
tool distributions, and browser source are immutable inputs. Disposable
source, dependency, browser, Archive, process, and container state belongs
only to the owned run root below `contracts/acceptance/.tmp/<run-id>/`.

## Result and cleanup

Each run writes bounded logs, evidence, screenshots/traces, disposable runtime
state, and one canonical machine-readable result only below its owned ignored
run root. A failed cell blocks dependent cells, the CLI exits nonzero, and no
green verdict is emitted. Only a complete, schema-valid, residue-free matrix
may emit:

```text
development-accepted-operations-pending
```

Generated `.tmp` state, copied Archive bytes, browser profiles, caches, logs,
screenshots, traces, and results are never tracked. They must be removed with
the guarded `cleanup` command before implementation handoff. The persistent
tree is limited to the reviewed paths and modes in `inventory.json`; adding or
removing a source, config, schema, test, lock, or documentation file requires
an explicit inventory review and edit.

## Scope statement

This is development characterization on the recorded machine profile, not a
production benchmark, capacity claim, SLO, release, deployment, or activation.
Even after a green result, operations remain pending. Production Compose,
nginx/systemd/timers, users and paths, permissions, TLS, secrets, real Archive
activation, restart/rollback, registries, release, deployment, monitoring,
cutover, migration, rollback drills, and legacy removal require a later
user-approved OpenSpec change.

The allowed final development statement is:

> 正式新版开发验收完成；运维、发布、部署、生产迁移和旧系统退役尚未开始。
