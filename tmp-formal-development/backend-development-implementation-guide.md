# 后端正式开发实施指南

> 状态：正式开发前执行稿
>
> 更新日期：2026-07-23
>
> 范围：Go API、Python 数据构建器、SQLite 契约、职位 catalog、缓存、Bangumi 上游 client、OpenAPI、查询 operation、可观测性埋点与开发测试。
>
> 本文只记录必须实现和验证的要求，不记录方案比较、讨论过程或旧架构的决策历史。

配套文档：

- [`backend-operations-implementation-guide.md`](./backend-operations-implementation-guide.md)：宿主机、Compose、调度、激活、回滚、资源、监控、迁移和发布；
- [`data-logic-implementation-guide.md`](./data-logic-implementation-guide.md)：评分、系列、角色、排序和统计口径；
- [`frontend-production-cleanup-and-architecture-plan.md`](./frontend-production-cleanup-and-architecture-plan.md)：前端状态、组件边界、原型清理和接入顺序；
- [`PRODUCT.md`](../PRODUCT.md) 与 [`DESIGN.md`](../DESIGN.md)：产品和界面规范。

## 1. 使用规则

### 1.1 交付状态

本文复选框只表示正式代码及其验证是否完成。原型已有相似行为、只更新 schema、只生成 fixture 或只在本机手工通过，均不算交付。

每项完成至少需要：

- 正式实现；
- 单元或契约测试；
- 与 Python/Go/TypeScript 相邻层的集成验证；
- 对应的错误、资源和安全边界；
- 不夹带旧协议或未启用规则。

实现中如需改变产品、统计或 wire 语义，先更新 `PRODUCT.md`、数据实施稿或本文，再修改代码。不得把临时实现反向当成新契约。

### 1.2 本文负责

- 新 Go API 的依赖方向和生成边界；
- Python producer 与 Go consumer 的快照契约；
- 动态职位、声优和未来人工职位集合；
- 两层进程内缓存与并发控制；
- 图片代理和公开收藏 client；
- typed query、六个 endpoint 和共享响应模型；
- query/app 事件、健康端点和指标埋点；
- 前端必须依赖的路由、分享和分区加载契约；
- 开发阶段、金标和 CI 测试内容。

宿主机命令、生产目录、timer、容器资源、日志保留、部署和迁移步骤只在运维实施稿中定义。

本文拥有算法、默认配置、wire、埋点和可测试资源行为；运维稿只拥有生产 hard limit、调度、保留、抓取、检查和演练。生产调参不得改变本文的业务语义；超出本文已测试范围时必须先补开发侧测试和基准。

## 2. 工程与依赖边界

### 2.1 重写方式

- 正式开发在当前仓库的普通重写分支完成；分支从干净 `origin/master` 建立并保留正常祖先。
- 不新建仓库、不使用 orphan 分支、不建立独立 worktree。
- 开始前先安全保存当前脏工作区；不得通过 reset、批量删除或 `git add -A` 覆盖现有工作。
- 新分支从最小目录和依赖清单开始，不在旧应用目录中长期维护 old/new 双实现。
- 迁移 `PRODUCT.md`、`DESIGN.md`、Impeccable 规则、语义 token 和小型金标；原型只作为视觉、状态机和差分 oracle。
- 不复制 `src/workbench` 命名、巨型全局状态、公开个人 fixture、演示 timer、私有组件 DOM selector 或只锁定源码文本的结构测试。

### 2.2 Go 结构

- Go module 使用 `go 1.26.0`，构建固定实际使用的最新 1.26 patch toolchain。
- HTTP 使用标准库 `net/http`；只引入必要的中间件和 SQLite driver。
- 依赖方向固定为：

```text
httpapi.Server
  → query.Service
      → archive.Store
      → collection.Source
      → collectionCache
      → resultCache
```

- handler 只负责严格解码、请求级校验、错误映射和 service 调用。
- domain、cache 和 archive store 不依赖 HTTP、OpenAPI 生成类型或外部收藏包 DTO。
- 不引入 DI 框架、GORM、通用 repository 基类、SQL generator 或 controller/service/repository 五层包装。
- 新核心不得依赖 MySQL、Redis、AOF、Bloom Filter 或常驻 Python 进程。
- 所有正式包名、路由、日志和指标不得使用 `workbench`。

### 2.3 OpenAPI 与 TypeScript

- OpenAPI 是 wire schema 的唯一机器可读真相。
- `oapi-codegen` 固定已发布版本，并只生成 Go DTO model；handler、严格解码、业务校验、错误映射和 service 调用手写。
- Go 生成文件只进入 `httpapi` adapter。
- 前端使用 TypeScript 6.0.2 兼容包与相容 `vue-tsc`；暂不使用 TypeScript 7 或双编译器。
- `openapi-typescript` 只生成 `paths/components` 类型，并在 CI 用 `--check` 防止漂移。
- 前端运行时继续使用原生 `fetch`、`AbortSignal` 和手写具名 operation wrapper，不新增 `openapi-fetch`。
- 生成类型只能进入 `src/api` adapter；组件和 feature store 依赖稳定 view model，不直接依赖生成文件。

## 3. 数据制品开发契约

### 3.1 producer / consumer 边界

Python updater 是 one-shot producer，Go API 是只读 consumer。跨语言只共享以下版本化制品：

- `schema.sql`；
- manifest schema；
- dataVersion 算法；
- dynamic position/cast/manual staff-set 配置；
- 最小 Archive fixture；
- 共享 JSON 金标。

Python 不调用 systemd、Docker API 或服务重启；Go 不修改快照。调度和激活属于运维侧。

条目与关系事实只从 GitHub `bangumi/Archive` 的正式 dump release asset 构建。producer 解析一个确定 release、记录 asset URL/release/digest，并在内容无变化时返回稳定 no-change；不得把实时 Bangumi API、旧 MySQL 或前端 fixture 混入全站数据制品。

职位定义只从 `bangumi/common/subject_staffs.yml` 读取。fixture/golden 固定已经核对的 commit `6a8442c17143a870357a5ff812362e8b5cfe9f9d`；生产构建先把上游 ref 解析为一个 exact commit，再下载和校验内容，manifest 记录 commit 与 SHA-256。后续新增/改名/分类变化通过结构化 diff 和质量门后随新 dataVersion 自动进入，不建立客户端职位版本协商或手工 Go/TS 枚举。

### 3.2 快照基础表

SQLite 至少保留不会被产品规则改写的原始事实：

```text
staff_position(
  subject_type, position_id,
  name_cn, name_en, name_jp,
  categories, sort_order, status, common_commit,
  PRIMARY KEY(subject_type, position_id)
)

staff_credit(
  subject_type, subject_id, person_id, position_id,
  PRIMARY KEY(subject_type, subject_id, person_id, position_id)
)

cast_credit(
  subject_type, subject_id, person_id, character_id,
  role_type, sort_order, eligible, provenance,
  PRIMARY KEY(subject_type, subject_id, person_id, character_id)
)

staff_set(
  key, subject_type, label, sort_order,
  PRIMARY KEY(key)
)

staff_set_member(
  set_key, position_id,
  PRIMARY KEY(set_key, position_id)
)
```

索引至少覆盖：

```text
staff_credit(subject_type, position_id, person_id, subject_id)
cast_credit(subject_type, role_type, person_id, subject_id)
cast_credit(subject_type, person_id, subject_id, character_id)
staff_set_member(set_key, position_id)
```

约束：

- `subject-persons.position` 只能形成 exact `staff_credit`，不得先做旧映射或 fan-out。
- 本作 `subject-characters + person-characters` exact 连接只能形成 `cast_credit`。
- 人物/作品集合和角色详情必须读取同一批 eligible cast edge。
- 未定义 position ID 保留 raw credit 并进入 unresolved 报告，不能伪造 catalog 名称或静默丢弃。
- v1 `cast_credit.provenance` 只允许 exact；不跨作品或同系列继承声优关系。
- `staff_set` 是查询期附加集合，不复制或改写 raw credit。

### 3.3 manifest 与 dataVersion

manifest 至少包含：

```text
schemaVersion
dataVersion
generatorVersion
generatedAt
archiveRelease / archiveDigest
commonCommit / commonDigest
catalogConfigDigest
domainRulesVersion
castRulesVersion
sourceFiles
tableCounts
qualitySummary
sqliteDigest
```

dataVersion 必须覆盖 Archive、common、schema、domain/cast 规则和 canonical catalog 配置；`catalogConfigDigest` 覆盖常用职位、额外展示分组和人工职位集合配置。任何会改变 catalog、集合或计算语义的变化都必须换 dataVersion。

### 3.4 producer 实现要求

- 下载、解压、解析和数据库写入全部在独立 staging 中完成。
- 下载先校验 HTTP 状态、大小和 digest，再进入解析。
- Archive 以流式方式处理，不把全部大型文件同时物化进内存。
- 每次构建全新 SQLite；不能按旧库行数决定跳过表，也不能只 upsert 而保留上游删除。
- source accounting 明确区分 imported、duplicate、invalid、unresolved。
- 建完索引后执行 SQLite integrity、领域质量门、只读重开和 Go consumer smoke test。
- 任一失败返回非零状态，不能发布部分 catalog 或部分数据库。
- updater 输出稳定 JSON 事件和 `update-status.json` 所需状态；具体生产目录和激活由运维稿定义。
- 实现优先使用 Python 标准库与轻量 HTTP/YAML 依赖，不引入 pandas、SQLAlchemy 或常驻任务框架。

### 3.5 Go consumer 启动门

API 每次启动只选择一个不可变 snapshot，并在全部检查成功前保持 `ready=false`：

1. 只读解析一次 `current.json`，拒绝未知字段、非法路径和不存在的 version；
2. 校验 manifest schema、必填输入版本和 `dataVersion`；
3. 对 SQLite 文件计算 digest，并与 manifest 的 `sqliteDigest` 完整比对；
4. 以 read-only/no-create 方式打开 SQLite，校验受支持的 schema version、必需表/索引和库内 dataVersion；
5. 要求 current、manifest、目录名和库内 dataVersion 全部一致；
6. 执行轻量 integrity/sentinel 查询和最小 catalog/domain smoke query；
7. 所有检查完成后原子发布只读 store，并把 readiness 切为成功。

任一失败必须关闭新句柄、输出稳定 app error code 并保持 not ready；API 不修改 snapshot、不自动改写 current，也不静默退回另一个版本。生产回滚由运维激活事务负责。

## 4. 职位 catalog

### 4.1 基础命名空间

对外 type 固定为：

```text
book | anime | music | game | real
```

Archive 数字类型只存在于数据适配层。

| kind | key | 来源 |
|---|---|---|
| exact staff | `staff:{type}:{positionId}` | common + `staff_credit` |
| cast | `cast:{type}:main` / `cast:{type}:all` | eligible `cast_credit` |
| future staff set | `staffset:{type}:{slug}` | 人工配置编译出的 exact staff 并集 |

API 和前端把 PositionKey 当 opaque string。不得用中文名、裸整数、旧 168 项 value 或 key 前缀猜业务能力；能力只读 catalog。

基础 catalog 包含当前 common 快照的全部 exact staff，以及：

| 类型 | key | 显示名 | 集合 |
|---|---|---|---|
| 动画 | `cast:anime:main` | 声优（仅主役） | eligible cast 且 role type = 1 |
| 动画 | `cast:anime:all` | 声优 | 全部 eligible cast |
| 游戏 | `cast:game:main` | 声优（仅主役） | eligible cast 且 role type = 1 |
| 游戏 | `cast:game:all` | 声优 | 全部 eligible cast |

main 必须是 all 的子集。同类型 main/all 属于同一 exclusive group；前端选择一个时原位替换另一个，后端同时收到时返回 `POSITION_SELECTION_CONFLICT`。

### 4.2 catalog DTO

每个 position 至少返回：

```text
key
kind
subjectType
label
names {cn,en,jp}
positionId | roleScope | memberKeys
categories[]
displayOrder
capabilities[]
exclusiveGroup?
status
```

catalog 还返回：

```text
subjectTypes[]
positions[]
groups[]
selectionRules[]
filter/sort capabilities
```

- common 新增职位随下一数据版本自动进入，不修改 Go/前端静态枚举。
- common 改名只更新展示名称，稳定 key 不变。
- 无 credit 的已定义职位仍是合法查询，返回空结果。
- unknown、跨类型、不可选和互斥 key 分别返回稳定 4xx。
- catalog 分组只影响浏览，不改变 query 集合。

### 4.3 Bangumi 分类与展示分组

```text
positions       唯一实体
groups          bangumi / shortcut / custom / fallback，只引用 PositionKey
selectionRules  exclusive 等选择规则
```

- 同一 position 可以同时出现在常用区、Bangumi 声明的多个分类和搜索结果中。
- UI occurrence 使用 `groupKey + positionKey`；选中状态只按 positionKey 保存并在全部副本同步。
- groupKey 不能提交给查询 API。
- 分类标题只展开，不提供整组选择或级联。
- Bangumi 分类按正整数 order 升序；非正数/缺失排在后面并保留来源顺序。
- 多分类职位在全部父级出现，不能擅自选 primary。
- 无分类 staff 进入“其他”；当前类型完全无 Bangumi 分类时使用“全部职位”容器。
- 动画/游戏增加“配音类”，位于“声音类”之后，只引用对应 main/all。
- 搜索覆盖中/英/日名称、position ID 和分类名称；结果按 positionKey 去重并显示全部所属分类。

正式前端使用独立 `PositionSelector`：桌面 portal 弹层，移动端 Query Editor 内全宽面板。不能依赖 Naive UI 私有 DOM 或把重复 position 强塞进要求 key 唯一的 TreeSelect。

### 4.4 常用职位

常用区是手工有序 key 配置，不是动态使用量排行。未配置类型不渲染空组。

| 类型 | 顺序 | 显示名 | key |
|---|---:|---|---|
| 动画 | 1 | 导演 | `staff:anime:2` |
| 动画 | 2 | 动画制作 | `staff:anime:67` |
| 动画 | 3 | 声优（仅主役） | `cast:anime:main` |
| 动画 | 4 | 声优 | `cast:anime:all` |
| 动画 | 5 | 脚本 | `staff:anime:3` |
| 动画 | 6 | 系列构成 | `staff:anime:10` |
| 动画 | 7 | 总导演 | `staff:anime:74` |
| 动画 | 8 | 原作 | `staff:anime:1` |
| 动画 | 9 | 演出 | `staff:anime:5` |
| 动画 | 10 | 分镜 | `staff:anime:4` |
| 游戏 | 1 | 剧本 | `staff:game:1004` |
| 游戏 | 2 | 开发 | `staff:game:1001` |
| 游戏 | 3 | 声优 | `cast:game:all` |
| 游戏 | 4 | 声优（仅主役） | `cast:game:main` |
| 游戏 | 5 | 原画 | `staff:game:1013` |

显示名称来自 catalog；配置只保存有序 key。所有 `staff:*` 保持 exact，“导演”不包含“总导演”，“演出”不隐含其他职位。

### 4.5 人工职位集合扩展点

v1 必须实现 dormant extension contract，但 active 配置保持为空，不启用任何旧手动规则。

代码库提供版本化配置：

```yaml
schemaVersion: 1
sets: []
```

未来手工增加一项时使用：

```yaml
- key: staffset:anime:director-family
  subjectType: anime
  label: 导演（含总导演）
  displayOrder: 10
  members:
    - staff:anime:2
    - staff:anime:74
```

规则：

- key 必须匹配 `staffset:{book|anime|music|game|real}:{slug}`；`slug` 匹配 `[a-z0-9]+(?:-[a-z0-9]+)*`、长度 1–64，完整 key 最长 96 字节。
- key 内 type 必须等于 `subjectType`；所有成员必须是当前 common catalog 中存在、可选、同类型的 exact `staff:*`。
- `slug` 是人工指定的稳定产品标识，不从显示名或成员生成。
- 改名或小范围成员修订可保留 key；根本语义变化新建 key。
- 配置中存在即启用，不增加 enabled、生效日期、后台管理或运行时 hot reload。
- 成员至少两个且输入不得重复；成员顺序无语义，只在 canonical digest 时排序，不能静默去重坏配置。
- 禁止 cast、跨类型、嵌套 staffset、循环、排除、权重和空集合。
- capabilities 取全部成员 capability 与 subjectType capability 的保守交集，不允许配置伪造或用并集放宽能力。
- `label` 同时写入 catalog 的 `label` 和 `names.cn`，`names.en/names.jp` 为 null；不得由 Go 或前端另行猜测翻译。
- `displayOrder` 必须是正整数，编译为 `staff_set.sort_order`；同类型按 `displayOrder`、再按 key 稳定排序。
- updater 在 common catalog 生成后编译配置到 `staff_set` / `staff_set_member`。
- catalog 对每项返回 `kind=staffSet` 和 memberKeys，并自动放入对应类型唯一的 `custom:{type}:staff-sets` 分组；因此 active set 不会成为 selector 中不可见的 orphan。
- 人工集合如需同时进入常用区，只在常用职位配置中额外引用同一个 key；position 实体仍只有一个。
- 任一 key/namespace 冲突、type 不一致、未知或不可选成员、重复成员、非法 label 或非法 displayOrder 都拒绝整版快照，不能跳过坏规则继续发布。
- canonical catalog 配置 digest 写入 manifest/dataVersion；成员重排不改变 digest，成员、label、displayOrder、常用职位或其他展示分组的语义变化必须改变 `catalogConfigDigest` 和 dataVersion。
- 规则只随 snapshot 激活，不在 Go 进程内热更新。

查询语义：

```text
works(person, staffset) = UNION works(person, each exact member)
```

多个 selector 继续使用“人物逐 selector AND、最终作品去重 UNION”。staffset 在 candidates、partners 和 co-star 中作为一个 identity。详情保留底层 exact credit/provenance，并可说明实际命中的 member；不得伪造一条 staffset 原始 credit。

请求同时包含 set 与其 member 时允许，但作品和人物全程去重。旧 mapping 和审计报告绝不能自动生成 active 配置。

开发工具必须另外生成只读的旧规则审计报告，供后续逐项决定人工集合：

- 枚举旧配置中的全部非恒等、一对多、伪声优 ID 和未知目标规则，不能只抽样；
- 对每条规则输出旧输入、旧目标、对应 exact key、受影响 credit/人物/作品数量、集合差异和有界样例 ID；
- 明确区分“仅改名”“并集扩张”“跨类型/声优伪 ID”“无法解释”；
- 报告生成失败或覆盖不全时 CI 失败，但报告内容不进入 active snapshot、不改变 dataVersion，也不由 updater 自动启用；
- 报告只作为评审制品，不在生产机长期保存，未来确认的规则必须手工写入版本化配置并重新经过本节全部质量门。

必须使用空配置和 synthetic 两成员规则证明：

- 空 active 配置即使仓库仍有旧 mapping 或审计文件也不产生 staffset；
- synthetic 规则无需修改 raw schema、handler 或前端枚举即可进入 catalog 并查询；
- exact staff 结果零变化；
- set 与其他 selector 的 AND/UNION 正确；
- set + member 不重复计数；
- 详情保留 exact provenance；
- 非法 key/namespace、key type 与 subjectType 不一致、成员 type 不一致、重复成员和未知成员都让整版失败；
- 成员重排不改变 digest；成员、label、displayOrder 或分组配置改变时 dataVersion 改变；
- 删除规则后旧 key 返回 `INVALID_POSITION_KEY`。

## 5. 查询计算与缓存

### 5.1 统计权威

Go 后端负责：

- 请求默认值、严格校验和语义规范化；
- personal/global 数据源分域；
- 条目/标签/日期/评分范围过滤；
- 多职位人物 AND 和作品 UNION；
- 系列归并、角色身份和参与 credit；
- work/rating/overall/preference、稳定名次和严格排序；
- 评分桶、季度序列、标签 Top N 和共演矩阵；
- 搜索、排序和服务端分页。

前端只能格式化名称、日期和分数，绘制坐标/颜色/刻度，并管理焦点、Drawer、主题、图例、搜索输入和取消。不得从当前页反算完整摘要或维护第二套评分/系列/偏好公式。

### 5.2 两层 weighted LRU

| cache | key | value | v1 基线 |
|---|---|---|---|
| collection | `collection/v1/{uidHash}/{subjectType}/{collectionStatuses}` | immutable CollectionSnapshot + digest/freshness | 64 MiB、4096 项、单项 8 MiB、fresh 1 小时 |
| result | `result/v1/{operation}/{dataVersion}/{queryDigest}/{inputDigest}/{collectionDigest?}` | 分页前紧凑 typed core | 190 MiB、512 项、单项 32 MiB |
| negative | 收藏语义 key | 不存在/不公开分类 | 2 MiB、4096 项；404 2 分钟、403 30 秒 |

实现要求：

- 共用 `map + container/list + sync.Mutex` 的按成本 LRU 内核。
- 加载和计算在锁外；相同 key 分别用 `singleflight` 合并。
- 共享任务有独立 timeout；一个请求取消只停止自身等待。
- 不同 key 昂贵计算通过有界执行器，最多 2 执行中 + 8 排队。
- 队列满返回 `503 SERVER_BUSY` 和 `Retry-After`。
- value 发布后不可变；排序使用新索引/浅拷贝，handler 不得修改缓存 slice。
- oversize、miss、eviction 或 cache write 失败只导致重算，不改变业务结果。
- 首版不使用 Redis、TinyLFU、后台 SWR、逐实体 cache 或按页 cache。

### 5.3 digest 与投影

- UID 只 trim，保留大小写；未经上游证明不得擅自转小写。
- collection digest 覆盖 subject ID/type、status、rate、comment、tags、vol/ep progress、private、updatedAt。
- query digest 只覆盖补默认后的 shared typed query；集合规范化、range 统一、标签先解析 AST，并包含 mergeSeries，不包含 mode/path、operation、input 或 view。
- input digest 覆盖 operation-specific input；rankings 使用固定空 input digest。operation、queryDigest 和 inputDigest 共同确定昂贵 core。
- search、sort、order、page、pageSize 和详情 section 不进入昂贵 core key。
- personal 请求必须先取得当前允许使用的 collection digest，再查 result cache。
- `refreshCollection` 只绕过 fresh collection 命中，不清空 LRU、不强制重算，digest 未变时可复用 result core。
- dataVersion 永远进入 result key。

### 5.4 stale

- 公开空收藏是 fresh 正缓存。
- fresh 过期后同步刷新。
- 只有 429、5xx、网络和 timeout，且旧值处于额外 30 分钟窗口时可 stale。
- stale 成功必须携带 fetchedAt、`stale=true` 和 `warningCodes:["COLLECTION_STALE"]`。
- 403/404 不得 stale；429/5xx/timeout/decode 不做负缓存。

## 6. Bangumi 上游 client

### 6.1 图片代理

```text
GET /api/v1/images/bangumi/{subjects|persons|characters}/{positiveID}?type={small|grid|large|medium|common}
```

- resource、正整数 ID 和 type 都必须 allowlist。
- 服务端构造固定 `api.bgm.tv` URL；不接收 URL、Host、协议、路径或任意重定向目标。
- type 必填，不隐式默认 large。
- 不转发客户端 Cookie、Authorization、Bangumi token 或任意请求头。
- 限制 timeout、并发、状态、重定向、图片 MIME 和最大字节数。
- 流式返回图片，不能 302 直连上游。
- 只透传安全的 ETag、Last-Modified、Cache-Control 和条件请求。
- image 与 collection 使用独立限流池。
- 前端只使用同源相对地址；DTO 不保存可派生图片 URL。
- v1 不提供其他 Bangumi GET 镜像或 wildcard proxy。

开发图片 helper 前必须核实资源/规格像素能力表，并以集中映射把 CSS 宽度和 DPR 选择到最小足够 type。

### 6.2 公开收藏

- v1 只读取无需用户凭据的公开收藏，不实现登录/OAuth。
- 请求 DTO 不接收 token/Cookie；client 不发送用户 Authorization/Cookie。
- 公共视图返回什么就使用什么，不推断私密项。
- 公开空收藏成功返回空结果。
- 明确不存在映射 `USER_NOT_FOUND`；明确私密/禁止匿名访问映射 `COLLECTION_NOT_PUBLIC`。
- timeout、429、上游 5xx 和协议/解码错误保持不同分类。
- 收藏不写 SQLite、日志明细、Prometheus label 或业务历史。

### 6.3 `bangumi-collection-go` 准入

在 `AcuLY/bangumi-collection-go` 完成并发布至少 `v0.1.0`：

- 完整 DTO：subjectID、subjectType、type、rate、comment、tags、updatedAt、volStatus、epStatus、private；
- Client 级完整分页、共享并发/QPS、Retry-After 和 jitter backoff；
- context、timeout、可注入 endpoint/transport；
- 401/403/404/429/5xx、网络、超时、取消、解码的 errors.Is/As；
- 限制错误响应体；
- 稳定排序、去重和收藏类型保留；
- httptest、race test、CI、Go 1.26。

本项目通过 `BangumiCollectionSource` 做领域转换。外部包不实现业务缓存、digest、stale、显式刷新或项目 domain，外部类型不得泄漏到 handler/cache。只有固定 tag 通过消费者 contract 和影子对比后才删除本地旧 client。

## 7. HTTP 基础契约

### 7.1 路由

```text
GET  /api/v1/catalog
POST /api/v1/rankings
POST /api/v1/candidates
POST /api/v1/person-detail
POST /api/v1/partners
POST /api/v1/co-star
GET  /api/v1/images/bangumi/...
GET  /livez
GET  /readyz
GET  /metrics                # 仅内部
```

查询 POST 都是只读无副作用操作，不使用 Idempotency-Key，也不创建 queryId 或服务端查询 session。

### 7.2 严格传输

- 只接受 `Content-Type: application/json`。
- 解码前 body 上限 64 KiB。
- 拒绝未知字段、尾随第二个 JSON、压缩请求体和非有限数值。
- page >= 1；pageSize 只允许 5/10/20，默认 10；超过末页返回空 items。
- 分页计算使用 checked arithmetic，不能触发大分配。
- position key 必须唯一、当前可选且属于 query subjectType。
- operation POST 成功和错误均返回 `Cache-Control: private, no-store`。
- catalog 使用 `Cache-Control: no-cache`，不建立客户端 data-version 协商。
- health 使用 `no-store`；图片使用安全的上游条件缓存。

### 7.3 顶层请求

```json
{
  "query": {},
  "input": {},
  "view": {},
  "refreshCollection": false
}
```

- query：Applied Query 与统计口径；
- input：改变 operation 集合的实体/身份；
- view：搜索、排序、分页和 section 投影；
- endpoint 已表达 operation，body 不重复 operation；
- request 不携带 queryId、requestId、dataVersion、主题、Drawer、Skeleton 或未应用 Draft；
- rankings 没有 input 时省略；
- refreshCollection 只允许 personal rankings/candidates 的显式应用或刷新。

### 7.4 envelope

成功：

```json
{
  "data": {},
  "meta": {
    "requestId": "opaque",
    "dataVersion": "opaque",
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 0
    },
    "collection": {
      "fetchedAt": "RFC3339",
      "stale": false,
      "warningCodes": []
    }
  }
}
```

pagination 只在分页响应出现，collection 只在 personal 出现。`warningCodes` 是必填稳定枚举数组：fresh 时为空，使用 stale 时恰好包含 `COLLECTION_STALE`；前端只按 code 映射提示，不解析上游错误文案。合法空结果和越界页都是 200，不增加 `success:true`。

错误：

```json
{
  "error": {
    "code": "UPSTREAM_TIMEOUT",
    "message": "可展示但不可供逻辑解析的文案",
    "retryable": true,
    "fieldErrors": {}
  },
  "meta": {
    "requestId": "opaque",
    "dataVersion": "optional"
  }
}
```

| HTTP | 语义 |
|---:|---|
| 400 | schema/field/capability/identity/position conflict |
| 403 | `COLLECTION_NOT_PUBLIC` |
| 404 | `USER_NOT_FOUND` / `ENTITY_NOT_FOUND` |
| 413 / 415 | body 过大 / content type 非法 |
| 429 | 本服务限流 |
| 502 | 上游协议或解码错误 |
| 503 | not ready、`SERVER_BUSY`、上游临时不可用或上游 429 |
| 504 | 本地或上游 timeout |
| 500 | 未分类内部错误 |

客户端只依赖 status 和 stable code，不解析中文 message。Retry-After 用于 429、队列满和已知等待；前端最多自动做一次 bounded jitter retry，且不自动重试 400/403/404 或显式收藏刷新。

## 8. shared query

### 8.1 personal

```json
{
  "scope": "personal",
  "uid": "lucay126",
  "subjectType": "anime",
  "positionKeys": ["staff:anime:3", "cast:anime:all"],
  "collectionStatuses": ["completed", "in_progress"],
  "includeNSFW": false,
  "mergeSeries": true,
  "filters": {
    "subjectDate": {"min": "2020-01", "max": "2025-12"},
    "collectionUpdatedAt": {"min": "2024-01"},
    "personalScore": {"min": 7},
    "globalScore": {"min": 6.5},
    "scoreDifference": {"min": -1.5, "max": 2},
    "ratingCount": {"min": 100},
    "tags": {
      "include": [{"anyOf": ["原创", "漫画改"]}],
      "exclude": [{"allOf": ["猎奇", "血腥"]}]
    }
  }
}
```

### 8.2 global

```json
{
  "scope": "global",
  "subjectType": "anime",
  "positionKeys": ["staff:anime:3"],
  "includeNSFW": false,
  "mergeSeries": false,
  "filters": {
    "globalScore": {"min": 7},
    "ratingCount": {"min": 100}
  }
}
```

### 8.3 字段规则

| 字段 | 要求 |
|---|---|
| scope | 必填 personal/global，无默认 |
| uid | personal 必填、trim 后非空；global 禁止 |
| subjectType | 必填 book/anime/music/game/real |
| positionKeys | 必填非空、无重复、同类型、当前可选 |
| collectionStatuses | personal 必填非空：completed/in_progress/on_hold/dropped；global 禁止 |
| includeNSFW | 默认 false；true 表示普通和 NSFW 都包含 |
| mergeSeries | 默认 false；只有 anime 可 true |
| filters | 可省略；每个 range 至少一端 |
| subjectDate | 通用 YYYY-MM 闭区间，缺失日期在启用时排除 |
| collectionUpdatedAt | personal 专用，收藏记录最后更新时间 |
| personalScore | personal 专用，定点 [0,10] |
| globalScore | 定点 [0,10] |
| scoreDifference | personal - global，personal 专用，[-10,10] |
| ratingCount | 非负整数；0 是合法值 |

range 双端存在时必须 min <= max。未知字段、空 range、非法月份、非有限数值和 scope/type 不适用字段都返回 field error，不能静默忽略。

OpenAPI 实现前必须使用真实 Bangumi UID/标签样本冻结足够宽松的 UID 字节数、标签组数、每组 token 数和 token 字节数，并加入边界测试；这些防御上限不得缩小现有产品可表达范围。

### 8.4 标签 AST

- include：外层 AND，每组 anyOf 内 OR；
- exclude：外层 OR，每组 allOf 内 AND；
- 标签 NFKC、大小写和首尾空白规范化后精确匹配；
- 空 token/空组拒绝；规范化后重复 token/group 去重；
- personal 匹配公共 + meta + 该 UID 收藏标签；global 只匹配公共 + meta；
- `/`、`+` 只属于 UI 输入语法，wire 只接受 AST。

### 8.5 operation / digest

- query 不携带 mode；ranking 对 positionKeys 做人物 AND，candidates 分职位生成候选。
- positionKeys 至少一项、去重且顺序保留；除 64 KiB body、catalog 合法性和通用资源保护外，不增加旧 168 项或其他缩小动态目录的产品上限。
- candidates 当前职位、detail 人物、partners source/candidatePositionKey、co-star participants 属于 input。
- search/sort/order/page/pageSize/section 属于 view。
- refreshCollection 不进入 query digest。
- main/all 同时出现返回 `POSITION_SELECTION_CONFLICT`。

## 9. operation 契约

### 9.1 `GET /api/v1/catalog`

返回 dataVersion、subject types、position entities、groups、selection rules 和 filter/sort capabilities。它不含用户输入，不接收客户端 dataVersion，不要求版本握手。应用启动时获取；失败只让职位 selector 原位错误/重试，不伪装空 catalog。

### 9.2 `POST /api/v1/rankings`

input：无。

view：

```text
search
sort = count | average | overall | preference(personal only)
order = asc | desc
page / pageSize
```

默认 `search=""`、`sort=count`、`order=desc`、`page=1`、`pageSize=10`。

返回：

- summary：完整合格 personCount、workUnit、全局唯一 workCount；query 含 cast 时返回全局唯一 characterCount；
- metricScale：当前主指标在 search 前完整集合上的 `{metric, kind:"linear", max}`；
- items：rank、最小 person ref、workCount、average、overall、personal preference；
- meta pagination；personal 另有 collection freshness。

规则：

- summary 和 scale 不随 search/page 变化；
- workCount 是所有合格人物实际命中的全局唯一统计单元，不是逐人物相加；
- row average/overall/preference 缺少证据时为 null；
- global 省略 preference 和 collection；
- 排序先于 search/page；rank 在完整未搜索集合中确定，因此搜索可跳号；
- pagination.total 是 search 后、分页前人数；
- 人物图片、详情、作品和关系不随排行行返回。

### 9.3 `POST /api/v1/candidates`

input：

```json
{"positionKey": "cast:anime:main"}
```

必须显式属于 query.positionKeys，后端不隐式取第一项。

sort：

- personal：count / average（个人）/ globalAverage；
- global：count / average（全站）；
- 默认 `search=""`、`sort=count`、`order=desc`、`page=1`、`pageSize=10`。

返回：

- summary.positionCounts：按 query.positionKeys 顺序，每个职位完整未搜索唯一人物数；
- items：当前职位 rank、person ref、workCount；
- pagination.total：当前职位 search 后人数。

职位计数、search total 和 rank 集合必须分离。selected/其他身份/图片/作品不进入 response；前端按 personId + positionKey 本地叠加。

### 9.4 `POST /api/v1/person-detail`

input：

```json
{"personId": 30858}
```

人物必须存在且满足当前 ranking 全部职位；存在但不在结果中返回 `PERSON_NOT_IN_QUERY_RESULT`。

view：

```text
section = works | characters
search
sort
order
page / pageSize
```

- characters 只在 query 具备 cast capability 时允许，否则 `CAPABILITY_NOT_AVAILABLE`。
- works sort：globalScore；personal 另有 personalScore/collectionUpdatedAt；series 另有 seriesSize。
- characters sort：role/workCount/name。
- 默认 `section=works`、`search=""`、`page=1`、`pageSize=10`；works 默认 `globalScore/desc`，characters 默认 `role/desc`。
- 禁止 refreshCollection。

完整 core 返回：

- person：id/name/nameCN，可选 careers 和 Archive 安全纯文本 summary；
- summary：workUnit/workCount，可选 characterCount；
- metrics：ratedWorkCount/average/overall；personal 对照 globalAverage/highest/lowest；
- tags：meta 最多 6、community 8、personal 6；
- ratings：1–10 桶、validCount/average、每桶最多 8 examples + hiddenCount、季度 timeline；
- personal preference：完整证据和最多三项 preferred/conservative；
- 当前 section 的 items 和 pagination。

summary、metrics、tags、ratings、preference 基于完整人物集合，不随 section/search/sort/page 变化。global 完全省略个人字段。

作品 item：

- subject variant：稳定 key、Subject ref/date/metaTags、ratings、personal collection、匹配 credits；
- series variant：seriesId、representative、matchedWorkCount、memberCount、完整 members、聚合 ratings、latestCollectionUpdatedAt、聚合 credits；
- DTO 不返回任意图片 URL、alias、完整标签或关系图。

角色 item：

- stable/opaque character key、可选稳定 ID、name/nameCN；
- primaryRole、原始 workCount、exact appearances；
- anonymous key 必须包含 Subject 身份，不能跨作品聚合；
- appearance 始终指向原始 Subject，不随系列合并。

### 9.5 `POST /api/v1/partners`

input：

```json
{
  "source": {
    "personId": 5745,
    "positionKeys": ["cast:anime:all"]
  },
  "candidatePositionKey": "staff:anime:3"
}
```

- source positionKeys 非空、去重、属于 query，且每个 identity 有真实作品。
- source 多身份先在原始 Subject 层取并集。
- input.candidatePositionKey 可过滤一个 query position；省略表示全部，不发送 `"all"` sentinel。
- 候选职位按 OR；响应只保留实际贡献共同作品的 positionKeys。
- sort：count/average/overall，personal 加 preference；禁止 refreshCollection。
- 默认 `search=""`、`sort=count`、`order=desc`、`page=1`、`pageSize=10`。

返回：

- `workUnit`；
- `source`：person、请求顺序的 positionKeys、`metrics {workCount,ratedWorkCount,average}`；
- `summary.partnerCount`；
- `summary.leaders[]`：personal 固定按 count、average、overall、preference 顺序各一项，global 固定前三项；
- 当前分页 `items[]`：rank 和 PartnerCore。

PartnerCore 字段固定为：

```text
person
positionKeys[]      实际贡献共同作品的 query identity
metrics:
  workCount
  ratedWorkCount
  average
  overall
preference?:
  comparableCount
  comparableSeriesCount
  effectiveEvidence
  evidenceWeight
  mean
  score
```

每个 leader 为 `{metric,item}`；item 是不含 rank 的完整 PartnerCore。对应指标没有任何有效候选时 item 为 null，leader 即使不在当前页也不能省略。global 完全省略 PartnerCore.preference 和 `meta.collection`；average/overall 无评分证据时为 null，精确 preference 0 保留为 0。

summary/leaders 基于 position filter 后完整未搜索集合；普通 search/sort/page 不改变，position filter 会重算。两人共同作品不在本响应返回；点击 item 后组合 source 和 target 实际贡献的 query identity 调用 co-star，staffset 必须保留 set key，不能降解为某个 raw member。

合作成立必须有真实共同 Subject；只参与同系列不同作品不算。人物排序使用数据实施稿的统一严格全序。

### 9.6 `POST /api/v1/co-star`

input：

```json
{
  "participants": [
    {"personId": 5119, "positionKeys": ["cast:anime:all"]},
    {"personId": 5745, "positionKeys": ["cast:anime:all", "staff:anime:3"]}
  ]
}
```

- 2–10 个唯一正整数 personId；
- 每人 positionKeys 非空、唯一、属于 query，且 identity 真实命中；
- identity 总数最多 20；
- 重复、人物超限和 identity 超限分别返回 field error、`PARTICIPANT_LIMIT_EXCEEDED`、`IDENTITY_LIMIT_EXCEEDED`；
- 0 人是前端空态，1 人调用 partners；endpoint 不接受；
- 禁止 refreshCollection。

works sort：personalScore/globalScore/collectionUpdatedAt；global 只有 globalScore；series 加 seriesSize。

默认 `search=""`、`order=desc`、`page=1`、`pageSize=10`；personal 默认 `sort=personalScore`，global 默认 `sort=globalScore`。

返回：

- `kind`：2 人为 pair，3–10 人为 group；
- `workUnit`；
- `participants[]`：输入顺序的 person、positionKeys 和个人 identity-union `metrics {workCount,ratedWorkCount,average}`；
- `summary`；
- `tags`、`ratings.datasets`、personal `preference`；
- group 独有上三角 `matrix.pairs`；
- 当前一页共同 subject/series items 和 pagination。

summary 字段固定为：

```text
unionWorkCount
commonWorkCount
ratedWorkCount
average
globalRatedWorkCount    personal scope required
globalAverage           personal scope required, nullable
highest                 personal scope required, nullable
lowest                  personal scope required, nullable
```

personal 的 ratedWorkCount/average/highest/lowest 使用个人评分，额外的 global 字段使用全站评分；global 的 ratedWorkCount/average 只使用全站评分并省略其余四项。无有效评分时 count=0，average/highest/lowest 为 null。

ratings datasets 固定为：

```text
datasets[]:
  kind = common | participant
  personId?             participant required; common omitted
  personal?             personal scope required; global scope omitted
  global                required
```

有共同作品时先返回一个全员交集的 common dataset，再按 participants 输入顺序返回每个人 identity union 的 participant dataset；personal 每项同时返回 personal/global distribution，global 每项只有 global。distribution 使用 10.2 的完整桶/timeline shape。无共同作品时 datasets 是空数组。

tags 固定包含 meta/community 数组，personal scope 另必须包含 personal 数组，global 省略 personal。personal 顶层 preference 固定包含 10.2 的六项证据和最多三项 `preferred[]` / `conservative[]`；每项返回统计单元 ref、personalScore、globalScore 和 difference。global 完全省略 preference。

group 的每个 matrix pair 固定为：

```text
leftPersonId
rightPersonId
metrics:
  workCount
  ratedWorkCount
  average
```

pair 只使用当前 scope 的评分来源；不返回全站/个人双份、对角线、下三角或 `isBest`。左/右人物顺序来自 participants 输入顺序。

集合顺序：

1. 每个人的多 identity 在原始 Subject 层取并集；
2. 人物之间求全员原始 Subject 交集；
3. 确定交/并集后才按 mergeSeries 聚合。

matrix 每格是对应两人集合，不是全员集合；pair 不返回 matrix。无全员共同作品是合法 200：commonWorkCount=0、items=[]、pagination.total=0、各 tags 数组为空、ratings.datasets=[]；personal preference 仍返回零证据且 mean/score=null。participants 和 group matrix 仍返回。

共同作品 item 复用 person-detail 的 subject/series 基础字段，用 participants.credits 表示每人的 exact contribution。系列 participant/credit 带 workCount；普通 Subject 不返回恒为 1 的 workCount。credit 使用 10.1 的 discriminated union，不得用旧职位 ID 补 credit。

## 10. 共享结果规则

### 10.1 Person / work / metrics

- ref 只包含稳定 ID、name、nameCN；图片由 ID 构造同源代理。
- 缺失 score/average/overall/preference 使用 null，不用 0。
- ratingCount 是 Bangumi 1–10 投票桶之和，只用于过滤/展示，不参与 overall 权重。
- 普通 workUnit 为 subject；anime mergeSeries=true 为 series。
- seriesId 是同类型连通分量最小正 Subject ID。
- matchedWorkCount 只计让系列进入当前 operation 的原始作品；memberCount 是完整系列大小。
- series ratings 只聚合 matched works，系列之间等权。
- latestCollectionUpdatedAt 只取 matched works 最大非空值；全空为 null 并排序置后。

person-detail 的作品/系列和 co-star 的 participant credits 共用以下 discriminated union：

```text
StaffContribution:
  kind = staff
  positionKey             请求中命中的 staff:* 或 staffset:* identity
  exactPositionKey        实际 raw staff:* member
  provenance = exact
  workCount?              series only

CastContribution:
  kind = cast
  positionKey             请求中命中的 cast:* identity
  character {key,id?,name,nameCN}
  roleType
  roleLabel
  provenance = exact
  workCount?              series only
```

- exact staff 查询中 `positionKey == exactPositionKey`；staffset 查询保留 set key，同时返回实际命中的 exact member。
- 同一 exact credit 命中多个请求 identity 时可产生多个 contribution，但作品、人物和评分计数仍按统计单元去重。
- Subject item 省略 workCount；series item 必须返回该 contribution 覆盖的 matched work 数。
- v1 provenance 只允许 exact；按 `positionKey → exactPositionKey/character key` 稳定排序。
- 启用 synthetic staffset 不得修改 OpenAPI、handler 分支或前端类型枚举，只新增 catalog/config 数据。

### 10.2 tags / ratings / preference

- tags 在统计单元内去重计数，按 count desc + normalized name asc。
- 每个 rating distribution 固定返回 `validCount`、`average`、1–10 十个桶和 timeline；无有效评分时 validCount=0、average=null。
- 每个桶固定返回 `score/count/examples/hiddenCount`；example 只含统计单元 `{kind,key,id,name,nameCN}`，不复制完整作品 DTO；全站小数最近整数且 .5 向上，每桶最多 8 个 example，其余计入 hiddenCount。
- timeline 项固定为 `year/quarter/average/count`；只有日期至少精确到月时产生，按季度聚合，series 模式返回空 timeline。
- preference 返回 comparableCount、comparableSeriesCount、effectiveEvidence、mean、evidenceWeight、score。
- 精确差值 0 是有效中性证据；无证据时 mean/score 为 null。

### 10.3 search / sort / pagination

- 人物、作品和角色 search 只匹配对象自身 nameCN/name。
- series search 同时匹配 representative 和全部 members 的 nameCN/name。
- 不匹配 alias、ID、标签、职位或关联对象名。
- direction 只作用于主指标；缺失主指标始终置后；稳定实体 ID 是最终 tie-break。
- summary、leaders、tags、ratings、preference、matrix 和 metricScale 基于完整 core，不随普通 search/page 变化。

## 11. 前端状态、路由与分享契约

### 11.1 canonical path

- 正式路径 `/ranking` 和 `/co-star`；`/`、`/index.html` 保留允许 query 后跳转 `/ranking`。
- 不使用 `?mode=`；只有两个 path 时不强制引入 Vue Router。
- Header 模式入口使用真实 link 和 `aria-current=page`，支持新标签、直接访问和前进后退。
- static host 必须 fallback 到同一 SPA。

### 11.2 共享查询

- 两模式共用 Query Draft、Applied Query、有序 positionKeys 和递增 queryRevision。
- path 切换不提交 Draft、不改变 revision、不清空人物结果。
- Ranking/Candidates/detail/partners/co-star 结果都标记 queryRevision；只有相同 revision 可作为当前结果。
- 搜索、排序、分页、焦点和 Drawer 是各模式独立 view state。
- 纯切换模式保留共演 selected identity；成功应用语义不同的新 query 后清空。
- 人物实体按 personId + queryRevision 共享；排行焦点不自动加入共演选择。

### 11.3 `?user=`

- `/ranking?user=` 和 `/co-star?user=` 首次进入只 trim 并填充 personal UID Draft，不自动查询。
- `/?user=` 与 `/index.html?user=` 跳到 `/ranking?user=`。
- 模式切换保留允许 query。
- personal 成功后用 effective UID 更新 user；global 成功后移除 URL user，但内存可保留。
- user 是首版唯一普通 query 参数；其他筛选、职位、人物、搜索、分页不自动写 URL/Web Storage。
- access/query 日志不得记录原始 query string；设置明确 Referrer-Policy。

### 11.4 分享查询

入口固定在 Header 模式切换器右侧。无 Applied Query 时不可用；有脏 Draft 或新请求等待时仍分享当前可见结果对应的最后成功 Applied Query。

```text
/ranking#q=v1.<payload>
/co-star#q=v1.<payload>
```

payload 只包含：

- Effective Query；
- 当前 operation input/view；
- 恢复当前分析所需的有限 person identity/focus/section。

排除 Draft、响应、requestId、queryRevision、dataVersion、digest、refreshCollection、主题、Drawer、滚动、Skeleton 和 cache outcome。

- fragment URL-safe、自包含、版本化；可使用确定压缩但保留 `v1` 外层。
- 编码后上限 16 KiB，解码 JSON 上限 64 KiB，并继续服从 operation 业务上限。
- 首次 document 最多消费一次；校验成功后走同一 Query Application Service。
- 消费后 replaceState 移除 fragment，避免重复 mount/hashchange 重放。
- 非法、超限、损坏或旧版本不发业务请求，移除 fragment并显示稳定错误。
- share payload 与 `?user=` 同时存在时，成功 share 优先；share 失败不能静默退化成自动 user 查询。
- 不建立 share API、短码表、服务端 session、requestId 映射或响应快照。
- 重放必须走普通 normalization 和 typed operation；dataVersion、queryDigest、inputDigest 及 personal collectionDigest 未变时自然命中现有缓存，不建立分享专用 cache key。
- 后端只记录普通 query_completed，不增加分享专用请求字段；原 fragment 和 payload digest 都不得进入 HTTP 日志或 metric label。
- personal 分享包含公开 UID/筛选，用户点击即代表主动披露；它不是加密或可信输入。

## 12. 分区加载与 Skeleton

前端按 operation + surface 保存 `idle | pending | ready | error`、sequence 和取消句柄。较旧响应不得覆盖新状态；取消只结束当前等待，不影响服务端 shared computation。

| 触发 | 保持可见 | pending surface |
|---|---|---|
| catalog 首次获取 | Header、模式、Query Editor 框架 | position selector |
| rankings 新 query | Header、pending query 摘要 | 排行主体 |
| rankings view | summary、toolbar、当前 detail | 人物行 + pagination |
| candidates 新 query/view | selected tray、selector、toolbar | position counts/候选行/pagination |
| person-detail 换人物 | ranking list、Drawer shell | 整个 detail |
| detail works/characters view | person header/metrics/tags/charts | items + pagination |
| partners 新 source | source card、candidate rail、tray | summary/leaders/list |
| partners 普通 view | source、summary/leaders、toolbar | rows + pagination |
| partners position filter | source、toolbar | summary/leaders/rows/pagination |
| co-star identity change | rail、tray、真实参与人数 | analysis body |
| co-star works view | participants/summary/tags/ratings/matrix | items + pagination |

规则：

- debounce 尚未发请求不进入 pending；
- 不设置人为 Skeleton 最短播放时间；
- 主题、密度、图例、Tooltip、Drawer、简介展开和本地选择不显示查询 Skeleton；
- 0 人空态、1 人 partners、2 人 pair、3–10 人 group 使用真实拓扑；
- pending surface 设置 aria-busy；一个邻近 polite status；视觉 skeleton aria-hidden、不可聚焦；
- view 刷新保留触发焦点；新人物 identity 与 detail 原子提交；
- Skeleton 行数跟随 5/10/20，形状跟随 personal/global、subject/series/character；
- 现有原子 Skeleton 可重组，但固定三人、固定十行和整页 queryLoading 不能直接进入生产。

## 13. 可观测性开发契约

### 13.1 app/query 事件

应用只输出结构化 JSON，逻辑 channel 为 app/query：

- app：启动/关闭、snapshot、updater、panic、代理/上游错误和慢操作；
- 每个 typed 业务请求恰好一条 query_completed；
- JSON/typed 校验失败一条受限 query_rejected；
- request ID 由服务端生成，进入 context、X-Request-ID、response meta 和关联日志；
- domain 只 wrapping error，不自行打印。

query_completed 至少记录：

```text
request_id / route_template / operation / scope
query_schema_version
submitted_query / effective_query
operation_input / view
query_digest / input_digest
app_version / app_commit
domain_version / aggregation_rules_version
data_version / snapshot_schema_version
archive_release / archive_digest / position_catalog_version
collection_digest / fetched_at / stale（personal）
collection_cache_outcome / result_cache_outcome
status / error_code / duration_ms / response_bytes / total / returned
```

禁止记录 raw body、raw URL/query、IP、headers、Cookie、Authorization、token、收藏明细、上游 body、cache value、返回实体列表、完整 response 和未经清洗的 err.Error。UID、标签、搜索和实体 ID 只能位于 query event 白名单字段，不复制到 app message 或 metric label。

`query_rejected` 只允许记录：

```text
request_id
route_template
operation（能由路由确定时）
content_length
status
error_code
field_paths[]（只允许 schema 已知路径）
duration_ms
```

未知/攻击者提供的字段名、非法值和解析片段不得进入 field_paths 或 message。`query_completed` 与 `query_rejected` 对一次请求互斥；health/metrics 抓取不产生普通 query 日志。

响应可使用清洗后的 `Server-Timing` 报告固定阶段 `collection/cache/sqlite/compute/projection` 的 duration；不得包含 UID、key、digest、SQL、cache value 或上游 URL。阶段值也必须进入同名 histogram，不能依赖逐请求多行阶段日志。

### 13.2 health / metrics

- `/livez` 只检查进程响应；
- `/readyz` 只在 3.5 的 consumer 启动门全部成功后返回 ready，并继续执行 SQLite 轻量只读查询；
- `/metrics` 标准 Prometheus exposition；
- pprof 默认关闭，只能显式绑定管理监听。

指标覆盖 HTTP、operation、计算队列、两层 cache、SQLite 固定 query、Bangumi collection/image、Go/process、build/snapshot 和 updater status。

label 只用固定枚举；UID、requestId、raw path、实体 ID、标签、digest 和 query 值禁止进入。dataVersion 只作为当前 snapshot info metric。

所有 Prometheus 时间指标使用 seconds、容量使用 bytes，名称带 `_seconds` / `_bytes`；日志仍使用明确的 `duration_ms` / `response_bytes` 字段。不得混用无单位 gauge。

Prometheus 不可用不得影响 API。生产抓取、保留和告警属于运维稿。

### 13.3 one-shot updater 事件

Python updater 只输出以下稳定 JSON 事件：

```text
updater_started
phase_completed
update_no_change
update_published
update_failed
```

事件白名单字段为 run_id、source release/digest、phase、duration_seconds、输入/输出行数、质量摘要、dataVersion 和稳定 error_code；不记录原始异常、上游 body 或本地 secret。失败和质量门不通过必须非零退出。

updater 原子写入供 Go exporter 读取的 `update-status.json`，只保存最后一次尝试和最后一次成功的时间、状态、阶段、duration_seconds、dataVersion 和 error_code，不保存历史。snapshot 发布完成不等于生产激活；`update_activated` 只由运维 wrapper 在 current 切换和 readiness 成功后记录，不能由 producer 提前声称。

## 14. 开发质量门

### 14.1 必须覆盖的 catalog 金标

- common 每个 `(type,id)` 恰好一个 exact staff key；
- synthetic 新 common position 无需改 Go/TS 即进入 catalog；
- 动画/游戏 main/all 恰好四项，main ⊆ all；
- common 动画 101–106 只形成 staff，不形成 cast；
- `person=6756, subject=9717, position=104` 只形成 `staff:anime:104`；
- exact 2/74、37/56 等集合互不暗中合并；
- 五类型、分类多父、搜索、无 credit 空结果和 fallback 分组；
- 常用副本状态同步、search 去重、main/all 原位互斥；
- 空 staffset 和 synthetic staffset 全部扩展测试。

### 14.2 API / domain 金标

- personal/global 严格分域和未知字段拒绝；
- 全部 range、tag AST、position conflict 和 capability error；
- 多职位人物 AND、作品 UNION；
- ranking summary/scale/rank/search/pagination；
- candidate positionCounts 与 search total 分离；
- detail subject/series/character variant；
- partners identity union、position filter、leaders 和 pair 跳转；
- co-star 2/3/10 人、20 identity、matrix、无共同作品；
- exact cast 角色与作品集合一致；
- strict total order、missing-last 和 stable ID；
- collection refresh、stale、negative、singleflight 和 cache bypass；
- A→B 乱序、取消、组件卸载和 operation 并发；
- share round-trip、超限/损坏/旧版、一次性消费和 cache hit；
- 错误 envelope、request ID 和 query_completed exactly once。

### 14.3 跨语言与生成门

- Python 用最小 fixture 构建 SQLite，Go 能启动、校验和执行所有 operation smoke query；
- Python/Go/TypeScript 共享关键 JSON 金标；
- OpenAPI 生成物 `--check` 无漂移；
- Go test/race/static checks；
- Python unit/fixture/quality tests；
- frontend typecheck/unit/build；
- API/updater Docker build smoke test。

## 15. 开发阶段

### Phase 0：契约与骨架

- [ ] 建立重写分支、Go 1.26 module、Python producer 和最小前端/API adapter。
- [ ] 修复测试 ignore，建立 OpenAPI、schema、manifest 和 shared golden。
- [ ] 建立 strict decoder、envelope、request ID、consumer 启动全校验、health 和最小 catalog。
- [ ] 建立 raw exact schema 与空 `manual-position-sets.yml`。

退出条件：Python 构建最小 SQLite；Go 只读启动；TS 生成类型；非法 schema 均稳定拒绝。

### Phase 1：数据与 catalog

- [ ] 实现流式 Archive producer、common 同步、cast exact 和质量报告。
- [ ] 实现 dynamic catalog、Bangumi groups、常用、配音类、staffset 编译。
- [ ] 生成覆盖全部非恒等旧 mapping 的只读差异审计报告，确认不会自动启用任何集合。
- [ ] 实现全部 catalog 金标和 dataVersion 变化规则。

退出条件：完整 Archive 可构建；未来 common/staffset synthetic 项无需改 handler/前端枚举即可查询。

### Phase 2：上游与缓存

- [ ] 完成图片白名单代理和规格能力表。
- [ ] 发布并接入 `bangumi-collection-go`。
- [ ] 实现 collection/result/negative cache、singleflight、有界执行器和 stale。
- [ ] 完成资源、取消、超时、oversize 和不可变 value 测试。

退出条件：浏览器无 Bangumi API 直连；业务结果不依赖 cache；公开收藏边界和所有上游错误可复现。

### Phase 3：查询 operation

- [ ] 实现 shared query normalization/digest。
- [ ] 依次完成 rankings、candidates、person-detail、partners、co-star。
- [ ] 接入数据实施稿的评分、系列、角色、偏好和排序金标。
- [ ] 实现 app/query、query_rejected、updater 事件、Server-Timing 和低基数 metrics。

退出条件：六个 endpoint OpenAPI、实现、shared goldens 和 cache core 投影全部一致。

### Phase 4：前端接入

- [ ] 建立具名 fetch wrapper 和 DTO→ViewModel mapper。
- [ ] 实现 `/ranking`、`/co-star`、共享 revision、`?user=` 和分享链接。
- [ ] 按 surface 拆分 Skeleton、错误、retry 和 stale response guard。
- [ ] 删除 fixture 统计权威、硬编码 position 和生产 `workbench` 命名。

退出条件：所有正式查询只依赖 API；不存在浏览器第二套统计公式；分区加载通过 DOM 和浏览器验收。

### Phase 5：生产候选

- [ ] 完成完整 Archive 基准和相同 release 新旧差分。
- [ ] 完成 OpenAPI/生成物/跨语言/容器 CI 门。
- [ ] 向运维侧交付 immutable API/updater/front artifacts 和 compatibility manifest。

退出条件：运维实施稿所需制品、health、metrics、status、回滚兼容信息齐全；实现没有旧协议兼容分支。
