## Context

Persistent inventory entries are already POSIX repository paths. On Windows,
the source-ownership loop derives paths with `path.relative()` and compares the
result directly, so every slash-sensitive rule is bypassed or misapplied.

## Decision

Normalize the derived relative source path once at its ownership boundary with
`split(path.sep).join(path.posix.sep)`. Keep filesystem access on native paths
and keep the existing expected arrays/rules unchanged. Add only the six exact
new persistent files reported by the checker.

Apply the same canonicalization to each relative path returned by the production
artifact walk. URL validation continues to require `/v2/`, strips that base,
and compares the resulting POSIX path against the exact emitted inventory.

The production-entry mount test remains fixture-free and keeps every assertion.
Its timeout changes from 10 to 30 seconds because two full-suite runs measured
10.2 and 17.1 seconds under parallel transform contention while an isolated run
completed in 5.3 seconds. Thirty seconds remains bounded and distinguishes a
real hang from ordinary full-suite contention.

## Review

Zero P0/P1 planning findings: standard-library path transformations fix the
source and artifact comparisons without relaxing a predicate, and the timeout change
does not remove or weaken an assertion. Rejected alternatives are
WSL/container-only acceptance, duplicating Windows variants in every rule, and
serializing the entire suite around one mount test.

## Verification

Run the checker and full Frontend gate through the pinned Node 24.18.0 binary on
Windows, then strict-validate this change and run `git diff --check`.
