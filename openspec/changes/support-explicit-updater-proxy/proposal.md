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
| Status | Proposed after the production updater's first safe `HTTPS_REQUEST_FAILED`; apply remains blocked pending complete strict-valid artifacts and zero-P0/P1 review. |
| Owner | Main agent: specification/audit/acceptance/Git. One implementation subagent: exact updater and operations repository changes. Production deployment remains owned by the existing activation change after a new green artifact exists. |
| Writable paths | This change; `updater/README.md`; `updater/src/bangumi_staff_stats_updater/producer/{acquisition.py,service.py}`; `updater/src/bangumi_staff_stats_updater/cli.py`; `updater/tests/{test_cli.py,producer/test_acquisition.py,producer/test_service.py}`; `operations/compose.updater-proxy.yaml`; `operations/{README.md,env.example}`; `operations/bin/{deploy,validate-isolated,build-bundle.sh}`; `operations/lib/common.sh`; and new `operations/test/updater-proxy.sh`. |
| Read-only protected inputs | All contracts, backend, frontend, unrelated updater/operations behavior, accepted prototype/product behavior, current production state, `myserver`, external proxy configuration/credentials, and every path not listed writable. |
| Deletion complement | No file, dependency, generated artifact, host object, or external state. Tests may remove only their own exact temporary roots through existing cleanup. |
| Mutable refs | This change's task state, implementation commit A, artifact-pin commit B, and their branch push only. No remote runtime, deployment, release, tag, PR, or production ref is writable here. |
| Consumes | Existing strict HTTPS origin/redirect/size/digest gates; current one-shot CLI; existing operations release-env/Compose/rollback model; confirmed `myserver-proxy:7897` topology as read-only design evidence. |
| Produces | Optional explicit updater proxy input plus an optional paired operations proxy overlay, fully covered by existing component and Actions gates. |
| Dependencies | Complete artifacts and zero-P0/P1 review → updater/operations implementation commit A → `operations/bin/build-bundle.sh` accepted-product pin updated to exact A in commit B → full Development Actions at B → new exact `linux/amd64` operations artifact → separate production activation amendment. |
| Deliverables | Strict-valid OpenSpec, implementation and tests, updated documentation, green Development Actions, and an admitted replacement artifact. |
| Acceptance | Invalid/missing-half/credentialed proxy configuration fails before staging or external network and may record only sanitized lifecycle event/status evidence; generic HTTP/HTTPS/ALL/NO proxy variables cannot select or bypass transport; configured requests preserve target allowlists, redirects, bounds, digests, and TLS; explicit preserve/direct/proxy deploy modes are unambiguous; conflicting shell values cannot override root-managed release env; Compose projection adds only the release-authorized external network/URL to updater; `operations/test/updater-proxy.sh` runs inside `build-bundle.sh`; component/full Actions gates are green. |
| Non-goals | No source-origin expansion, TLS bypass, transparent proxy/TUN/NAT, raw-IP pin, retry framework, new dependency, API/frontend change, public routing, host mutation, updater execution, or legacy retirement. |
| Operations deferred | Installing the new artifact, projecting exact `proxy-net`/`myserver-proxy:7897`, one reviewed production retry, timer/Nginx integration, and cutover remain in `activate-single-host-production`. |
| Stop/rollback conditions | Stop on validation, test, security-boundary, commit-A identity, artifact pin, or Actions failure. Preserve prior bytes and do not touch production. A later deployment failure restores the previous application env and exact transport mode through the existing operations transaction. |

External behavior classification: **PRESERVE_ORACLE** at
`644b7748674e553f863d0ffd61d029f86fdc0717`; this transport-only change creates
no product-visible behavior. It touches no other repository or external
state. Apply is blocked until proposal, specs, design, and tasks are complete,
strictly valid, explicitly reviewed, and approved by the main agent.
