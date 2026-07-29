## Why

`search.bgmss.fun` currently gives the new application ownership of the root
route, but the user has explicitly reassigned the root to the retained legacy
application. The accepted new application therefore needs one collision-free,
same-origin path base without changing its appearance or interaction behavior.

## What Changes

- **BREAKING**: Publish the new SPA only below `/v2/`, with its two public
  modes at `/v2/ranking` and `/v2/co-star`.
- Publish new-stack API requests below `/v2/api/v1/**`; Nginx removes only the
  `/v2` deployment prefix before forwarding to the unchanged loopback API.
- Return `search.bgmss.fun/` and every non-`/v2` legacy path to the exact
  retained legacy frontend/routes.
- Build static assets with `/v2/` as their production base and make SPA
  navigation/share links deployment-base aware.
- Preserve the new application's accepted visual, responsive, state, copy, and
  interaction behavior. Classification: **INTENTIONAL_DELTA** only for the
  user-authorized public path; all product UI behavior remains
  **PRESERVE_ORACLE** at
  `644b7748674e553f863d0ffd61d029f86fdc0717`.
- Validate through green Actions, deploy the resulting admitted `linux/amd64`
  bundle to the existing `bgmss-v2` root/project, atomically apply the bounded
  Nginx path split, and restore the exact current Nginx bytes if any old/new
  public probe fails.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-query-shell`: Make public navigation and share URLs honor the
  production `/v2/` base while retaining the same logical ranking/co-star
  modes.
- `frontend-build-artifact`: Produce and smoke the static artifact at the
  accepted `/v2/` production base.
- `operations-single-host-deployment`: Replace whole-vhost cutover with a
  reversible same-vhost split: legacy at the root and new stack only below
  `/v2/**`.

## Impact

| Field | Declaration |
|---|---|
| Status | Frontend/path-split implementation committed and pushed; exact-head Product validation green; release-bundle Product baseline correction, bundle admission, deployment, acceptance, archive, and lifecycle push pending. |
| Owner | Main agent owns specification, direct sequential implementation, production mutation, audit, and final acceptance because delegation would add more coordination cost than parallel benefit. |
| Writable paths | This change; delta/main specs for the three named capabilities during sync; `frontend/vite.config.ts`; new `frontend/src/shared/navigation/basePath.ts`; exact path-aware hunks in `frontend/src/app/routes.ts`, `frontend/src/features/query/share.ts`, `frontend/src/features/query/components/AppHeader.vue`, `frontend/src/api/client.ts`, and `frontend/src/shared/media/bangumiImage.ts`; nested-base request mapping only in `frontend/build/smoke.mjs` and its exact `frontend/build/test.mjs` tests; exact `/v2/` resolution in `frontend/scripts/check-production-artifact.mjs`; exact related frontend tests and persistent inventory additions in `frontend/scripts/check-architecture.mjs`; the exact reviewed Product revision pin only in `operations/bin/build-bundle.sh`; `operations/nginx/bgmss.conf`; the one new legacy-root placeholder projection in `operations/bin/validate-isolated`; `operations/README.md`; on `myserver`, a new exact admitted incoming bundle/release below `/srv/bgmss-v2`, existing transactional application refs/project through `operations/bin/deploy`, `/srv/bgmss-v2/config/nginx/nginx.conf`, `/etc/nginx/nginx.conf`, and one new exact pre-change Nginx backup. |
| Read-only protected inputs | Product/statistical semantics, backend/updater/contracts code, dependencies and locks, accepted visuals/assets/CSS/copy, Archive data and pointers, updater/timer/logrotate/proxy configuration, TLS/DNS/firewall, legacy `/srv/bgmss` bytes/data/Compose objects, stopped loader, legacy API/MySQL/Redis containers, unrelated Nginx vhosts/routes, and every undeclared host/repository object. |
| Deletion complement | No legacy/new application, container, image, Archive, service, route, certificate, log, or unrelated file is deleted. Failed application deployment uses the existing transaction; failed path cutover restores the exact pre-change Nginx bytes and retains the admitted new release for diagnosis/rollback. |
| Mutable refs | This branch and remote branch; change lifecycle; `bgmss-v2` current/previous application refs only through the accepted deploy transaction; exact active/retained Nginx candidate and new exact backup. |
| Consumes | Current clean branch `codex/minimal-single-host-ops` at `406fb5ae29acd34d1789efb5350b88c4703c1834`; active new source `be48847bc26bcda28c9f08f6807f5dec40d479f4`; real Archive `dv1-9d794033f12b8bcd60d8c890115a76ca52060ae13b357b3c32e036f94bb67888`; retained legacy frontend/root routes; loopback new API `127.0.0.1:18080`; active Nginx hash `6fe8171ebd4a45eaa94cdba27f561d9207d433cd8bf1ef4e727c2e57a31fb7df`; and exact legacy backup hash `6775e97ba227f4309106f89d5e1358b33c22ef5520ddba5b36a9da1a8615693c`. |
| Produces | One admitted new application release whose static/API URLs are rooted at `/v2/`; public legacy root plus public new `/v2/`; retained loopback health/metrics and legacy rollback capacity; committed, pushed, archived evidence. |
| Dependencies | Completed production activation; clean branch; strict-valid artifacts; accepted frontend/backend build workflows; green exact-head Actions; unchanged live topology and protected legacy identities; `nginx -t` before reload. |
| Deliverables | Minimal path-base implementation and tests; deployment-aware artifact; reviewed Nginx split; admitted remote bundle; successful old/new public probes and automatic rollback procedure; synchronized/archive OpenSpec; commit/push. |
| Acceptance | Strict OpenSpec validation; green frontend/full Actions without local builds; artifact index/assets use `/v2/`; `/v2`, `/v2/ranking`, `/v2/co-star`, `/v2/api/v1/catalog`, deferred chunks, share navigation, and image proxy are new-stack correct; `/`, a representative legacy static asset, `/statistics`, `/timeline`, and `/proxy` retain legacy ownership/status; loopback API/Prometheus remain healthy; Nginx syntax passes and active bytes equal the reviewed candidate; no protected identity or Archive change. |
| Non-goals | No visual/interaction redesign, statistical/data/API-contract change, dependency/tool upgrade, updater run, Archive change, TLS/DNS/firewall change, extra observability, legacy retirement, or unrelated host repair. |
| Operations deferred | Legacy retirement, extended load/soak, and any route beyond the exact `/v2/**` split. |
| Stop/rollback conditions | Stop on unexpected dirty scope, product behavior/dependency/contract drift, failed Actions/artifact admission, host topology/protected-state drift, or failed old/new probe. Repository corrections remain path-scoped; application failure uses the accepted deploy rollback; Nginx failure restores the exact new pre-change backup before another reload. |

This change mutates no other repository. The user has explicitly authorized
the named branch lifecycle and the exact `myserver` application/Nginx path
deployment, but no broader external mutation. Apply remains blocked until
proposal, specs, design, and tasks are complete, strict-valid, and reviewed by
the main agent with zero P0/P1 findings.
