## Context

The Query verifier is the sole owner of four fixed Go children:

1. primary `oapi-codegen`;
2. deterministic replay `oapi-codegen`;
3. `gofmt`;
4. compile smoke.

Each child is already launched through `/usr/bin/sandbox-exec`, with an empty
ambient environment, a fixed `env -i` assignment list, exact argv/cwd/tool
identity, and pre/post materialized-module seals. The existing profile is:

```text
(version 1)(allow default)(deny file-write* (subpath "/Users/luca/Library/Application Support/go/telemetry"))
```

The acceptance Harness also applies an outer `(deny network*)` sandbox to the
verifier process. macOS does not permit the already-sandboxed process to apply
another sandbox, so the first Go child fails before code generation.

After network denial is moved inward, the existing primary/replay command
still cannot run offline. `go run <package-subdirectory>@v2.8.0` first asks the
public proxy whether that package subdirectory is itself a module. Go does not
persist the negative proxy lookup, so no prewarmed `GOMODCACHE` can make the
exact argv network-independent. Disabling the checksum database or maintaining
an ad-hoc private proxy would weaken or complicate the accepted checksum
policy.

## Decision

The Query owner SHALL change its exact inner profile to:

```text
(version 1)(allow default)(deny network*)(deny file-write* (subpath "/Users/luca/Library/Application Support/go/telemetry"))
```

The exact profile bytes and SHA-256 remain part of the verifier and manifest
authority. All four Go children SHALL use that same wrapper prefix. The
correction SHALL NOT add a second execution path, bypass `sandbox-exec` or
relax the clean environment.

The Query module SHALL adopt the same standard tool-directive model already
used by Backend:

```text
tool github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen
```

Primary and replay SHALL run from the materialized module root
`contracts/goldens/query/.tmp` as `go tool oapi-codegen ...`, with the same
v2.8.0 implementation and output arguments. The tracked locks SHALL be the
tidied minimal closure:

- `go.mod.lock`: 1,103 bytes,
  `628a1da85a82862c737829dc9a873789edc2c43456ceb937b6687e928ba585ed`;
- `go.sum.lock`: 17,200 bytes, 182 records,
  `ee80a5647acb9e65743c163514c481527180d4cbee15e84e8282966145da1337`.

Every checksum record SHALL be an exact line from the accepted Backend
`go.sum`. `GOSUMDB`, `GOPROXY` and the rest of the Go environment SHALL remain
unchanged; no checksum bypass or private proxy is allowed. The sealed cache
provides the exact verified module bytes, and the inner sandbox proves no
network fallback occurs.

The acceptance companion correction may then execute the sealed
`--verify-codegen-projections` verifier directly, with fixed executable,
argv/cwd/environment and timeout, because the Query verifier is the sole Go
executor and each Go child carries the exact network-denial profile. Every
other Query command remains under the Harness outer networkless sandbox.

## Evidence and seal propagation

The delegated Query owner SHALL:

- update only the profile constant and its exact digest;
- replace only primary/replay's online-first tool lookup with the locked
  tool-directive command and module-root cwd;
- materialize the new exact locks and prove all 182 checksum records are a
  Backend `go.sum` subset;
- run existing child-free profile/wrapper drift negatives;
- confirm every successful Go result records the new profile text/digest and
  accepted `go tool` argv, unchanged environment and module seals;
- recompute only necessarily affected Query evidence and verifier identity;
- rebind Query Domain's Query-manifest authority plus its verifier identity;
- rebind Statistics' Query Domain handoff only;
- prove TypeScript/Go outputs remain byte-identical and the module-lock delta is
  exactly the reviewed tool closure.

## Validation

Run the complete locked Query flow twice in the original checkout and once in
each of two distinct absolute clone paths. Each run must execute four Go
children, record the exact new network-denial profile, preserve the accepted
generated hashes, and end with no `node_modules`, `.cache` or `.tmp` residue.
Then run Query Domain, Statistics, Backend/Frontend Query drift checks, strict
OpenSpec and exact diff/seal audits.

## Rollback

Before any child is active, restore only the seven admitted tracked files and
remove only Query-owned generated roots through the existing guarded cleanup.
Do not rewrite refs, broad-clean the repository, alter caches, or weaken the
acceptance network requirement.
