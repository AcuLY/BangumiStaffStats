## Capability Boundary

| Field | Scope |
|---|---|
| Status | Explicitly authorized root cutover; implementation pending |
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

### Requirement: One query shell SHALL own routes and shared query state

The formal SPA SHALL expose logical `/ranking` and `/co-star` shell modes at
the configured production base, currently public `/ranking` and
`/co-star`, with one `QueryDraft`, one immutable last-successful
`AppliedQuery`, one ordered `positionKeys` array, and one monotonic
`queryRevision`. Operation/logical-path/deployment-base SHALL not enter the
shared query signature. Editing Draft or switching modes SHALL not apply,
reset, or fork shared state; only a successful semantically new application
SHALL advance revision.

Rankings and candidates SHALL retain separate normalized view and resource
slots tagged with their revision. A slot for the current revision MAY be
restored on mode return; an absent slot MAY be loaded through the registered
operation port without resubmitting Draft.

The existing query store SHALL also own draft and accepted co-star position
scope (`query` or `all`) as defined by frontend-cross-position-co-star. Scope
SHALL participate in co-star dirty/apply/undo behavior without becoming a catalog
PositionKey or entering the ranking query signature. An all-only query with no
concrete positions SHALL open the position editor on a switch to ranking, rather
than submit an invalid ranking request.

The configured base root and its `index.html` SHALL replace to the public
ranking path while preserving safe query parameters; root-domain paths outside
the configured base SHALL not be claimed by this shell. `?user=` SHALL prefill
only personal Draft. URL fragments SHALL NOT restore query state or trigger a business request; an initial fragment SHALL be cleared without decoding.

Successful personal application SHALL replace `?user=` with the effective
trimmed UID; successful global application SHALL remove `?user=`. These URL
updates SHALL remain inside the configured base and SHALL not start another
request. The Header SHALL contain an always available same-tab link labeled “回到旧版” immediately left of the theme button, with fixed href `https://search.bgmss.fun/old/`. No sharing or clipboard action SHALL remain. The legacy link and theme button SHALL share one right-aligned Header action container. The link SHALL include a jump icon and show “旧版” below 780px, while retaining “回到旧版” as its accessible name.

#### Scenario: Draft changes and mode changes

- **WHEN** the user edits Draft and switches between ranking and co-star at the root production base
- **THEN** the browser path SHALL switch only between `/ranking` and `/co-star`
- **AND** Applied Query, queryRevision, ordered PositionKeys, current-revision resources, and edited Draft SHALL remain unchanged

#### Scenario: A new query succeeds
- **WHEN** final validation passes and the active operation returns the latest successful response for a semantically new Draft
- **THEN** the operation resource, Applied Query, and next queryRevision SHALL commit atomically
- **AND** no later feature may create a second Applied Query owner

#### Scenario: An old query fragment is present
- **WHEN** a document opens with an old query fragment and no valid tab session
- **THEN** no query SHALL be decoded or automatically executed from that fragment
- **AND** the fragment SHALL be cleared and the editable form SHALL remain available

#### Scenario: Return to the old application
- **WHEN** the Header is rendered in either mode, theme or viewport
- **THEN** the legacy anchor (回到旧版 on desktop, 旧版 on mobile) SHALL precede the theme button and point exactly to https://search.bgmss.fun/old/
- **AND** it SHALL remain keyboard accessible and available before any query succeeds

#### Scenario: A path outside the deployment base is loaded

- **WHEN** a path outside an explicitly configured nested application base is requested
- **THEN** the new query shell SHALL not claim, redirect, or rewrite that path
