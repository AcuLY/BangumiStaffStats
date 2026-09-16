## Task Boundary

| Field | Boundary |
|---|---|
| Status | 用户确认实施和按流程部署；strict gate 与主代理审查前禁止 apply |
| Owner | 主代理规格/集成/验收；依次 contracts、backend、frontend 实施，每个路径同一时刻一个写者 |
| Writable paths | 下列 inventory；本 change；PRODUCT.md、DESIGN.md、AGENTS.md（仅现有路由文档同步）；组件既有 .cache/.tmp/node_modules/dist 由原脚本管理 |
| Read-only protected inputs | 其他 active changes、未列源码、归档格式、生产目录、nginx、mypc 与凭据 |
| Deletion complement | 无产品删除；生成器只管理其既有输出 |
| Mutable refs | 当前隔离克隆 master 本地精确提交；不切工作分支；远端由部署 change 管理 |
| Consumes | 用户批准 design.md、六份 delta、源码基线 0387cbf391da61df3afa6ae0a357d6a754905fd7 |
| Produces | 脚本外的应用实现、测试和验收记录；已有脚本由用户独立发布；不把实现声明等同于验证 |
| Dependencies | contracts → generated consumers → backend → frontend → integration → operations |
| Deliverables | 单类型不限、wish、人物入口、局部空态、真实验证 |
| Acceptance | 下列精确命令及 design.md 场景矩阵 |
| Non-goals | 跨类型、通用分享、私密收藏、凭据传递、公式/Archive 格式/依赖升级、重设计 |
| Operations deferred | 生产发布由已授权 deploy-unrestricted-person-entry 执行；本任务不写线上 |
| Stop/rollback conditions | HEAD/dirty/path 意外冲突、审批拒绝、golden/测试失败、生成器漂移或范围扩大即停；禁止 reset --hard、破坏性 checkout、git clean、git add -A、宽泛删除 |

### Exact ownership inventory

| Capability owner | Writable paths |
|---|---|
| contracts-query-wire | `contracts/schemas/query/`, `contracts/schemas/{rankings,candidates,person-detail,partners,co-star}/request-v1.schema.json`, `contracts/openapi/openapi.yaml`, `contracts/goldens/query/` (source/goldens only), `contracts/goldens/query-domain/`, `contracts/goldens/catalog/index.json` (user-approved correction of three CRLF-era SHA256 metadata fields only; catalog source configs/fixtures/verifier remain read-only), `contracts/goldens/api/catalog/index.json` (only three CRLF-era SHA256 fields), `contracts/goldens/statistics/index.json` (only stale authority SHA256 fields referencing accepted decision/product/query-handoff bytes); both corpora, verifiers, source authorities and dependencies remain read-only for this user-approved metadata repair, `contracts/goldens/api/` (affected feature cases/verifiers only; the two metadata-repair verifiers stay unchanged), `contracts/artifacts/fixtures/positive/{backend,frontend}/component-statement.json`; generated `backend/internal/httpapi/wire/`, `frontend/src/api/generated/`, `frontend/src/api/` generated wire artifacts only; `backend/build/build.sh` compatibility pin |
| backend-query-result-set | `backend/internal/query/`, `backend/internal/statistics/`, `backend/internal/ranking/`, `backend/internal/candidates/`, `backend/internal/persondetail/`, `backend/internal/partners/`, `backend/internal/costar/`, `backend/internal/httpapi/` non-generated files, `backend/internal/runtimecache/`, `backend/scripts/check.sh` (primary integration: only register this feature's exact new Go source/test paths in `expected_inventory`; no removal of prior entries or change to checker logic, budgets, dependencies or cleanup) |
| backend-public-collection-source | `backend/internal/publiccollection/`, `backend/internal/runtimecache/collection.go`, `backend/internal/runtimecache/collection_test.go`, `backend/internal/query/normalize.go` and normalization tests |
| frontend-query-shell | `frontend/src/features/query/`, `frontend/src/app/`, `frontend/src/api/` non-generated normalization/schema integration, `frontend/src/stores/`, `frontend/src/features/co-star/`, `frontend/src/features/catalog/`, `frontend/tests/`, `frontend/ARCHITECTURE.md`, `frontend/scripts/check-architecture.mjs` (primary integration only: register this feature's independently reviewed new source/test/delivery paths in `expectedInventory`; preserve all previous entries and every other guard/budget/dependency rule; verify an extra path is still rejected) |
| frontend-person-inspector | `frontend/src/features/person-detail/`, `frontend/src/features/ranking/`, `frontend/src/app/`, `frontend/src/styles/` only scoped empty-state styling, `frontend/tests/` |
| frontend-bangumi-person-entry | `frontend/src/app/personEntry.ts`, `frontend/src/app/routes.ts`, `frontend/src/app/App.vue`, `frontend/tests/` except existing `app/bangumi-plugin.test.ts`; existing root script and its tests are read-only for this completion pass |

## 1. Specification and authority gate — primary

- [x] 1.1 Inspect branch/HEAD/status, approved scope and existing operation all semantics; preserve both active changes.
- [x] 1.2 Reconcile PRODUCT/DESIGN with single-type unrestricted, wish and entry; correct AGENTS route prose to accepted / and /old/ without host edits.
- [x] 1.3 Complete six delta specs and this owner-scoped implementation plan.
- [x] 1.4 Primary review and `OPENSPEC_TELEMETRY=0 npm exec --yes --package=@fission-ai/openspec@1.6.0 -- openspec validate add-unrestricted-person-entry --strict`; `git diff --check`.

## 2. Contracts and generated consumers — contracts owner

- [x] 2.1 Preflight `git status --short --branch; git rev-parse HEAD`; require reviewed gate and owned dirty set. Add failing golden/schema cases for all+empty, all+keys invalid, invalid/null scope, wish order and legacy digest preservation.
- [x] 2.2 Implement optional literal `positionScope: "all"` in shared/effective/projection schemas and mirrored OpenAPI; retain existing operation-level all compatibility and require empty query keys for explicit all. Add wish and shared canonical vectors without changing legacy keys or digests.
- [x] 2.3 Run existing Go/TS query, ranking, candidates, person-detail, partners, co-star generators; update generator-owned manifests only through generators; align accepted OpenAPI compatibility pin if changed.
- [x] 2.4 Verify contract goldens, generated drift and `node --test contracts/artifacts/test/*.test.mjs`; record tests genuinely blocked on consumers until later gates. Primary review contracts before consumer implementation.
- [x] 2.5 User-approved metadata-only repair: synchronize only the three stale catalog file hashes and thirteen statistics authority hashes to inspected bytes; preserve corpora, source authorities and both verifiers. Rerun unchanged catalog/statistics acceptance and fail-closed negative guards; evidence in `verification-non-script.md`.

## 3. Backend semantics and public collection — backend owner

- [x] 3.1 Preflight branch/HEAD/dirty and contract handoff; add failing normalization, wish mapping/cache and unrestricted query-domain tests.
- [x] 3.2 Implement normalized optional scope and projection; include wish in query/runtime cache/source validation and canonical status ordering; preserve upstream errors and privacy semantics.
- [x] 3.3 Build unrestricted contributions from retained raw staff and exact eligible cast, preserving actual identity/evidence; union person works by Subject ID rather than all-position AND. Keep specific-selection algebra and cancellation unchanged.
- [x] 3.4 Integrate statistics/ranking/detail/locate and existing candidate/partners/co-star operation scopes. Preserve explicit identity narrowing, cast roles, unknown retained staff participation and original-subject intersection under series merge.
- [x] 3.5 After backend spec and quality review, register the exact newly reviewed Go files in the existing closed `expected_inventory` (preserve every earlier entry and all checker logic; verify rejection of an extra file). Run targeted Go tests then `cd backend && ./scripts/check.sh` in pinned environment; verify no-participation vs nonexistent-person and personal/global HTTP regressions. Record full-script/race results separately from slice approval. Add explicit real-service HTTP regressions for shared unrestricted personal/global requests, wish identity and no-participation versus nonexistent-person errors; legacy stub-only success tests do not establish this integration.

## 4. Frontend shell, application entry and inspector — frontend owner

User publishes the script directly to Bangumi. Preserve existing `bangumi_plugin.js` and `frontend/tests/app/bangumi-plugin.test.ts` unchanged. Script installation documentation, download entry and frontend artifact copy are not required and must not block application acceptance. The application consumes the fixed entry URL protocol independently. No push, deployment or production mutation is performed in this completion pass.

- [x] 4.1 Preflight branch/HEAD/dirty and generated/backend handoff; load Impeccable guidance and run its context script. Write failing model/selector/status/routes/coordinator tests before behavior changes; retain prior script coverage read-only.
- [x] 4.2 Implement optional all scope in shared draft/application/recovery; top exclusive 不限 for five ranking selectors; wish display by type with manual defaults unchanged; preserve concrete multi-position behavior. Integrate real candidate projection admission and exact complete-identity handoff per design's frontend cross-mode details; keep legacy/selector guards separate from query-all factual permission and preserve atomic navigation/cancellation.
4.3 is outside this application-completion pass: existing script and tests remain unchanged, publication is user-owned, and installation/download/bundling deliverables have been removed by the user's scope decision. This is a scope exclusion, not a claim of new script verification or publication.
- [x] 4.4 Add strict one-time `/ranking?entry=bangumi-person&user=...&person=...&type=...` parser and fresh default query builder. Reject repeated/unknown/malformed parameters; ordinary user remains prefill-only. Apply once after catalog, before old recovery/default selection.
- [x] 4.5 Open target regardless of page/empty rank, map only active `PERSON_NOT_IN_QUERY_RESULT` to scoped local empty state, retain other failures and later selection ownership, desktop inspector/mobile drawer.
- [x] 4.6 Run focused tests then `cd frontend && npm run check`; primary spec review then quality review with browser/keyboard/mobile evidence, fix findings before advancing.

## 5. Integration acceptance and lifecycle — primary

- [x] 5.1 Run complete affected gates and generator reproducibility using exact pinned toolchain; `git diff --check`; strict change validation. Evidence includes actual commands, exit codes and any not-run checks.
- [x] 5.2 Exercise real backend + built frontend browser flows for five types, wish-only, NSFW-only, non-first-page target, no works, network error, edit/retry/cancel/stale, choosing other people, desktop/mobile/light/dark/keyboard. Compare preserved surfaces to accepted baseline; do not call mocks live production evidence.
- [ ] 5.3 Audit all owned diff; complete independent spec and quality reviews; synchronize/ archive this completed feature per repo skills, strict all-spec validation, phase-sized exact-path commits.
- [x] 5.4 Hand verified accepted feature and evidence to deploy-unrestricted-person-entry; no premature claim of pushed/merged/released/deployed.

## Implementation recipe

The wire is deliberately additive, and the same shape is used in shared/effective/projection consumers:

```ts
// No fake position key and no alternative digest for legacy requests.
{ scope: 'personal', uid, subjectType: 'anime',
  positionScope: 'all', positionKeys: [],
  collectionStatuses: ['wish', 'completed', 'in_progress', 'on_hold', 'dropped'],
  includeNSFW: false, mergeSeries: false }
```

Backend uses `PositionScope string` with JSON `positionScope,omitempty` in EffectiveQuery/QueryDigestProjection. Normalization admits only absent or literal `all`; all requires empty keys. The legacy input flag that admits empty operation-all queries remains independent. Unrestricted evaluation derives exact position contributions from current-type facts and unions ranking people; it does not feed all keys to existing `rankingPeople` AND logic. `OperationEvaluation` must explicitly preserve or narrow selection semantics for the requested operation rather than accidentally expanding a requested identity.

Frontend entry draft must be derived, not copied from stored recovery:

```ts
const draft = createDefaultDraft(uid);
draft.subjectType = subjectType;
draft.collectionStatuses = ['wish', 'completed', 'in_progress', 'on_hold', 'dropped'];
draft.positionKeys = [];
// The query-level optional all property is carried by draft -> AppliedQuery.
// Existing independent operation scope continues to describe operation inputs.
```

Contract schema failures are expected RED until schema support exists. A query-domain fixture with one person holding overlapping staff/cast credits on one Subject plus a second Subject must report 2 works, while a one-job person must not disappear. All five current-type fixtures must exclude unrelated/NSFW works. Unknown retained staff evidence must remain counted without fabricated labels. The old multi-position golden stays unchanged. Frontend tests assert query body, exactly one main request, selected target and empty-state scope, not just snapshots.

### Fixed execution environment and commands

All isolated calls use the existing wrapper, not inherited shell state:

```sh
bash /root/.hermes/workspace/bangumi-staff-stats/toolchains/with-pinned-tools.sh node --version
bash /root/.hermes/workspace/bangumi-staff-stats/toolchains/with-pinned-tools.sh npm --version
# expected v24.18.0 and 11.16.0; Go checks require go1.26.5
```

Contracts: `node contracts/goldens/query/verify-current.mjs`, `node contracts/goldens/query-domain/verify.mjs`, relevant `contracts/goldens/api/*/verify.mjs`, and `node --test contracts/artifacts/test/*.test.mjs`. Generation from backend: `./scripts/generate-query-wire.sh --write`, `generate-rankings-wire.sh --write`, `generate-candidates-wire.sh --write`, `generate-person-detail-wire.sh --write`, `generate-partners-wire.sh --write`, `generate-co-star-wire.sh --write`; rerun each with `--check`. Frontend counterparts: `npm run generate:query-wire`, `generate:rankings-wire`, `generate:candidates-wire`, `generate:person-detail-wire`, `generate:partners-wire`, `generate:co-star-wire`; drift and build use `npm run check`.

Focused backend: `go test ./internal/query ./internal/statistics ./internal/publiccollection ./internal/runtimecache ./internal/ranking ./internal/persondetail ./internal/candidates ./internal/partners ./internal/costar ./internal/httpapi` with the repo-local Go cache/toolchain env as check.sh establishes. Focused frontend: `npm test -- --maxWorkers=2` plus exact selected test files as added. Full backend gate: `./scripts/check.sh`. Final artifact gate: existing backend/frontend build scripts and paired operations bundle; no bypass of contract identity pin.

Dependency mirror failure is not a product pass/fail: recover exact integrity-verified cached tarballs or use green ci.yml on the exact candidate commit; do not upgrade lockfiles/tools or emit synthetic successful evidence.
