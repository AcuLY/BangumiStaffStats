| Boundary | Declaration |
|---|---|
| Status | specified/main-agent reviewed; apply begins only after strict validation |
| Owner | One Backend implementation agent; no staging, commit, ref, remote, or external mutation |
| Writable paths | Exact paths declared in `proposal.md`, plus these task markers |
| Protected state | All other repository paths and all external/ref/host state |
| Acceptance | Focused/repeated/race plus full Backend and strict OpenSpec gates |

## 1. Typed execution observations

- [x] 1.1 Add the closed request-scoped query trace; prove finite durations,
  fixed order, concurrent safety, one freeze, and rejection of unknown phases
  or cache outcomes.
- [x] 1.2 Instrument result/collection cache and the five services so the trace
  distinguishes collection, cache, SQLite, compute, and projection without
  recording identifiers or changing query results.
- [x] 1.3 Freeze the trace before first response commitment; render the same
  values as a deterministic `Server-Timing` header and phase histograms for
  typed business routes, including error/timeout/cancellation boundaries.

## 2. Safe metrics and events

- [x] 2.1 Extend the typed registry with fixed phase, queue, three-cache,
  SQLite, collection/image upstream, and updater-status families using seconds
  and bytes with closed labels only.
- [x] 2.2 Enrich terminal query events only with closed scope/cache outcomes and
  fixed phase durations; preserve mutual exclusion, exactly-once emission, and
  all accepted redaction rules.
- [x] 2.3 Implement the bounded read-only update-status v1 consumer and verify
  positive/negative contract goldens, duplicate keys, symlinks, size bounds,
  replacement, missing/malformed state, and no effect on ordinary API routes.

## 3. Process assembly and acceptance

- [x] 3.1 Wire one process runtime stats provider, sampled once per scrape, and
  an optional explicit update-status path while preserving existing app/CLI
  call compatibility and readiness semantics.
- [x] 3.2 Prove header/histogram identity, no sensitive strings, fixed
  cardinality, monotonic counters, non-additive runtime totals, concurrent
  parseable scrapes, and unchanged API bodies.
- [x] 3.3 Run focused tests repeatedly, race tests for affected packages,
  `go test ./...`, `go vet ./...`, `go build ./...`, `./scripts/check.sh`,
  strict OpenSpec validation, `git diff --check`, and exact path/residue audit;
  freeze the unstaged candidate for main-agent review.
