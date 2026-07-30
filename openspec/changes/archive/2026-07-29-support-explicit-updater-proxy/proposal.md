## Why

The first production Archive update failed safely because direct
`raw.githubusercontent.com` traffic from `myserver` is intermittently
black-holed. The existing `myserver-proxy:7897` path is reliable, but the
updater deliberately ignores generic proxy environment variables and its
Compose service cannot currently reach `proxy-net`.

## What Changes

- Add one optional, explicit updater HTTPS-proxy input. Accept only a bounded
  credential-free canonical `http://HOST:PORT` proxy URL and continue to
  ignore all generic HTTP/HTTPS/ALL/NO proxy environment inheritance.
- Route only approved HTTPS requests through that proxy while preserving the
  existing destination/redirect allowlists, response bounds, digest checks,
  and end-to-end TLS certificate validation.
- Add an optional operations proxy overlay and paired release settings so the
  one-shot updater can join one explicitly named existing external network.
  API and Prometheus topology, ports, mounts, resources, and routing remain
  unchanged.
- Extend updater and operations tests, build gates, and documentation without
  adding a runtime dependency.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `updater-archive-producer`: Admit one strictly validated explicit HTTPS proxy
  transport without weakening source identity or TLS requirements.
- `operations-single-host-deployment`: Persist and project an optional paired
  updater proxy URL/network while preserving the minimal single-host topology.

## Impact

| Field | Declaration |
|---|---|
| Status | Implemented and accepted after zero-P0/P1 review and green exact-head Actions; production projection remains delegated to `activate-single-host-production`. |
| Owner | Main agent: specification/audit/acceptance/Git. One implementation subagent: exact updater and operations repository changes. Production deployment remains owned by the existing activation change after a new green artifact exists. |
| Writable paths | This change; `updater/README.md`; `updater/src/bangumi_staff_stats_updater/producer/{acquisition.py,service.py}`; `updater/src/bangumi_staff_stats_updater/cli.py`; `updater/tests/{test_cli.py,producer/test_acquisition.py,producer/test_service.py}`; `operations/compose.updater-proxy.yaml`; `operations/{README.md,env.example}`; `operations/bin/{deploy,validate-isolated,build-bundle.sh}`; `operations/lib/common.sh`; and new `operations/test/updater-proxy.sh`. |
| Read-only protected inputs | All contracts, backend, frontend, unrelated updater/operations behavior, accepted prototype/product behavior, current production state, `myserver`, external proxy configuration/credentials, and every path not listed writable. |
| Deletion complement | No file, dependency, generated artifact, host object, or external state. Tests may remove only their own exact temporary roots through existing cleanup. |
| Mutable refs | This change's task state, implementation commit A, artifact-pin commit B, and their branch push only. No remote runtime, deployment, release, tag, PR, or production ref is writable here. |
| Consumes | Existing strict HTTPS origin/redirect/size/digest gates; current one-shot CLI; existing operations release-env/Compose/rollback model; confirmed `myserver-proxy:7897` topology as read-only design evidence. |
| Produces | Optional explicit updater proxy input plus an optional paired operations proxy overlay, fully covered by existing component and Actions gates. |
| Dependencies | Implementation A1 `25791670b38914c4d7d1e885df5d719c061acf50` → pin B1 `2ed66558f55ed13f16dcafedf61afd5797b512cb` → Actions run `30443632555` exposed one test-only mypy issue → focused fix A2 `7d2aa05853e55499a35d0afd9f6e4cb2dd3be17a` → final pin/artifact commit B2 `016160f7a63d68639a50e226c052fe75d5888f5f` → green run `30444069918` and admitted artifact `8721121158`. |
| Deliverables | Complete: strict-valid OpenSpec, implementation and tests, updated documentation, green Development Actions, and admitted replacement artifact `operations-preview-016160f7a63d68639a50e226c052fe75d5888f5f`. |
| Acceptance | Satisfied at B2: invalid/missing-half/credentialed proxy configuration fails before staging or external network and may record only sanitized lifecycle event/status evidence; generic HTTP/HTTPS/ALL/NO proxy variables cannot select or bypass transport; configured requests preserve target allowlists, redirects, bounds, digests, and TLS; explicit preserve/direct/proxy deploy modes are unambiguous; conflicting shell values cannot override root-managed release env; Compose projection adds only the release-authorized external network/URL to updater; `operations/test/updater-proxy.sh` runs inside `build-bundle.sh`; both run `30444069918` jobs are green; artifact source/platform/closed inventory/checksums are accepted. |
| Non-goals | No source-origin expansion, TLS bypass, transparent proxy/TUN/NAT, raw-IP pin, retry framework, new dependency, API/frontend change, public routing, host mutation, updater execution, or legacy retirement. |
| Operations deferred | Installing the new artifact, projecting exact `proxy-net`/`myserver-proxy:7897`, one reviewed production retry, timer/Nginx integration, and cutover remain in `activate-single-host-production`. |
| Stop/rollback conditions | Stop on validation, test, security-boundary, commit-A identity, artifact pin, or Actions failure. Preserve prior bytes and do not touch production. A later deployment failure restores the previous application env and exact transport mode through the existing operations transaction. |

External behavior classification: **PRESERVE_ORACLE** at
`644b7748674e553f863d0ffd61d029f86fdc0717`; this transport-only change creates
no product-visible behavior. It touches no other repository or external
state. Repository apply and Actions acceptance are complete. Production use is
authorized only through the separately amended and reviewed
`activate-single-host-production` change.
