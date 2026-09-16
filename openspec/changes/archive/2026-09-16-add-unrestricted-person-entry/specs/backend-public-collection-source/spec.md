## Capability Boundary

| Field | Boundary |
|---|---|
| Status | 用户已确认实施；主代理 review 与 strict validate 之后才 apply；不表示已验证或部署 |
| Owner | backend；主代理集成审查；重叠路径按 tasks 顺序单写者 |
| Writable paths | `backend/internal/publiccollection/`, `backend/internal/runtimecache/collection.go`, `backend/internal/runtimecache/collection_test.go`, `backend/internal/query/normalize.go` and normalization tests；本 capability delta；根 PRODUCT.md / DESIGN.md 仅主代理同步已批准口径 |
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

## MODIFIED Requirements

### Requirement: The adapter SHALL map the complete public DTO exactly

The adapter SHALL support the five admitted subject types and five requested
collection states and SHALL retain every collection field required by the
internal snapshot. The fixed external client SHALL normalize an omitted or
JSON-null optional upstream comment to the same empty string before mapping;
every non-null string SHALL remain exact. A same-ID nested subject may have a
different supported type; this SHALL NOT invalidate the collection record,
whose top-level subject_type remains the returned SubjectType.

#### Scenario: Public collection is returned

- **WHEN** the external client returns valid records
- **THEN** subject ID/type, status, rate, normalized comment, tags, update
  time, volume/episode progress, and private flag SHALL be preserved exactly
- **AND** an empty public collection SHALL be a successful empty snapshot

#### Scenario: Optional upstream comment is null

- **WHEN** the real anonymous client receives an otherwise complete valid
  record whose optional `comment` is JSON null
- **THEN** the adapter SHALL return a complete snapshot item with empty comment
- **AND** the record SHALL remain available to personal query operations

#### Scenario: Returned data violates the admitted contract

- **WHEN** a record is nil, inconsistent, duplicated across states, or invalid
- **THEN** the adapter SHALL return a sanitized protocol/decode failure
- **AND** it SHALL NOT choose a winner, drop a record, or publish partial data

#### Scenario: Nested subject metadata has another supported type
- **WHEN** the real client receives a collection record with subject_type 2 and a complete same-ID nested subject with type 6
- **THEN** the adapter SHALL return the complete anime collection item with its original subject ID and collection fields
- **AND** downstream statistical inclusion SHALL remain governed by the existing Archive/query authority

The shared `wish` state SHALL map in both directions to the existing client intention state (numeric Bangumi collection type 1). It SHALL participate in snapshot selection, validation, normalization and cache keys just like the other states. No dependency upgrade or credential transmission is required.

#### Scenario: Intention state across media types
- **WHEN** a public collection request includes `wish` for book, anime, music, game or real
- **THEN** the corresponding intention records SHALL remain available and unscored records SHALL count as works, not zero-valued ratings
- **AND** duplicate-state requests SHALL normalize deterministically without changing private/upstream-error classifications
