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

## Decision

The Query owner SHALL change its exact inner profile to:

```text
(version 1)(allow default)(deny network*)(deny file-write* (subpath "/Users/luca/Library/Application Support/go/telemetry"))
```

The exact profile bytes and SHA-256 remain part of the verifier and manifest
authority. All four Go children SHALL use that same wrapper prefix. The
correction SHALL NOT add a second execution path, bypass `sandbox-exec`, relax
the clean environment, or alter Go command/environment/module policy.

The acceptance companion correction may then execute the sealed
`--verify-codegen-projections` verifier directly, with fixed executable,
argv/cwd/environment and timeout, because the Query verifier is the sole Go
executor and each Go child carries the exact network-denial profile. Every
other Query command remains under the Harness outer networkless sandbox.

## Evidence and seal propagation

The delegated Query owner SHALL:

- update only the profile constant and its exact digest;
- run existing child-free profile/wrapper drift negatives;
- confirm every successful Go result records the new profile text/digest and
  unchanged argv/environment/module seals;
- recompute only necessarily affected Query evidence and verifier identity;
- rebind Query Domain's Query-manifest authority plus its verifier identity;
- rebind Statistics' Query Domain handoff only;
- prove TypeScript/Go outputs and all module locks remain byte-identical.

## Validation

Run the complete locked Query flow twice in the original checkout and once in
each of two distinct absolute clone paths. Each run must execute four Go
children, record the exact new network-denial profile, preserve the accepted
generated hashes, and end with no `node_modules`, `.cache` or `.tmp` residue.
Then run Query Domain, Statistics, Backend/Frontend Query drift checks, strict
OpenSpec and exact diff/seal audits.

## Rollback

Before any child is active, restore only the five admitted tracked files and
remove only Query-owned generated roots through the existing guarded cleanup.
Do not rewrite refs, broad-clean the repository, alter caches, or weaken the
acceptance network requirement.
