## 1. Review and preflight

- [x] 1.1 Strict-validate and review this change, then pause the `/v2/` public
  cutover until the repaired image route passes production verification.
- [x] 1.2 Keep implementation within the Backend and operations paths listed in
  the proposal, with no dependency, contract, frontend, data, updater-source,
  base-Compose, Nginx, systemd, logrotate, or Prometheus change.

## 2. Backend image transport

- [x] 2.1 In `backend/internal/imageproxy/{client.go,client_test.go}`, implement canonical dedicated-proxy validation, closed direct/explicit-proxy transports, manual one-hop `api.bgm.tv` to `lain.bgm.tv` handling, and all existing transfer/error/cache bounds.
- [x] 2.2 In `backend/cmd/api`, `backend/internal/app`, and `backend/internal/httpapi`, pass the optional environment value into image-client construction before serving without adding an `app -> imageproxy` dependency; update focused tests and `backend/README.md`.
- [x] 2.3 Execute the focused Backend tests for exact `302 -> 200` and
  default-image success; invalid/credentialed/ambient/bypassed proxy inputs;
  invalid and second redirects; direct/proxy dial targets; conditional `304`;
  timeout/cancellation/permit release; status/MIME/header/declared-and-actual-size
  bounds; metadata sanitization; and safe error mapping. Development Actions
  run `30477869459` passed the complete Backend gate; no Go test was run
  locally.

## 3. Operations projection

- [x] 3.1 Update only `operations/compose.updater-proxy.yaml` so API receives `BGMSS_IMAGE_HTTPS_PROXY` and joins `updater_proxy`; keep updater unchanged and Prometheus isolated.
- [x] 3.2 Update `operations/test/updater-proxy.sh`, the static render in `operations/bin/validate-isolated`, and proxy wording in `operations/README.md`; prove direct mode remains closed and proxy mode gives each service only its intended environment/network projection.
- [x] 3.3 Run build, Go tests, Compose projection tests, and isolated validation
  through Development Actions or the approved remote container environment
  without starting updater or changing the external network. Development
  Actions run `30477869459` passed the complete Product gate. Permitted local
  checks were `gofmt`, Bash syntax, YAML parse, `git diff --check`, and strict
  OpenSpec validation; no Go, Compose, Docker, or container gate was run
  locally.

## 4. Repository and artifact acceptance

- [x] 4.1 Review the implementation diff and run static checks plus strict
  OpenSpec validation locally; require Development Actions to run the complete
  Backend and operations test/build gates. Independent review found zero
  P0/P1, and run `30477869459` passed the complete Product job.
- [x] 4.2 Commit and push the implementation. After its Product job is green,
  update only the accepted Product revision in
  `operations/bin/build-bundle.sh`, then require a final exact-head green run
  and one admitted `linux/amd64` operations artifact. Implementation commits
  `7e5902c5e9dff694c4ad1874a31d0b0b187bd5c2` and
  `fd4ff7339ff09bdb94e36a66f075629b4ab75e89`, followed by pin commit
  `ae70b2ada2529741bfc8bcfd4a248835bb2f915d`, were pushed. Exact-head
  Development Actions run `30480275932` passed Product and bundle jobs.
- [x] 4.3 Verify the artifact source, images, checksums, and replacement overlay
  before transferring it to the host. Artifact `8735918334`,
  `operations-preview-ae70b2ada2529741bfc8bcfd4a248835bb2f915d`, passed
  every bundle checksum and declared source revision
  `ae70b2ada2529741bfc8bcfd4a248835bb2f915d`, source tree
  `4bd528a2a8d73a1aedebe3d7bd34271ab3c32c5f`, platform `linux/amd64`,
  and replacement-overlay SHA-256
  `a0af2072e24b9e293720888fe3f89e144d02a323e3d2d870b287724794d868f8`.

## 5. Production deployment and rollback

- [x] 5.1 Recheck the current application, Archive pointers, proxy release
  settings/network, installed overlay, active Nginx, stopped loader, and
  available capacity before writing production state. The preflight bound the
  prior application to `9a5884048f6ed19d086f899f6459a8080683bb0a`,
  data version
  `dv1-9d794033f12b8bcd60d8c890115a76ca52060ae13b357b3c32e036f94bb67888`,
  active Nginx SHA-256
  `6fe8171ebd4a45eaa94cdba27f561d9207d433cd8bf1ef4e727c2e57a31fb7df`,
  proxy container `1ecd23c4512d…`, and stopped legacy loader
  `84d7ca5dcf10…`.
- [x] 5.2 Transfer and verify the admitted bundle, then deploy the application
  through the existing command with proxy mode preserved; verify
  readiness/catalog/metrics before touching the installed overlay. The
  reverified bundle was transferred below
  `/srv/bgmss-v2/incoming/run-30480275932/` and the normal deploy command made
  `ae70b2ada2529741bfc8bcfd4a248835bb2f915d` current while retaining
  `9a5884048f6ed19d086f899f6459a8080683bb0a` as previous; Archive,
  readiness, catalog, metrics, and Prometheus remained healthy.
- [x] 5.3 Under `/srv/bgmss-v2/data/operations.lock`, copy the verified overlay preimage into the run root, atomically install only `/srv/bgmss-v2/compose/compose.updater-proxy.yaml` among operations definitions, preserve root ownership/mode `0644`, and force-recreate API. The retained preimage is
  `/srv/bgmss-v2/incoming/run-30480275932/compose.updater-proxy.yaml.preimage`;
  the installed overlay equals the admitted `a0af2072…` bytes.
- [x] 5.4 Verify API has exact `BGMSS_IMAGE_HTTPS_PROXY` plus `backend`/`proxy-net`; updater retains only its existing proxy input/network and is not run; Prometheus retains only `backend`; readiness/catalog/metrics/scrape remain healthy; and representative loopback and unchanged routed image requests return one allowed non-empty body no larger than 8 MiB. Final loopback and public probes returned HTTP 200,
  `image/jpeg`, and 32959 bytes; Prometheus reported its API target `up`.
- [x] 5.5 On failure, restore the prior overlay, force-recreate API, and use the
  normal application rollback if needed. Confirm Archive, proxy lifecycle,
  Nginx, and the stopped loader remain unchanged. The first production overlay
  attempt exposed a transient upstream protocol result and exercised the exact
  overlay/API rollback before diagnosis. An isolated release-image probe and a
  repeated locked activation then passed without a product-code change.
  Archive, Nginx, proxy, and stopped loader identities did not drift; the
  application rollback was not needed.

## 6. Specification lifecycle

- [x] 6.1 After production acceptance, sync both deltas to their main specs,
  archive this change, strict-validate all specs, and record exact implemented,
  tested, committed, pushed, artifact, deployed, and rollback states. Both
  deltas were merged into the main specs, this change was archived at
  `openspec/changes/archive/2026-07-30-repair-production-image-proxy-egress`,
  and strict validation passed with zero failures.

## 7. Post-archive production compatibility amendment

- [x] 7.1 Reopen this change after repeated public and loopback probes disprove
  stable image acceptance. Reproduce the first hop with the exact release
  image and proxy, prove that empty and Go-default User-Agent values receive
  `403` while a fixed project value receives the approved `302`, and revise
  the proposal/design/delta before implementation.
- [x] 7.2 Set exact
  `AcuLY/BangumiStaffStats (https://github.com/AcuLY/BangumiStaffStats)` on
  both approved image GETs and add focused assertions that both hops use it
  while caller-controlled headers remain absent. Run no local build; require
  Development Actions for the full Backend/Product gates. Implementation
  commit `6465e54e676329bea9ed3173b180aa767a144368` was pushed, and exact-revision
  Development Actions run `30486870346` passed the complete Product job,
  including Backend, Updater, Frontend, contracts, double build, assembly,
  smoke, and residue gates.
- [x] 7.3 Commit/push the implementation, advance only the accepted Product
  revision after its green run, require a final exact-head green
  `linux/amd64` bundle, transactionally deploy it with the existing overlay,
  and prove repeated loopback/public image success without Archive, Nginx,
  proxy, updater, monitoring, or legacy drift. Pin commit
  `1150a94e77dcd7e269bf58a96f5df93ba451882a` was pushed; manual run
  `30487900010` passed Product and bundle jobs and published artifact
  `8738853938` for source tree `c19729511e70befb4ec3ebc25910fc6838261f4c`.
  All bundle checksums passed locally and on `myserver`; the revision deployed
  transactionally with `ae70b2ada2529741bfc8bcfd4a248835bb2f915d`
  retained as previous. Three repetitions for each actual UI image class
  succeeded both on loopback and public `/v2/`, while Archive, Nginx, overlay,
  proxy identity, updater timer, Prometheus target, stopped legacy loader,
  legacy root, and unrelated recoverable services remained unchanged.
- [x] 7.4 Sync the amended Backend delta, rearchive this change, strict-validate
  all specs, commit/push lifecycle evidence, and require final remote equality,
  clean worktree, and green Actions. The fixed code-owned upstream identity and
  its scenario were merged into the main Backend image-proxy specification,
  and the completed change returned to
  `openspec/changes/archive/2026-07-30-repair-production-image-proxy-egress`.
  Final repository and Actions equality are verified after the lifecycle
  commit so documentation-only completion does not trigger an extra commit
  cycle.
