# 正式开发数据契约与实施清单

> 状态：正式开发前执行稿
>
> 更新日期：2026-07-23
>
> 决策事实以 [`prototype-data-logic-audit.md`](../docs/decisions/prototype-data-logic-audit.md) 为准；本文只是面向实施的投影，不替代审计记录。

配套文档：

- [`backend-development-implementation-guide.md`](./backend-development-implementation-guide.md)：后端、数据构建、catalog、缓存、API 与开发质量门；
- [`backend-operations-implementation-guide.md`](./backend-operations-implementation-guide.md)：单机部署、资源、周更、监控、迁移与回滚；
- [`frontend-production-cleanup-and-architecture-plan.md`](./frontend-production-cleanup-and-architecture-plan.md)：前端状态、组件拆分、原型清理和接入顺序。

## 1. 使用规则

### 1.1 决策状态与交付状态分开

本文中的复选框只表示“正式生产实现及其验收是否完成”，不表示该口径是否已经确认。

| 决策状态 | 数量 | 含义 | 当前生产交付状态 |
|---|---:|---|---|
| `ACCEPTED_PENDING_IMPLEMENTATION` | 26 | 口径已确认，等待正式实现与验证 | 均不得因原型存在而视为完成 |
| `ACCEPTED_REVISED_PENDING_IMPLEMENTATION` | 3 | 口径已按新 catalog/cast 范围修订 | 以修订后要求实现，不保留旧命名或映射 |
| `IMPLEMENTED_VERIFIED` | 1 | `DR-DATA-SERIES-001` 已在当前原型验证 | 正式权威层/API 仍待迁移 |
| `ACCEPTED_NO_ACTION` | 1 | `DR-DATA-CAST-001` 确认保持 `valid_cv` 兼容口径 | 需要回归保护，不改算法 |

完成一个复选框至少需要：实现代码、自动化测试、对应层的验收证据，以及不夹带未确认口径。只修改本地代码、只通过原型测试或只更新 fixture 均不算完成。

### 1.2 变更规则

- 需要改变统计定义、数据来源、筛选语义或产品口径时，先更新审计记录并确认，再同步本文。
- 经审计确认属于临时 fixture、缺失校验、重复实现或明显错误的项目，按已确认目标修正，不继续复制原型行为。
- 没有独立 `DR-DATA-*` 的规则必须标为“已验证基线”或“实施推导”，不得伪装成新决策。
- 实施记录只追加代码、测试、数据版本和验证结果，不反向改写决策含义。

## 2. 范围与阻断项

### 2.1 本文负责

- 原始数据、派生制品、目录与发布版本的契约；
- 职位、配音、角色、评分、系列和查询集合的领域规则；
- 跨语言测试向量、对外数据契约和迁移验收；
- 与前端状态相关但会改变结果语义的数据边界。

组件/CSS 拆分、图片代理和部署拓扑不在本文重复展开。

### 2.2 已确定的外部实施前提

- Go 后端是统计权威并负责稳定排序、搜索和服务端分页；前端只保留交互、视口和可视化状态。
- Python one-shot updater 负责离线构建；宿主机 wrapper 负责调度、受控重启和回滚。
- 只允许当前/上一版不可变快照、manifest、目录/规则和有界运维制品落盘；收藏、查询结果、图片和会话不得持久化。
- v1 动态暴露五类全部 common exact 职位，并额外提供动画/游戏 main/all 声优。
- v1 使用不可变快照指针切换后的单实例重启，不实现进程内热切换。
- 资源、并发、延迟、旧版回退和退出门以配套开发/运维实施稿为准，不再作为数据实现阻断项。
- 配音只接受本作 exact 关系；缺失进入 updater 质量分类，不跨作品或同系列补 credit。

### 2.3 目标状态流

```text
数据制品：raw -> staged -> validated -> active
                                  └─ failure -> 保留上一 active

查询提交：draft -> validating -> pending -> applied
                    └─ invalid       └─ cancel/error -> 保留旧 applied/result

结果资源：idle | pending | ready | error
```

合法零结果属于 `ready`，由返回数据中的零计数和空 items 表达，不建立独立的 empty 请求状态。只有规范化查询签名发生变化且新结果成功提交时，才更新 Applied Query 并清空共演选择；取消、校验失败、请求失败和 no-op 均保留原状态。

### 2.4 实施依赖

```text
Gate 0：契约与金标
  -> Phase 1：数据制品与规范化模型
       -> Phase 2：查询集合语义 ─┐
       -> Phase 3：统计领域逻辑 ─┼-> Phase 4：权威层/API
                                 └-> Phase 5：前端接入
                                      -> Phase 6：迁移与切换
```

## 3. 已确认不变量与回归保护

本节不设实施复选框；对应测试在后续阶段交付。

- **评分来源。** 个人模式使用 `collection.rate`，全站模式使用 `subject.score`；全站筛选、派生、默认顺序、tooltip 和图表不得读取 `collection.*`。来源：已验证基线、`DR-DATA-GLOBAL-001`。
- **未评分边界。** 未评分作品在未启用评分条件时计入作品数，但不进入均分、有效评分数、综合分权重或评分图表。来源：已验证基线、`DR-DATA-FILTER-001`、`DR-DATA-RATING-002`。
- **普通综合分。** 先把均分向下截取两位，再计算 `(n × 均分 + 5 × 5) / (n + 5)`；`n` 只包含有效评分数。来源：已验证基线、`DR-DATA-RATING-001`、`DR-DATA-BACKEND-001`。
- **多职位排行。** 一个人物必须满足全部所选职位；指标使用各职位作品的去重并集。来源：审计“已验证基线”，无独立 DR。
- **多人集合。** 同一人物的多个身份取作品并集，多个人物之间取全员作品交集。来源：审计“已验证基线”，无独立 DR。
- **偏好输入。** 只使用个人与全站评分均有效的对象；差值 `0` 是有效证据；系列模式先求系列内平均，再让系列等权。来源：已验证基线、`DR-DATA-PREFERENCE-001`。
- **标签组合语法。** 暂时保留正向“组间 AND、组内 `/` OR”，反向“组间 OR、组内 `+` AND”；精确匹配与空 token 拒绝已由 `DR-DATA-TAG-001` 确认，组合语法本身属于保留基线，如需改变必须重新登记。
- **`valid_cv` 兼容口径。** 继续从任意有效 `subject-persons` 关系建立全局人物白名单，再过滤 `person-characters`；不改成人物—作品配对校验。来源：`DR-DATA-CAST-001`，状态为 `ACCEPTED_NO_ACTION`。

## 4. Phase 0：版本化契约与金标

### 实施任务

- [ ] **让 Go 回归测试进入版本控制。** 删除根 `.gitignore` 中会全局忽略 `*_test.go` 的规则，提交 `rate_test.go` 及后续领域测试。`DR-DATA-BACKEND-001`
- [ ] **定义版本化 manifest。** 至少包含 `schemaVersion`、`dataVersion`、输入版本/校验和、Bangumi 职位目录版本、生成时间、生成器版本和覆盖统计。`DR-DATA-SCHEMA-001`、`DR-DATA-PIPELINE-001`
- [ ] **定义跨层基础类型。** 固定 `ScoreValue`、`PositionKey`、`SeriesId`、规范化 Query、结构化错误和结果单位；禁止用 `number | string` 或 optional mega type 推迟语义判断。`DR-DATA-RATING-002`、`DR-DATA-SUBJECT-TYPE-001`、`DR-DATA-SERIES-002`
- [ ] **建立共享 JSON 金标向量。** Python one-shot 数据制品 producer、Go domain/API 和 TypeScript adapter 分别运行同一份输入/期望输出；共享测试数据，不强迫共享运行时代码。`DR-DATA-SORT-001` 及所有统计决策
- [ ] **定义 Query normalization 与缓存 digest。** shared Query 先补默认值、对集合字段去重排序、统一空范围并把标签解析成 AST；服务端 `queryDigest` 只包含 scope、职位、筛选和 `mergeSeries`。结果缓存 key 在此基础上再加入 dataVersion、operation、operation-specific `inputDigest` 和 personal collectionDigest；view 不进入昂贵 core key。模式只由 path/operation 表达，不进入 shared Query 或 digest。前端可独立生成只用于 dirty/no-op/revision 的 query signature，但不得把它当服务端缓存 digest。该项是缓存、旧响应保护和选择清理的共同实施推导。

### 退出条件

- schema、manifest 和金标文件已经跟踪；
- 制品 producer、Go、TypeScript 都能拒绝错误版本并消费最小合法样例；
- 本阶段不依赖最终 HTTP 路由，但基础类型和金标必须服从已确认的“后端唯一统计权威”边界。

## 5. Phase 1：数据制品与规范化领域模型

### 5.1 数据宇宙与发布生命周期

- [ ] **建立完整全站数据宇宙。** 读取完整 Subject、Bangumi 职员关系和配音关系；个人模式再与目标用户收藏取交集，并叠加个人评分、收藏状态、标签和更新时间。`DR-DATA-SCOPE-001`
- [ ] **分离 raw、staged 和 active。** 原始 Archive/收藏输入只读，派生输出写入新版本；禁止生成器覆盖原始输入。`DR-DATA-PIPELINE-001`
- [ ] **严格校验 staged 制品。** 校验版本/批次、ID 唯一性、引用完整性、评分范围、日期、Series ID、职位/角色关系和聚合不变量；错误阻止激活，不降级为 0 或静默覆盖。`DR-DATA-SCHEMA-001`
- [ ] **保证确定性与可回滚。** 相同输入生成相同语义输出和 `dataVersion`；激活失败时继续使用上一版本。

### 5.2 输入规范化

- [ ] **使用结构化 infobox 解析器。** 支持空字段、块字段、别名、重复字段、换行和异常语法；无合法中文名时回退原文名，并记录解析失败指标。`DR-DATA-NAME-001`
- [ ] **完整覆盖收藏状态 2/3/4/5。** 每种状态至少准备一个有评分和一个未评分样例；“想看 1”不在本轮范围。`DR-DATA-COLLECTION-001`
- [ ] **严格解析日期并保留精度。** 只接受登记过的完整或部分日期格式；缺少月份时不生成季度，尾随垃圾必须失败。`DR-DATA-DATE-001`
- [ ] **安全处理无 Character ID 的角色。** fallback key 至少包含 Subject ID，并标记为未知角色记录，禁止仅凭类型和顺序跨作品合并。`DR-DATA-CHARACTER-001`

### 5.3 职位与配音关系

- [ ] **版本化同步 Bangumi 职位目录。** 记录上游 commit、生成时间和内容哈希，完整保存 `(subjectType, positionId)`；输出新增、改名、分类变化、删除、未知 ID 和使用频次。`DR-DATA-POSITION-001`
- [ ] **把 Bangumi 目录与产品聚合规则分层。** 上游目录自动同步；人工职位集合使用独立、人工审核且有测试的配置维护，当前 active 配置为空。`DR-DATA-POSITION-001`
- [ ] **使用稳定业务键。** exact 职位采用 `staff:{subjectType}:{positionId}`，声优采用 `cast:{subjectType}:main|all`，未来人工集合采用 `staffset:{subjectType}:{slug}`；禁止运行时 `Number()`、中文名称或 key 前缀猜测能力。`DR-DATA-SUBJECT-TYPE-001`、`DR-DATA-CAST-002`
- [ ] **从原始关系重建 101–106。** Bangumi 职员职位 101–106 按真实含义保留，但不得进入声优统计；删除的是错误分类，不是原始关系。`DR-DATA-CAST-002`
- [ ] **把声优范围实现为查询谓词。** `casts` 原样保存角色类型；“全部声优”的作品数、角色数和角色列表必须包含主役。`DR-DATA-CAST-002`
- [ ] **为 `valid_cv` 建回归保护。** 不改变全局人物白名单口径，并证明正式重构没有偷偷改成人物—作品配对校验。`DR-DATA-CAST-001`

### 退出条件

- 完整 Archive 能构建隔离的全站基线和个人覆盖层；
- Bangumi 职位、角色类型和匿名角色不会因 ID 撞号或缺失被静默合并；
- 任一质量错误都不能改变当前 active 版本；
- 只生成本作 exact cast credit；缺少关系时输出质量分类，不产生任何跨作品推断 credit。

## 6. Phase 2：查询与结果集合

### 实施任务

- [ ] **隔离 personal/global 查询。** 全站路径不得读取、排序或序列化 `collection.*`；个人路径显式叠加收藏覆盖层。`DR-DATA-GLOBAL-001`、`DR-DATA-SCOPE-001`
- [ ] **按来源保存并搜索标签。** 个人模式使用公共、meta、个人收藏标签的去重并集；全站模式只使用公共和 meta 标签。`DR-DATA-TAG-001`
- [ ] **实现标签解析器。** 使用 NFKC、大小写和首尾空白标准化后的精确匹配；保留现有 AND/OR 组合基线，并在提交前拒绝空 token。`DR-DATA-TAG-001` + 已验证基线
- [ ] **实现评分条件的缺失值语义。** 不提供未评分独立条件；启用个人评分、全站评分或评分差时，缺少所需有效评分的对象必须剔除。`DR-DATA-FILTER-001`、`DR-DATA-RATING-002`
- [ ] **实现集合金标。** 多职位为“人物满足全部职位、指标取职位作品并集”；同人物多身份取并集；多人物取全员交集。来源：已验证基线。
- [ ] **统一最终结果单位。** 领域金标中的泛称 `itemCount` 按第 11.1 节映射到 wire 的 `workCount`、`characterCount` 或对应 pagination total；普通模式计实际参与的去重作品，系列模式计这些作品覆盖的系列，角色模式计实际角色，候选范围只作内部中间量。`DR-DATA-COUNT-001`
- [ ] **输出查询变化判定。** 只有规范化 digest 变化且请求成功，才产生新的 query version；取消、失败和 no-op 不提交新版本。实施推导，支撑 `DR-DATA-SELECTION-001`。

### 退出条件

- personal/global 使用同一输入时不会发生个人字段泄漏；
- 标签、评分缺失、多职位、多人和三种领域 `itemCount` 单位及其 wire 字段映射均有纯函数金标；
- 审计样例继续证明最终实际参与数为 442，而不是职位过滤前候选数 449。

## 7. Phase 3：评分、系列、偏好与排序

### 7.1 评分基础

- [ ] **建立唯一有效评分规则。** 仅有限且位于 `[1,10]` 的数值有效；0、null、缺失表示未评分，越界值是数据错误。`DR-DATA-RATING-002`
- [ ] **使用整数百分值或可靠十进制定点。** 均分向下截取两位；展示、排序、综合分、季度图和对外契约消费同一规范化结果。`DR-DATA-RATING-001`、`DR-DATA-TIMELINE-001`
- [ ] **综合分只使用有效评分数。** 普通模式使用 `(n × 已规范化均分 + 5 × 5) / (n + 5)`，`n` 不含未评分作品；系列模式使用有效系列数。`DR-DATA-BACKEND-001`、`DR-DATA-SERIES-001`
- [ ] **严格生成 `ratingCount`。** 只显式累加 `score_details` 的 1–10 分桶并验证非负整数；0 是有效人数，且该字段只用于筛选，不参与综合分权重。`DR-DATA-RATING-COUNT-001` + 已验证基线
- [ ] **固定评分分布。** 图表表示作品均分分布；小数按最近整数、`.5` 向上，中间桶为 `[x-0.5, x+0.5)`，两端截断到 `[1,10]`。用户投票分布不在本契约内。`DR-DATA-DISTRIBUTION-001`
- [ ] **统一季度均分。** `[6,7,7]` 必须得到 `6.66`；折线位置、tooltip、摘要和对外值不得再使用独立四舍五入口径。`DR-DATA-TIMELINE-001`

### 7.2 系列统计

- [ ] **实现系列统计单元。** 关闭合并时一部作品一个单元；开启后系列内先按当前评分来源求有效均分，再让系列等权，数量切换为系列数，综合分权重使用有效系列数。`DR-DATA-SERIES-001`
- [ ] **先求共同原始作品，再合并系列。** 分别参与同系列不同作品的人物不能因此被算作共同参与。`DR-DATA-SERIES-001`
- [ ] **固定动画系列关系边界。** 合并 2/3/4/5/6/9/10/11/12；不合并 1/7/8/14/99；按同类型作品构造无向传递闭包。`DR-DATA-SERIES-002`
- [ ] **规范 Series ID。** 使用同类型连通分量内最小正整数 Subject ID；非法、缺失或不存在的引用回退到作品自身 ID。`DR-DATA-SERIES-002`
- [ ] **生成可复核系列数据。** 把当前“关系权重主条目得分 → 日期排序 → 既有首两项交换规则 → Subject ID 最终兜底”的 `sequelOrder` 算法提取为版本化纯规则和金标；对外提供其代表条目、完整成员、每个人实际命中的作品、普通职位或配音角色，系列标签只取代表条目。`DR-DATA-SERIES-001` 的生产实施推导
- [ ] **禁止伪造系列时间维度。** 系列结果态不生成合并季度，仅保留评分分布。`DR-DATA-SERIES-001`

### 7.3 偏好与排序

- [ ] **实现可复核偏好结果。** 只使用个人与全站评分均有效的作品；系列模式先求系列内平均再等权。结果保留 `comparableCount`、`comparableSeriesCount`、`effectiveEvidence`、`mean`、`evidenceWeight` 和 `score`。`DR-DATA-PREFERENCE-001`
- [ ] **实现唯一严格全序。** 升降序只作用于主指标，缺失值始终置后，最终以稳定实体 ID 升序兜底；禁止 `>=` 比较器。`DR-DATA-SORT-001`
- [ ] **统一候选结果与排名徽标。** 名次从同一份未搜索、未分页结果派生；缺失均分使用 null，不得伪装为 0。`DR-DATA-CANDIDATE-001`、`DR-DATA-SORT-001`
- [ ] **保证排序不改变结果集合。** 作品、系列和人物组合排序只重排，不过滤对象；完全并列仍得到稳定结果。`DR-DATA-SORT-001`

### 7.4 清理

- [ ] **移除废弃先验。** `globalScorePrior`、`votePriorCount` 从正式 schema 删除，或只存在于版本化 legacy 区域；生产统计不得读取。`DR-DATA-METADATA-001`
- [ ] **删除重复/无消费者派生统计。** 仍需保留的值统一由单一 domain helper 生成。`DR-DATA-DERIVED-001`

### 退出条件

- 空集、全未评分、8.20 定点边界、`[6,7,7]`、系列等权、分桶边界、缺失排序和完全并列均通过金标；
- 任何展示层都无需自行修正权威统计结果；
- 当前原型的 `result=series` 只作为已验证交互基准，不能代替正式权威层交付。

## 8. Phase 4：权威层与对外契约

后端是唯一统计权威。下列任务由正式 API 完成；前端 adapter 只校验和映射响应，不能复制统计、全量排序或分页公式。具体 wire 见配套后端开发实施稿。

### 实施任务

- [ ] **提供版本化 catalog。** 前端只消费一个条目类型、Bangumi 职位、人工职位集合和 cast role 目录，不再维护静态副本。`DR-DATA-POSITION-001`
- [ ] **隔离 personal/global DTO。** global 响应不得包含或由 `collection.*` 派生；增加结构级防泄漏测试。`DR-DATA-GLOBAL-001`
- [ ] **返回可解释统计证据。** 偏好返回第 7.3 节字段；综合分 wire 返回 `average`、`ratedWorkCount` 和 `overall`。中性先验固定为 5 个 5 分单元，分母固定为 `ratedWorkCount + 5`，属于版本化领域不变量，可由已返回字段解释；前端不得据此重算或覆盖 `overall`。`DR-DATA-PREFERENCE-001`
- [ ] **返回完整系列 DTO。** 包含代表条目、完整成员、实际参与明细、角色/职位证据和稳定 Series ID。`DR-DATA-SERIES-001`、`DR-DATA-SERIES-002`、`DR-DATA-CAST-002`
- [ ] **保证稳定排序与分页。** 页码变化不得改变全集顺序；搜索和分页不得生成另一套排名。`DR-DATA-SORT-001`、`DR-DATA-CANDIDATE-001`
- [ ] **携带 `dataVersion`。** 响应、缓存 key、日志和问题复现信息必须能定位同一数据版本。实施推导。
- [ ] **区分空结果与错误。** 合法零结果返回 `200`，资源状态为 `ready` 且使用零计数/空 items；schema、质量、上游和权限错误使用结构化错误，不伪装成零集合。

### 退出条件

- 契约、稳定分页、personal/global 隔离、错误分类和版本换代均有集成测试；
- 制品 producer 与 Go/TypeScript consumer 对相同金标输出一致；
- 缓存 TTL、并发和延迟按配套实施稿验证；未经完整数据和同规格机器实测不得标记为已通过。

## 9. Phase 5：前端数据接入

组件和状态拆分以配套前端计划为准；本文只约束会影响数据结果的适配行为。

### 实施任务

- [ ] **从正式 catalog 生成职位选择器。** 不保留生成器、后端配置和页面词表三份副本。`DR-DATA-POSITION-001`
- [ ] **只在成功变更查询后清空共演状态。** 清空全部已选人物/身份及其聚焦、搜索、分页和分析派生；取消、失败和 no-op 保留旧状态。`DR-DATA-SELECTION-001`
- [ ] **限制单人物合作搜索的影响范围。** 搜索只过滤可见列表和分页，顶部合作总数与各指标最高人物始终来自完整候选集。`DR-DATA-COOP-001`
- [ ] **按证据展示偏好与综合分。** 排行/合作排行只显示最终偏好分；人物详情和单人物共演信息按钮展示实际中间量。精确中性值为 `0.00`，正数才加 `+`，负数使用 `−`，无样本显示 `—`。`DR-DATA-PREFERENCE-001`
- [ ] **使用 Applied Query 的 `mergeSeries`。** 系列卡只使用权威层返回的代表、成员和实际参与明细；隐藏时间维度，不保留 `?result=series` 正式协议，也不在浏览器猜测完整成员或重算权威统计。`DR-DATA-SERIES-001`
- [ ] **删除公开个人 fixture 数据路径。** 正式入口不得加载 `/workbench-data/*`，fixture adapter 只能由测试/dev 显式注入。

### 退出条件

- 前端不直连 Bangumi API、不加载个人公开快照、不维护第二套统计公式；
- 查询状态机、空/错状态、选择清理、局部搜索、系列和偏好均通过组件/E2E；
- production artifact denylist 不含 fixture、固定 UID 或原型入口。

## 10. Phase 6：迁移、发布与删除

### 实施任务

- [ ] **只从原始数据重建。** 重新生成 101–106、配音关系、Series ID、评分人数和个人覆盖层；禁止迁移已丢失来源或包含错误分类的聚合结果。
- [ ] **执行影子对比。** 代表性请求差异必须归类为“已确认修正、旧 bug、新回归”，不能以错误结果的字节一致为目标。
- [ ] **执行发布质量门禁。** 校验引用、数量、聚合不变量、schema、`dataVersion`、缓存版本和职位目录版本后才允许激活。
- [ ] **演练失败与回滚。** 下载、解析、生成、校验或激活前任一步失败都保持当前 active 不变；保留上一版不可变快照，并按运维实施稿执行指针恢复、单实例重启和 readiness 验证。
- [ ] **完成真实更新验证。** 按后端计划完成至少两次真实周更和一次回滚演练，再删除旧数据链路。
- [ ] **删除 legacy。** 在所有消费者迁移并达到双栈退出门后，删除废弃先验、重复派生、错误 101–106 分类、公开 fixtures 和旧 `/statistics`。不得提前删除原始证据或上一可回滚版本。

### 退出条件

- 完整 Archive 在已确认资源限制内通过容量/性能基准；
- 所有影子差异均有归因，未决事项没有被实现默认值悄悄替代；
- clean clone 能重建、测试、发布和回滚同一数据版本。

## 11. 规范表

### 11.1 结果单位与 wire 映射

`itemCount` 只是在领域金标和通用算法中描述“当前统计单位数量”的泛称，不是正式 API 字段。对外必须使用与语义相符的具体字段：

| 领域单位 | `itemCount` 定义 | wire 映射 | 不计入 |
|---|---|---|---|
| 普通作品 | 命中当前职位人物关系的去重作品数 | `workUnit=subject`；人物/候选使用 `workCount`，全员交并集使用 `unionWorkCount/commonWorkCount` | 职位过滤前候选范围 |
| 系列 | 实际参与作品覆盖的去重系列数 | `workUnit=series`；人物/候选使用 `workCount`，全员交并集使用 `unionWorkCount/commonWorkCount` | 未实际参与但处于同系列的作品 |
| 角色 | 实际角色数 | 完整摘要使用 `characterCount`；角色分页使用 `pagination.total`；角色自身的 `workCount` 仍表示其原始出演作品数 | 无关系支撑的推断角色 |

同一个实现不得同时序列化泛称 `itemCount` 和上述具体字段。`COUNT-442` 的领域期望是 `itemCount=442`，对应排行 wire 为 `summary.workCount=442`。

### 11.2 人物排序链

`±` 只作用于用户选择的主指标；其余方向固定。

| 主指标 | 唯一排序链 |
|---|---|
| 数量 | 数量 `±` → 有效均分优先且均分 DESC → 有效评分数 DESC → Person ID ASC |
| 均分 | 有效值优先 → 均分 `±` → 有效评分数 DESC → 数量 DESC → Person ID ASC |
| 综合分 | 有效值优先 → 综合分 `±` → 有效评分数 DESC → 数量 DESC → 均分 DESC → Person ID ASC |
| 偏好 | 有效值优先 → 偏好分 `±` → 有效样本数 DESC → 数量 DESC → 均分 DESC → Person ID ASC |

明确移除作品标题、收藏人数、Bangumi Rank 和人物名作为隐式排序键。作品/系列浏览使用“有效值 → 所选指标 `±` → 全站评分 DESC → Subject/Series ID ASC”；多人最佳组合使用“共同数 DESC → 当前模式均分 DESC → 人物 ID 组合 ASC”。

### 11.3 系列边界

| 类别 | Relation ID |
|---|---|
| 合并 | 2、3、4、5、6、9、10、11、12 |
| 不合并 | 1、7、8、14、99 |

“合并续作”只是短标签，帮助文案必须说明还包含总集篇、番外、衍生和不同演绎；仅共享世界观不构成合并依据。

### 11.4 术语与证据字段

| 字段/术语 | 定义 |
|---|---|
| 公共标签 | Subject 的公共 `tags` 字段 |
| meta 标签 | Archive Subject 的 `meta_tags` 字段；与公共标签分开保存 |
| 个人收藏标签 | 目标用户 collection 的标签，只能进入 personal 模式 |
| `comparableCount` | 个人与全站评分均有效的原始作品数 |
| `comparableSeriesCount` | 上述作品自然覆盖的系列数 |
| `effectiveEvidence` | 当前统计模式实际等权的作品数或系列数 |
| `mean` | 当前等权统计单元上的平均“个人评分 − 全站评分” |
| `evidenceWeight` | `effectiveEvidence / (effectiveEvidence + 5)` |
| `score` | `mean × evidenceWeight`；无有效证据时为 null |
| `sequelOrder` | 版本化的系列成员/代表排序值；关系权重、日期、首两项交换规则和 Subject ID 兜底必须有金标 |

## 12. 最小金标矩阵

| Case | 输入/场景 | 必须结果 | 主要追踪项 |
|---|---|---|---|
| `SCORE-MISSING` | 0、null、缺失 | 计为未评分，不进入均分/权重 | `RATING-002`、`FILTER-001` |
| `SCORE-RANGE` | `<1`、`>10`、非有限数 | 数据错误 | `RATING-002`、`SCHEMA-001` |
| `SCORE-820` | 数学结果 8.20 | 不得得到 8.19 | `RATING-001` |
| `TIMELINE-667` | `[6,7,7]` | `6.66` | `TIMELINE-001` |
| `ALL-UNRATED` | 全部未评分 | 数量保留，均分/综合分证据为空 | `BACKEND-001`、`FILTER-001` |
| `COLLECTION-2345` | 收藏状态 2/3/4/5 | 每种均覆盖有评分/未评分 | `COLLECTION-001` |
| `TAG-EMPTY` | `/`、`+` 或空 token | 提交失败，不运行集合运算 | `TAG-001` |
| `TAG-SOURCE` | personal/global 同一标签 | personal 可含个人标签，global 不可 | `TAG-001`、`GLOBAL-001` |
| `CAST-101-106` | Bangumi 职位 101–106 | 保留真实职位，不进入声优 | `CAST-002` |
| `CAST-ALL` | 主役角色 | “全部声优”作品数、角色数和列表均包含 | `CAST-002` |
| `COUNT-442` | 审计默认样例 | 领域 `itemCount=442`，排行 wire `summary.workCount=442`，不是候选 449 | `COUNT-001` |
| `SERIES-INTERSECTION` | 各自参与同系列不同作品 | 不算共同作品/系列 | `SERIES-001` |
| `SERIES-ID` | 非法/缺失关联 | 回退 Subject 自身 ID | `SERIES-002` |
| `SORT-TIE` | 主指标与证据完全并列 | 稳定 ID 决定顺序 | `SORT-001` |
| `SORT-MISSING` | 有效值与缺失值混合、升降序 | 缺失始终置后 | `SORT-001`、`CANDIDATE-001` |
| `GLOBAL-LEAK` | global 响应/排序 | 不出现或读取 `collection.*` | `GLOBAL-001` |
| `QUERY-NOOP` | 规范化后条件不变 | 不清空选择、不提交新版本 | `SELECTION-001` |
| `QUERY-CHANGED` | 新条件成功返回 | 清空全部共演及派生状态 | `SELECTION-001` |

## 13. 配音关系缺失处理

- 只接受本作精确 `(subjectId, characterId)` 关系，不从同系列、续作、重制或其他作品继承。
- updater 质量报告必须区分 `NO_CHARACTERS`、`NO_CAST_RELATIONS` 和 `FILTERED_BY_VALID_CV`，并提供有界频次与样例。
- 缺失分类只用于质量诊断，不生成 inferred credit、不进入正常 catalog，也不伪装成零错误。
- 领域 `itemCount` 只统计实际确认的 exact 参与结果，并按第 11.1 节映射到 wire；不能为补齐候选数量无依据生成 credit。
- 未来若增加 inferred 能力，必须使用新的版本化 provenance、独立 capability 和 dataVersion，不得改变 v1 exact 语义。

## 14. 实施与验证记录

- 2026-07-22：`DR-DATA-SERIES-001` 的 `result=series` 已在当前原型完成交互和视觉验证；正式权威层、API/adapter 和生产数据迁移仍为未完成状态。
- 后续记录格式：`日期 · 工作包/DR · commit · dataVersion · 测试命令 · 验收结果 · 已知限制`。
