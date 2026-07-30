# 新版前端生产化清理与架构拆分计划

> 状态：正式开发前审计稿
>
> 日期：2026-07-23
>
> 范围：新版 `frontend/src/workbench`、旧生产入口、构建公开资源、前端测试及与现有后端的接口边界。
> 本文只制定清理和迁移计划，不执行删除，也不代表已经接入、发布或部署。

配套记录：[`data-logic-implementation-guide.md`](./data-logic-implementation-guide.md) 负责数据口径；[`backend-development-implementation-guide.md`](./backend-development-implementation-guide.md) 负责 catalog、API、路由、分享和请求状态契约；[`backend-operations-implementation-guide.md`](./backend-operations-implementation-guide.md) 负责部署与迁移；[`prototype-data-logic-audit.md`](./decisions/prototype-data-logic-audit.md) 保留原型数据审计。

## 1. 结论

当前新版工作台应当视为“高完成度交互原型”，不能把现有目录原地整理后直接当作生产实现。最安全的路线是：

1. 冻结原型，把它作为视觉和交互基准；
2. 先确定正式 API、Applied Query 状态机和数据模型；
3. 在新的 feature-first 边界内逐条纵向迁移功能；
4. 每条功能通过行为、契约和浏览器回归后，再删除对应原型实现；
5. 最后由同一个正式 SPA 承载 `/ranking` 与 `/co-star`，根路径跳转到 `/ranking`，并删除旧前端和所有公开 fixture／实验页。

不要把 `useWorkbench.ts` 机械拆成一组仍然共享同一个全局上下文的 composable。这样只会移动代码，不会解决职责耦合。

## 2. 本轮扫描基线

| 项目 | 当前事实 | 生产风险 |
|---|---:|---|
| 新版 Workbench 非测试 Vue/TS/CSS | 约 17,231 行 | 已达到需要明确模块边界的规模 |
| `useWorkbench.ts` | 950 行、约 80 个 context 字段 | 路由、主题、查询、排行、候选、选择和分析全部耦合 |
| 直接读取 `useWorkbench()` 的组件 | 16 个 | 叶子组件也依赖全局状态，难以复用和测试 |
| CSS | 30 个模块、约 7,514 行 | 多个业务选择器跨文件覆盖，样式所有权不清 |
| 超过 500 行的 CSS 模块 | 6 个 | 已超过现有设计约束，需要按组件归属拆分 |
| 公开 Workbench fixture | 约 6.6 MiB | 个人快照、固定 UID 和演示数据会原样进入生产构建 |
| Vite HTML 入口 | 3 个 | 旧主页、新工作台和空状态预览同时构建 |
| 前端测试 | 41 文件、211 项当前通过 | 29 个文件依赖读取源码字符串；25 个测试文件仍未跟踪；没有组件挂载/E2E |
| 后端业务入口 | 仅 `POST /statistics` | 不能直接覆盖新版多职位、双评分、系列、角色和共演契约 |

当前工作树包含大量既有修改和未跟踪文件。后续清理必须逐文件执行，禁止批量删除、`git add -A` 或用重置命令覆盖现状。

当前最需要优先解耦的视图热点为 `QueryWorkspace.vue`（711 行）、`SinglePersonCooperation.vue`（538 行）、`ComparisonRatingDistribution.vue`（509 行）、`PersonInspector.vue`（506 行）、`PersonPicker.vue`（396 行）、`RatingDistributionChart.vue`（377 行）和 `AnalysisDashboard.vue`（326 行）。这里的行数用于定位复核优先级，不是机械拆分指标。

## 3. 生产开发前必须锁定的边界

### 3.1 统计权威边界

后端是唯一统计权威。正式排行、候选、共演交集、搜索、稳定排序、分页、评分与系列统计均在服务端完成，前端只负责：

- 编辑并提交查询；
- 展示服务端返回的可复核统计结果；
- 管理焦点、抽屉、局部筛选、图表 tab 等纯 UI 状态；
- 在 DTO 到 View Model 的 mapper 中做格式转换，不重新定义统计口径。

“浏览器继续维护第二套统计公式并整包加载关系快照”是已否决方案，不再作为迁移分支。前端 adapter 只能校验、映射和格式化权威响应；视口坐标、图表几何与纯本地交互不属于统计重算。

### 3.2 canonical path 与唯一 SPA

生产只保留一个 SPA 构建，并使用两个 canonical path：

- `/ranking`：人物排行；
- `/co-star`：共演分析；
- `/` 与 `/index.html`：保留允许的 query 后跳转 `/ranking`。

以下只能存在于开发、测试或归档中：

- `person-workbench.html` 独立入口；
- `person-workbench-empty.html`；
- `/prototypes/*`；
- `/workbench-data/*`。

迁移期间允许旧、新入口并存，但必须设定明确的切换阶段，不能长期维持两套应用、两套主题和两套请求模型。两个正式 path 共用同一应用状态和静态 fallback，不是两套 HTML。

### 3.3 查询状态语义

正式状态必须区分：

- `draft`：当前编辑但尚未生效的条件；
- `applied`：最近一次成功查询使用的不可变条件；
- feature `resource status`：`idle | pending | ready | error`；合法零结果是携带零计数和空 items 的 `ready`，不建立独立 empty 请求状态；
- `query version/digest`：用于结果归属、缓存和阻止旧响应覆盖新响应。

人物排行与共演分析共用唯一 `QueryDraft`、`AppliedQuery`、有序 `positionKeys` 和单调递增 `queryRevision`。切换 path 不自动提交草稿、不改变 revision，也不重置人物或职位。

Ranking、Candidates、Detail、Partners 和 CoStar 各自保存结果与 view state，但每份结果都标记所属 queryRevision。切换模式时，相同 revision 的结果立即恢复；没有相同 revision 时只加载目标 operation 的局部分区。旧 revision 可以作为失败回退证据保留，但不能伪装成当前结果。

修改 Draft 时继续显示当前 Applied Query 和结果。成功应用语义不同的新查询后，原子提交新 Applied Query、revision 和发起模式的主结果，并清空全部共演人物/身份及其派生分析；取消、校验失败、请求失败或规范化 no-op 均保留旧 Applied Query 和结果。

网络请求不由 QueryStore 单独完成。`executeQuery(operation)` application service 负责最终校验、取消旧等待、调用对应 feature API、检查 sequence/request ID，并原子提交结果与共享 Applied Query。其他 operation 随后按相同 revision 懒加载自己的结果，不能维护第二份 Applied Query。operation/path 只选择要加载的能力，不进入共享 Query。

显式刷新收藏只允许从 personal rankings/candidates 的“应用/刷新收藏”动作触发。前端发送 `refreshCollection=true` 前保存可恢复的上一份 Applied Query/result，但立即让当前个人主结果退出可见 ready 态并使对应 surface 进入 pending，不能把旧结果伪装成已经刷新。成功返回 fresh 或允许的 stale 结果后提交同一共享 Query；`meta.collection.stale=true` 时必须按 `warningCodes` 中的 `COLLECTION_STALE` 显示稳定提示，不能解析上游文案。硬失败或取消时恢复上一份可用结果并显示本次反馈。显式刷新不得自动重试，也不得由搜索、排序、分页、详情、partners 或 co-star 请求携带。

### 3.4 URL 与持久化

URL 与持久化边界固定为：

- 模式进入 path：`/ranking` / `/co-star`，不使用 `?mode=`；
- `?user=<UID>` 只自动填充 personal UID Draft，不自动提交；
- 旧 `/?user=` 和 `/index.html?user=` 跳转到 `/ranking?user=`；
- 成功 personal 查询用 effective UID 更新 `?user=`；global 查询移除 URL 中的 user；
- 完整筛选、职位、人物、搜索、排序和分页不自动写入普通 query 或 Web Storage；
- 主题只写入版本化 localStorage key；
- 分享查询使用版本化 URL fragment，首次进入最多消费一次，不能用 requestId 或服务端 session 恢复。

路由和 URL 同步集中在 app shell，支持 `popstate`，不能散落在页面 watch 中。

### 3.5 正式契约

前后端至少要共享以下内容：

- 版本化职位/角色业务键；
- Query DTO 与结构化字段错误；
- personal/global 两套评分来源；
- 人物、作品、角色、系列 DTO；
- 严格全序的排序和分页语义；
- 空结果、取消、过期响应和服务端错误语义；
- 诊断用 dataVersion、schema 与能力信息；客户端不参与 dataVersion 协商。

推荐使用 OpenAPI/JSON Schema 生成 TypeScript 类型，避免 Go DTO、旧前端类型和 fixture 类型继续各自演化。

## 4. 删除与迁移清单

### 4.1 P0：正式构建必须立即隔离

以下内容在开始生产入口验证前必须移出构建。需要保留证据的文件可移动到 `docs/archive/`，但不能继续位于 `public/`：

- `frontend/public/prototypes/person-picker-height-strategy.html`；
- `frontend/public/prototypes/subject-work-layout-credits.html`；
- `frontend/public/prototypes/subject-work-layout-editorial.html`；
- `frontend/public/prototypes/subject-work-layout-scorecard.html`；
- `frontend/public/workbench-data/co-star-snapshot.json`；
- `frontend/public/workbench-data/position-data.json`。

原因：Vite 会原样复制 `public/`。当前 `dist` 已包含上述原型页和两个个人数据快照。

同时增加构建 denylist：产物中不得出现 `/prototypes/`、`/workbench-data/`、`lucay126`、`person-workbench-empty`、固定人物选择 ID 或“静态原型”文案。

### 4.2 可直接清理的死代码/陈旧文件

执行前仍需按当前工作树逐项确认引用：

- `useWorkbench.ts` 中没有消费者的 `queryStatus`、`focusedDistribution`、`ratingDistribution`、`selectedUnionCount`、`cooperationIndex`、`relationshipMatrix`；
- `WorkbenchApp.vue` 中无对应来源的 `url.searchParams.delete('direction')`；
- 空壳 `styles/modules/pagination.css` 及其 import；
- 未被 tsconfig 使用、且内容已过期的 `frontend/components.d.ts`；保留实际生成位置 `frontend/src/components.d.ts`；
- Vue 模板 README。`frontend/README.md` 应替换为真实入口、命令、目录边界和 fixture 规则，不只是删除。

### 4.3 正式 API 接通后删除

#### Fixture 运行时

- `src/workbench/data/loadFixtures.ts`；
- `WorkbenchApp.vue` 的 snapshot/positionData bootstrap；
- 伴随全站 fixture 启动的整页 loading/error 外壳；改为 catalog、排行、详情、候选和分析各自的资源状态；
- `types.ts` 中仅服务于快照的 `WorkbenchSnapshot`、`SnapshotMeta`、`PositionData`；
- `generate-workbench-data.mjs` 的 `public/workbench-data` 默认输出与 `generate:workbench` 生产脚本入口。

生成器中可复用的稳定排序、原子写入和可复现能力可迁入测试/数据工具，但输入必须匿名、规模小，并实现与生产 API 相同的 schema adapter。
当前生成器输出 schema 3，而仓库公开 fixture 仍是 schema 2；正式门禁必须拒绝这种依靠 optional 字段静默兼容的版本漂移。

#### 固定演示状态

- `1200/520ms` 查询模拟延迟和 `setTimeout` 请求；
- 默认 UID `lucay126`；
- 默认焦点人物 `4697`；
- 默认 3 人/4 身份的固定选择；
- 按 fixture UID 选择数据的 gate；
- `profileExtras.ts` 的固定人物简介、收藏数和评论数；
- `.env.development`、`.env.test` 中的固定 UID/职位。

生产初始状态应为没有 Applied Query、没有焦点人物、没有已选身份。

#### 硬编码目录与代理

- `QueryWorkspace.vue` 中手写的条目类型、职位和收藏状态目录，改由版本化 catalog/capabilities 契约提供；
- `Number(positionId)` 之类对字符串职位的猜测式转换；
- `bangumiImages.ts` 中硬编码的 `https://search.bgmss.fun/proxy`，改为正式的同源图片路由；同时删除所有图片默认落到 `large` 的隐式行为，`type` 必须由集中尺寸策略得出。

### 4.4 状态机与行为测试建立后删除

- `person-workbench-empty.html`；
- Vite 的 `personWorkbenchEmpty` input；
- 通过 pathname 判断首次查询状态的逻辑；
- 依赖该文件名的结构测试。

首次查询、加载、空结果、失败、取消状态本身必须保留；删除的是原型触发方式，不是这些 UX 状态。

### 4.5 决策落盘、测试替换后删除/归档

- `frontend/prototypes/person-ranking-workbench.html`；
- `person-workbench-unified.html`、`preference-algorithm-comparison.html` 两个跳转页；
- `palette-lab.html`、`surface-color-lab.html`、`surface-color-preview.html`；
- 对这些实验页做 `readFileSync(...).toContain(...)` 的测试；
- 其余只锁定内部变量名、class 名或模板字符串的结构测试。

不能一次删除全部结构测试。应先用领域单测、组件交互测试和浏览器视觉回归承接其约束，再逐个替换。

当前 `DESIGN.md` 已恢复并作为唯一正式设计规范；`DESIGN.legacy.md` 和历史会话只保留为证据，不是实现者需要并行猜测的第二份当前规范。后续界面变更先更新 `DESIGN.md`，再同步本实施稿中的对应要求。

### 4.6 新版切换到 `/` 后删除旧前端

切换完成并通过回归后，可删除旧应用树：

- `frontend/src/App.vue`、`frontend/src/main.ts`；
- `frontend/src/pages/`；
- 旧 `frontend/src/api/api.ts`；若已建立第 6 节的新 API 层，只删除旧模块，不删除目录；
- `frontend/src/stores/`；
- 旧 `frontend/src/components/`；
- 旧 `frontend/src/constants/`、`frontend/src/style.css`；
- 只被旧入口使用的 SVG、`star.png`、`star_unrated.png`、`info.png` 和 `request.css`；
- 旧 `VITE_API_USERID`、`VITE_API_POSITION` 和绝对生产 API URL。

依赖清理在切换后按真实引用执行：

- 若正式 client 使用原生 `fetch`，删除 `axios`；
- 删除无源码引用的 `vfonts`；
- `unplugin-vue-components` 移到 `devDependencies`；
- `naive-ui` 移到 `dependencies`；
- Pinia 作为下述 feature store 实现保留；
- `vite-svg-loader`、`unplugin-auto-import` 只在完成引用检查和显式 import 迁移后删除。

### 4.7 最后删除的兼容层

- `data-visual="archive"` 及以它为前缀的 token selector；必须先把 token 迁到正式 app 根节点；
- 迁移期的 `useWorkbench()` facade；
- 独立 `person-workbench.html` 入口；
- 旧、新样式并存期间的兼容 class。

## 5. 明确保留并重构的资产

以下不是原型垃圾，不应在清理时误删：

- 系列展示语义；正式查询使用 Applied Query 的 `mergeSeries`，不保留 `?result=series`；
- 首次查询以及 `idle | pending | ready | error`、取消和 Skeleton UX；合法空结果作为 ready 数据态展示；
- `SafeImage`、`AppIcon`、`AdaptivePagination`、`SortDirectionButton`，以及当前 tooltip 的交互行为；正式组件统一命名为 `AppTooltip`；
- `QueryDateRange`、`QueryNumericRange` 等已经单一职责的字段组件；
- `SubjectWorkBrowser` 的交互模式，但其数据源改为 API-backed；
- `preference`、`ratingSummary`、`ratingDistribution`、`seriesAggregation`、`characterCredits`、`nameSearch`、`participationEntries` 等原型纯领域实现只保留为迁移期 test oracle/共享金标来源，生产前端不得 import 或执行；完成 Go/API 对账后移入测试/归档或删除；
- 图表坐标、颜色、刻度、命中几何、响应式测量和 DTO 到 View Model 的无语义格式映射继续作为前端纯逻辑保留；
- `adaptiveOverflowGrid`、tooltip viewport boundary 等布局工具；
- `check-naive-css-boundaries.mjs`，继续作为 CI 门禁；
- 主题 token、分类色板和已经确认的响应式/无障碍行为；
- `docs/design-sessions` 等历史证据，不进入生产构建即可。

## 6. 目标目录与依赖方向

正式重写分支使用 `app / features / api / shared`，不把原型期 `workbench` 作为生产命名继续扩散：

```text
frontend/src/
├─ app/
│  ├─ main.ts
│  ├─ App.vue
│  ├─ AppProviders.vue
│  ├─ AppHeader.vue
│  └─ routeState.ts
├─ api/
│  ├─ client.ts
│  ├─ errors.ts
│  ├─ generated/              # OpenAPI 生成类型，只在 adapter 使用
│  ├─ operations/
│  └─ mappers/
├─ features/
│  ├─ query/
│  │  ├─ application/
│  │  ├─ model/
│  │  ├─ store/
│  │  └─ components/
│  ├─ ranking/
│  │  ├─ model/
│  │  ├─ store/
│  │  └─ components/
│  └─ co-star/
│     ├─ model/
│     ├─ store/
│     └─ components/
└─ shared/
   ├─ model/
   ├─ domain/
   ├─ charts/
   ├─ media/
   ├─ components/
   ├─ composables/
   └─ styles/
```

依赖方向固定为：

```text
app/shell -> feature container -> feature store/model
                    |                  |          |
                    |                  |          +-> shared domain
                    |                  +-> API adapter/mapper -> generated API contract
                    +-> leaf components via props/events
```

约束：

- `shared` 不反向 import `features/*`；
- 只有 feature container 读取 store；
- 叶子组件不读取全局 context，只接收 props 并发出语义事件；
- API DTO 必须先经过 mapper，SFC 不直接消费宽松的 optional mega type；
- 一个模块至少被两个 feature 使用后才进入 `shared`，避免过早抽象；
- 文件长度只是复核信号，不为追求小文件把完整交互拆成碎片。

## 7. 状态与模型拆分

### 7.1 `CatalogStore`

负责：

- 诊断用 `dataVersion`、capabilities；
- 条目类型、收藏状态、`staff:* | cast:* | staffset:*` position 和展示分组；
- catalog 加载/失败/过期状态。

不负责业务查询或结果。

### 7.2 `QueryStore`

负责：

- 唯一 `QueryDraft`、`AppliedQuery`、有序 `positionKeys` 和 `queryRevision`；
- dirty 比较、restore 和 shared query normalization；
- 结构化 `fieldErrors`，禁止从中文错误字符串反推字段；
- 纯校验、用于 dirty/no-op/revision 的 shared query signature 与 `commitApplied`；signature 包含 scope、筛选和职位等 Query 语义，不包含 mode/path，operation-specific identity 另由请求 input 表达；前端不复制后端完整结果缓存 digest 算法；
- 供 application service 调用的 draft snapshot。

不发网络请求，也不持有 feature 的 `idle | pending | ready | error`、排行、候选或分析结果。

### 7.3 `RankingStore`

负责：

- 当前 Applied Query 对应的排行页面；
- `{ status: idle | pending | ready | error, data, error, requestId, queryRevision }` 形式的排行/详情资源状态；
- metric、direction、search、page、pageSize；
- focused person ID；
- 人物详情、作品/角色资源各自独立的请求状态。

它只依赖已应用查询，不读取 draft，也不计算后端权威统计。

### 7.4 `CoStarStore`

负责：

- 候选结果、职位 tab、排序、搜索和分页；
- `{ status: idle | pending | ready | error, data, error, requestId, queryRevision }` 形式的候选/分析资源状态；
- `SelectedIdentity[]`，人物与职位使用稳定业务键；
- 单人/多人分析资源；
- 暴露 `clearForQueryChange()`，由 application service 在新 query version 成功后调用；
- 直接保存服务端基于未搜索、未分页权威集合返回的 rank、summary 和 leaders；不得从当前页派生名次或完整范围统计。

### 7.5 `executeQuery(operation)` Application Service

负责：

- 从 QueryStore 取得唯一 shared draft snapshot，并按当前 operation 做最终校验；
- 为每个 surface 持有 AbortController/sequence/request ID，阻止旧响应覆盖新结果；
- 调用 Ranking 或 CoStar API，并更新对应 feature resource；
- 新查询请求成功且 sequence 仍有效时，原子提交 feature result、共享 Applied Query 和 queryRevision；
- 模式切换只按当前 revision 加载缺失 operation，不重新提交 Applied Query；
- 只有语义不同的新 query 成功提交后才清空 CoStar 选择和分析；Draft 改动、失败、取消和 no-op 均不清空；
- personal rankings/candidates 的显式收藏刷新按第 3.3 节进入 pending、携带 `refreshCollection=true`、处理 stale warning，并在硬失败/取消时恢复上一可用结果；其他 operation 禁止携带该标志；
- 失败或取消时保留之前的 Applied Query 和可用结果，并单独更新请求反馈。

它是业务用例协调层，不渲染 UI、不实现统计公式，也不成为第四个巨型 store。

### 7.6 留在组件本地的状态

- drawer 开关与焦点恢复；
- tooltip、展开/收起；
- 图表展示 tab；
- ResizeObserver 和 overflow 测量结果；
- 明确不改变服务端结果语义的纯展示筛选或展开状态；正式契约中的 search/sort/page 必须通过 feature store 请求服务端，不能退回组件本地计算。

### 7.7 正式模型

至少分离：

- `QueryDraft` 与已校验的 `AppliedQuery`；
- `PositionKey = staff:{subjectType}:{positionId} | cast:{subjectType}:main|all | staffset:{subjectType}:{slug}`；前端把它当 opaque string，只读 catalog capability；
- `PersonEntity`、`RankedPersonRow`、`CandidateIdentityRow`、`CooperationPartner`；
- `WorkResult | SeriesResult` 判别联合；
- `ResultSemantics`，统一 personal/global、作品/系列单位、可用指标和评分来源。

## 8. 组件拆分计划

### 8.1 App Shell

正式 `App.vue` 只保留 provider、路由布局和顶层错误边界，不再加载全量人物数据，也不拥有查询/排行/共演业务状态。当前 `WorkbenchApp.vue` 只作为迁移来源，生产目标中不得保留该命名。

### 8.2 查询区

当前 `QueryWorkspace.vue`（711 行）拆为：

- `QueryWorkspace`：编辑器开合、焦点恢复、桌面/移动容器协调；
- `AppliedQuerySummary`：只展示当前 Applied Query；
- `QueryEditorForm`：表单提交/取消/恢复编排；
- `QueryScopeFields`：personal/global、UID、条目类型、收藏状态；
- `QueryAdvancedOptions`：日期、评分、分差、评分人数、标签；
- `QueryPositionSelector`：消费 CatalogStore 的职位目录；
- `QueryActions`：提交状态和反馈。

摘要、默认值、规范化和校验进入 `query/model`，浮层定位和滚轮边界进入局部 composable。模板不得再按中文错误文案推断字段。

### 8.3 人物排行

- `RankingPage`：容器，连接 store 与子组件；
- `RankingToolbar`：指标、方向、搜索和分页大小；
- `RankedPersonList`：纯列表，接收 rows/focusedId/semantics，发出 `activate(personId)`；
- `PersonInspectorContainer`：负责详情资源；
- `PersonProfileHeader`；
- `PersonMetricGrid`；
- `PersonCreditsPanel`：组合作品/角色浏览。

`RankedPersonList` 继续承担排行/候选所需的明确 variant，而不是让其重新读取全局状态。

### 8.4 人物选择器

当前 `PersonPicker.vue` 拆为：

- `PersonPickerPanel`：桌面 rail 与移动 drawer 复用的面板壳；
- `SelectedIdentityTray`；
- `CandidateToolbar`；
- `CandidateBrowser`；
- `CandidateTile`；
- `CandidatePagination`（可直接复用 AdaptivePagination）。

候选排名只从服务端响应接收一次，卡片和已选托盘不得自行重算。

### 8.5 单人共演

当前 `SinglePersonCooperation.vue`（538 行）拆为：

- `PartnersContainer`：提交 typed request，并连接服务端 resource 与子组件；
- `usePartnerViewState`：只管理搜索输入、排序选择、分页控件、焦点和取消，不计算合作集合；
- `SinglePersonSummary`；
- `CooperationPartnerPane`；
- `CooperationWorksPane`。

rank、partnerCount、leaders、排序结果和分页全部消费服务端响应；前端没有完整合作全集，不能从当前页重算。列表搜索请求返回的新页面不得改写服务端给出的完整 partnerCount 和 leaders。

### 8.6 多人分析

当前 `AnalysisDashboard.vue` 拆为：

- `CoStarAnalysisState`：只负责 `empty | single | multi` 状态分派；
- `SinglePersonAnalysis`；
- `MultiPersonAnalysis`；
- `SelectedPeopleOverview`；
- `SharedWorksSection`；
- `PairRatingMatrix`。

`PairRatingMatrix` 只接收预计算的 people/cells/bestPairKey/unit，不访问 store。

### 8.7 图表与重复测量

- 将两个评分图表重复的坐标轴、刻度、ResizeObserver 和命中几何抽入 `shared/charts/ratingCharts.ts` 与 `useRatingChartViewport`；
- 外层统一接收 `RatingSeries[]`，保留单人/多人展示 wrapper；
- 将 `AdaptiveAppearanceList`、`AdaptiveRoleList` 的重复测量生命周期抽为 `useAdaptiveOverflowRows`；
- 将两个 drawer 的滚轮边界抽为 `useContainedDrawerScrollbar`；
- 不把整个 drawer 或完整工作台做成一个高度参数化“万能组件”。

### 8.8 不建议继续拆分

以下组件当前主要问题是依赖全局状态，不是尺寸，应先改为 props/events，通常无需再拆：

- Header、Footer；
- `QueryDateRange`、`QueryNumericRange`；
- `SubjectWorkBrowser + SubjectWorkList + WorkListToolbar` 组合；
- `SafeImage`、Tooltip、分页、方向按钮；
- Ranking/CoStar 两个 feature route 容器。

### 8.9 图片资源与 `SafeImage`

图片 URL、尺寸选择和视觉状态必须分别有唯一 owner，不能继续散落在各业务组件：

- `shared/media/bangumiImagePolicy.ts` 维护 Bangumi `small | grid | large | medium | common` 的版本化能力表。实施前先用上游文档或受控响应核实人物、角色、作品各规格的真实像素宽度；未核实的数值不能写成生产常量。
- 调用方只提供资源类型、ID、语义展示宽度和响应式 `sizes` 信息，不直接硬编码 `type`。策略按“CSS 展示宽度 × 设备像素比”选择能够覆盖目标像素宽度的最小规格；没有足够大的规格时才使用该资源的最大规格，禁止所有场景默认 `large`。
- 固定宽度槽位可以解析为单一同源 URL；会随断点变化的槽位优先由同一策略生成带宽度描述符的 `srcset/sizes`，让浏览器按 viewport 与 DPR 选择。两条路径必须共享同一规格能力表和相同选择测试。
- `shared/components/SafeImage.vue` 只负责图片生命周期、候选源回退、比例、可访问性和占位视觉，不知道人物排行、共演或详情业务。
- `SafeImage` 使用显式 `loading | loaded | missing | error` 状态：没有可用源直接进入 `missing`；存在源但尚未完成（包括尝试后备源）为 `loading`；任一源成功为 `loaded`；全部候选源失败或超时才进入 `error`。不得再用“当前源为空”同时表示无图和加载失败。
- `loading` 使用骨架表面，可选的微弱动效必须服从 `prefers-reduced-motion`；`missing` 使用稳定的资源类型占位；`error` 使用可辨识但克制的失败占位。至少 `loading` 与 `missing` 在形状/内容上明显不同，不能只靠 class 名或颜色区分。
- 四种状态共用 3:4 固定占位盒，不因加载或失败发生布局位移。紧凑图片中的占位图形默认 `aria-hidden`，人物/作品名称由相邻文本提供；若图片本身是唯一信息载体，调用方必须提供非重复的可访问名称。

后端图片代理只校验并透传策略得出的规范 `type`，不根据 UI 猜尺寸；业务组件也不能绕过策略自行拼代理 URL。这样更换上游规格、代理路由或响应式槽位时只修改能力表/adapter，而不是搜索全部 SFC。

## 9. CSS 所有权计划

当前 `workbench.css` 聚合 30 个全局模块，同一 `.person-profile`、`.profile-metrics`、`.ranking-pane` 等选择器被多个 foundation、responsive、data 和 refinement 文件覆盖。迁移顺序应在组件职责稳定之后进行。

规则：

- 全局只保留 tokens、reset/base、app shell、teleport/overlay 和经审核的 Naive override；
- 业务组件样式与组件同目录，响应式规则跟随其 owner；
- 禁止一个 feature 的 CSS 直接覆盖另一个 feature 的内部 class；
- 共用视觉 primitive 通过组件或明确 token 复用，不靠同名全局 class 偶然复用；
- `<780px` 等已确认断点保持不变，迁移时逐个 viewport 对账；
- 单个业务 CSS 目标控制在 300 行左右，500 行为必须拆分/复核上限；
- `!important`、`:deep()` 和 Naive 内部选择器新增必须经过现有 CSS 门禁。

## 10. 测试与质量门禁

### 10.1 保留/新增

- 评分、偏好、系列、角色、名称搜索和严格排序的原型 test oracle/共享 JSON 金标；这些测试只用于验证 Go/API 迁移等价性，不对应生产前端运行时代码；
- QueryStore 状态机测试：首次、提交、重复提交、取消、校验失败、shared Query 在 path 切换时保持一致、operation view/resource 隔离、旧响应丢弃；
- Ranking/CoStar store 的分页、焦点和 query version 测试；
- Vue 组件挂载与交互测试，覆盖 Query Editor、排行、选择器、drawer 和分析状态；
- 前后端契约测试及小型匿名 fixture；
- E2E：personal/global、空结果、错误、取消、多职位、series、character、移动 drawer、键盘焦点；
- 显式收藏刷新测试：仅允许 personal rankings/candidates，pending 时旧结果不冒充新结果，fresh/stale warning/硬失败恢复/取消均覆盖，且不发生自动 retry；
- 可访问性自动检查；
- Light/Dark 下 390、779、780、1280、1440/2560 的视觉回归；
- 图片策略单测：按资源类型、展示宽度、断点和 DPR 覆盖“选择最小足够规格、超出范围回退最大规格”，并锁定调用方不得隐式默认 `large`；
- `SafeImage` 组件测试：覆盖 `loading -> loaded`、无源 `missing`、候选源回退和全部失败 `error`，断言加载占位与无图占位视觉结构不同且四态均保持 3:4；
- 浏览器网络检查：代表性列表缩略图与详情图请求命中策略得出的 `type`，没有统一请求 `large`，也没有直连 `api.bgm.tv`；
- bundle 内容、体积和隐私 denylist。

### 10.2 逐步替换

29 个源码字符串测试现在仍是原型回归网，不能先删。每个生产 feature 完成后，按下列映射替换：

```text
文案/状态约束      -> component behavior test
颜色/token 约束    -> token unit test + visual regression
响应式 class 约束  -> browser viewport regression
结构/变量名约束    -> 删除，不在生产测试中固化实现细节
领域公式约束       -> backend/shared golden contract test；不保留前端运行时公式
```

### 10.3 CI 最低命令

正式切换前，干净检出必须通过：

```text
frontend: lint + typecheck + test:unit + check:naive-css + build + e2e
backend:  go test ./...
repo:     git diff --check + production artifact denylist
```

还需修正仓库卫生问题：根 `.gitignore` 当前全局忽略 `*_test.go`，会导致 Go 测试无法正常纳入版本控制；同时核对实际 `backend/config/config.toml` 的忽略路径和凭据状态，只提交安全的 example 配置。

## 11. 实施阶段与退出条件

### Phase 0：冻结原型

- 保存关键页面截图、viewport、Light/Dark 和状态矩阵；
- 只把经确认仍需实施的界面要求写入 `DESIGN.md`，删除无效 TODO 和实验草稿；
- 标记原型分支/commit，不在同一实现上继续堆生产适配。

退出条件：后续任何生产差异都能判断是明确变更还是回归。

### Phase 1：契约与骨架

- 把已确认的后端统计权威边界落实到 schema、Query DTO、结果投影和 API client；
- 建立 schema、PositionKey、Query DTO、错误模型和 API client；
- 建 `app/` 与四个状态边界；
- fixture 只通过测试/dev data source 注入。
- 开发环境使用同源 Vite proxy 或统一 origin，消除当前 `127.0.0.1` 与后端只允许 `localhost` 的 CORS 偏差。
- 建立图片规格能力表、同源 URL adapter 和 `SafeImage` 四态契约；图片代理未接通前也不得在业务组件中恢复硬编码域名或默认 `large`。

退出条件：生产代码不需要知道 fixture 文件路径，能以匿名最小数据跑通 `idle | pending | ready | error`；ready 同时覆盖有数据和合法零结果。

### Phase 2：查询纵向切片

- 迁移 Query Workspace；
- 完成唯一 shared draft/applied/positionKeys、operation-specific resource/view、结构化校验、取消和旧响应保护；
- 完成 personal 显式收藏刷新及 fresh/stale/失败恢复状态路径；
- 从 catalog API 获取职位/能力。

退出条件：查询状态机行为测试和 personal/global E2E 通过。

### Phase 3：排行与人物详情

- 先迁移排行列表/排序/分页；
- 再按需加载人物资料、作品和角色；
- 按列表、候选、作品网格和详情的实际语义宽度接入集中图片规格策略；响应式槽位提供准确 `sizes`，避免小缩略图下载详情规格；
- 禁止浏览器加载全量快照后重新排行。

退出条件：排行、焦点、分页、详情失败隔离和 series state 通过契约/E2E。

### Phase 4：选择器与共演

- 迁移候选列表和身份选择；
- 迁移单人合作；
- 最后迁移多人共同作品、矩阵和图表；
- 只有语义不同的新 query 成功提交后清空选择；Draft 变化、失败、取消和 no-op 不清空。

退出条件：0 人、1 人、2+ 人状态与查询变更清理全部通过。

### Phase 5：样式归属与测试替换

- CSS 跟随稳定组件边界迁移；
- 抽取真实共享 primitive；
- 用挂载/E2E/视觉测试替换结构测试。
- 在 Light/Dark 与关键 viewport 对账图片四态，确认加载中、无图和失败可区分、无布局位移，并用网络记录核对实际 `type`。

退出条件：关键 viewport 和双主题无视觉回归，键盘/读屏状态可用，结构测试不再阻止内部重构。

### Phase 6：入口切换与删除

- 同一正式 SPA 接管 `/ranking` 与 `/co-star`，根路径跳转 `/ranking`；
- 删除旧前端、空状态入口、公开 fixtures、public prototypes、实验页、兼容 facade 和 archive namespace；
- 清理依赖、环境变量、生成声明和 README；
- 在 clean clone 构建并检查产物。

退出条件：只剩一个生产 HTML；产物 denylist 为零；无固定用户/人物数据；全部前后端、E2E、视觉和构建门禁通过。

## 12. 明确禁止的迁移方式

- 不直接把真实 `fetch` 塞进现有 `useWorkbench.ts`；
- 不把 950 行全局 composable 换成一个同样巨大的 Pinia store；
- 不让叶子组件继续调用全局 context；
- 不在 SFC 中重复实现评分、系列、排序或共演公式；
- 不把宽松 fixture type 原样命名为正式 API type；
- 不先重写 CSS 再拆组件；
- 不先删除全部结构测试再开始迁移；
- 不把个人快照、小工具页或测试 scenario 放进 `public/`；
- 不在旧、新应用之间长期复制修复；原型冻结后，正式修复只进入新架构。

## 13. 正式开发启动检查表

- [x] 统计权威边界已确认并写盘；
- [x] `DESIGN.md` 已确认为唯一当前设计规范；legacy/design-session 只作为历史证据；
- [ ] API schema 与错误模型可供前后端共享；
- [ ] `PositionKey` 和 personal/global/series 语义已冻结；
- [ ] 原型截图和行为矩阵已保存；
- [ ] P0 公开资源已从生产构建隔离；
- [ ] 新目录、依赖方向和 store ownership 已建立；
- [ ] 小型匿名 fixture 与 contract test 已建立；
- [ ] CI 能阻止 prototype、个人快照和固定 ID 进入产物；
- [ ] Bangumi 图片规格能力表已有来源与单测，代表性槽位不再统一请求 `large`；
- [ ] `SafeImage` 的 loading、missing、error、loaded 四态和 3:4 稳定性已有组件/视觉验收；
- [ ] 每个 phase 均有单独可回滚的提交，不夹带当前工作树中的无关修改。
