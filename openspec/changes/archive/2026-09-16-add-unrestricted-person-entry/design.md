# 不限职位与 Bangumi 人物页入口 — 产品设计

## 状态与依据

用户已确认本设计，并授权“改完直接按流程部署”。主代理完成规格审查及 strict gate 后实施；生产发布由独立 deploy-unrestricted-person-entry 约束，授权不等于已上线。

源码基线：`master`，`0387cbf391da61df3afa6ae0a357d6a754905fd7`。遵循 PRODUCT.md、DESIGN.md 和根 AGENTS.md；现有统计公式、单类型边界、查询编辑与取消机制保持不变。

## 用户可见行为

### 1. 各作品类型的“不限”

每次仍只能查询动画、书籍、音乐、游戏或三次元中的一种类型；人物排行、人物详情与共演均不支持跨作品类型联合查询。

人物排行每个类型的职位 selector 顶部新增“不限”，位于常用职位和分类目录之前。它与具体职位互斥，选中后呈现一行“不限”，不把所有职位逐项选中。改选具体职位后离开“不限”；具体职位多选保持原来的资格 AND、作品并集语义。

“不限”表示当前作品类型中，只要人物存在真实参与记录就计入其作品，覆盖 Staff 与适用的配音参与。同一人物对同一 Subject ID 的多个职位、多个角色及重叠参与只计一部作品，不通过标题归并不同条目。统计、排序、分页和人物定位全部由后端执行。

切换排行、详情与共演时保留已经应用的查询条件与真实参与身份，不能因为“不限”产生空职位无效请求、清空查询或把任意参与改成同时具备所有职位。共演仍按相同原始作品求交集，合并续作保持原有单类型规则和默认值。

### 2. 补齐意向收藏状态

补入想看／想读／想听／想玩对应的同一个底层收藏状态；名称随作品类型展示，不拆成多个实际状态。插件的“全部收藏状态”包含意向、进行中、已完成、搁置、抛弃。

只查询能够公开读取的收藏，不增加 OAuth、Cookie/token 传递或私密收藏读取。未评分作品计入作品数，不以零分计入均分。普通手动查询的默认收藏状态不因插件选择全部状态而改变。

### 3. Bangumi 人物页脚本

在人物页，例如 `https://bgm.tv/person/6447`，提供符合 Bangumi 原生风格的分体按钮：

- 主按钮“查看我的收藏参与作品”：直接查询动画，无需先选类型。
- 相邻展开按钮“其他作品类型”：菜单提供书籍、音乐、游戏、三次元；选择即按该单一类型跳转。后续点击主按钮仍查询动画。

用户身份只从当前登录用户的导航区域取得。人物 ID 来自人物页路径；不能把人物 ID 或正文中其他用户的 ID 当作登录 UID。未登录或不能可靠识别身份时提示“登录 Bangumi 后可查看收藏参与作品”，不猜测用户、不发起错误身份的查询。

固定目的站点为 `https://search.bgmss.fun/` 的人物排行入口，不允许外部输入替换目标域名。不传 Cookie/token、页面正文或完整浏览记录。脚本由用户直接发布到 Bangumi；保留已有根 `bangumi_plugin.js` 及测试，本次不改脚本，不补安装说明、下载入口、安装差异文档或前端产物副本。脚本分发不是应用实现、验收或发布的门禁。

菜单与按钮支持触屏、键盘激活、Escape 关闭、外部点击关闭以及返回触发器焦点；避免重复安装产生重复入口。

### 4. 查询入口的固定口径

点击后启动一份新查询：

- 当前登录的 Bangumi UID；
- 主按钮为动画，二级入口为所选单一类型；
- 全部收藏状态；
- 不限职位；
- 当前人物作为待打开的详情目标。

**不包含 NSFW，高级选项全部沿用项目默认值。** 复用 `createDefaultDraft` 的默认构造逻辑，仅覆盖上述入口字段；目前默认 `includeNSFW=false`、`mergeSeries=false`，评分、日期、标签、评分人数等额外过滤均未启用。不继承上次查询或标签页恢复中的高级条件，也不另建一套可能漂移的默认值。

“全部收藏”指选中全部收藏状态，不表示绕过作品类型或 NSFW 等默认过滤。进入站点后仍允许用户自行编辑条件。

### 5. 定位、空态与继续浏览

入口意图优先于旧标签页恢复和榜单默认首位选中。目标人物不在第一页时仍需正确打开详情，不能只在当前分页中搜索。桌面揭示现有详情区；手机打开现有人物详情抽屉，不创建另一套详情页面。

完整查询成功且目标人物没有符合条件的参与作品时，仅详情区显示与目标人物 ID 和当前类型关联的空态：

> 该人物没有参与当前查询条件下的收藏作品

不能伪造零分、人物资料或作品；不能把该情况解释为该人物从未参与用户的任何收藏。榜单可用时照常展示，用户可关闭详情、选择其他人物、修改查询并重新查看。即使整个榜单为空，仍须展示指定人物的详情空态和可编辑查询，而不是丢弃入口目标。

用户选中其他人物后，已消费的入口参数不能重新抢回选择。查询失败、取消、详情错误和迟到响应不能覆盖新的人物或新查询，也不能造成重复自动查询。

上游超时、UID 不存在、私密或禁止访问收藏、人物实体不存在、catalog 失败与真正的无参与结果分别处理；错误保留重试，不降级成空状态。

## 架构方向与边界

1. contracts 先明确单类型“不限”与新增意向状态的 wire 语义，更新规范化、缓存身份和语言无关用例，再按现有生成器生成全部受影响的 Go/TypeScript 消费者，不手改生成文件。
2. backend 复用当前类型的归档事实、参与记录和统计引擎。不得通过前端合并已分页排行、重复计数或模拟全部职位 AND 实现不限。
3. frontend 在既有 Query Draft / Applied Query / coordinator / recovery 中接入入口启动，不建立重复查询或详情状态 owner。复用 `routes.ts` 与现有人物定位机制；只有通过严格验证的、受限的插件入口意图允许自动查询。
4. 通用查询分享和 URL fragment 回放仍不恢复，普通 `?user=` 仍只预填。新增能力是确定字段的单次人物入口，不是任意查询序列化。
5. 没有参与作品可复用现有 `PERSON_NOT_IN_QUERY_RESULT` 的明确错误身份，映射成详情局部空态；必须在成功查询与已验证目标的语境中使用，不把任意异常映射为空。不为此杜撰完整详情成功响应。
6. 不限使用可选 `query.positionScope: "all"` 加必填空 `positionKeys: []`；非 all 时字段省略，具体职位 wire / digest 不变。意向状态为 `wish`，规范顺序为 wish/completed/in_progress/on_hold/dropped。范围进入 EffectiveQuery 和 DigestProjection；不使用虚构职位 key，也不枚举为 AND。
7. 后端复用真实 StaffCredits 和 eligible exact CastCredits；selector 隐藏的已保留 Staff credit 不能漏计，作品按 Subject ID 去重。保留实际 canonical staff / cast-all 身份用于详情和共演，不能把 “不限” 变成人物身份；显式操作身份仍精确。
8. 入口 URL 为 `/ranking?entry=bangumi-person&user=<uid>&person=<positive-id>&type=<single-type>`，严格拒绝重复、未知或非法字段；成功解析后先保存一次性 intent 并清理 URL，再等 catalog 通过现有 coordinator 查询。
9. tasks.md 给出单写者实施顺序；无归档格式、依赖或工具链升级。

### 前端跨模式身份接入细则

以下细则落实既有“不丢失真实参与身份”要求，不新增接口字段、统计口径或查询状态 owner。

- 查询级不限的排行“查看共演”复用现有候选接口：保持 Applied Query，发送 `input: {positionKey: null, positionScope: "query"}`，省略 participants，以 `count/desc`、每页 20 人读取候选。可用详情返回的完整原文 name 作为服务端搜索条件；超过 256 个码点则不设搜索，不截断名字。只按精确数字 Person ID 接受目标，不按同名或名次猜测；直接保留该单个人物行的完整有序身份，不合并分页贡献、不使用 positionCounts 或全 catalog 补身份。
- 查找归现有 `workspaceLinks.ts` 临时 owner，不覆盖可见候选资源，不持久化响应或建立身份权威缓存。每页核对 transaction、query signature、revision、当前目标、dataVersion/collection fetchedAt、页码/每页数量和稳定 total；拒绝重复人物、重复页或无进展。只有找到 1–20 个非重复身份后才原子替换共演选择、设操作“全部”并跳转；缺失、失败或超限均保留原选择、路由和 Draft，不能截断身份或用静默页数上限宣称未找到。新主查询开始时即使尚未提交 revision，也须与切人、改选择、取消、切模式和卸载一起使旧查找失效；success/catch/finally 使用同一所有权检查。最坏情况需读取多个候选页，不承诺固定查找延迟。
- selector 可选性与后端事实身份校验分离。普通具体 Query 和旧操作级 all 完整保留原 catalog/selectable/capability/成员校验。仅显式查询级 all 不再要求操作身份属于空 query.positionKeys：catalog 中已知的不同 subjectType 仍拒绝；同类型 canonical staff，以及动画/游戏同类型 cast-all，可提交给后端作事实校验，不以 selector 隐藏或 capability 缺失否定真实参与。该例外依据已解码的 kind/subjectType/roleScope/selectable 元数据，不解析 PositionKey 前缀，不扩展具体角色或 staffSet 的权限；这些非事实默认身份仍按原能力规则校验。catalog 中不存在的合法 opaque key 也只允许提交给查询级 all 的后端事实校验，不能被前端宣称为存在、赋予虚构标签或加入 selector。后端始终独立拒绝错误类型、未见事实及非法显式身份；恢复不要求保留历史响应才能重新校验。
- 真实 candidates driver 在查询级 all 或操作级 all 下使用响应 positionCounts 的有序 key 集校验行投影，其余唯一性、顺序、单职位、scope、页码和 work-unit 校验不变。显式身份详情的 acceptedQuery 保留真实 Applied Query，显示身份从 accepted input 获取，不制造 all+nonempty keys 的假查询；排行定位仅阻止旧式无具体职位且没有 query.positionScope=all 的状态。ready 角色区继续以 summary.characterCount 是否存在为准，包括零，不根据空 query keys 隐藏。

## 现有规范的有意调整

- INTENTIONAL_DELTA：排行不再一律要求具体职位；各类型允许独占“不限”。具体职位的现有行为保持。
- INTENTIONAL_DELTA：明确插件入口在移动端主动揭示指定人物；普通手动排行的默认首人行为保持。
- NEW_CAPABILITY：受限人物入口与其他类型二级选项；不是恢复被删除的通用查询分享。
- NEW_CAPABILITY：新增统一意向收藏状态及类型对应文案。
- PRESERVE_ORACLE：未列出的界面与交互遵循 `644b7748674e553f863d0ffd61d029f86fdc0717` 和之后 PRODUCT / DESIGN 已采纳的行为。

实施前同步 PRODUCT.md 对“仅具体职位可排行”“全部范围转排行先选职位”的限制，以及 DESIGN.md 对“排行没有全部选项”的规则；不改写其他视觉风格。现有路由以 PRODUCT.md 和已核查的实际 nginx 为准：**新版在根路径，旧版在 `/old/`**；AGENTS.md 末尾残留的旧部署描述不能作为改路由依据。此处不授权任何路由改动。

## Change boundary

| Field | Boundary |
|---|---|
| Status | 用户已确认；六份 delta specs 与 tasks 已形成，主代理 review + strict gate 前 apply 阻塞 |
| Owner | 主代理维护范围和审查；contracts → backend / frontend 分别实施；插件归 frontend |
| Writable paths | tasks.md 的精确 owner 路径；根 PRODUCT.md / DESIGN.md 同步已批准口径，AGENTS.md 仅同步既有路由事实 |
| Read-only protected inputs | tasks 未声明源码、已有 active changes、历史脚本 `/srv/bgmss/bangumi_plugin.js`、生产目录 `/srv/bgmss-v2`、nginx、mypc 及其 Codex 会话 |
| Deletion complement | 无；不删除旧脚本、归档、旧服务或其他变更 |
| Mutable refs | 当前隔离克隆 master 允许精确本地提交，不切工作分支；远端集成由部署 change 管理 |
| Consumes | 上述源码基线、PRODUCT.md、DESIGN.md、用户逐项确认的产品范围 |
| Produces | proposal / design / delta specs / tasks；实施后产生应用代码、测试与验收证据；脚本由用户独立发布 |
| Dependencies | contracts → generated consumers → backend/frontend；无新增运行时依赖计划 |
| Deliverables | 单类型不限、意向状态、应用端单次入口、局部空态及回归证据；保留既有脚本 |
| Acceptance | 下列产品矩阵；正式实施须执行完整受影响组件检查 |
| Non-goals | 跨类型查询、私密收藏、通用分享、统计公式变动、重设计、归档格式重写 |
| Operations deferred | 已授权按流程集成部署，独立 deploy-unrestricted-person-entry 负责；本功能 change 不写线上、不改路由 |
| Stop/rollback conditions | 读写审批阻塞、规范冲突、并发改动、生成器漂移、测试失败或需扩大范围时停止；不绕过审批、不破坏性回滚 |

## 验收矩阵

- 五种类型各验证“不限”位于顶部、独占切换、真实参与、同作品去重；具体多职位与配音子角色范围不回归。
- 各类型意向状态显示名称正确；全部状态包含统一意向状态；普通查询默认收藏选择不变。
- 默认按钮查询动画，其他四种类型从二级菜单独立查询；来源人物 6447 是定位实例，不是硬编码目标。
- 登录身份、未登录、错误 UID、非法人物 ID、重复参数、非法类型和固定站点目的地校验。
- 入口不继承旧 NSFW、合并续作、评分、日期、标签等条件；参数结果与项目默认高级选项一致。
- 目标在首屏、非首屏、未参与、仅 NSFW 参与、完全空收藏、详情实体不存在和网络失败分别验证。
- 看过空态后能打开其他人物；旧入口不抢回选中；快速切人、切模式、改查询、取消、重试、刷新与旧请求迟到验证。
- 桌面、移动、键盘、触屏、明暗主题的实际渲染与构建产物检查；无未处理 console 错误、横向溢出或重复 ID。
- backend 目录的 `./scripts/check.sh`、frontend 目录的 `npm run check`、仓库根目录的 `node --test contracts/artifacts/test/*.test.mjs`、受影响生成器漂移检查、`git diff --check` 和严格 OpenSpec 验证。

## 执行证据与限制

固定 CLI 为 `@fission-ai/openspec@1.6.0`；固定 Node 24.18.0 / npm 11.16.0 / Go 1.26.5，不升级依赖。父代理通过 toolchains/with-pinned-tools.sh 显式传入各独立进程，不能假定上一 terminal export 被后台继承。

前端基线 48 个文件、583 个测试在固定 Node/npm 下通过。后端基线被依赖下载的 Tencent 镜像 ECONNRESET 阻塞，属于环境而非已证实的代码失败；在同一锁文件 integrity 下恢复依赖缓存或使用正式 CI，不能伪造通过。mypc 项目历史和 GitHub 已有认证已只读核查；凭据不导出。规格子代理超时未写文件，六份 delta 由主代理接管完成。
