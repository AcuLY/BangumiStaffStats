| Field | Declaration |
|---|---|
| Status | Planning complete; strict validation/review pending before apply. |
| Owner | Main agent directly owns all sequential work. |
| Writable paths | Change/archive destination; `operations/compose.yaml`; `operations/test/updater-proxy.sh`; `operations/README.md`; main operations spec; four activation artifacts. |
| Read-only protected inputs | Every other repository path and all external/host state. |
| Deletion complement | No persistent object/dependency; existing exact test temporaries only. |
| Mutable refs | Change task state, narrow commits, and branch push. |
| Consumes | Reviewed artifacts, exact production failure evidence, current operations bytes, SQLite official documentation. |
| Produces | Focused Compose/test/docs correction, green Actions evidence, and production handoff. |
| Dependencies | Approval → implementation → audit/commit/push → Actions → sync/archive/activation handoff. |
| Deliverables | Proposal deliverables only. |
| Acceptance | Delta scenarios, exact projection evidence, full Actions, strict specs, clean diff/status. |
| Non-goals | Proposal non-goals only. |
| Operations deferred | No host file install, updater invocation, systemd/logrotate/Nginx, cutover, or legacy action in this change. |
| Stop/rollback conditions | Stop on branch/HEAD/scope/review/Actions mismatch; never reset, clean, or mutate external state. |

## 1. Main-agent specification approval

- [x] 1.1 Strict-validate proposal/design/delta/tasks and all specs; audit the failure evidence, SQLite documentation, fixed path, projection boundary, writable scope, and alternatives; record zero P0/P1 findings and approve or stop.

## 2. Main-agent focused operations correction

- [x] 2.1 Preflight branch `codex/minimal-single-host-ops`, starting HEAD `2a39104d6f9e7d0112cd60c47d97b34b7689f03e`, dirty scope limited to this change, no conflicting owner, and complete reviewed artifacts.
- [x] 2.2 Add only exact updater `SQLITE_TMPDIR=/var/lib/bgmss/archive`; extend direct/proxy projection assertions for updater presence and API/Prometheus absence; document the SQLite-specific disk-spill boundary.
- [x] 2.3 Perform lightweight source/diff checks only; do not run product tests/builds locally or on `myserver`, and leave executable operations/product verification to Development Actions.

## 3. Main-agent candidate and Actions acceptance

- [x] 3.1 Audit the complete candidate against the delta, require zero P0/P1 findings, strict-valid OpenSpec/all-spec and clean diff/status, then create and push one narrow implementation commit; require the remote branch to match.
- [x] 3.2 Require one exact-head workflow-dispatch Development Actions run with both jobs green; verify run `30452886753` completed both jobs successfully at source `1505c5d7c36f457ed8d9e3be542e2422fe2811fc`, including the operations projection test in both build paths; admit artifact `8724804723` as evidence only without deploying its product bundle.

## 4. Main-agent lifecycle and production handoff

- [x] 4.1 Sync/archive this change and amend `activate-single-host-production` with failed run `6d7dd3d4-9eb4-472e-af09-0561dc313617`, current source/env/status/data baseline, exact old/new Compose identities, and exactly one newly authorized updater invocation.
- [x] 4.2 Strict-validate all specs and prepare one narrow OpenSpec lifecycle/handoff commit; keep host execution blocked until its push succeeds and the remote branch matches.
