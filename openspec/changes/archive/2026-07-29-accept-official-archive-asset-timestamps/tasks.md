| Field | Declaration |
|---|---|
| Status | Implementation and exact-head artifact accepted; lifecycle handoff in progress. |
| Owner | Main agent directly owns all repository work under the user's latest no-unnecessary-subagent rule. |
| Writable paths | This change/archive destination; `updater/src/bangumi_staff_stats_updater/producer/acquisition.py`; `updater/tests/producer/test_acquisition.py`; exact accepted-product literal in `operations/bin/build-bundle.sh`; `openspec/specs/updater-archive-producer/spec.md`; four existing activation proposal/design/spec/tasks artifacts. |
| Read-only protected inputs | Every other repository path; all external repositories/hosts/artifacts/runtime state. |
| Deletion complement | No persistent file/dependency; exact existing test-temporary cleanup only. |
| Mutable refs | Completed implementation/pin sequence through accepted product `8282996f3f0cb0e2cde2a91ce71d425217ffa9d6` and source `be48847bc26bcda28c9f08f6807f5dec40d479f4`; narrow lifecycle push. |
| Consumes | Reviewed artifacts, upstream evidence, current code/tests, failed production evidence. |
| Produces | Accepted focused parser/test correction and replacement artifact. |
| Dependencies | Approval → implementation → audit/A → pin-only B → Actions/artifact → sync/archive and activation handoff. |
| Deliverables | Proposal deliverables only. |
| Acceptance | Delta scenarios, focused and full Actions gates, exact artifact evidence, clean diff/status. |
| Non-goals | Proposal non-goals only. |
| Operations deferred | No host write, updater invocation, Nginx/systemd/logrotate, cutover, or legacy action in this change. |
| Stop/rollback conditions | Stop on branch/HEAD/dirty-scope/artifact/review/Actions mismatch; never reset, clean, or mutate external state. |

## 1. Main-agent specification approval

- [x] 1.1 Strict-validate proposal/design/delta/tasks and all specs, audit the upstream evidence and retained identity gates, record zero P0/P1 findings, and approve or stop before implementation.

## 2. Main-agent focused updater correction

- [x] 2.1 Preflight branch `codex/minimal-single-host-ops`, exact starting HEAD `b3bd03439b66bf90cbc734aeb126fb57e1c4ae60`, dirty scope limited to this new change, no conflicting owner, and complete reviewed artifacts; stop on mismatch.
- [x] 2.2 Remove only the unsupported dump-name-time equals `created_at` condition and add the exact 2026-07-28 official positive regression plus mutations covering every retained field/cross-binding/time-order failure in `test_acquisition.py`.
- [x] 2.3 Perform lightweight source/diff checks only; do not run product tests/builds locally or on `myserver`, and leave all executable verification to Development Actions.

## 3. Main-agent candidate and artifact acceptance

- [x] 3.1 Audit the complete candidate against the delta, require zero P0/P1 findings, strict-valid OpenSpec/all-spec and clean diff/status, then create narrow implementation commit A without changing the accepted-product pin.
- [x] 3.2 Pin the implementation, correct the sole Actions-reported Ruff formatting issue directly, pin exact accepted product `8282996f3f0cb0e2cde2a91ce71d425217ffa9d6` in source `be48847bc26bcda28c9f08f6807f5dec40d479f4`, push, and require the remote branch to equal that source.
- [x] 3.3 Require green exact-source Development Actions run `30449279352` and admit its sole replacement `linux/amd64` artifact `8723283346`, matching source/tree/platform/closed nine-file inventory/eight checksums.

## 4. Main-agent lifecycle and production handoff

- [x] 4.1 Sync the delta to the main updater spec, archive this completed change, strict-validate all specs, and amend `activate-single-host-production` with the exact failed UUID/evidence, B2 private baseline, exact replacement artifact/runtime-file inventory, and exactly one newly authorized updater invocation before any host action.
- [x] 4.2 Narrowly commit/push only the OpenSpec lifecycle/handoff, require the remote branch to match, and report that host execution remains blocked until the activation amendment is accepted.
