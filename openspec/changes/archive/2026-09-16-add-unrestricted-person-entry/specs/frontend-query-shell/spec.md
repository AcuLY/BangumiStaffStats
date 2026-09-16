## Capability Boundary

| Field | Boundary |
|---|---|
| Status | 用户已确认实施；主代理 review 与 strict validate 之后才 apply；不表示已验证或部署 |
| Owner | frontend；主代理集成审查；重叠路径按 tasks 顺序单写者 |
| Writable paths | `frontend/src/features/query/`, `frontend/src/app/`, `frontend/src/api/` non-generated normalization/schema integration, `frontend/src/stores/`, `frontend/src/features/co-star/`, `frontend/src/features/catalog/`, `frontend/tests/`, `frontend/ARCHITECTURE.md`, `frontend/scripts/check-architecture.mjs`（仅主代理登记本功能已独立审查的新 source/test/delivery 精确 expectedInventory 条目；保留原清单及其余所有门槛并验证额外文件仍被拒绝）；本 capability delta；根 PRODUCT.md / DESIGN.md 仅主代理同步已批准口径 |
| Read-only protected inputs | 其他 active changes、归档结构与 fixtures、部署目录、nginx、mypc、未声明源码 |
| Deletion complement | 无；生成器仅管理其既有精确输出 |
| Mutable refs | 当前隔离克隆 master 的本地精确提交；不切分支；外部集成由 deploy-unrestricted-person-entry 负责 |
| Consumes | 用户批准设计、现有 PRODUCT / DESIGN、基线 0387cbf391da61df3afa6ae0a357d6a754905fd7 与现有 contract |
| Produces | 本范围实现、测试和可追溯验收证据 |
| Dependencies | contracts → generated consumers → backend / frontend → operations |
| Deliverables | 本文要求及 design.md 验收矩阵 |
| Acceptance | tasks.md 的固定工具链、golden、组件、浏览器及 diff 检查 |
| Non-goals | 跨类型、通用分享、私密收藏、凭据、公式变更、新依赖、归档迁移或重设计 |
| Operations deferred | 本 capability 不写线上；用户授权发布在独立 deployment change 执行 |
| Stop/rollback conditions | scope/HEAD/dirty mismatch、必要审批被拒或实测失败停止；禁止 destructive reset/checkout、clean、broad delete、git add -A |

## ADDED Requirements

### Requirement: Single-type unrestricted ranking is an exclusive first option
The query shell SHALL show “不限” first in each type's ranking position selector, above categories/common positions. It SHALL occupy one exclusive row, not enumerate every job. Choosing a concrete job exits unrestricted mode; selecting unrestricted clears concrete selections. The shared applied query SHALL carry `positionScope: "all", positionKeys: []`; existing concrete-position AND behavior SHALL remain unchanged. Switching modes or restoring valid tab state SHALL not demand concrete ranking positions for this explicit query. Existing co-star operation-level all scope SHALL remain distinct from query-wide all.

#### Scenario: Five independent selectors
- **WHEN** each single subject type is selected and “不限” is applied
- **THEN** the UI SHALL submit only that type and one unrestricted query with no fake position key
- **AND** selector, applied summary, mode switches and local recovery SHALL preserve that meaning

### Requirement: Intention status has type-specific copy and stable identity
The frontend SHALL expose `wish` as 想读 for book, 想看 for anime/real, 想听 for music and 想玩 for game. Manual defaults SHALL remain unchanged. A new person-entry draft SHALL use `createDefaultDraft(uid)` then override only type, all five collection states and unrestricted position scope, preserving NSFW=false and default advanced options.

#### Scenario: Entry overrides stale saved restrictions
- **WHEN** a person entry is opened with older local saved score/date/tag/NSFW/series settings
- **THEN** the entry SHALL start from current defaults, not from those saved restrictions
- **AND** the user SHALL remain able to edit and apply a later query normally

### Requirement: Unrestricted operation identity admission preserves factual authority
For explicit query-wide all only, the frontend SHALL distinguish permission to submit an identity for backend validation from selector eligibility. It SHALL NOT require membership in the empty shared positionKeys. Known different-subject-type entries SHALL remain invalid. Current-type canonical staff and anime/game cast-all identities SHALL remain eligible for backend factual validation even when selector visibility or capability metadata does not expose them. This exception SHALL use decoded catalog metadata, never PositionKey prefix parsing. Explicit cast-role and staff-set identities SHALL retain their existing operation-capability checks; concrete queries and legacy operation-all SHALL retain all existing membership, visibility and capability guards. Catalog-absent opaque keys MAY be submitted only under explicit query-wide all, without asserting their existence, fabricating labels, or adding them to the selector. The backend SHALL remain the independent authority rejecting non-factual, wrong-type and invalid explicit identities. Recovery SHALL preserve valid intent without a persisted returned-key authority cache.

#### Scenario: Retained identity is absent or hidden in the selector
- **WHEN** an unrestricted candidate or restored operation uses actual current-type staff participation whose key is absent from the catalog or represented as a hidden staff entry
- **THEN** the frontend SHALL preserve the exact identity for backend validation and subsequent detail/co-star operations
- **AND** ordinary/legacy unsupported selections, known wrong types, malformed keys, duplicates and identity limits SHALL remain rejected by their existing owners

#### Scenario: Real candidate projection under shared all
- **WHEN** the real candidates driver receives a shared unrestricted query with ordinary query operation scope
- **THEN** it SHALL validate row identities against the response's ordered positionCounts universe rather than empty shared keys
- **AND** response uniqueness, ordered membership, single-position, scope, pagination and work-unit checks SHALL remain intact

### Requirement: Unrestricted ranking handoff consumes one complete authoritative identity row
The ranking-to-co-star handoff SHALL use the unchanged Applied Query and the existing unconstrained candidates projection, omitting participants and selecting only an exact Person ID. Server-side name search MAY narrow candidates but SHALL NOT identify the person; names exceeding the search limit SHALL not be truncated into authority. The handoff SHALL consume one row's complete identity array without unioning pages, reconstructing detail contributions, filling from catalog keys, or truncating an oversized identity set. Its transient owner SHALL preserve existing selection, route and Draft until a complete current 1–20-identity result can be committed atomically. It SHALL check every page's request/context/snapshot and forward progress, and invalidate success, rejection and finalization on primary-request start, cancellation, newer target/selection, mode change and unmount. It SHALL NOT replace the visible candidates resource or persist response data.

#### Scenario: Same-name target appears after the first candidate page
- **WHEN** an unrestricted ranked person's complete identity row is on a later candidate page among namesakes
- **THEN** only the exact numeric Person ID SHALL provide the full identity handoff, with no participants constraint or client statistical recomputation
- **AND** missing, failed, malformed, stale or oversized results SHALL leave the old selection and route unchanged

#### Scenario: A newer main request has started without committing a revision
- **WHEN** an older identity lookup resolves or rejects after a newer main request starts, even if that request later fails or is canceled
- **THEN** the obsolete lookup SHALL NOT navigate, replace identities, overwrite current feedback or release a newer pending state
