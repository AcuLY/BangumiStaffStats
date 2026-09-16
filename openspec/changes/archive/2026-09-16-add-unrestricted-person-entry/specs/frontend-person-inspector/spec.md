## Capability Boundary

| Field | Boundary |
|---|---|
| Status | 用户已确认实施；主代理 review 与 strict validate 之后才 apply；不表示已验证或部署 |
| Owner | frontend；主代理集成审查；重叠路径按 tasks 顺序单写者 |
| Writable paths | `frontend/src/features/person-detail/`, `frontend/src/features/ranking/`, `frontend/src/app/`, `frontend/src/styles/` only scoped empty-state styling, `frontend/tests/`；本 capability delta；根 PRODUCT.md / DESIGN.md 仅主代理同步已批准口径 |
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

### Requirement: Person entry target owns one consumable initial selection
After the entry's ranking query succeeds, the frontend SHALL open its validated person ID through the existing coordinated detail resource even if absent from the first ranking page or the whole ranking is empty. It SHALL reveal the desktop inspector or mobile drawer. This initial target SHALL take precedence over default first-person selection and saved recovery only once. Later user selection, edits, cancellation and stale-response guards SHALL keep their existing ownership.

#### Scenario: Target is not on the first page
- **WHEN** the entry query succeeds but the person is not in the returned ranking page
- **THEN** the explicit person ID SHALL still be requested and opened without frontend searching or recomputing a ranking

### Requirement: Verified no participation is a local detail empty state
Only `PERSON_NOT_IN_QUERY_RESULT` for the active target and successful active query SHALL render “该人物没有参与当前查询条件下的收藏作品” in the existing detail region, retaining the target ID and selected type context. It SHALL not invent profile/rating/work data, globally replace the ranking, or disable query editing. Entity-not-found, private/invalid UID, catalog failure, network error and canceled requests SHALL retain their actual error/retry behavior.

#### Scenario: Empty target then other person
- **WHEN** a valid target has no qualifying works, including only NSFW works or an empty public collection
- **THEN** only the target detail SHALL display the scoped empty state
- **AND** selecting another ranking person SHALL show that person's details without the consumed entry taking control again

#### Scenario: Detail fails or a response arrives late
- **WHEN** a detail request fails for a different reason or arrives after a newer selection
- **THEN** it SHALL not be converted into this empty state or overwrite the latest selection
