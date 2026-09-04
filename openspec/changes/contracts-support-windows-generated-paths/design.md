## Decision

Lexically reject non-string, empty, and NUL inputs on every host. Reject a
backslash only when it is not the host separator, preserving the existing POSIX
ambiguity policy. Split on both slash forms solely to detect an explicit `..`
segment before `path.resolve()`.

All authority checks after lexical admission remain unchanged: the temporary
root must be strictly inside the repository, candidates must remain inside the
temporary root, existing ancestors cannot be symlinks or non-directories, and
real paths must equal their canonical native paths.

For tracked source identity, Git HEAD and stage-0 index already carry the
canonical executable mode and are compared exactly before worktree bytes are
accepted. On Windows, where `fs.stat()` cannot observe a worktree execute-bit
transition, omit only that unrepresentable comparison. Raw worktree bytes and
all Git mode/index checks remain mandatory. POSIX retains the worktree mode
comparison and `chmod` negative.

## Review

Zero P0/P1 findings. The correction broadens only valid native lexical syntax;
it does not broaden the allowed resolved directory. Windows mode authority is
not weakened because the filesystem has no additional executable-bit state
beyond Git's checked index/HEAD metadata. Rejected alternatives are
Frontend-local separator rewriting, disabling the guard on Windows, pretending
`chmod` changed NTFS state, or relying on WSL.

## Verification

Run the focused generated-path tests, source-identity mode negatives, the
complete Contracts artifact tests that consume the guards, and the Frontend
artifact unit suite under pinned Node 24.18.0. Strict-validate and run
`git diff --check`.
