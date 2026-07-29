| Field | Declaration |
|---|---|
| Status | Specification complete pending strict validation and main-agent approval. No implementation/release/deploy claim. |
| Owner | Main agent: specification, audit, Git, acceptance, archive. Bundle owner: workflow plus `build-bundle.sh`. Runtime owner: remaining `operations/**`. Remote validation owner: exact admitted `myserver` command set after green gates. |
| Writable paths | Proposal-declared paths, split exactly by owner below. |
| Read-only protected inputs | Proposal-declared Product/repository/host inputs. |
| Deletion complement | No repository deletion; exact run-owned validation cleanup only. |
| Mutable refs | Implementation branch/push, manual artifact, validation root/project/ports/images. |
| Consumes | Accepted Product revision, existing build helpers/endpoints/fixture, operations guide, host capabilities. |
| Produces | Minimal bundle/runtime/templates plus isolated validation result. |
| Dependencies | Spec approval → parallel repository implementation → green Development Actions → AMD64 bundle → host preflight/validation/cleanup → audit/archive. |
| Deliverables | Reviewed files, commits/push, green runs, remote evidence, archived capability, report. |
| Acceptance | Delta scenarios; local work is static only, executable product/build/Compose gates run in Actions or isolated `myserver` containers. |
| Non-goals | Proposal exclusions, especially receipt/handoff/proof/control-runtime expansion. |
| Operations deferred | Public/production activation, secrets, traffic, extended observation, legacy retirement. |
| Stop/rollback conditions | Stop on scope/identity/collision/health/cleanup/legacy drift; restore validation-local previous state and touch nothing else. |

## 1. Specification and baseline

- [ ] 1.1 Main agent verifies branch
  `codex/minimal-single-host-ops`, exact base
  `34176077787b7942741ae412d3f012c732a51ee0`, and that only this change is
  dirty; strict-validate and commit/push the reviewed OpenSpec before apply.
- [ ] 1.2 Record `codex/ops-authority-superseded` as preserved but outside the
  completion path. Do not cherry-pick its receipt/schema/handoff/control
  runtime or tests.

## 2. One-build Actions bundle

- [ ] 2.1 Bundle owner preflights the reviewed change, clean implementation
  base, and exact writable files `.github/workflows/operations-preview.yml`,
  the one conditional caller job in `.github/workflows/ci.yml`, and
  `operations/bin/build-bundle.sh`, plus only the action-reference
  declaration/assertion in `contracts/artifacts/test/ci-policy.test.mjs`; stop
  on any other dirty path.
- [ ] 2.2 Implement a reusable read-only workflow with pinned existing setup
  Actions and pinned one-day `actions/upload-artifact`, called only by the
  existing Development workflow's manual dispatch path. Build Backend and
  Updater once for `linux/amd64`, build Frontend once, assemble only the
  declared bundle files, write `build.json` and `SHA256SUMS`, and publish
  nothing else. Ordinary push/PR runs SHALL NOT invoke the bundle job.
- [ ] 2.3 Add static workflow/shell checks for exactly five reviewed
  SHA-pinned external Actions, exactly one same-revision local reusable
  workflow reference, read-only permission, no other
  local/URL/Docker/mutable Action reference, no
  secret/registry/release/deploy authority, one build per component, closed
  bundle inventory, and shell syntax. Run only `bash -n`, YAML/text
  inspection, pinned OpenSpec validation, and `git diff --check` locally.

## 3. Minimal single-host runtime and templates

- [ ] 3.1 Runtime owner preflights the reviewed change and limits writes to
  `operations/**` excluding `operations/bin/build-bundle.sh`; stop if Bundle
  owner paths or Product paths are dirty.
- [ ] 3.2 Implement `operations/compose.yaml`, env example, and shared shell
  helpers with unique project/root/image variables, loopback API/Prometheus,
  API/updater/Prometheus topology, resource/security limits, private data
  mounts, and journald logging.
- [ ] 3.3 Implement small `deploy`, `update`, `rollback-app`, `rollback-data`,
  `check`, and isolated-validation commands. Require exact arguments/root,
  one non-waiting lock, checksum admission, atomic env/pointer/link switches,
  bounded readiness, separate rollback dimensions, and explicit
  current/previous rollback references. Do not automatically delete historical
  releases or Archive versions.
- [ ] 3.4 Add inert Nginx, logrotate, systemd service/timer/journal, Prometheus
  scrape/rule files, and concise operator README. Keep public activation,
  secrets, service enablement, Nginx reload, and legacy retirement absent.
- [ ] 3.5 Run only local static `bash -n`, Compose/YAML source checks without
  Docker execution, pinned OpenSpec validation, and `git diff --check`;
  executable Compose/template/product validation remains Actions/remote-owned.

## 4. Review, staged commits, and Actions

- [ ] 4.1 Main agent audits the two owner diffs for exact scope, normal
  operability, rollback correctness, legacy isolation, and absence of excluded
  proof machinery; route only substantive defects back to the matching owner.
- [ ] 4.2 Commit the Actions bundle and runtime/templates in separate reviewed
  commits, push, and require exact-head `development-artifacts` green.
- [ ] 4.3 Manually dispatch the registered `development-artifacts` workflow,
  require its reusable `operations-preview` build job green, download the one
  artifact without executing product code locally, verify its checksum
  inventory, and bind its exact run/head.

## 5. Isolated myserver validation

- [ ] 5.1 Remote owner performs read-only preflight on `myserver`: require
  `linux/amd64`, Docker/Compose, Nginx/systemd validation tools, curl/flock,
  disk; exact absence of the transfer root and
  `/srv/bgmss-ops-validation-minimal-<run-id>` and unique Compose project;
  free `127.0.0.1:19090/19091`; capture legacy paths/projects/containers/
  listeners/Nginx/systemd identities before any write.
- [ ] 5.2 Transfer only the admitted bundle and reviewed `operations/**` into
  the exact absent `/tmp/bgmss-ops-minimal-input-<run-id>` root; the validator
  reads only that staging root, loads under run-specific tags, verifies
  `SHA256SUMS`, seeds the minimal Archive, renders `docker compose config`, and
  starts the unique project without a public port or legacy mount.
- [ ] 5.3 Require API `/livez`, `/readyz`, `/metrics`, Prometheus readiness and
  API scrape, expected journald driver/resource/security projection, updater
  `doctor`/contract path, one validation-local pointer switch/restoration,
  and one application restart/rollback.
- [ ] 5.4 Validate Nginx with a temporary prefix and systemd units with
  `systemd-analyze verify`; do not copy into `/etc`, enable/start/reload a
  service, or change TLS/routes/firewall.
- [ ] 5.5 Stop/remove only the unique project/containers/network/run-tagged
  images and exact validation root; compare every captured legacy field and
  both loopback ports after cleanup, then remove the exact caller-owned transfer
  root. Preserve/report any ambiguous residue and do not broaden cleanup.

## 6. Final audit and lifecycle

- [ ] 6.1 Main agent confirms zero P0/P1 within the minimal scope, exact-head
  green runs, successful remote checks/rollback/cleanup, unchanged Product and
  legacy state, and no claim of production activation.
- [ ] 6.2 Update only status/task evidence, strict-validate, synchronize
  `operations-single-host-deployment`, archive the change, commit/push, and
  report repository-defined versus isolated-validated versus deferred
  production states separately.
