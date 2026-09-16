## Why

人物排行目前必须指定具体职位，不能直接回答“这个人参与了我收藏的哪些作品”。旧 Bangumi 脚本已从当前 master 删除，且原有用户页链接没有人物定位能力。

本变更补齐单类型“不限”职位、意向收藏状态和人物页入口，直接打开目标详情，并正确处理没有符合条件的参与作品。

## What Changes

- NEW_CAPABILITY：动画、书籍、音乐、游戏、三次元各自的排行职位 selector 顶部提供独占“不限”，同人物同作品按 Subject ID 去重。
- INTENTIONAL_DELTA：补入想看／想读／想听／想玩共用的意向收藏状态；插件使用全部收藏状态，普通手动查询默认收藏选择不变。
- NEW_CAPABILITY：恢复根 `bangumi_plugin.js` 的脚本交付定位，在人物页添加默认动画主按钮及其他类型二级菜单，按当前登录 UID 自动查询并定位人物。
- INTENTIONAL_DELTA：受限入口覆盖旧会话恢复及榜单默认首人；无参与时只在人物详情展示空态，仍能浏览其他人物。移动端入口主动打开现有详情抽屉。
- PRESERVE_ORACLE：仍为单类型，不增加跨类型统计；具体职位 AND、既有统计公式与未涉及的视觉交互按 PRODUCT.md、DESIGN.md 及 `644b7748674e553f863d0ffd61d029f86fdc0717` 保持。
- 插件高级选项复用项目默认值：**不包含 NSFW、合并续作关闭、不启用额外过滤**。不继承旧查询筛选。
- 不恢复通用分享或 fragment 回放，不发送凭据，不读取私密收藏。

当前执行范围为脚本外的应用实现与验收。用户直接向 Bangumi 发布脚本；保留已有根脚本及测试，不补安装说明、下载入口或前端产物副本，不把脚本分发作为本站发布门禁。

## Capabilities

### New Capabilities

- `frontend-bangumi-person-entry`：人物页脚本、安全登录身份识别、默认/二级类型入口、单次自动查询及目标揭示。

### Modified Capabilities

- `contracts-query-wire`：明确“不限”的单类型契约、意向状态及确定性规范化/查询身份；保留具体职位旧请求兼容。
- `backend-query-result-set`：不限参与并集、人物作品去重与统计/操作身份衔接。
- `backend-public-collection-source`：统一意向收藏状态映射与已有失败语义。
- `frontend-query-shell`：每类型 selector 顶部“不限”、收藏文案、入口默认构造与共享查询/恢复互操作。
- `frontend-person-inspector`：指定人物优先、非首页定位、局部无参与空态与继续浏览。

六份 delta specs 与 tasks.md 共同限定实现；已有契约要求完整保留，仅增加明确 all / wish 语义和入口例外。

## Impact

| Field | Boundary |
|---|---|
| Status | 用户已确认设计并授权按流程部署；主代理 review / strict gate 前 apply 阻塞 |
| Owner | 主代理负责规格与审核；contracts、backend、frontend 各自拥有实现；插件归 frontend |
| Writable paths | tasks.md 精确 ownership inventory 与本 change；PRODUCT.md、DESIGN.md 仅批准产品口径；AGENTS.md 仅既有路由事实文档同步 |
| Read-only protected inputs | 未声明仓库代码与其他 active changes、历史脚本、生产目录、nginx、mypc 与开发会话 |
| Deletion complement | 无 |
| Mutable refs | 当前隔离克隆 master 本地精确提交，不切工作分支；远端集成由 deployment change 管理 |
| Consumes | `master` 基线 `0387cbf391da61df3afa6ae0a357d6a754905fd7`、用户已确认的单类型功能与默认高级选项 |
| Produces | proposal / design / 六份 delta specs / tasks；实施后产生代码和验证证据 |
| Dependencies | contracts → generated consumers → backend / frontend；没有新增运行时依赖计划 |
| Deliverables | 不限、意向状态、应用端人物入口与空态、完整相关测试证据；脚本由用户独立发布 |
| Acceptance | design.md 的场景矩阵；完整受影响组件检查、真实浏览器和构建产物检查、生成器及 diff/OpenSpec 验证 |
| Non-goals | 跨类型、通用分享、凭据/私密收藏、公式或归档格式变更、无关重设计 |
| Operations deferred | 用户已授权按流程集成和部署；独立 deploy-unrestricted-person-entry 管理实际操作，本功能 change 不写线上或改路由 |
| Stop/rollback conditions | 必要读取被拒绝、规范冲突、未知并发写入或需扩展范围时停止；不重试被拒操作、不绕过审批、不作破坏性回滚 |

本变更不写其他仓库或生产系统。myPC 项目特定 Codex 记录和既有 GitHub 认证已只读复核；凭据未导出。`openspec list --json` 中的已有变更均予保留，不重新归档或替它们勾选历史验收。

**Apply 在 proposal、design、delta specs 与 tasks 全部完成、主代理审查并通过 `openspec validate add-unrestricted-person-entry --strict` 之前保持阻塞。** 用户确认已取得；无需重复索取同一设计授权，新审批拒绝仍必须遵守。