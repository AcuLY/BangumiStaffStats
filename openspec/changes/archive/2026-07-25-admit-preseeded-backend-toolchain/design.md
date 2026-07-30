## Context

Formal integrated acceptance copies and seals every current tool closure, then
runs owner gates with outer file-write denial and an unconditional final
reseal. Backend's authoritative gate currently downloads Go into
`backend/.cache/go-mod`, recursively chmods the cache, and removes it in both
its entry cleanup and EXIT trap. A copied GOROOT placed elsewhere fails the
owner gate; a copied GOROOT placed at the expected location is destroyed
before use and cannot be resealed after exit.

| Boundary | Declaration |
|---|---|
| Status | Prerequisite to integrated acceptance. |
| Owner | One Backend apply subagent; main agent specifies, reviews, commits, and accepts. |
| Writable paths | `backend/scripts/check.sh`; new focused helper/test scripts; only the acceptance-mode `GOTOOLCHAIN` branch in seven existing wire-generator shell entrypoints; task markers. |
| Read-only protected inputs | All tracked paths outside the exact declared check/helper/test/generator-script set and task markers, especially paused `contracts/acceptance/**`; all external/frozen evidence roots. |
| Deletion complement | No tracked deletion; only exact documented runtime cleanup. |
| Mutable refs | None during apply. |
| Consumes | Pinned Go 1.26.5 module contract and copied complete module/toolchain closure. |
| Produces | One explicit sealed-toolchain branch in the existing gate. |
| Dependencies | Existing Bash/macOS/Go only. Dependency direction remains acceptance harness -> owner gate -> admitted Go; product runtime does not depend on the harness. |
| Deliverables | Narrow script diff and executable evidence. |
| Acceptance | Default regression, strict negative admission, real write-denied full gate, failure cleanup, complete final reseal, strict OpenSpec. |
| Non-goals | Product behavior, API, dependency, contract, artifact format, frontend/oracle, or operational change. |
| Operations deferred | Release/deploy/migration/production activation remain deferred. |
| Stop/rollback conditions | Stop on any scope, seal, cleanup, compatibility, or independent-review failure; reverse only the exact script diff. |

## Goals / Non-Goals

**Goals:**

- Allow the unmodified authoritative command sequence to consume one exact
  preseeded Go closure without weakening outer write denial or final reseal.
- Preserve ordinary developer/CI behavior exactly.
- Fail before product checks on unsafe or ambiguous admission.
- Keep failure cleanup exact and leave the evidence-bearing closure intact.

**Non-Goals:**

- General external GOROOT selection, configurable cache roots, another
  historical-tool exception, or a reusable sandbox framework.
- Generator-script rewrites, dependency updates, product changes, artifacts,
  release, deployment, or production operations.
- Any visual or interaction change. Oracle preservation remains governed by
  commit `644b7748674e553f863d0ffd61d029f86fdc0717`.

## Decisions

### Use one explicit path-valued acceptance variable

`BGMSS_ACCEPTANCE_GOROOT` both opts in and names the authority. Set-empty is
different from unset and fails. A second boolean would create invalid
combinations. The only accepted value is the exact physical
`$backend_root/.cache/go-mod/golang.org/toolchain@v0.0.1-go1.26.5.darwin-arm64`
path. The script rejects an inherited `GO_BOOTSTRAP`, validates the path before
the first ordinary cleanup, and then exports its exact `bin/go` as
`GO_BOOTSTRAP`. The seven child generators retain `GOTOOLCHAIN=local` only
when this exact admitted mode is present; their ordinary branch remains
unchanged.

Alternatives rejected:

- A GOROOT outside `backend/.cache/go-mod` conflicts with the owner gate and
  creates a second cache contract.
- Reusing caller `GO_BOOTSTRAP` is ambiguous and can diverge between the parent
  gate and child generators.
- Weakening acceptance to per-invocation hashes cannot prove immutable
  lifecycle or final-tree equality.

### Split cleanup by mode, not by broad exclusions

Ordinary mode keeps the current recursive cleanup. Acceptance mode first
requires its writable roots absent, then owns only four exact roots:
`go-build`, `go-path`, `npm`, and `.tmp`. Cleanup operates only on those
roots; it never recursively chmods or traverses `go-mod`. This avoids
path-exclusion recursion and makes the deletion complement reviewable.

The complete preseeded `go-mod` root, rather than only GOROOT, is preserved
because Go module commands also consume the sealed module cache. The harness
pre-attests and write-denies that full closure.

### Make admission structural and identity-bearing

The script accepts only the exact fixed path; proves each cache/GOROOT/bin
component real and non-symlink; and checks the cache completion marker,
VERSION, compiler, runtime source, and regular executable single-link
`go`/`gofmt` witnesses. It asks the admitted `go` for `GOVERSION`, `GOROOT`,
and `go version`, requiring exact Go 1.26.5 darwin/arm64 identity and the
reported root to equal the admitted physical path. It uses macOS Bash
3.2-compatible set/unset detection, `pwd -P`, explicit `-L` checks, and
macOS `stat`; it does not rely on Bash 4 `[[ -v ]]` or GNU `readlink -f`.
These checks prevent an innocuous-looking directory from redirecting
execution or selecting an automatic alternate toolchain.

The harness still owns the stronger full-tree digest, inode, mode, link,
write-denial, and unconditional final-reseal proof. The product gate does not
duplicate that substantial verifier.

### Keep the candidate boundary honest

This script is tracked product-source evidence, so successful apply creates a
new product candidate revision/tree. All three accepted artifacts and the
compatibility manifest will be rebuilt against that one candidate. The frozen
offline-input manifest will be regenerated with the new candidate identity;
no old sealed root will be edited in place.

No library is added. Bundle/runtime cost is zero; the only execution cost is
bounded path/version validation at gate startup.

The validation/cleanup functions live in one repository-owned shell helper
used by `check.sh`; a focused committed shell test exercises fixtures without
recursively invoking the full quality matrix. The full ordinary and sealed
runs remain end-to-end acceptance.

## Risks / Trade-offs

- **[Child generators reset some Go environment values]** -> Export the exact
  admitted `GO_BOOTSTRAP`, make their existing assignment choose `local` only
  in admitted mode, and verify all child processes use it while outer
  write-denial prevents closure mutation.
- **[A trap could hide the original failure]** -> Cleanup is best-effort over
  exact owned roots and retains the incoming exit status.
- **[A symlink/hardlink bypass could redirect authority]** -> Validate every
  descendant segment and both executables before product checks; cover each
  rejection with targeted evidence.
- **[Frozen inputs become stale after the source change]** -> Build a new
  candidate/artifact set and a new immutable cache manifest; retain old roots
  read-only until replacement admission succeeds.

## Migration Plan

1. Strict-validate and approve this change.
2. Implement only the exact declared check/helper/test/generator-script set,
   then run negative admission probes, focused command/signal-failure cleanup,
   ordinary full gate, and real sealed full gate with independent post/final
   reseal.
3. Obtain independent zero-P0/P1 review and commit the prerequisite.
4. Sync and archive this change.
5. Build/freeze a new single-revision artifact set and cache manifest, then
   resume integrated acceptance against only that new candidate.
6. If any step fails, stop; retain frozen evidence and reverse only the owned
   script patch. There is no deployment rollback because operations are out of
   scope.

## Open Questions

None. Apply begins only after main-agent approval.
