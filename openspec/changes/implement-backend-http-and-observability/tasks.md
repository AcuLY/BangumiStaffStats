## Task Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; committed/pushed/released/deployed: no |
| Owner | One Backend owner applies; main agent audits and accepts. |
| Writable paths | Exact apply paths in `proposal.md`, plus this file's task markers. |
| Read-only protected inputs | Accepted Archive state, contracts/generated wire, guides/root specs, other code/changes, refs/remotes, hosts, and production. |
| Deletion complement | None. |
| Mutable refs | None during apply. |
| Consumes | Reviewed artifacts and accepted runtime/query-wire/Archive-consumer capabilities. |
| Produces | HTTP runtime, three runtime routes, metrics/events, tests, guards, and docs. |
| Dependencies | Apply is blocked until `implement-backend-archive-consumer` is accepted and these artifacts are approved. |
| Deliverables | Exact proposal deliverables with no new dependency. |
| Acceptance | Transport/fuzz/cancel/health/metrics/event/race/full backend/OpenSpec/residue gates. |
| Non-goals | Business endpoints, Archive/producer/updater logic, pprof, monitoring/operations, external mutation. |
| Operations deferred | Production exposure/limits, scrape/alerts/retention/SLOs, service/proxy config, activation/release/deploy. |
| Stop/rollback conditions | Stop on preflight drift or any failed gate; revert only owned bytes and never use reset-hard, checkout rollback, clean, `git add -A`, broad deletion, stage, commit, archive, or push. |

## 1. Backend owner preflight

- [ ] 1.1 Verify branch/HEAD/index, allowed concurrent dirty paths, exact writable/protected inventory, accepted Archive-consumer exit evidence, and main-approved strict-valid 4/4 artifacts; stop before mutation on any mismatch.
- [ ] 1.2 Record the baseline targeted/full backend checks and hashes of generated wire, Archive interfaces, module manifests, and every existing writable file.

## 2. HTTP runtime

- [ ] 2.1 Implement bounded `http.Server` lifecycle and request-ID, recovery, deadline, cancellation, commit-aware response, exact-route/method, and shared-envelope middleware in the enumerated HTTP files.
- [ ] 2.2 Implement the capped one-value strict JSON decoder and direct/fuzz tests for media/content encoding, size boundary, unknown/trailing/malformed/non-finite input, stable codes, safe fields, and bounded allocation.
- [ ] 2.3 Implement `/livez` plus injected `/readyz` over only the published Archive store and fixed one-second identity query; test not-ready/ready/probe-failure/shutdown transitions and prove no Archive validation or business route.

## 3. Observability

- [ ] 3.1 Implement the standard-library typed metric registry and `/metrics` exposition with fixed enums, units, atomic snapshot, current-snapshot-only dataVersion, and no arbitrary labels.
- [ ] 3.2 Implement typed one-line JSON app/query event constructors with mutual exclusion, health-scrape silence, stable allowlists, and no raw request/error, UID, credential/token, upstream body, query/entity, or `update_activated`.
- [ ] 3.3 Test metric parsing/cardinality/histogram consistency/concurrency and event validity/redaction/control-character/unknown-field rejection under ordinary and race runs.

## 4. Assembly and owner acceptance

- [ ] 4.1 Assemble one Archive state and readiness adapter in app/cmd, keep load failure observable but not-ready, stop serving before closing state, and add lifecycle/cancellation/failure tests without external state.
- [ ] 4.2 Update only the declared architecture/inventory/check/README paths; assert dependency direction, exact routes, no new module, no protected/generated drift, and no forbidden feature or operations artifact.
- [ ] 4.3 Run formatting, targeted/full/fuzz/race/vet/build, architecture/inventory, strict change/all/doctor, diff/residue checks; report investigated/implemented/verified/committed/pushed/released/deployed status without staging.

## 5. Main-agent acceptance

- [ ] 5.1 Recheck dependency acceptance, HEAD/index/dirty scope and protected hashes; audit the complete owned diff, error/privacy/timeout/readiness semantics, and rerun all material gates.
- [ ] 5.2 Confirm zero out-of-scope/external/operations mutation, record exact status, then perform lifecycle work separately only if accepted; do not start downstream apply here.
