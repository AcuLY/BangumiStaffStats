## 1. Planning

- [x] 1.1 Record exact Contracts ownership, protected checks, native lexical
  decision, stop conditions, and zero-P0/P1 review.
- [x] 1.2 Strict-validate before implementation.

## 2. Implementation

- [x] 2.1 Admit only the host-native separator while preserving POSIX foreign
  separator rejection and both-form traversal detection.
- [x] 2.2 Add focused positive native-path and negative traversal coverage.
- [x] 2.3 Preserve exact Git HEAD/index mode and raw-byte checks while making
  worktree execute-bit comparison conditional on host support; keep the POSIX
  chmod negative and add a cross-platform index-mode negative.

## 3. Acceptance

- [x] 3.1 Run focused generated-path and source-identity safety tests plus the
  complete Frontend artifact suite under pinned Node 24.18.0.
- [x] 3.2 Strict-validate, run `git diff --check`, and keep Git/deploy false.

Full Contracts sweep evidence is recorded separately and is not claimed green:
43/52 passed; the remaining producer-runtime and external Python-launch Windows
failures occur outside this change's paths and before the modified guards.
