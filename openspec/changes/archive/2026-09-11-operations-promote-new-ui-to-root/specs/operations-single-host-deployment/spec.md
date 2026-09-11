## Capability Boundary

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

## MODIFIED Requirements

### Requirement: Nginx cutover SHALL be atomic and reversible

The authorized root promotion SHALL serve the new application from /srv/bgmss-v2/current-frontend at / with canonical /ranking and /co-star routes, and SHALL proxy /api/v1/ to 127.0.0.1:18080/api/v1/ with the accepted 130s read timeout. Legacy SHALL remain running and reachable at /old/. Existing /statistics, /timeline, /proxy, TLS, logs and unrelated server/location bytes SHALL remain equivalent.

Migration SHALL save an exact absent change-specific Nginx and release-state backup, verify the active preimage before writing, retain the candidate in /srv/bgmss-v2/config/nginx/nginx.conf, validate with nginx -t and use same-directory atomic replacement before reload. Failed activation SHALL restore the exact Nginx backup and prior application, revalidate/reload and verify recovered routes without switching Archive data.

#### Scenario: Root promotion succeeds
- **WHEN** the candidate is activated
- **THEN** / SHALL serve the exact new index, canonical SPA modes and /api/v1/catalog SHALL work, and /old/ SHALL serve the unchanged legacy index with working legacy assets

#### Scenario: Existing v2 links and cached clients
- **WHEN** a client requests /v2/, /v2/ranking or /v2/co-star
- **THEN** a no-store redirect SHALL preserve query parameters and lead to the corresponding root route
- **AND** /v2/api/v1/ and /v2/assets/ SHALL remain compatible with current and retained prior new-client assets

#### Scenario: Missing static or API paths
- **WHEN** an asset or API path does not exist
- **THEN** it SHALL return its appropriate error and SHALL NOT return legacy or new SPA HTML as a successful fallback

#### Scenario: Candidate fails or active configuration drifts
- **WHEN** config identity, syntax, reload or required public probes fail
- **THEN** activation SHALL stop and the verified prior routing/application state SHALL be restored

#### Scenario: Unrelated service ownership
- **WHEN** root promotion completes
- **THEN** legacy auxiliary upstreams, Prometheus and unrelated containers SHALL retain their preflight ownership and availability
