## Context

Ranking and co-star share Applied Query but have different person membership: ranking requires all selected positions, while a co-star participant carries explicit identities. Existing details only accept ranked people. The user approved same-page co-star detail with a drawer below 960px and an inline right card at 960px and above.

## Goals / Non-Goals

**Goals:** follow a ranked person into single-person partners; inspect co-star source/selected participants; locate an authoritative ranking page; retain source state and dirty Draft. Partner rows retain primary/original names and positions with only their pair activation.

**Non-Goals:** third columns, new routes, new libraries, ranking formula changes, shares, response persistence, deployment.

## Change boundary

| Boundary | Declaration |
|---|---|
| Status | Implemented and committed locally in b675b8d; full acceptance/archival remain governed by unchecked tasks |
| Owner | Primary owns frontend/source/docs; backend_design owns backend/contracts/generated consumers |
| Writable paths | Owned files below, this change directory, openspec/specs/contracts-person-workspace-links/spec.md and openspec/specs/frontend-person-workspace-links/spec.md |
| Read-only protected inputs | Other dirty hunks, archive files, AGENTS.md, operations, other active change artifacts, governing guides |
| Deletion complement | No file removal |
| Mutable refs | None, master at 3612f50 |
| Consumes | Existing query, detail, ranking and selection authorities |
| Produces | Two additive fields and projections, navigation controls, regression evidence |
| Dependencies | Contracts -> generated consumers -> backend and frontend -> acceptance |
| Deliverables | Code, tests, synchronized PRODUCT/DESIGN and accepted specs |
| Acceptance | Focused tests, npm ci/check under Node 24.18.0 npm 11.16.0, backend scripts/check.sh, applicable goldens/artifact tests, browser desktop/mobile, diff hygiene |
| Non-goals | See above |
| Operations deferred | No external/live mutation or ref changes |
| Stop/rollback conditions | Stop on overlapping active writers/authority conflict; preserve preimages and undo only owned hunks |

### Owned files

- Primary may create ignored frontend/.tmp/person-workspace-preview.mjs and run its built-artifact preview on loopback 5175, proxying /v2/api to the read-only 8081 acceptance API. The existing 5174 frontend was restarted after npm ci released its native module lock; other project services and the existing 8080 backend remain unchanged.

- Primary owns the existing openspec/specs/frontend-person-inspector/spec.md resource requirement only, to synchronize the explicitly approved independent preview resource boundary. Other active changes to this capability remain untouched.

- Primary also owns frontend/src/features/person-detail/components/{PersonProfile.vue,PersonItemBrowser.vue,RatingEvidence.vue} solely to replace fixed heading IDs with per-instance Vue useId values, avoiding duplicate IDs while ranking and co-star details stay mounted.

- Backend validation only: backend/.cache/person-workspace-links-qa/main.go and backend/.cache/person-workspace-links-qa-api may call existing app.RunWithOptions with ArchiveUpdater nil. Primary may run it on loopback 8081 against the existing WSL Archive read-only for browser acceptance; no production activation or Archive writes. Browser screenshots are disposable artifacts under the supplied visualization workspace.

- Primary additionally owns frontend/scripts/check-architecture.mjs only to register the three new source/test files in its existing exact inventory. Contracts/backend may build backend/.cache/person-workspace-links-api as an ignored local linux/amd64 validation artifact.

- Contracts/backend additionally owns contracts/goldens/query/manifest.json only to refresh the existing shared operation bundle's required generator length/digest after this schema change.

- Primary additionally owns frontend/src/features/query/coordinator.ts solely for keeping RankingsViewState's new locatePersonId optional; ordinary views must remain source compatible.

- Contracts/backend owner: contracts/schemas/query/operation-components-v1.schema.json; contracts/schemas/rankings/success-envelope-v1.schema.json; contracts/openapi/openapi.yaml; contracts/goldens/api/rankings/{verify.mjs,cases/global.json,cases/personal.json,cases/errors.json}; contracts/goldens/api/person-detail/{verify.mjs,cases/global.json,cases/personal.json,cases/errors.json}; contracts/goldens/query/verify-current.mjs; backend/internal/persondetail/{types.go,service.go,cache.go,service_test.go,cache_test.go}; backend/internal/ranking/{model.go,view.go,service_test.go,view_test.go}; backend/internal/httpapi/{rankings_handler_test.go,person_detail_handler_test.go}; generated backend/internal/httpapi/wire/*.gen.go and frontend/src/api/generated/ (only outputs of existing generators affected by the shared operation schema).
- Primary: PRODUCT.md; DESIGN.md; frontend/ARCHITECTURE.md; frontend/src/app/App.vue; frontend/src/api/{rankings.ts,personDetail.ts}; frontend/src/api/adapters/rankings.ts; frontend/src/features/person-detail/{workspaceLinks.ts,person-detail.css,components/PersonDetailSurface.vue,components/PersonInspector.vue}; frontend/src/features/co-star/components/{CoStarWorkspace.vue,CoStarSurface.vue,CoStarParticipants.vue,PartnersSurface.vue}; frontend/src/features/ranking/components/RankedPersonList.vue; frontend/tests/app/person-workspace-links.test.ts; frontend/tests/features/person-detail/workspace-links.test.ts; frontend/tests/api/rankings.test.ts; frontend/tests/features/person-detail/components.test.ts.

## Decisions

1. Optional input.positionKeys is a nonempty unique subset of the Applied Query for query scope; accepted all scope validates the explicit identities against the current subject type catalog. Backend derives an internal query for detail/statistics and includes canonical identities in its cache input digest. Ordinary person-detail input retains ranking membership. The public Applied Query never changes. Character section uses the actual detail identities.
2. Optional view.locatePersonId returns data.location {personId,rank,page}; null rank/page means outside ranking. Rank precedes search, page follows search; search exclusion leaves rank but null page. It never changes the requested page. Frontend makes a lookup with empty search then requests the returned page. No name matching or client ranking.
3. One small person-workspace link owner manages a separate transient co-star detail resource through existing typed API drivers, preserving ranking detail state. It admits only latest request under the same revision and data/collection snapshot. UI preview state is not persisted. Query changes, selection edits, or leaving co-star close the preview and invalidate pending requests.
4. Reuse PersonDetailSurface with an actions slot, configurable panel ID and co-star inline shell. Below 960px its existing drawer owns background isolation; at/above 960px it occupies the existing right analysis region. Preserve mounted analysis while temporarily hidden so filters and local state survive. Return restores scroll and focus. Crossing 960px preserves the open person and transfers focus safely without duplicate drawers/IDs.
5. Ranking 查看共演 selects the exclusive All range, atomically replaces the current selection with that person's query identities and enters partners; explicit selection overrides default candidate preselection. Header uses ordinary mode navigation, without origin flags, prior-analysis snapshots, ranking-view rollback or extra return controls. It never applies Draft. Invalid >20-identity selection leaves source untouched and explains the existing limit.
6. Co-star detail keeps identity information in its profile, without a repeated person/position line or visible numeric ranking summary. Its return and ranking buttons share one action row. Missing rank retains a local explanation. Ranking detail has no top action bar: profile identity/career align left, 查看共演 is at the right, and Header mode navigation returns to retained analysis. Ranking location preserves metric/direction/page size, clears search and opens the exact person. Partner list rows show primary name, original name and positions without a separate detail button; row activation still opens the pair.

## Risks / Trade-offs

- Wider cards have different origins; scoped detail labels prevent confusing person evidence with shared works or full-position ranking.
- Async mode switches and resize may strand focus; tests cover delayed responses, selection edits, Escape, Header navigation and 959/960px.
- Existing dirty baseline and unrelated active changes remain protected. No unrelated repairs are included. Compare the existing components and baseline screenshots for preservation, then verify the intentional additions in rendered desktop/mobile states.
