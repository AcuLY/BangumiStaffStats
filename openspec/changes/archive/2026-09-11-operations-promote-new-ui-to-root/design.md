## Context

Pre-cutover accepted production revision was 31e35d6, with schema 2 data dv1-e0d052a68237aa9d145aca8edf2d86dc60c16644bedd2c467ac71f383e191778. Preflight local master was 080e8db with authorized uncommitted career/separator UI changes. Legacy HTML references root /assets/ and /bgmss.png, so preserving /old requires retaining those static references without rewriting legacy bundles.

## Goals / Non-Goals

Root navigation and a working legacy entry, exact-artifact deployment, bounded rollback. Preserve all appearance except the explicitly requested career/separator improvements. No new Archive build or network-policy repair.

## Change boundary

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

## Decisions

1. Frontend production base is /. Keep nested-base helper tests as compatibility coverage.
2. Nginx serves the new SPA at /, /ranking and /co-star, and /api/v1/ proxies to loopback 18080 with the accepted 130s timeout. /metrics stays private.
3. /old redirects to /old/ and serves the unchanged legacy directory. Root /assets/ prefers new assets then the legacy directory, so existing legacy HTML/dynamic imports work; /bgmss.png remains the legacy icon. Verify filename collisions before activation.
4. /v2 and /v2/ redirect to /; /v2/ranking and /v2/co-star retain query strings on no-store 308 redirects. Keep /v2/api/v1/ as a direct compatibility proxy and /v2/assets/ as static compatibility backed by current then previous frontend. Missing assets return 404, never SPA HTML.
5. Before deploying, verify schema 2 and current health, save exact release env/links and the entire Nginx file under an absent change-specific backup. Render a candidate by replacing only the managed route span inside the search.bgmss.fun TLS block. Check other bytes unchanged, nginx -t, and public probes. Restore both config and prior application on failure; current data is not switched.
6. No legacy service retirement. Archive-update failures remain visible and are not reported as fixed by this routing change.

## Risks / Trade-offs

Legacy root asset references require a contained static fallback. Old /v2 client assets need the retained previous release. Root metrics/API must not fall through to HTML. Runtime/API state is independent of frontend base; changing base must not alter query signatures or data.
