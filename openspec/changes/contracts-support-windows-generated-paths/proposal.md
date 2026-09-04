# Change: Support native Windows artifact safety checks

## Why

The shared generated-path guard describes its input as a native filesystem
path but rejects every backslash before resolving or checking containment. All
Windows `path.join()` results therefore fail at the guard entrance, preventing
Frontend artifact tests and other component artifact tooling from running
natively. The existing containment, symlink, realpath, and traversal policies
must remain fail-closed.

Windows filesystems also do not expose mutable POSIX executable bits through
`fs.stat()`. A worktree-only `chmod` negative is therefore unrepresentable even
though Git HEAD/index mode drift remains fully observable.

## What Changes

- Accept the host's native separator in absolute generated-path inputs.
- Continue rejecting backslashes as a foreign/ambiguous separator on POSIX.
- Detect `..` traversal with either slash form before resolution on every host.
- Keep the repository/tmp containment and existing-chain safety checks unchanged.
- On Windows, use exact HEAD-versus-stage-0 index equality as executable-mode
  authority and keep raw worktree blob verification; compare worktree execute
  bits only on hosts that represent them.

## Impact

| Field | Boundary |
|---|---|
| Status | Local bounded Contracts artifact-safety correction |
| Owner | Contracts artifact compatibility |
| Writable paths | Contracts owner: `contracts/artifacts/lib/generated-path.mjs`, `contracts/artifacts/lib/git-checkout.mjs`, `contracts/artifacts/test/generated-path.test.mjs`; Frontend consumer-test owner: `frontend/build/test.mjs`; this change only |
| Read-only protected inputs | Product components, artifact schemas/evidence, other Contracts helpers/tests, dependencies, external state |
| Deletion complement | Preserve all containment, symlink, non-directory, canonical-realpath, cleanup, HEAD/index mode, and raw-byte guards |
| Mutable refs | Current dirty worktree only; generated test data remains under declared `.tmp` roots |
| Consumes | Node `path.sep`, native absolute paths, existing generated-root options |
| Produces | Platform-correct lexical admission and source-mode verification before unchanged fail-closed checks |
| Dependencies | Node standard library only |
| Deliverables | Shared guard correction and positive/negative focused tests |
| Acceptance | Generated-path tests, source-identity negatives, and Frontend artifact unit suite pass natively on Windows under Node 24.18.0 |
| Non-goals | Artifact semantics, smoke behavior, schemas, packaging output, dependencies, WSL, Git/deploy operations |
| Operations deferred | Commit, push, release, deployment |
| Stop/rollback conditions | Any escape/symlink test regression, platform ambiguity, or mutation outside declared tmp roots |

External behavior classification: developer-tooling only; product/oracle behavior
is preserved. No external system or repository is mutated.
