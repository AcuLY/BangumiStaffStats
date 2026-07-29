## 1. Review and preflight

- [x] 1.1 Strict-validate and review this change, then pause the `/v2/` public
  cutover until the repaired image route passes production verification.
- [x] 1.2 Keep implementation within the Backend and operations paths listed in
  the proposal, with no dependency, contract, frontend, data, updater-source,
  base-Compose, Nginx, systemd, logrotate, or Prometheus change.

## 2. Backend image transport

- [x] 2.1 In `backend/internal/imageproxy/{client.go,client_test.go}`, implement canonical dedicated-proxy validation, closed direct/explicit-proxy transports, manual one-hop `api.bgm.tv` to `lain.bgm.tv` handling, and all existing transfer/error/cache bounds.
- [x] 2.2 In `backend/cmd/api`, `backend/internal/app`, and `backend/internal/httpapi`, pass the optional environment value into image-client construction before serving without adding an `app -> imageproxy` dependency; update focused tests and `backend/README.md`.
- [ ] 2.3 Execute the focused Backend tests for exact `302 -> 200` and
  default-image success; invalid/credentialed/ambient/bypassed proxy inputs;
  invalid and second redirects; direct/proxy dial targets; conditional `304`;
  timeout/cancellation/permit release; status/MIME/header/declared-and-actual-size
  bounds; metadata sanitization; and safe error mapping. The cases are
  implemented and statically reviewed, but no Go test was run locally.

## 3. Operations projection

- [x] 3.1 Update only `operations/compose.updater-proxy.yaml` so API receives `BGMSS_IMAGE_HTTPS_PROXY` and joins `updater_proxy`; keep updater unchanged and Prometheus isolated.
- [x] 3.2 Update `operations/test/updater-proxy.sh`, the static render in `operations/bin/validate-isolated`, and proxy wording in `operations/README.md`; prove direct mode remains closed and proxy mode gives each service only its intended environment/network projection.
- [ ] 3.3 Run build, Go tests, Compose projection tests, and isolated validation
  through Development Actions or the approved remote container environment
  without starting updater or changing the external network. Permitted local
  checks completed: `gofmt`, Bash syntax, YAML parse, `git diff --check`, and
  strict OpenSpec validation; no Go, Compose, Docker, or container gate was run
  locally.

## 4. Repository and artifact acceptance

- [ ] 4.1 Review the implementation diff and run static checks plus strict
  OpenSpec validation locally; require Development Actions to run the complete
  Backend and operations test/build gates.
- [ ] 4.2 Commit and push the implementation. After its Product job is green,
  update only the accepted Product revision in
  `operations/bin/build-bundle.sh`, then require a final exact-head green run
  and one admitted `linux/amd64` operations artifact.
- [ ] 4.3 Verify the artifact source, images, checksums, and replacement overlay
  before transferring it to the host.

## 5. Production deployment and rollback

- [ ] 5.1 Recheck the current application, Archive pointers, proxy release
  settings/network, installed overlay, active Nginx, stopped loader, and
  available capacity before writing production state.
- [ ] 5.2 Transfer and verify the admitted bundle, then deploy the application
  through the existing command with proxy mode preserved; verify
  readiness/catalog/metrics before touching the installed overlay.
- [ ] 5.3 Under `/srv/bgmss-v2/data/operations.lock`, copy the verified overlay preimage into the run root, atomically install only `/srv/bgmss-v2/compose/compose.updater-proxy.yaml` among operations definitions, preserve root ownership/mode `0644`, and force-recreate API.
- [ ] 5.4 Verify API has exact `BGMSS_IMAGE_HTTPS_PROXY` plus `backend`/`proxy-net`; updater retains only its existing proxy input/network and is not run; Prometheus retains only `backend`; readiness/catalog/metrics/scrape remain healthy; and representative loopback and unchanged routed image requests return one allowed non-empty body no larger than 8 MiB.
- [ ] 5.5 On failure, restore the prior overlay, force-recreate API, and use the
  normal application rollback if needed. Confirm Archive, proxy lifecycle,
  Nginx, and the stopped loader remain unchanged.

## 6. Specification lifecycle

- [ ] 6.1 After production acceptance, sync both deltas to their main specs, archive this change, strict-validate all specs, and record exact implemented, tested, committed, pushed, artifact, deployed, and rollback states.
