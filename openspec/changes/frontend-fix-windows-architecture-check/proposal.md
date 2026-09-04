# Change: Make the Frontend architecture gate Windows-native

## Why

The pinned Node 24.18.0 Frontend gate reaches `check-architecture.mjs` on
Windows, but `path.relative()` emits backslashes while the accepted inventory
and ownership rules use repository-style forward slashes. The checker therefore
misclassifies `src/app/App.vue` as a leaf component and cannot validate the
current local worktree without WSL. The same gate also needs exact registration
of the six persistent files introduced by already-specified Frontend changes.

## What Changes

- Normalize only checker-internal repository-relative source paths to POSIX form.
- Normalize production-artifact inventory paths to the same canonical form so
  `/v2/` URL references resolve to emitted files on Windows.
- Register the six exact persistent source/test files already owned by active
  Frontend OpenSpec changes.
- Keep the fixture-free production-entry mount assertions unchanged while
  giving that single integration test a bounded 30-second budget under full-suite
  transform contention.
- Preserve all architecture rules, dependency pins, application behavior, and
  the immutable prototype oracle.

## Impact

| Field | Boundary |
|---|---|
| Status | Local bounded Frontend-toolchain correction |
| Owner | Frontend node/toolchain acceptance |
| Writable paths | `frontend/scripts/check-architecture.mjs`; `frontend/scripts/check-production-artifact.mjs`; `frontend/tests/app/app.mount.test.ts`; this change only |
| Read-only protected inputs | Application source semantics, dependencies, APIs, Backend, updater, contracts, operations, user/global Node installation |
| Deletion complement | Preserve every existing inventory entry and architecture rule |
| Mutable refs | Current dirty worktree only |
| Consumes | Pinned Node 24.18.0, Windows `path.relative`, active-change file inventory |
| Produces | Platform-stable source/artifact comparisons, exact inventory registration, and a bounded full-suite mount-test budget |
| Dependencies | Node standard library only; no package change |
| Deliverables | Checker diff, focused Windows execution, full Frontend gate evidence |
| Acceptance | Native Windows `check:architecture` and full `npm run check` under Node 24.18.0, with all production-entry assertions retained |
| Non-goals | Product/UI behavior, architecture-policy relaxation, WSL, CI, Git integration, deployment |
| Operations deferred | Commit, push, release, deployment |
| Stop/rollback conditions | Any rule relaxation, non-inventory source mutation, dependency drift, or Linux path regression |

External behavior classification: **PRESERVE_ORACLE** at
`644b7748674e553f863d0ffd61d029f86fdc0717`; this changes developer acceptance
only. No external system or repository is mutated.
