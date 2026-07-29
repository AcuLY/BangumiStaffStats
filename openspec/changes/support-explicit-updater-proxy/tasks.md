| Field | Declaration |
|---|---|
| Status | Apply-ready only after strict validation and explicit zero-P0/P1 main-agent approval. |
| Owner | Main agent: spec/audit/task state/Git/acceptance. One implementation subagent: exact updater and operations repository block. |
| Writable paths | This change and exact proposal-declared updater/operations source, tests including `operations/test/updater-proxy.sh`, documentation, overlay, `operations/bin/build-bundle.sh`, and artifact-inventory paths. |
| Read-only protected inputs | Every other repository path; all external repositories, hosts, proxies, production state, artifacts, and refs until separately authorized lifecycle steps. |
| Deletion complement | No persistent file or dependency. Existing tests may delete only identity-checked temporaries they create. |
| Mutable refs | Change task state, implementation commit A, artifact-pin commit B, and this branch's narrow push. |
| Consumes | Reviewed proposal/spec/design, current updater/operations code, read-only proxy evidence. |
| Produces | Accepted explicit proxy implementation and a new green Actions artifact. |
| Dependencies | Approval → updater implementation → operations projection → audit/implementation commit A → pin A in artifact commit B → push → Actions/artifact → sync/archive. |
| Deliverables | Proposal deliverables only. |
| Acceptance | Delta scenarios, unchanged component/full CI gates, exact diff/status/artifact evidence. |
| Non-goals | Proposal non-goals only. |
| Operations deferred | No host write, updater retry, Nginx/systemd install, cutover, or legacy retirement in this change. |
| Stop/rollback conditions | Stop on branch/HEAD/dirty-scope/review/test/Actions/artifact mismatch; preserve prior bytes and do not mutate external state. |

## 1. Main-agent specification approval

- [x] 1.1 Strict-validate this change and all specs, confirm the exact branch/HEAD/dirty scope, complete an independent zero-P0/P1 proposal/spec/design/tasks review, and explicitly approve apply.

## 2. Implementation-owner updater transport

- [x] 2.1 Preflight the exact branch/HEAD, allowed dirty state limited to the two active OpenSpec changes, reviewed task status, and declared updater writable paths; stop on mismatch.
- [x] 2.2 Implement the dedicated `BGMSS_HTTPS_PROXY` request input, exact bounded canonical credential-free URL validation, a proxy handler immune to ambient HTTP/HTTPS/ALL/NO variables and bypass (including `NO_PROXY=*`), unchanged direct/TLS/origin/redirect/content behavior, sanitized failures, and focused CLI/acquisition/service tests without adding dependencies or writing outside declared updater paths.
- [x] 2.3 Run only lightweight source/static checks needed while editing; leave all product test/build execution to Development Actions as the user directed, and report exact implemented versus unverified state.

## 3. Implementation-owner operations projection

- [x] 3.1 Recheck branch/HEAD/dirty ownership before touching operations and stop if another owner or undeclared path overlaps.
- [x] 3.2 Add explicit preserve/direct/proxy release semantics, strict URL/network validation, tracked updater-only proxy overlay, common wrapper selection, pre-change-env compatibility, previous-env rollback preservation, and child-process isolation from ambient transport/URL/network variables; update docs/examples and isolated inventory without mutating a host or external network.
- [x] 3.3 Add `operations/test/updater-proxy.sh` and invoke it from `build-bundle.sh` before product builds; cover direct, valid proxy, partial/duplicate/invalid-before-lock-and-image-load, preserve/proxy/direct transitions, previous-env rollback, ambient-conflict authority, and Compose JSON proving only updater gains the exact release URL/external network while API/Prometheus stay closed; leave execution to Development Actions and report implemented versus unverified state.

## 4. Main-agent candidate and Actions acceptance

- [x] 4.1 Audit every implementation byte against both deltas, require zero P0/P1 findings, run strict OpenSpec/all-spec and diff/status checks, and narrowly create implementation commit A without changing the existing accepted-product pin.
- [ ] 4.2 Change only the reviewed accepted-product revision in `operations/bin/build-bundle.sh` to exact implementation commit A, re-audit the guard, create artifact commit B, narrowly push both commits, and verify the remote branch equals B.
- [ ] 4.3 Require green Development Actions for exact artifact commit B and admit exactly one new `linux/amd64` operations artifact with matching source/platform/closed inventory/checksums.

## 5. Main-agent lifecycle

- [ ] 5.1 Sync both deltas to main specs, archive this completed change, strict-validate all specs, narrowly commit/push the lifecycle, and amend `activate-single-host-production` with exact B/run/artifact plus a closed Git-blob/hash inventory for the separately transferred operations definitions (including the overlay) and the reviewed production proxy projection before any retry.
