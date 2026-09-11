## Task boundary

| Field | Scope |
|---|---|
| Status | Implemented and deployed; live verification passed on 2026-09-11 |
| Owner | Primary: Operations/specs/Git/live activation; root_frontend: frontend build and packaging |
| Writable paths | frontend/vite.config.ts; frontend/build/{smoke,test}.mjs; frontend/scripts/check-production-artifact.mjs; frontend/tests/shared/base-path.test.ts; operations/nginx/bgmss.conf; operations/test/{runtime,root-routing}.sh; operations/bin/validate-isolated (template placeholder only); operations/README.md; PRODUCT.md; this change; openspec/specs/{frontend-query-shell,operations-single-host-deployment}/spec.md; existing requested career/separator UI diff; myserver:/etc/nginx/nginx.conf plus its named same-directory candidate; /srv/bgmss-v2/{releases,state,current-frontend,previous-frontend,config/nginx,incoming/root-promotion-20260911,backups/root-promotion-20260911}; run-owned /tmp/bgmss-root-routing.* test fixtures |
| Read-only protected inputs | Contracts, Backend, current Archive, existing legacy dist, unrelated host services and Nginx servers |
| Deletion complement | Replace production /v2 default only; preserve nested-base utility tests, old application bytes and rollback releases |
| Mutable refs | Current master worktree; remote codex topic + reviewed PR to master |
| Consumes | Reviewed frontend changes, exact linux/amd64 bundle, schema 2 Archive, current Nginx snapshot |
| Produces | Root frontend build, bounded Nginx routing template, verified root deployment and rollback snapshot |
| Dependencies | Backend/Contracts -> frontend bundle -> Operations; no reverse statistical ownership |
| Deliverables | Source, route specs, acceptance and live deployment evidence |
| Acceptance | npm run check; operations runtime test; strict spec validation; CI bundle; nginx -t; root/old/v2/assets/API/browser/health/restart probes |
| Non-goals | API schemas, statistical semantics, Archive rebuilding, egress repair, unrelated sites, dependency upgrades |
| Operations deferred | Automatic Archive update failure and unconstrained global performance remain separate known issues |
| Stop/rollback conditions | Drift, invalid bundle/schema, failed checks, conflicting ownership, or route failures: restore exact Nginx backup and previous app; never reset --hard, checkout rollback, git clean, git add -A or broadly delete |

## 1. Primary — specification and Operations
- [x] 1.1 Inspect branch/HEAD/dirty scope, current host routes/schema/runtime, and active changes.
- [x] 1.2 Review coherent artifacts and run strict validation before edits.
- [x] 1.3 Update root/legacy/v2 template, runtime tests, PRODUCT and Operations guide; validate bounded route candidate.

## 2. Frontend owner — packaging
- [x] 2.1 Recheck approved scope and current files before editing; preserve the existing UI diff.
- [x] 2.2 Use root production base in build/check/smoke and fixtures; retain nested-base utility tests.
- [x] 2.3 Run affected frontend checks and inspect actual root build.

## 3. Primary — release and authorized host activation
- [x] 3.1 Audit full diff, synchronize accepted specs, run full applicable checks and exact-stage commits.
- [x] 3.2 Push topic, review green PR and merge; obtain successful exact-revision linux/amd64 bundle.
- [x] 3.3 Back up /etc/nginx/nginx.conf and /srv/bgmss-v2 state; verify rollback and no concurrent drift.
- [x] 3.4 Deploy and switch only search.bgmss.fun application routes; verify /, /old/, /v2 compatibility, assets, API, health, metrics, browser and restart; preserve other services.
- [x] 3.5 Record exact evidence and remaining independent limitations; archive only after requested acceptance completes.

## Verification and deployment evidence — 2026-09-11

- Source commit ce4e34c4220510f8bd30f122d22d26e79e6865e4 was merged through PR #5 as 469f5f5dc09e88590730923eeb9d80ca00466866.
- Full PR CI run 34592483042 and manual verification/bundle run 34592482451 succeeded. The deployed linux/amd64 bundle binds source tree d2429841e8dafce5017f3133d4f6203973f29027; all local and host SHA256SUMS passed.
- Local default parallel tests initially had two timeouts; unchanged tests with two workers passed 564/564. Typecheck, production build/artifact checks and packaging 8/8 passed. Strict validation passed 95 items before archival.
- Isolated operations runtime and root routing tests passed, including legacy assets, prior v2 assets, root/v2 API paths, query-preserving redirects, missing-file 404s and private metrics. A separate isolated Nginx reload -> rollback -> re-promotion probe passed.
- Full active Nginx preimage SHA256: 0f79ab444aebffd6d49801c4861be9c9eb8f8353fbf0a8ab5905c381f69df5d2. Admitted/active candidate SHA256: 74e51de5c7f676cc36b13b14c3764afcbd7a602a2c391637d1f9104a5644e148. Only the existing search.bgmss.fun application route span was replaced; its prefix/suffix were retained byte-for-byte. New and legacy asset filenames had no collisions.
- Backup: myserver:/srv/bgmss-v2/backups/root-promotion-20260911. Candidate and activation/probe evidence: /srv/bgmss-v2/incoming/root-promotion-20260911; retained live candidate: /srv/bgmss-v2/config/nginx/nginx.conf.
- Activation completed with ROOT_PROMOTION_VERIFIED. Root and both SPA paths returned the exact new index; /old/ returned the unchanged legacy index. Redirects preserved user parameters; current, legacy and previous-v2 assets resolved; missing static files and /metrics returned 404. Both API prefixes returned the current catalog.
- Public browser root navigation reached /ranking; a real query displayed career text 音乐人 / 声优 at weight 400 and bracket-tight summary text. /old/ rendered the legacy UI; both pages had no console warnings/errors. Root production-build preview also exercised /co-star navigation.
- API restart followed by livez/readyz/catalog/metrics/Prometheus/journald checks passed. All non-API container IDs and images remained identical to preflight.
- Archive pointer remained dv1-e0d052a68237aa9d145aca8edf2d86dc60c16644bedd2c467ac71f383e191778 with schema 2; no data migration occurred in this cutover. Previously reported automatic Archive refresh failures and unbounded global-query performance are independent, unremediated scope; this release does not claim their acceptance.