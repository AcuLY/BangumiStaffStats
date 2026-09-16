## Capability Boundary

| Field | Boundary |
|---|---|
| Status | 用户已确认实施；主代理 review 与 strict validate 之后才 apply；不表示已验证或部署 |
| Owner | backend；主代理集成审查；重叠路径按 tasks 顺序单写者 |
| Writable paths | `backend/internal/query/`, `backend/internal/statistics/`, `backend/internal/ranking/`, `backend/internal/candidates/`, `backend/internal/persondetail/`, `backend/internal/partners/`, `backend/internal/costar/`, `backend/internal/httpapi/` non-generated files, `backend/internal/runtimecache/`；`backend/scripts/check.sh` 仅由主代理登记本功能新增 Go 源码/测试的精确 `expected_inventory` 条目，保留旧条目及全部校验逻辑、预算、依赖与清理规则；本 capability delta；根 PRODUCT.md / DESIGN.md 仅主代理同步已批准口径 |
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

### Requirement: Catalog identities SHALL produce exact deterministic set algebra

The Backend SHALL treat PositionKey as opaque and consume the accepted typed
selection plan. Exact staff SHALL use raw matching `staff_credit`; staff sets
SHALL union their exact members while retaining set and exact-member evidence;
Each individual cast scope SHALL use only its exact eligible numeric role
(main=1, supporting=2, guest=3, minor=4, narrator=5, voice-library=6), and
cast `all` SHALL use all exact eligible roles. It SHALL not infer cross-subject cast or reinterpret staff
positions 101–106 as cast.

Each position SHALL yield its complete candidate people and de-duplicated raw
Subjects. For concrete-position queries ranking people SHALL satisfy every query position, and each person's
works SHALL be the Subject-ID union of those identities. Participant helpers
SHALL union one person's requested identities and intersect different people
only at raw Subject level. Defined positions with no credit are valid empty
sets. Output position order follows Effective Query; people, Subjects, and
contributions use stable total order independent of SQL/map order.

#### Scenario: Multiple identities and people are combined
- **WHEN** a person matches multiple exact identities and multiple people are compared
- **THEN** same-person works SHALL be unioned once, people SHALL intersect on actual raw Subjects, and exact contribution evidence SHALL remain attributable

#### Scenario: Candidate scope exceeds actual participation
- **WHEN** 449 eligible subjects contain matching requested-position credit for only 442 subjects
- **THEN** the participating Subject set SHALL contain 442, not the pre-credit candidate count

For `positionScope: "all"`, ranking SHALL union actual current-type staff participation and exact eligible cast participation before per-person Subject-ID de-duplication. Retained raw staff credit SHALL NOT vanish solely because a selector hides its position. Display-only staff-set aliases and individual cast-role selectors SHALL NOT inflate identities, counts or averages; canonical exact staff and cast-all evidence SHALL remain attributable. Empty or absent credits SHALL NOT create people. Sorting, details, locating, candidate/partner/co-star operations and existing anime-series rules SHALL consume this same authoritative result without frontend aggregation. Specific-position AND eligibility SHALL remain unchanged. Explicit operation identity selections SHALL not accidentally expand just because their shared query is unrestricted.

#### Scenario: Overlapping credits under unrestricted selection
- **WHEN** the same person has several staff jobs and several cast roles in one eligible Subject, plus participation in another Subject
- **THEN** their work count SHALL be two and every actual credit SHALL remain traceable
- **AND** a person with only one of those jobs SHALL still appear; an unrelated type or default-excluded NSFW Subject SHALL not appear

#### Scenario: Cross-mode identities remain exact
- **WHEN** an unrestricted result is opened in detail or used for co-star, or a concrete cast-role identity is explicitly chosen
- **THEN** same-person works SHALL union, different people SHALL intersect original Subjects, and explicit role identities SHALL remain exact without turning all identities into an AND query

#### Scenario: Raw retained staff evidence lacks a visible selector
- **WHEN** an eligible Subject has a retained raw staff credit for an unresolved or hidden position
- **THEN** unrestricted count and details SHALL retain the real participation without inventing a label or replacing it with an unrelated position
