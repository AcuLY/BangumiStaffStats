## Capability Boundary

| Field | Boundary |
|---|---|
| Status | 用户已确认实施；主代理 review 与 strict validate 之后才 apply；不表示已验证或部署 |
| Owner | frontend；主代理集成审查；重叠路径按 tasks 顺序单写者 |
| Writable paths | `frontend/src/app/personEntry.ts`, `frontend/src/app/routes.ts`, `frontend/src/app/App.vue`, `frontend/tests/` except existing `app/bangumi-plugin.test.ts`；本 capability delta；根 PRODUCT.md / DESIGN.md 仅主代理同步已批准口径 |
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

### Requirement: Bangumi person pages expose safe authenticated-user navigation
The existing root `bangumi_plugin.js` is maintained separately for the user's direct publication to HTTPS Bangumi hosts `bgm.tv`, `bangumi.tv`, and `chii.in`. Its preserved navigation contract SHALL add an idempotent native-style split button on exact `/person/<positive safe integer>` pages. “查看我的收藏参与作品” SHALL always target anime; “其他作品类型” SHALL expose book/music/game/real as separate immediate actions. Identity SHALL come only from authenticated navigation, never person/profile/body links. Unknown or logged-out identity SHALL show “登录 Bangumi 后可查看收藏参与作品” and not launch a guessed user query. The destination SHALL be fixed to `https://search.bgmss.fun/ranking`. The application SHALL NOT require script installation documentation, a download entry, or a bundled script copy as a delivery or acceptance gate; current implementation work SHALL preserve the existing script and its tests without edits.

#### Scenario: Default and secondary entries
- **WHEN** a logged-in user activates the main action or one secondary type
- **THEN** a URL SHALL be built with URL/URLSearchParams, containing only `entry=bangumi-person`, `user=<uid>`, `person=<id>` and `type=<single type>`
- **AND** subsequent main-action activation SHALL still use anime, and no cookie/token/page text SHALL be transmitted

#### Scenario: Installation and access
- **WHEN** the userscript runs twice, encounters a body user link, or the menu is operated by keyboard/touch
- **THEN** there SHALL be only one control, unrelated identities SHALL be ignored, Escape/outside click SHALL close the menu and focus SHALL return appropriately

### Requirement: Restricted entry URL triggers one fresh query only
Only `/ranking` URLs with exactly one each of `entry=bangumi-person`, `user`, `person`, and `type` SHALL trigger the person flow. UID SHALL follow shared validation; person SHALL be a positive decimal safe integer; type SHALL be one of book/anime/music/game/real. Duplicate, missing, malformed or unexpected query parameters SHALL fail safe to editable non-auto-executing state. The intent SHALL be captured then consumed/removed from the URL before normal mode navigation, prioritized over old tab recovery, and run after catalog success exactly once. Ordinary `?user=` remains prefill-only; fragment replay and generic query sharing SHALL remain disabled.

#### Scenario: Valid initial intent
- **WHEN** a valid restricted URL is loaded
- **THEN** a fresh default personal query with all five states, unrestricted positions, NSFW excluded and one detail target SHALL run once through the existing coordinator

#### Scenario: Invalid or duplicate entry parameter
- **WHEN** a parameter is repeated, an ID is unsafe, a type is unsupported or arbitrary filters are appended
- **THEN** no automatic collection query SHALL run and the user SHALL retain the ordinary editable query shell
