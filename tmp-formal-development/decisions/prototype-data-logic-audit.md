# 原型数据逻辑审计与决策登记

> 建立日期：2026-07-22  
> 最近同步：2026-07-23  
> 审计范围：当前 Vue 原型界面、静态 fixture 生成器、当前 fixture、与迁移口径直接相关的旧后端实现  
> 当前阶段：只登记、逐项确认；在用户明确要求开始实施前，不因本文自动修改代码

本文记录当前原型数据逻辑审计中发现的问题，以及用户逐项确认后的正式数据契约。实现现状、审计建议和历史后端行为都不能自动视为用户决策。

## 确认规则

- 每轮只确认一个具名决策项。
- 确认顺序按 P0、P1、P2、P3 推进；同优先级内按登记表顺序推进。
- 当前确认项：无；所有正式开发前的 P0 数据口径已确认，下一轮转入 v1 API 传输契约。
- 全局默认（用户已于 2026-07-22 确认）：凡经审计证实属于原型临时实现、fixture 局限、校验缺失或明显实现错误的项目，正式开发时默认修正，可直接记为 `ACCEPTED_PENDING_IMPLEMENTATION`；只有会改变统计定义、数据来源、筛选语义或产品口径的事项继续逐项确认。
- 用户可以接受建议方案、选择替代方案、补充新方案或明确延期。
- 每次确认后同步更新登记表、对应明细和确认记录。
- 全部关键口径确认完成后，再单独汇总后端数据契约、迁移顺序和验收测试。
- 除非用户另行授权，确认阶段不实施代码改动。

## 状态定义

- `NEEDS_DECISION`：审计事实已记录，但目标口径或处理方式仍需用户确认。
- `ACCEPTED_PENDING_IMPLEMENTATION`：用户已确认目标口径，尚未完成实现与验证。
- `ACCEPTED_NO_ACTION`：用户确认保持现状或无需处理。
- `TODO`：问题已确认需要后续处理，但当前暂不继续确认算法或实施细节；从本轮确认顺序暂时移出。
- `DEFERRED`：用户明确延期，不进入当前后端改造范围。
- `IMPLEMENTED_VERIFIED`：用户已确认，代码、测试、fixture 和规范均已对齐并验证。
- `REOPENED`：曾经确认，但因新证据或范围变化重新开放。

## 优先级定义

- `P0`：会改变核心统计含义或数据全集，后端开工前必须确认。
- `P1`：当前结果已确定错误或明显误导，应在主数据链路中解决。
- `P2`：接口契约、数据覆盖或前后端一致性风险，应在 API 定型前确认。
- `P3`：低频边界、展示一致性或维护债务，可在核心契约后处理。

## 后续待办

- [ ] `DR-DATA-CAST-002`：正式开发分离 Bangumi 官方职位与内部声优角色类型的命名空间，清理 101–106 撞号产生的错误声优 credit，并修正旧后端“全部声优”漏主役角色明细。
- [ ] `DR-DATA-CAST-003`：正式开发实现已确认的 exact-only 配音关系，并在 updater 质量报告中区分缺少角色、缺少本作配音关系和被 `valid_cv` 过滤。

## 已验证基线

- 个人模式评分来源为 `collection.rate`；全站模式评分来源为 `subject.score`。
- `ratingCount` 当前只参与查询过滤，不参与综合分加权。
- 未评分作品计入作品数，但不计入均分、有效评分数和综合分的 `n`。
- 普通未合并模式的目标公式为：先向下截取均分两位，再计算 `(n × 均分 + 5 × 5) / (n + 5)`。
- 多职位排行要求人物具备全部所选职位，指标按各职位作品的去重并集计算。
- 同一人物多身份取作品并集；多个人物之间取全员交集。
- 相对偏好只使用个人与全站均有效的评分对；差值 0 是有效结果；合并时系列内先平均，再让系列等权。
- 当前 fixture 有 450 部动画：396 部有个人评分、54 部未评分；默认关闭 NSFW 后为 449 部，其中 53 部未评分。
- 当前各 fixture 数组内部未发现重复 Subject/Person ID；两个文件间有 2,313 个预期重叠人物 ID，已按同一人物核对合并。未发现重复职位作品引用、孤儿 Subject 引用、越界评分或非法评分人数。

## 决策登记表

| ID | 状态 | 优先级 | 主题 | 建议结论 |
|---|---|---:|---|---|
| `DR-DATA-SCOPE-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P0 | 全站模式数据宇宙 | 全站与个人使用独立作品宇宙；个人收藏只作为个人模式覆盖层。 |
| `DR-DATA-SERIES-001` | `IMPLEMENTED_VERIFIED` | P0 | 合并续作对统计单元的影响 | 开启后主指标与结果列表均以系列为统计单元；系列卡复用代表条目并附成员名单。 |
| `DR-DATA-RATING-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P0 | 均分与综合分的十进制定点运算 | 使用整数分值或十进制定点，禁止直接依赖二进制浮点截断。 |
| `DR-DATA-CAST-001` | `ACCEPTED_NO_ACTION` | P0 | `valid_cv` 配音关系过滤 | 保持旧版全局人物白名单方案，不改变作品参与与配音来源口径。 |
| `DR-DATA-BACKEND-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P0 | 有效评分数修正与测试未进入版本库 | 保留有效评分数修正，并让 Go 回归测试正式受版本控制。 |
| `DR-DATA-NAME-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P1 | 人物与角色 infobox 名称解析 | 使用兼容 Bangumi infobox 语法的结构化解析器，不再用简单正则承担字段解析。 |
| `DR-DATA-PIPELINE-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P1 | 原始收藏快照与派生 fixture 混用 | 原始输入与生成输出分离，原始快照不可被派生结果覆盖。 |
| `DR-DATA-CANDIDATE-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P1 | 候选排序、缺失均分和排名徽标 | 排序与名次使用唯一结果集；无评分始终排在有效值之后。 |
| `DR-DATA-SELECTION-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P1 | 查询变化后的共演人选 | 成功应用变化后的查询条件时，清空全部共同参与分析人选。 |
| `DR-DATA-TAG-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P1 | 标签来源、匹配方式和组合语法 | 个人模式搜索个人收藏与公共标签的并集；全站模式只用公共标签；统一精确匹配。 |
| `DR-DATA-FILTER-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P1 | 评分条件与未评分作品 | 不提供未评分独立条件；启用任何评分值条件时，缺少相关评分的作品一律剔除。 |
| `DR-DATA-COOP-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P1 | 单人物合作搜索影响顶部统计 | 搜索只过滤可见列表，不重算总数与各指标最高人物。 |
| `DR-DATA-CAST-002` | `ACCEPTED_REVISED_PENDING_IMPLEMENTATION` | P0 | 原始职员职位 ID 与声优派生 ID 冲突 | 保留已确认的配音来源口径；common 职位使用 `staff:*`，动画/游戏 main/all 声优使用 `cast:*`，两者彻底分域。 |
| `DR-DATA-CAST-003` | `ACCEPTED_PENDING_IMPLEMENTATION` | P0 | 本作缺少配音关系时是否跨作品继承 | 正式统计只接受本作精确关系；缺失由 updater 分类报告，不跨作品补 credit。 |
| `DR-DATA-COLLECTION-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P2 | 收藏状态与 fixture 覆盖 | 后端支持真实 2/3/4/5；fixture 至少加入 4/5 的行为样例。 |
| `DR-DATA-POSITION-001` | `ACCEPTED_REVISED_PENDING_IMPLEMENTATION` | P0 | common 职位目录自动更新与映射治理 | common 全部职位动态生成 exact `staff:*` 查询项；舍弃旧 168 清单。旧手动合并规则另行逐项评估，当前不作保留/删除结论。 |
| `DR-DATA-COUNT-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P2 | 查询范围数与实际参与条目数 | 最终结果只返回实际参与数；候选范围数只作为内部中间量。 |
| `DR-DATA-SCHEMA-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P2 | fixture/API schema 校验 | 在数据入口严格验证版本、引用、唯一性、范围和同批生成信息。 |
| `DR-DATA-RATING-002` | `ACCEPTED_PENDING_IMPLEMENTATION` | P2 | 评分有效值统一规则 | 统一为有限数值且位于 `[1,10]`；0/null 表示未评分。 |
| `DR-DATA-DISTRIBUTION-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P2 | 全站小数评分分桶 | 定义为作品均分分布；使用最近整数、`.5` 向上并写入区间契约。 |
| `DR-DATA-TIMELINE-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P2 | 季度均分精度 | 与主均分统一使用有效评分和向下截取两位规则。 |
| `DR-DATA-GLOBAL-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P2 | 全站模式读取个人字段 | 全站派生、排序和 tooltip 顺序不得读取个人收藏评分或标签。 |
| `DR-DATA-SUBJECT-TYPE-001` | `ACCEPTED_REVISED_PENDING_IMPLEMENTATION` | P2 | 非动画职位标识 | 五类统一使用带 type 的 `staff:*` / `cast:*` key，不依赖 `Number()` 或中文名称转换。 |
| `DR-DATA-SERIES-002` | `ACCEPTED_PENDING_IMPLEMENTATION` | P2 | 系列关系范围与 Series ID 规范 | 保留当前系列关系边界；Series ID 使用同类型连通分量内最小的正整数 Subject ID。 |
| `DR-DATA-RATING-COUNT-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P2 | 评分人数生成 | 只显式累加 1–10 分桶，不遍历所有数值属性。 |
| `DR-DATA-METADATA-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P2 | 旧评分先验元数据 | 删除或版本化已废弃的 `globalScorePrior/votePriorCount`。 |
| `DR-DATA-DATE-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P3 | 日期与季度解析 | 只接受完整合法格式；缺少月份时不伪造季度。 |
| `DR-DATA-CHARACTER-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P3 | 无 Character ID 的角色聚合 | 无稳定身份时不跨作品合并，或把 Subject ID 纳入 key。 |
| `DR-DATA-SORT-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P3 | 排序维度与完整排序链 | 保留维度使用统一严格全序；主方向独立，缺失值置后，最终按稳定 ID 排序。 |
| `DR-DATA-PREFERENCE-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P3 | 偏好中间量与零值显示 | API 保留完整计算证据；排行只显示结果，人物详情说明实际样本与计算；中性值显示 `0.00`。 |
| `DR-DATA-DERIVED-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | P3 | 重复、未使用的派生统计 | 删除或统一到单一 domain helper，防止后端接入错误口径。 |

## 待确认明细

### DR-DATA-SCOPE-001 · 全站模式数据宇宙

**审计事实**

- 生成器只物化存在个人收藏记录的作品、职位和角色关系。
- 前端切换全站模式时只跳过 UID、收藏状态和个人评分过滤，无法补回从未进入 fixture 的作品。
- 当前所谓全站模式最多只有 450 部作品；默认范围是 449 部，不是全站全集。

**影响**

人物作品数、均分、综合分、共演、角色数和分布图都回答“该用户收藏范围内的全站评分”，而不是“全站人物统计”。

**建议决策**

采用两个明确的数据宇宙：

1. 全站模式：完整 Subject + Credit + Cast 数据。
2. 个人模式：在全站基础数据上与目标用户收藏记录做交集，并叠加个人评分、收藏状态、标签和更新时间。

不建议仅改文案继续把当前集合称为“全站模式”。

**证据**

- [`generate-workbench-data.mjs`](../../frontend/scripts/generate-workbench-data.mjs) 第 447–467、505、522 行附近。
- [`useWorkbench.ts`](../../frontend/src/workbench/composables/useWorkbench.ts) 第 355–442 行附近。

**用户确认（2026-07-22）**：确认这是原型的数据范围问题；原型阶段暂不要求修正，正式开发时必须采用上述完整全站数据宇宙，并将个人收藏作为个人模式覆盖层。

### DR-DATA-SERIES-001 · 合并续作对统计单元的影响

**审计事实**

- `mergeSeries` 当前只传给相对偏好算法。
- 作品数、均分、综合分、共演和图表仍按原始 Subject 计算。
- 默认声优范围有 846 人存在重复系列作品；佐仓绫音为 61 部作品、32 个系列。

**建议决策**

- 关闭时：一部作品是一个统计单元。
- 开启时：同系列内先按当前评分来源求有效均分，每个系列等权；作品数指标切换为系列数，综合分的 `n` 使用有效系列数。
- 使用同一查询界面入口，通过 `result=series` 表达系列结果态；不新增 HTML/Vite 入口或另一套视觉方向。
- “参与作品”“共同作品”“合作作品”列表在系列结果态改为系列卡：封面、标题与标签来自旧版 `sequel_order` 算法选出的当前参与范围代表条目，评分为当前参与范围内的系列均分；不展示代表条目的个人收藏状态与收藏日期。覆盖摘要使用主色并放在卡片右上角。底部只列系列成员的小封面、显示名与原文名；只要存在原文名就使用次级字号固定展示，即使与显示名或中文名相同也不省略，名称实际被截断时才显示完整双语名称 tooltip。
- 人物详情的系列排序复用非合并状态在相同数据来源下的既有选项，并额外提供“系列作品数量”，按系列成员名单数量排序；退出系列结果态时该项回退到评分。
- 标签模块保留，但只统计代表条目标签；不计算标签交集、并集或覆盖率。
- 合作仍是单一二元判断：先求所有所选人物共同参与的原始 Subject ID 交集，再按系列合并；分别参与同一系列的不同作品不算合作。
- 共同系列卡显示“共同参与 N 部 · 系列 M 部”，并显示每个人在该系列内参与的作品数。系列参与者单元左侧由同排的小序号与人物名、人物名下方的“参与 N 部”组成，右侧保留参与职位列表；职位 tag 末尾数字表示该具体身份覆盖的去重系列作品数，普通单作品卡不显示恒为 1 的数字。系列共演卡在右上角覆盖摘要后提供一个 info 说明，明确数字的这一口径。共演分析的系列与非系列卡均使用完整身份 tag“声优（戏份类型）：角色名”；仅系列态在 tag 末尾增加 N，普通职位显示为“职位 N”。同一角色跨作品只展示最高优先级戏份类型，数字仍按角色身份覆盖数计算，缺角色明细的作品另计通用“声优 N”tag。只有人物排行详情的作品/系列卡不重复普通职位。
- 系列结果态的时间维度不可合并，因此完整隐藏“按评分 / 按时间”切换组，只保留评分分布。

**证据**

- [`useWorkbench.ts`](../../frontend/src/workbench/composables/useWorkbench.ts) 第 361–377、484–509 行附近。
- [`DESIGN.md`](../../DESIGN.md) “相对偏好口径”与“文案”章节。

**用户确认（2026-07-22）**：确认开启“合并续作”后，主指标统一以系列为统计单元、系列之间等权；在现有原型上以最小改动扩展既有组件，使用代表条目卡与底部系列成员名单，不另定视觉方向、不新增结果页入口或独立视觉组件。当前原型 fixture 缺少 `sequel_order` 与数据库级完整成员时允许降级展示快照内已知成员；离线生成器必须同步旧版代表算法并在重生成后提供完整名单。

### DR-DATA-RATING-001 · 均分与综合分的十进制定点运算

**审计事实**

- `Math.floor(value * 100) / 100` 会把数学上的 8.20 算成 8.19。
- 当前六个职位中发现 1 条个人人物-职位均分、202 条全站人物-职位均分受影响；65 条全站综合分也发生 0.01 偏差。
- 生成器中的 `Number.EPSILON` 写法不能可靠修正。

**建议决策**

评分进入统计层后使用整数百分值或可靠十进制定点类型；均分截取、综合分舍入和排序都消费同一个规范化结果。边界测试至少覆盖 `8.2`、`41/5`、`6/7/7` 和全为未评分。

**证据**

- [`ratingSummary.ts`](../../frontend/src/workbench/domain/ratingSummary.ts) 第 7–21 行。
- [`generate-workbench-data.mjs`](../../frontend/scripts/generate-workbench-data.mjs) 第 202–208 行。

**用户确认（2026-07-22）**：确认保留“均分向下截取两位”的业务规则；正式开发使用整数百分值或可靠的十进制定点运算，并让展示、排序与综合分共用同一规范化结果。

### DR-DATA-CAST-001 · `valid_cv` 导致的配音记录漏数

**审计事实**

- Bangumi dump 将直接职员关系放在 `subject-persons`，作品—角色关系放在 `subject-characters`，人物—角色配音关系放在 `person-characters`。
- 旧后端曾为临时排除部分“不在 `subject-persons` 中的译配”建立全局 `valid_cv` 集合，只把至少在任意一条 `subject-persons` 中出现过的人物视为合格声优；原型生成器沿用了这条规则。
- 生成器读取每条 `person-characters` 时，先执行 `if (!validCvPersonIds.has(personId)) return`。因此，一个人物即使拥有完整有效的作品—角色—人物配音关系，只要从未出现在 `subject-persons`，其全部配音关系都会被静默丢弃。
- 这不是可靠的配音来源判断：人物只要在其他任意作品的 `subject-persons` 中出现过，其全部 `person-characters` 又都会通过。该条件既可能漏掉正常配音，也不能准确识别译配。
- 真实例：在 2026-07-07 dump 中，《孤独摇滚！》（Subject `328609`）的喜多郁代（Character `87975`）同时关联长谷川育美（Person `30858`，关系 `type=0`）与林慕青（Person `58218`，关系 `type=3`）。长谷川育美存在 `subject-persons` 记录而通过；林慕青完全不在 `subject-persons`，因此其本地化配音关系被丢弃。这可以解释旧规则最初想解决的问题。
- 同一作品也能看到副作用：八百屋杏（Person `19562`）为匿名角色（Character `17529`）配音，人物—角色关系为 `type=0`，作品—角色关系也完整，但她完全不在 `subject-persons`，所以这条原配记录同样被丢弃。当前 1,717 条被丢弃记录中，867 条为 `type=0`，证明 `valid_cv` 并不等价于“排除译配”。
- 当前原始 dump 复算结果：12,867 条可映射角色记录中丢弃 1,717 条，涉及 658 人、1,222 条人物-作品关系、1,180 个角色和 265 部作品。

**建议决策**

配音关系的有效性由 Person、Character、Subject 及关系本身决定，不再依赖人物是否在其他位置出现过 `subject-persons`。如需区分原配、译配或其他来源，应保留来源字段并提供显式筛选，而不是静默删除。

**证据**

- [`generate-workbench-data.mjs`](../../frontend/scripts/generate-workbench-data.mjs) 第 492–548 行。
- [`update_database.py`](../../backend/scripts/update_database.py) 第 214 行附近的临时限制注释。

**用户确认（2026-07-22）**：不采纳上述审计建议，保持旧版方案且不做任何改变。继续从任意有效 `subject-persons` 记录建立全局 `valid_cv` 人物白名单，再以该白名单过滤 `person-characters`；不改为人物—作品配对校验，也不新增配音来源筛选。

### DR-DATA-NAME-001 · 人物与角色 infobox 名称解析

**审计事实**

字段正则会跨行读取下一字段。当前有 170 位人物显示名为 `|别名={`；角色记录中有 1,456 条同类错误和 8 条 `|性别=` 错误。

**建议决策**

- 使用兼容 Bangumi infobox/wiki 语法的结构化解析器，不再用简单正则直接提取字段。
- 解析层明确处理空字段、块字段、别名结构、重复字段、换行和异常语法；正则只可用于输入预检或安全兜底。
- 对目标字段做类型与内容校验；无合法中文名时回退原文名，不能把下一字段或语法标记当成名字。
- 建立真实 infobox 样本与异常边界测试，并保留解析失败质量指标。

**证据**：[`generate-workbench-data.mjs`](../../frontend/scripts/generate-workbench-data.mjs) 第 225–250 行。

**用户确认（2026-07-22）**：确认名称解析算法必须完善；正式开发采用结构化 infobox 解析方案，不能只修补或继续依赖简单正则。

### DR-DATA-PIPELINE-001 · 原始收藏快照与派生 fixture 混用

**审计事实**

生成器默认输入和输出都是 `co-star-snapshot.json`。元数据保留 API 收藏 461 条，但派生数据只剩 450 条，默认重跑无法恢复 11 条缺失记录或刷新新增收藏。

**建议决策**

把 API 原始收藏快照、JSONLines 版本和派生原型 fixture 分成独立路径；输出必须记录输入版本、校验和、生成时间与覆盖统计，生成器不得默认覆盖原始输入。

**证据**：[`generate-workbench-data.mjs`](../../frontend/scripts/generate-workbench-data.mjs) 第 20、58–75、442–454、756–760 行。

**用户确认（2026-07-22）**：依据“原型临时做法在正式开发时默认修正”的全局规则确认；正式开发分离原始收藏快照与派生数据，保证原始输入不可被生成结果覆盖且统计可完整重建。

### DR-DATA-CANDIDATE-001 · 候选排序、缺失均分和排名徽标

**审计事实**

- 候选列表使用向下截取均分，排名徽标重新使用未截取均分。
- 默认声优范围按个人均分默认降序时有 106 人名次不一致；全站模式按全站均分默认降序时有 840 人不一致。
- 141 位无个人评分候选被当作 0，按均分升序时排在有效评分之前。

**建议决策**

建立唯一的候选结果和 comparator；排名从未搜索、未分页的同一结果派生；均分使用 `number | null` 并携带有效数，无数据始终置后。

**证据**

- [`useWorkbench.ts`](../../frontend/src/workbench/composables/useWorkbench.ts) 第 647–683 行。
- [`PersonPicker.vue`](../../frontend/src/workbench/components/PersonPicker.vue) 第 45–88 行。

**用户确认（2026-07-22）**：依据全局默认规则确认；正式开发统一候选排序、名次和缺失值口径，无评分不得伪装为真实 0 分。

### DR-DATA-SELECTION-001 · 查询变化后的已选人物

**审计事实**

应用查询时只按职位清理身份，不按新作品范围清理。年份、评分、标签或 UID 变化后，旧人物可能保留为零作品集合并继续影响分析；非当前模式的职位草稿也可能被隐式提交。

**建议决策**

- 本项专指共同参与分析的 `selectedScopes`，不是排行候选列表。
- 查询签名发生变化并成功应用后，清空全部共演人选以及依赖它们的聚焦、搜索和分页状态；不只清理零作品人物。
- 仅编辑后取消、查询校验失败或重复应用未变化条件时，不清空共演人选。
- 无论从人物排行还是共同参与模式提交了会影响共同分析范围的查询变化，都执行同一清空规则，避免非当前模式留下旧选择。

**证据**：[`useWorkbench.ts`](../../frontend/src/workbench/composables/useWorkbench.ts) 第 704–765、795–810 行。

**用户确认（2026-07-22）**：确认修改并成功应用查询条件时应清空全部共演人选，不保留或标记旧人选；本项不涉及排行候选。

### DR-DATA-TAG-001 · 标签来源、匹配方式和组合语法

**审计事实**

原型混合 meta、公共和个人标签，并采用双向子串匹配；“轻百合日常”当前会命中 198 部，而精确匹配为 0。只输入 `/` 或 `+` 都可能排除全部作品。旧后端采用精确匹配。

**建议决策**

- 数据模型继续分别保存公共标签、meta 标签和个人收藏标签，不在入口处不可逆压平。
- 个人模式的搜索集合为公共标签、meta 标签和目标用户个人收藏标签的去重并集；任一来源精确命中即可。
- 全站模式只使用公共标签和 meta 标签，不得读取某个用户的个人收藏标签。
- 使用 NFKC、大小写和首尾空白标准化后的精确匹配，删除当前双向子串判断。
- 保留现有组语法时，正向为组间 AND、组内 `/` OR；反向为组间 OR、组内 `+` AND。
- 空 token 在提交前报错，不执行空集合的 `some/every`。

**证据**：[`useWorkbench.ts`](../../frontend/src/workbench/composables/useWorkbench.ts) 第 389–439 行。

**用户确认（2026-07-22）**：确认个人模式同时搜索个人收藏标签与公共标签，保持当前原型的标签来源并集口径；全站模式不读取个人标签。正式开发修正双向子串误匹配并拒绝空 token。旧 Go 后端实际上只搜索公共 `Subject.Tags`，正式改造时需要补入个人收藏标签。

### DR-DATA-FILTER-001 · 评分范围是否包含未评分

**审计事实**

未评分和缺失评分都被转换为 0，因此“我的评分上限 7”会包含未评分作品，“0–0”会成为隐式的仅未评分查询。

**建议决策**

- 不新增“包含未评分”或“仅看未评分”条件。
- 未启用评分值条件时，未评分作品仍保留在作品范围和作品数中，但不进入均分、综合分有效数和评分图表。
- 启用个人评分范围时，缺少有效个人评分的作品剔除；启用全站评分范围时，缺少有效全站评分的作品剔除；启用个人—全站分差时，两侧任一评分无效都剔除。
- `ratingCount` 是评分人数而不是评分值；0 仍是有效人数，不适用“未评分作品”规则。

**证据**：[`useWorkbench.ts`](../../frontend/src/workbench/composables/useWorkbench.ts) 第 378–418 行。

**用户确认（2026-07-22）**：确认未评分不作为独立查询条件；只要查询启用了会读取评分值的条件，缺少所需评分的作品永远剔除。未启用评分值条件时仍按既定口径计入作品范围与作品数。

### DR-DATA-COOP-001 · 单人物合作搜索影响顶部统计

**审计事实**

合作人物搜索后的列表同时被用于顶部合作人数和各指标最高人物，导致本地搜索改写全局摘要。

**建议决策**

顶部总数和 leaders 始终基于完整 `cooperationCandidates`；搜索后集合只用于左侧可见列表和分页。

**证据**：[`SinglePersonCooperation.vue`](../../frontend/src/workbench/components/SinglePersonCooperation.vue) 第 122–205、330–334 行。

**用户确认（2026-07-22）**：依据全局默认规则确认；搜索只改变可见列表，不得改写完整结果集的摘要统计。

### DR-DATA-CAST-002 · 原始职员职位 ID 与声优派生 ID 冲突

**审计事实**

根据用户补充的旧版设计背景，当时 Bangumi 的 `subject-persons` 没有提供声优职位关系，官方职员职位 ID 也尚未扩展到 100 以上，因此项目把动画角色类型临时编码为 `100 + roleType`，即 101–106，并用 101/102 表示“仅主役声优/全部声优”。这个历史方案在当时的官方职位范围之外，不会直接撞号。

现在生成器仍让上述内部派生编码与真实的 `subject-persons.position` 共用同一张扁平职位映射表。Bangumi 当前已经把真实职员职位扩展到 100 以上，其中 101–106 分别是技术导演、特技导演、色彩脚本、分镜协力、分镜抄写、副人物设定。旧版保留编号因此与上游新增编号发生碰撞，真实动画职员会被伪造成声优。此前把这项描述为“有声优 credit 但无角色明细”并不准确。

真实样例：原始 `subject-persons` 记录 `person_id=6756, subject_id=9717, position=104` 表示龙轮直征在《魔法少女小圆》担任“分镜协力”。当前映射却把 104 转成应用内职位 102，最终 fixture 因此记录龙轮直征为该作品的“声优”。这条关系并非来自 `person-characters`，自然没有 `rolesBySubject`。当前统计出的 356 条“无角色明细的声优 credit”、涉及 298 人，实质上是这类错误映射，而不是需要保留的未知角色配音。

原始 dump 中这 356 条真实职位记录按 Position 分布为：101 有 2 条、102 有 0 条、103 有 27 条、104 有 21 条、105 有 5 条、106 有 301 条。它们因为“映射表中已有同名键”而不会进入 `unmappedPositionRows`，说明只监控未知 ID 仍无法发现已有 ID 的语义碰撞。

同一套旧编号还造成旧后端内部口径不一致：主役角色的作品参与会同时写入 Position 101“仅主役声优”和 102“全部声优”，但 `casts` 角色明细只写 Position 101。查询“声优”时作品数包含主役作品，角色数和角色列表却排除所有主役角色；查询“仅主役声优”才取得这些角色。当前原型生成器统一写入 `voiceRoleIndex`，没有复现这一漏数，但正式后端若照搬旧表结构会重新引入。

**建议决策**

- 原始 `subject-persons.position` 只按 common 职位目录解析，公开键使用 `staff:{subjectType}:{positionId}`；角色关系使用 `cast:{subjectType}:main|all`，不再把两种来源都表示成无命名空间的整数。
- 声优作品参与仍按已确认的 `DR-DATA-CAST-001` 旧版 `valid_cv` 方案，从 `subject-characters` / `person-characters` 关系生成；本项不改变该权威来源和过滤口径。
- 删除这 356 条误生成的**声优分类**，但不删除原始 `subject-persons` 作品参与关系；例如 Position 104 仍应作为“分镜协力”保留，在产品支持该职位时归入正确职位。重新生成 fixture，并增加“真实职员职位 101–106 不得进入声优统计”的回归测试。
- `casts` 原样保存角色类型；动画和游戏分别补充 main/all 两个声优查询谓词，不再让同一角色只能挂在一个聚合职位 ID 下。同类型 main/all 互斥；回归测试必须证明 all 的作品数、角色数和角色列表均包含主役。
- 不再新增“未知角色 credit”这一统计概念；若未来出现来源真实但角色详情缺失的数据，再按新的真实样例另立决策。

**证据**：[`generate-workbench-data.mjs`](../../frontend/scripts/generate-workbench-data.mjs) 第 506–517、519–568 行；[`position_id_mapping.json`](../../backend/scripts/position_id_mapping.json) 第 90–95 行；[`update_database.py`](../../backend/scripts/update_database.py) 第 238–269、318–378 行；[`character.go`](../../backend/internal/core/character/character.go) 第 17–49、100–133 行；[`position-data.json`](../../frontend/public/workbench-data/position-data.json) 中 Person `6756` 的职位数据；Bangumi `common` 的 [`subject_staffs.yml`](https://github.com/bangumi/common/blob/6a8442c17143a870357a5ff812362e8b5cfe9f9d/subject_staffs.yml) 职位枚举。

**用户确认（2026-07-22）**：确认这是旧版在当时官方职位范围之外保留 101–106 作为声优角色类型所留下的兼容问题。正式版保留已确认的旧版配音来源与 `valid_cv` 口径，但必须把内部角色类型与 Bangumi 官方职员职位彻底分域；原始 `subject-persons` 关系仍按真实官方职位保留，不得再因整数撞号进入声优统计。同源的“全部声优漏主役角色明细”属于明显实现错误，依据全局规则一并修正。

**范围修订（2026-07-23）**：用户确认新版不使用旧 168 项，而是动态开放 common 完整职位目录并参考旧版额外补充声优；公开 key 明确不使用 `official` 名称。当前方案以 `staff:*` / `cast:*:main|all` 表达，旧 101/102/1101/1102 数字不提供兼容；同类型 main/all 互斥。

### DR-DATA-CAST-003 · 本作缺少配音关系时是否跨作品继承

**审计事实**

- 默认查询范围中没有 Position 102 credit 的 7 部作品，均不是被 `valid_cv` 直接过滤：它们在原始 `person-characters` 中对应本作 Subject ID 都是 0 行，关系没有进入过滤步骤。
- 其中 3 部连本作 `subject-characters` 也没有：Subject `189777`《Alice in Deadly School》、`274613`《爱、死亡 & 机器人》、`395855`《爱、死亡 & 机器人 第四季》。只能判断上游未提供角色/配音数据，不能判断作品实际没有声优。
- 另 4 部有本作角色但没有本作人物—角色关系：Subject `76194`《未来日记Redial》有 10 个角色、`331935`《奇蛋物语 特别篇》有 4 个、`443179`《拾荒者统治》有 12 个、`451757`《瑞克和莫蒂 第九季》有 6 个。
- 《未来日记Redial》的相同 10 个 Character ID 在本篇 Subject `16235` 均有配音人物；《奇蛋物语 特别篇》的 4 个角色也在本篇 Subject `316607` 有配音人物，相关人物全部满足已确认的全局 `valid_cv`。当前及旧版算法都严格按 `(subjectId, characterId)` 连接，因此不会跨作品继承这些关系。
- 这种严格连接避免了续作、重制、本地化版本或制作变更导致的演员误继承，但会把“本作关系未录入”表现成零 credit。《瑞克和莫蒂 第九季》还说明即使同一角色在相邻季度出现，演员关系也可能只部分录入，不能仅凭同系列和相同 Character ID 视为权威关系。
- 若查询条件最终只剩这类零 credit 作品，旧后端因人物结果为空而返回无结果；原型会显示零人物和候选作品数。根据 `DR-DATA-COUNT-001` 的已确认口径，正式结果的实际参与数应为 0，不得用候选范围数代替。
- 2026-07-23 对官方 `dump-2026-07-21.210441Z.zip`（SHA-256 `e1120169088407c66a94dacacda4dffaabe0e2e08cbcc8238c880f6c0140dd57`）完成完整性校验和同一组 Subject 精确复扫：七部作品的本作 `person-characters` 仍全部为 0；本作角色数仍分别为 `0/0/0/10/4/12/6`。Subject `76194` 的 10 个 Character ID 在本篇 `16235` 各有一条配音关系，Subject `331935` 的 4 个 Character ID 在本篇 `316607` 也各有一条，与 2026-07-07 样本无变化。该结果证明缺口持续存在并存在潜在推断来源，但不能证明跨作品演员关系权威等价。

**算法选项**

- 方案 A（审计建议）：继续只接受本作精确 `person-characters` 关系，不跨作品推断；同时在导入质量报告中区分 `NO_CHARACTERS`、`NO_CAST_RELATIONS` 与 `FILTERED_BY_VALID_CV`。上游后续补齐后通过数据刷新自然生效。
- 方案 B：允许从同系列相同 Character ID 继承，但必须定义可继承的关系类型、唯一演员约束、冲突处理、`valid_cv` 复用规则和 `inferred/sourceSubjectIds` 来源标记；推断关系不得伪装成上游精确关系。
- 无论选择哪种方案，`DR-DATA-COUNT-001` 都只返回当次算法实际确认出的参与作品数；不得为了让 449 与 442 相等而无依据补 credit。

**证据**：官方 [`dump-2026-07-21.210441Z.zip`](https://github.com/bangumi/Archive/releases/download/archive/dump-2026-07-21.210441Z.zip) 中 `subject-characters.jsonlines`、`person-characters.jsonlines` 与 `subject-relations.jsonlines` 的上述 Subject 精确扫描；[`generate-workbench-data.mjs`](../../frontend/scripts/generate-workbench-data.mjs) 第 519–568 行；[`update_database.py`](../../backend/scripts/update_database.py) 第 238–269 行。旧样本保留在 `/Users/luca/Downloads/dump-2026-07-07.210439Z`，只用于变化对比。

**用户处理（2026-07-22）**：标记为待办项，当前不选择方案 A/B；后续恢复确认跨作品继承算法。本项仍在正式开发范围内，不视为放弃或维持现状。

**恢复确认（2026-07-23）**：后端架构决策闭环后恢复本项。当前仍等待用户选择；在确认前，schema 和实现草案只允许 `provenance=exact`，不得提前生成 inferred credit。

**用户确认（2026-07-23）**：选择方案 A。v1 的 `cast:*:main|all` 只统计本作精确 `person-characters` 关系，并继续应用已确认的全局 `valid_cv`；同系列相同 Character ID、系列合并和候选作品都不得补出跨作品 cast edge。缺少 exact 关系的作品不进入声优人物、作品、角色和共演集合，实际参与数允许为 0。updater 必须分别报告 `NO_CHARACTERS`、`NO_CAST_RELATIONS` 与 `FILTERED_BY_VALID_CV`。未来若增加推断，必须另立修订，显式保存 inferred provenance/source、更新 domain rule version 与 `dataVersion`，并提供 exact/inferred 差异报告。

### DR-DATA-COLLECTION-001 · 收藏状态与 fixture 覆盖

**审计事实**

UI 提供看过、在看、搁置、抛弃，但当前 fixture 只有 2/3，4/5 只能返回空结果。

**建议决策**

生产接口完整支持 2/3/4/5；测试 fixture 每种状态至少包含有评分、未评分各一个边界样例。是否支持“想看 1”另立产品范围，不由当前实现推断。

**证据**：[`QueryWorkspace.vue`](../../frontend/src/workbench/components/QueryWorkspace.vue) 第 192–200 行。

**用户确认（2026-07-22）**：依据全局默认规则确认；正式接口与测试数据完整覆盖 UI 已声明的收藏状态 2/3/4/5。“想看 1”仍不由本项扩展。

### DR-DATA-POSITION-001 · 官方职位目录自动更新与映射治理

**审计事实**

- 当前 [`position_id_mapping.json`](../../backend/scripts/position_id_mapping.json) 是静态手工清单，导入器发现未知 ID 后直接跳过，没有同步官方职位定义的机制。
- 以当前 Bangumi `common/subject_staffs.yml` 为准，五种条目类型共有 246 个官方职位定义，本地清单缺少 73 个：动画缺 69 个，游戏缺 Position 1033，三次元缺 Position 4020–4022。缺失既包括上色、色彩检查等动画 Position 93–100，也包括客座人物设定、音乐监督、视觉导演等 Position 107–168 的新增职位；书籍和音乐职位当前没有缺失。
- 当前 450 部作品的 92,203 条 `subject-persons` 记录中有 2,859 条无法映射，约 3.1%，分布于 67 个职位。这 67 个 ID 全部已经是官方目录中的合法职位，并非损坏或真正未知的数据。因此这不仅是未来兼容性问题，当前 fixture 已经发生静默漏数。
- 当前单张映射表同时承担“官方职位目录”“旧职位别名归一化”“一个职位计入多个统计口径”和“声优角色类型派生”四种职责；即使补齐本轮缺失 ID，后续仍会再次出现漏项或碰撞。
- 后端、前端生成器和查询界面各自维护静态职位副本；后端又以职位中文名称解析 ID，未知名称会静默得到 0。上游改名、新增职位或任一副本未同步时，都可能产生不可见的不一致。

**建议决策**

- 将 Bangumi [`common/subject_staffs.yml`](https://github.com/bangumi/common/blob/6a8442c17143a870357a5ff812362e8b5cfe9f9d/subject_staffs.yml) 作为官方职位目录源，在定时任务或数据发布流程中自动拉取并生成版本化目录；产物记录上游 commit、生成时间和内容哈希。正式服务运行时读取已经审核和固定版本的产物，不在请求路径临时下载上游文件。
- 数据层以 `(subjectType, positionId)` 保存每一条 `subject-persons` 原始职位。common 新增职位默认可以被识别、保存和通过 exact `staff:*` key 查询，不因前端未发布静态清单而丢弃。
- 旧 168 项人工清单不进入新版兼容层。旧 `position_id_mapping.json` 中监督/总监督、演出/主演出等手动合并项先生成逐项数据与产品语义报告，另立 `DR-BE-POSITION-MERGE-001` 评估；当前不得自动保留、统一删除或改写 exact `staff:*` 结果。
- 每次同步生成结构化差异：新增、改名、分类变化、删除、未知原始 ID及其使用频次。新增 common 职位不阻断原始数据入库，并在发布新 dataVersion 后自动进入 catalog。
- API 和前端状态使用 `staff:{type}:{positionId}` / `cast:{type}:{scope}` 稳定键；中文名称只作为可更新的展示字段。前端职位选择器从接口目录生成，不再同时硬编码 `position.json`、`SUPPORTED_POSITIONS` 和页面词表。
- 声优角色类型按 `DR-DATA-CAST-002` 使用独立命名空间，不进入官方职位目录。迁移时从原始 dump 重建受影响 credit，不复用已经丢失来源信息的旧聚合结果。
- 职位目录和 dump 先进入暂存版本，完成引用、数量、聚合不变量及缓存版本校验后再原子切换；不能继续以总行数相等判断“无需更新”，也不能只做不删除旧关系的 upsert。更新失败时保留上一版可用数据。

**证据**：[`generate-workbench-data.mjs`](../../frontend/scripts/generate-workbench-data.mjs) 第 24–32、493–515、682–719 行；[`QueryWorkspace.vue`](../../frontend/src/workbench/components/QueryWorkspace.vue) 第 55–60 行；[`update_database.py`](../../backend/scripts/update_database.py) 第 211–298、302–378、560–567 行；[`position.go`](../../backend/internal/core/position/position.go) 第 9–26 行；[`position_id_mapping.json`](../../backend/scripts/position_id_mapping.json)；[`position.json`](../../backend/config/position.json)；Bangumi [`subject_staffs.yml`](https://github.com/bangumi/common/blob/6a8442c17143a870357a5ff812362e8b5cfe9f9d/subject_staffs.yml)。

**用户确认（2026-07-22）**：确认正式版必须考虑 Bangumi 官方职位的自动更新，不能继续依赖一次性手工清单。自动更新负责同步和保存完整官方职位目录；项目统计职位的归并规则仍独立治理。正式导入不得静默丢弃未知职位，必须提供版本、差异、频次和质量统计。

**范围修订（2026-07-23）**：用户确认舍弃旧 168 项，以 common 当前完整职位目录作为新版动态查询范围，未来新增自动补充，并参考旧版另加声优职位；public key 不使用 `official`，改用 `staff`。旧手动合并项需要重新评估，本轮不决定保留或删除。

### DR-DATA-COUNT-001 · 查询范围数与实际参与条目数

**审计事实**

- 旧版后端先按用户/全站范围、条目类型、收藏状态、NSFW、标签、日期、收藏数和评分得到候选作品 `subjs`，之后才按所选职位查询 `credits` 并建立人物—作品结果。没有当前职位关系的作品不会进入任何人物的作品明细、个人作品数、均分或综合分，但响应中的 `SubjectCount` 仍直接取职位查询前的 `len(subjs)`。
- 当前原型沿用了相同的两阶段口径：`queryScopeIds` 不读取职位关系，人物排行随后才把各人物的职位作品与该范围取交集。因此默认界面显示 449 个候选条目，实际有 Position 102 credit 的作品为 442 部；另外 7 部只进入顶部范围数，不进入人物排行指标或合作统计。Subject `76194`《未来日记Redial》是当前 fixture 中的真实例子之一。
- 旧版系列数同样根据职位查询前的候选作品计算，角色数却来自实际 `casts`；所以同一个 `itemCount` 字段会随统计类型分别表示“候选范围”或“实际参与结果”。旧前端统一显示为“共统计到……个条目/系列/角色”，没有说明这一区别。
- 因此这不是原型偏离旧后端，而是旧版延续下来的混合命名问题。所谓作品 C“被查入”，准确含义只是它进入了作品候选范围和顶部范围计数；它没有进入当前职位的人物统计结果。如果全部候选作品都没有当前职位人物关系，旧后端会直接返回无结果，而不会单独返回该范围数。

**建议决策**

正式接口的最终 `itemCount` 只返回至少命中当前职位人物关系的去重作品并集；默认样例应返回 442，而不是职位过滤前的 449。候选范围仍可作为查询执行过程中的内部中间量，但不进入最终响应或“共统计到”的界面文案。系列模式相应返回实际参与作品所覆盖的去重系列数；角色模式继续返回实际角色数。

**证据**：[`statistic.go`](../../backend/internal/core/statistic/statistic.go) 第 130–174、199–233 行；[`person.go`](../../backend/internal/core/person/person.go) 第 10–75 行；[`sequel.go`](../../backend/internal/core/sequel/sequel.go) 第 11–42 行；旧前端 [`ResponseStats.vue`](../../frontend/src/components/rank/ResponseStats.vue) 第 28–50 行；原型 [`useWorkbench.ts`](../../frontend/src/workbench/composables/useWorkbench.ts) 第 419–530 行；[`RankingWorkbench.vue`](../../frontend/src/workbench/components/RankingWorkbench.vue) 第 87–98 行。

**用户确认（2026-07-22）**：确认最终结果只返回实际参与数。没有当前职位 credit 的候选作品不得计入 `itemCount`；默认样例应返回 442，不返回 449。Subject `76194`《未来日记Redial》为何缺少 Position 102 credit 另立算法问题，后续单独审计和确认，不能为了凑齐范围数直接推断关系。

### DR-DATA-SCHEMA-001 · fixture/API schema 校验

**审计事实**

当前加载器只检查顶层数组存在；重复 ID 会在构造 `Map` 时静默覆盖，两个 fixture 也没有同批生成校验。

**建议决策**

API/fixture 入口校验 schema 版本、生成批次、ID 唯一性、引用完整性、评分范围、日期、Series ID、职位和角色关系；质量错误应阻止统计而不是降级为零值。

**证据**：[`loadFixtures.ts`](../../frontend/src/workbench/data/loadFixtures.ts) 第 18–40 行；[`useWorkbench.ts`](../../frontend/src/workbench/composables/useWorkbench.ts) 第 265–290 行。

**用户确认（2026-07-22）**：依据全局默认规则确认；正式数据入口实施严格 schema、批次、唯一性、引用和取值范围校验。

### DR-DATA-RATING-002 · 评分有效值统一规则

**审计事实**

主均分接受所有有限且大于 0 的数，偏好和图表只接受 `[1,10]`，缺失值又常被转换为 0。

**建议决策**

统一为 `Number.isFinite(score) && score >= 1 && score <= 10`。0、null、缺失统一表示未评分；越界值是数据错误，不能静默进入部分指标。

**证据**：[`ratingSummary.ts`](../../frontend/src/workbench/domain/ratingSummary.ts)、[`preference.ts`](../../frontend/src/workbench/domain/preference.ts)、[`ratingDistribution.ts`](../../frontend/src/workbench/domain/ratingDistribution.ts)。

**用户确认（2026-07-22）**：依据全局默认规则确认；有效评分统一为有限的 `[1,10]` 数值，0/null/缺失表示未评分，越界值作为数据错误处理。

### DR-DATA-DISTRIBUTION-001 · 全站小数评分分桶

**审计事实**

当前使用 `Math.round`，8.5 进入 9 分桶；当前 fixture 有 49 部全站评分恰好为 `.5`。设计文档尚未定义区间边界。

**建议决策**

如果图表表示“作品平均分分布”，采用最近整数、`.5` 向上，并在契约中写出 `[x-0.5, x+0.5)` 边界；如果要表达用户投票分布，则应直接使用 `score_details`，不能复用当前图表含义。

**证据**：[`ratingDistribution.ts`](../../frontend/src/workbench/domain/ratingDistribution.ts) 第 36–49 行。

**用户确认（2026-07-22）**：确认图表表示“作品均分分布”，不是用户投票分布；全站小数评分采用最近整数分桶，`.5` 向上，例如 8.5 进入 9 分桶。正式契约明确中间分桶 `[x-0.5, x+0.5)`，两端在有效评分 `[1,10]` 内截断。若未来展示用户投票分布，必须另用 `score_details` 建模，不复用本图表。

### DR-DATA-TIMELINE-001 · 季度均分精度

**审计事实**

季度图使用未截取算术平均再 `toFixed(2)`，主均分先向下截取；例如 `[6,7,7]` 分别显示 6.67 与 6.66。

**建议决策**

默认复用主均分的有效值和截取规则。如果保留原始均值用于绘图精度，tooltip 必须明确，且排序/摘要仍使用主口径。

**证据**：[`ratingDistribution.ts`](../../frontend/src/workbench/domain/ratingDistribution.ts) 第 94–111 行。

**用户确认（2026-07-22）**：确认季度图与主均分使用同一套有效评分与精度规则；算术均值向下截取两位，例如 `[6,7,7]` 的季度均分为 6.66。折线位置、tooltip、摘要和后端返回值均消费同一个规范化结果，不再使用 `toFixed(2)` 形成独立的四舍五入口径。

### DR-DATA-GLOBAL-001 · 全站模式读取个人字段

**审计事实**

全站模式下，底层作品列表仍先按个人评分排序，标签集合代码也会读取个人收藏标签。当前 fixture 没有个人标签，但后端接入后可能泄漏个人口径。

**建议决策**

全站模式的筛选、派生、默认顺序、tooltip 和图表不得读取 `collection.*`；统一使用全站评分、作品日期和稳定 ID。

**证据**：[`useWorkbench.ts`](../../frontend/src/workbench/composables/useWorkbench.ts) 第 389–398、578–581、813–816 行。

**用户确认（2026-07-22）**：依据全局默认规则及已确认的全站数据宇宙确认；全站模式不得读取个人收藏字段。

### DR-DATA-SUBJECT-TYPE-001 · 非动画职位标识

**审计事实**

非动画职位当前是字符串，通用查询层却统一 `Number()` 并丢弃非数值；校验只检查原数组非空。今天非动画类型被禁用，启用后会“验证通过但零结果”。

**建议决策**

五类统一复用 `DR-DATA-POSITION-001` 的动态目录和带类型稳定键：common 职位使用 `staff:{type}:{positionId}`，声优使用 `cast:{type}:{scope}`；查询层使用明确联合类型，不运行时猜测转换。

**证据**：[`QueryWorkspace.vue`](../../frontend/src/workbench/components/QueryWorkspace.vue) 第 47–59、140–142 行；[`useWorkbench.ts`](../../frontend/src/workbench/composables/useWorkbench.ts) 第 237–241 行。

**用户确认（2026-07-22）**：依据全局默认规则确认；开放非动画类型前建立稳定、明确的职位 ID 与类型映射，禁止运行时猜测转换。

**范围修订（2026-07-23）**：新版动态开放五类 common 职位，不再等待旧字符串职位表逐类补齐；前端必须先完成 catalog 驱动和 `staff/cast` key 迁移后再启用这些类型。

### DR-DATA-SERIES-002 · 系列关系范围与 Series ID 规范

**审计事实**

- 动画当前用关系 2 前传、3 续集、4 总集篇、5 全集、6 番外篇、9 不同世界观、10 不同演绎、11 衍生、12 主线故事构造无向连通分量。因此“合并续作”实际比字面上的前传/续集更宽。
- 当前样例中，关系 9 会把《进击！巨人中学校》与《进击的巨人》合并；关系 10 会把《少女革命》TV 与剧场版《少女革命 思春期默示录》合并；总集篇、剧场版、外传和四格衍生也会进入各自主线系列。
- 关系 8“相同世界观”反而不合并。例如 Love Live!、LoveLive! Sunshine!!、虹咲和 Superstar，以及《樱花庄的宠物女孩》与《青春猪头少年》保持为不同系列。当前边界的隐含标准是“相同主要角色或直接故事派生可以合并，仅共享世界观但主角/故事不同则不合并”。
- 并查集具有传递性：A 与 B 是续集、B 与 C 是衍生时，A/B/C 最终属于同一系列，即使 A 与 C 没有直接关系。因此每新增一种允许关系，都可能合并整片既有组件，而不只是单独一对作品。
- 旧后端重建时按遍历顺序分配递增 Series ID，新增组件可能让大量 ID 漂移；原型改用连通分量内最小 Subject ID，稳定性更好。偏好层仍会把数值 `123` 与字符串 `"123"` 视为不同系列，0/负数也可成为合法 key。

**建议决策**

- 建议保留当前动画边界：合并 2/3/4/5/6/9/10/11/12，不合并 1 改编、7 角色出演、8 相同世界观、14 联动、99 其他。这样可以合并相同角色/故事的续作、重述和衍生，又避免仅因共用世界观把不同主角线的大型宇宙连成一个系列。
- 产品文案应说明这里的“系列”包含总集篇、番外、衍生和不同演绎；如果继续使用“合并续作”这一短标签，至少由帮助文案给出边界。
- Series ID 对外统一为正整数，采用同类型连通分量内最小 Subject ID；`<=0`、空值、非法字符串或不存在的引用回退到 Subject 自身，不得把未知作品合成同一个系列。该规范化属于实现修正，不依赖关系范围的产品选择。

**证据**：[`generate-workbench-data.mjs`](../../frontend/scripts/generate-workbench-data.mjs) 第 35–40 行；[`preference.ts`](../../frontend/src/workbench/domain/preference.ts) 第 52–103 行。

**用户确认（2026-07-22）**：确认保留当前动画系列边界：合并关系 2/3/4/5/6/9/10/11/12，不合并改编、角色出演、仅相同世界观、联动和其他关系；产品文案应准确说明该范围。Series ID 对外统一为同类型连通分量内最小的正整数 Subject ID，非法或缺失值回退到作品自身 ID。

### DR-DATA-RATING-COUNT-001 · 评分人数生成

**审计事实**

当前实现累加 `score_details` 对象的所有数值属性；如果上游以后加入 `total`，会重复计数。

**建议决策**

只显式累加键 `1..10`，并验证每个桶为非负整数；如上游提供可信 total，可做一致性校验而不是重复求和。

**证据**：[`generate-workbench-data.mjs`](../../frontend/scripts/generate-workbench-data.mjs) 第 198–208、274–276 行。

**用户确认（2026-07-22）**：依据全局默认规则确认；评分人数只累加 1–10 分桶并校验其为非负整数。

### DR-DATA-METADATA-001 · 旧评分先验元数据

**审计事实**

fixture 仍包含 `globalScorePrior=5.9376`、`votePriorCount=50`，但当前综合分固定使用 5 分、5 个统计单元先验，偏好也不按票数修正。

**建议决策**

从当前 schema 删除废弃字段；如为历史兼容保留，必须放入带版本的 legacy 区域，生产统计不得读取。

**证据**：[`co-star-snapshot.json`](../../frontend/public/workbench-data/co-star-snapshot.json) 的 `meta.preference`。

**用户确认（2026-07-22）**：依据全局默认规则确认；废弃先验字段从正式 schema 删除或隔离到版本化 legacy 区域，生产统计不得读取。

### DR-DATA-DATE-001 · 日期与季度解析

**审计事实**

当前季度解析可接受尾随垃圾，只有年份时会自动归到第一季度。当前 fixture 日期完整，属于后端边界风险。

**建议决策**

只接受 `YYYY-MM-DD` 或明确登记的部分日期格式；缺月时不生成季度点，原始精度单独保存。

**证据**：[`ratingDistribution.ts`](../../frontend/src/workbench/domain/ratingDistribution.ts) 第 63–75 行。

**用户确认（2026-07-22）**：依据全局默认规则确认；日期严格按登记格式解析，缺少月份时不得伪造季度。

### DR-DATA-CHARACTER-001 · 无 Character ID 的角色聚合

**审计事实**

缺少 ID 和名称时 fallback key 只有角色类型与顺序，不同作品中的匿名角色可能被误合并。当前 fixture 角色有 ID，属于接口边界风险。

**建议决策**

无稳定人物身份时不跨作品聚合；至少把 Subject ID 纳入 fallback key，并把结果标为未知角色记录。

**证据**：[`characterCredits.ts`](../../frontend/src/workbench/domain/characterCredits.ts) 第 61–69 行。

**用户确认（2026-07-22）**：依据全局默认规则确认；无稳定 Character ID 时不得把不同作品的匿名角色跨作品合并。

### DR-DATA-SORT-001 · 排序维度与完整排序链

**审计事实**

- Bangumi Rank 等已按此前确认从当前排序入口移除；剩余问题不是继续增删排序维度，而是前后端及不同页面尚未共享一套完整排序契约。
- 主人物排行会把缺少当前指标的人放在最后，只让升降序影响主指标；并列时按偏好样本数（仅偏好排序）、作品/系列数、当前模式均分、Person ID 继续比较。合作人物排行没有偏好样本数这一层，人物选择器又把无有效评分编码为 0，按均分升序时会让无评分人物排在有效评分人物之前。
- 旧 Go 后端的数量、均分和综合分采用不同次级链，最后一级使用 `>=` 而不是严格的 `>`。完全相等时 `a < b` 与 `b < a` 都可能成立，违反排序器契约；同时没有 Person ID 终极键，而输入来自 map 遍历，因此分页边界可能漂移。
- 旧后端的升序通过反转整个降序结果实现，连次级键也一起反转；原型只反转用户选择的主指标。例如两个人均分同为 8.00，一个有 20 个有效样本、另一个只有 2 个，旧后端升序会把 2 个样本者放前，原型仍优先 20 个样本者。
- 原型在均分并列时使用总作品数，而不是实际参与均分计算的有效评分数。当前 fixture 中井上麻里奈（Person `4382`）与伊濑茉莉也（Person `4769`）的个人均分同为 7.25；前者是 30 部作品、16 个有效评分，后者是 26 部作品、20 个有效评分。原型会因总作品数把前者排前，但若排序依据是均分证据，后者的有效样本更多。该差异与已经确认的“综合分使用有效评分数”是同一数据边界。
- 当前 fixture 中池田裕治（Person `328`）和恩田尚之（Person `351`）均为 1 部作品、1 个有效评分、均分 7.00、综合分 5.33。旧后端无法稳定决定两者顺序；增加最终 ID 后应固定为 328 在 351 前。
- 作品浏览也不一致：人物详情的主指标并列后直接按 Subject ID，共同作品和合作作品则先按全站评分再按 Subject ID；收藏日期缺失时当前不是排到末尾，而是从列表中被删除，导致仅切换排序就改变结果集合。
- 多人物“最佳组合”当前按共同数、全站均分排序，没有最终人物 ID 键；个人模式也仍以全站均分破同分，完全并列时结果受已选人物的输入顺序影响。

**建议决策**

- 所有排序器必须形成严格全序，最终使用稳定实体 ID 升序，禁止 `>=`；升降序只作用于用户选择的主指标，次级证据键方向固定，缺少主指标的项始终置后。
- 主人物排行、合作人物排行和人物选择器共享以下人物排序链：
  - 数量：`数量 ± → 有效均分优先且均分 DESC → 有效评分数 DESC → Person ID ASC`；
  - 均分：`有效值优先 → 均分 ± → 有效评分数 DESC → 数量 DESC → Person ID ASC`；
  - 综合分：`有效值优先 → 综合分 ± → 有效评分数 DESC → 数量 DESC → 均分 DESC → Person ID ASC`；
  - 相对偏好：`有效值优先 → 偏好分 ± → 有效样本数 DESC → 数量 DESC → 均分 DESC → Person ID ASC`。
- 排序只改变顺序，不改变结果集合。作品/系列浏览统一为`有效值优先 → 所选指标 ± → 全站评分 DESC → Subject ID / Series ID ASC`；缺少收藏日期或评分的条目保留并置后。系列内部顺序继续使用 `sequelOrder ASC → Subject ID ASC`。
- 多人物最佳组合使用`共同数 DESC → 当前模式均分 DESC → 人物 ID 组合 ASC`。前端所有入口与正式后端共享同一组包含升序、降序、缺失值、完全并列和分页边界的测试向量。

**证据**：[`useWorkbench.ts`](../../frontend/src/workbench/composables/useWorkbench.ts) 第 490–551、670–704 行；[`SinglePersonCooperation.vue`](../../frontend/src/workbench/components/SinglePersonCooperation.vue) 第 159–179 行；[`AnalysisDashboard.vue`](../../frontend/src/workbench/components/AnalysisDashboard.vue) 第 96–121、153–177 行；[`useSubjectWorkBrowser.ts`](../../frontend/src/workbench/composables/useSubjectWorkBrowser.ts) 第 33–81 行；[`PersonInspector.vue`](../../frontend/src/workbench/components/PersonInspector.vue) 第 85–105 行；[`sorter.go`](../../backend/internal/core/statistic/sorter.go)；[`statistic.go`](../../backend/internal/core/statistic/statistic.go) 第 59–63、199–225 行。

**用户确认（2026-07-22）**：确认从所有排序 selector 移除作品标题、收藏人数、Bangumi Rank 和人物名；保留维度采用上述统一严格全序。升降序只作用于主指标，评分相关并列优先有效评分/样本证据，缺失值始终置后，排序不得改变结果集合，最终使用稳定实体 ID；人物排行、人物选择器、合作排行、作品/系列浏览及正式后端共享同一契约和测试向量。

### DR-DATA-PREFERENCE-001 · 偏好中间量与零值显示

**审计事实**

- 模型已计算可比较作品数、可比较系列数、当前统计单元数、平均偏差、样本权重和最终分，但人物详情只显示最终分和通用公式，没有显示本人的实际样本数、平均偏差与权重，因此相同最终分可能无法解释。
- 例如人物 A 只有 1 部可比较作品，评分差为 `+2.00`，其偏好分为 `2 × 1/(1+5) = +0.33`；人物 B 有 10 部可比较作品，每部平均只高 `+0.50`，其偏好分为 `0.5 × 10/(10+5) = +0.33`。两人的最终分相同，但一个是强烈偏好、样本很少，另一个是轻微偏好、样本较多。
- 零值符号目前不一致：人物详情和作品偏差会显示 `0.00`，人物排行与合作排行却显示 `+0.00`。精确为零并不代表正向偏好。

**建议决策**

- API 保留 `comparableCount`、`comparableSeriesCount`、`effectiveEvidence`、`mean`、`evidenceWeight` 和 `score`，不能只返回最终分；这些字段共同构成可复核的计算证据。
- 排行列表继续只显示最终偏好分，避免信息过载；人物详情的说明中展示实际计算，例如“平均偏差 `+2.00` × 样本权重 `1/6` = 偏好分 `+0.33`（1 部有效作品）”。合并系列时相应显示有效系列数，并可同时说明涉及的原始作品数。
- 精确中性值在人物详情、排行、合作排行和无障碍文案中统一显示 `0.00`；仅正数加 `+`，负数使用 `−`，无有效样本仍显示 `—`。

**证据**：[`preference.ts`](../../frontend/src/workbench/domain/preference.ts)；[`PersonInspector.vue`](../../frontend/src/workbench/components/PersonInspector.vue)；[`RankedPersonList.vue`](../../frontend/src/workbench/components/RankedPersonList.vue)。

**用户确认（2026-07-22）**：确认 API 保留全部偏好计算中间量；排行和合作排行不新增列，仍只显示最终分。人物详情复用现有信息按钮展示该人物的实际平均偏差、有效作品/系列数、样本权重和最终分，下方偏好作品列表保持不变。综合分的同一信息按钮也展示当前人物的均分、有效评分数、中性统计单元、分母与最终综合分。单人物共演在合作人物区域集中复用综合分与相对偏好说明，并随当前合作人物更新实际数值。精确中性值统一显示 `0.00`，无有效样本显示 `—`。

### DR-DATA-DERIVED-001 · 重复、未使用的派生统计

**审计事实**

`useWorkbench` 中仍有固定读取个人评分并包含“未评”的旧分布和其他未使用派生值，与当前可见图表的评分来源规则不同。

**建议决策**

删除未使用派生值，或全部改为消费统一 domain helper。后端 API 不为无消费者的旧字段背书。

**证据**：[`useWorkbench.ts`](../../frontend/src/workbench/composables/useWorkbench.ts) 第 589–595、817–833 行。

**用户确认（2026-07-22）**：依据全局默认规则确认；正式开发删除未使用派生值，或统一改为消费唯一 domain helper。

### DR-DATA-BACKEND-001 · 有效评分数修正与测试未进入版本库

**审计事实**

- 当前工作区 `rate.go` 已把综合分的 `n` 改为有效评分数，但改动尚未提交；当前 HEAD 仍使用总作品数。
- 本机 `rate_test.go` 能验证未评分不增加权重，但 `.gitignore` 的 `*_test.go` 会忽略它。

**建议决策**

把有效评分数作为正式后端契约；调整忽略规则并让回归测试进入版本库。测试至少覆盖空集、全未评分、单个有效评分、混合未评分、8.20 浮点边界和系列统计。

**证据**

- [`rate.go`](../../backend/internal/core/subject/rate.go)。
- [`rate_test.go`](../../backend/internal/core/subject/rate_test.go)。
- [`.gitignore`](../../.gitignore) 第 14 行。

**用户确认（2026-07-22）**：确认保留以有效评分数作为综合分权重的修正；调整忽略规则并将 Go 回归测试纳入版本控制，覆盖全未评分、混合未评分、定点边界和系列合并。

## 确认记录

- 2026-07-22 · `DR-DATA-SCOPE-001` · `ACCEPTED_PENDING_IMPLEMENTATION`：确认原型现状有问题，正式开发时必须修正为完整全站数据宇宙；当前不修改原型代码。
- 2026-07-22 · `DR-DATA-SERIES-001` · `IMPLEMENTED_VERIFIED`：确认并完成合并续作结果态适配；系列等权，先求共同原始作品再归并系列，作品列表改为复用既有卡片的系列卡，并在底部仅列成员小封面与名称。
- 2026-07-22 · `DR-DATA-RATING-001` · `ACCEPTED_PENDING_IMPLEMENTATION`：确认均分继续向下截取两位；正式开发改用整数百分值或十进制定点，并统一展示、排序和综合分的计算输入。
- 2026-07-22 · `DR-DATA-CAST-001` · `ACCEPTED_NO_ACTION`：确认沿用旧版全局 `valid_cv` 人物白名单过滤方案；不改变作品参与与配音来源口径。
- 2026-07-22 · `DR-DATA-BACKEND-001` · `ACCEPTED_PENDING_IMPLEMENTATION`：确认有效评分数修正与对应 Go 回归测试都应正式进入版本库。
- 2026-07-22 · `DR-DATA-NAME-001` · `ACCEPTED_PENDING_IMPLEMENTATION`：确认正式开发使用兼容 Bangumi infobox 语法的结构化解析器，简单正则不得继续作为字段解析主体。
- 2026-07-22 · 全局确认规则：经审计证实的原型临时实现、fixture 局限、校验缺失和明显实现错误，正式开发时默认修正；仅统计定义、数据来源、筛选语义和产品口径继续逐项确认。
- 2026-07-22 · `DR-DATA-PIPELINE-001` · `ACCEPTED_PENDING_IMPLEMENTATION`：确认原始输入与派生 fixture 分离，原始快照不可被派生输出覆盖。
- 2026-07-22 · 依据全局规则批量登记为 `ACCEPTED_PENDING_IMPLEMENTATION`：`DR-DATA-CANDIDATE-001`、`DR-DATA-COOP-001`、`DR-DATA-COLLECTION-001`、`DR-DATA-POSITION-001`、`DR-DATA-SCHEMA-001`、`DR-DATA-RATING-002`、`DR-DATA-GLOBAL-001`、`DR-DATA-SUBJECT-TYPE-001`、`DR-DATA-RATING-COUNT-001`、`DR-DATA-METADATA-001`、`DR-DATA-DATE-001`、`DR-DATA-CHARACTER-001`、`DR-DATA-DERIVED-001`。
- 2026-07-22 · `DR-DATA-SELECTION-001` · `ACCEPTED_PENDING_IMPLEMENTATION`：确认查询条件发生变化并成功应用后清空全部共演人选；不保留旧选择，也不影响仅取消编辑或未变化查询。
- 2026-07-22 · `DR-DATA-TAG-001` · `ACCEPTED_PENDING_IMPLEMENTATION`：确认个人模式搜索公共、meta 与个人收藏标签的并集；全站模式只使用公共与 meta 标签；匹配改为标准化精确匹配并拒绝空 token。
- 2026-07-22 · `DR-DATA-FILTER-001` · `ACCEPTED_PENDING_IMPLEMENTATION`：确认不提供未评分独立条件；启用个人评分、全站评分或评分差条件时，缺少相应有效评分的作品一律剔除。
- 2026-07-22 · `DR-DATA-CAST-002` · `ACCEPTED_PENDING_IMPLEMENTATION`：确认 101–106 是旧版在当时官方职位范围之外建立的声优角色类型编号；正式版保留旧版配音来源口径，但把内部角色类型与官方职员职位彻底分域，清除撞号产生的错误声优分类，并修正旧后端“全部声优”角色明细漏掉主役的问题。
- 2026-07-22 · `DR-DATA-POSITION-001` · `ACCEPTED_PENDING_IMPLEMENTATION`：补充确认为版本化自动同步 Bangumi 官方职位目录，完整保留原始职位；项目聚合规则单独人工治理，所有新增、变化和未知职位必须形成差异与质量报告。
- 2026-07-22 · `DR-DATA-COUNT-001` · `ACCEPTED_PENDING_IMPLEMENTATION`：确认最终 `itemCount` 只返回当前职位实际参与的去重作品数；默认样例返回 442，不返回职位过滤前的候选范围 449。《未来日记Redial》等缺 credit 原因另立 `DR-DATA-CAST-003`。
- 2026-07-22 · 待办标记：`DR-DATA-CAST-002` 保持 `ACCEPTED_PENDING_IMPLEMENTATION`，列入正式开发实施待办；`DR-DATA-CAST-003` 标为 `TODO`，跨作品继承算法留待后续确认。当前确认顺序继续到 `DR-DATA-DISTRIBUTION-001`。
- 2026-07-22 · `DR-DATA-DISTRIBUTION-001` · `ACCEPTED_PENDING_IMPLEMENTATION`：确认图表表示作品均分分布；全站小数评分按最近整数分桶，`.5` 向上，用户投票分布若需要则另用 `score_details` 建模。
- 2026-07-22 · `DR-DATA-TIMELINE-001` · `ACCEPTED_PENDING_IMPLEMENTATION`：确认季度均分与主均分统一使用有效评分和向下截取两位规则；折线、tooltip、摘要与 API 共用同一规范化结果。
- 2026-07-22 · `DR-DATA-SERIES-002` · `ACCEPTED_PENDING_IMPLEMENTATION`：确认保留当前系列关系边界；Series ID 统一使用同类型连通分量内最小的正整数 Subject ID，非法或缺失值回退为作品自身 ID。
- 2026-07-22 · `DR-DATA-PREFERENCE-001` · `ACCEPTED_PENDING_IMPLEMENTATION`：确认 API 返回完整偏好计算证据；排行保持只显示最终分，人物详情现有信息按钮展示实际样本与计算过程；中性值显示 `0.00`，无样本显示 `—`。
- 2026-07-22 · `DR-DATA-SORT-001` · `ACCEPTED_PENDING_IMPLEMENTATION`：确认保留排序维度使用统一严格全序；主方向独立、缺失值置后、排序不改变结果集合，评分相关并列优先有效样本，最终使用稳定实体 ID，并由前后端共享测试向量。
- 2026-07-23 · `DR-DATA-POSITION-001` / `DR-DATA-SUBJECT-TYPE-001` · `ACCEPTED_REVISED_PENDING_IMPLEMENTATION`：舍弃旧 168 项，以 common 五类完整目录动态生成 `staff:*` exact 查询；未来新增随 dataVersion 自动进入 catalog，public key 不使用 `official`。
- 2026-07-23 · `DR-DATA-CAST-002` · `ACCEPTED_REVISED_PENDING_IMPLEMENTATION`：动画/游戏参考旧版补充 main/all 声优能力，但使用独立 `cast:*` key，禁止复用 101/102/1101/1102；同类型 main/all 互斥。
- 2026-07-23 · `DR-BE-POSITION-MERGE-001` · `DEFERRED`：已登记旧普通职位 10 条替换/一对多规则及旧声优伪 ID 规则；按用户要求跳过本项，后续逐项重新评估。当前不提供任何合并查询项，且未来也不得改写 `staff:*` exact 结果。
- 2026-07-23 · `DR-DATA-CAST-003` · `ACCEPTED_PENDING_IMPLEMENTATION`：确认 v1 声优统计只接受本作 exact 配音关系，不从同系列作品继承；缺失进入 updater 分类质量报告，未来任何 inferred 能力必须另立版本化修订。

## 实施与验证记录

- 2026-07-22 · `DR-DATA-SERIES-001`：已在同一查询界面入口实现 `result=series` 结果态，复用并扩展现有排行、分析、评分图、作品浏览和参与者组件；离线生成器同步旧版代表条目算法并输出完整系列成员。当前仓库静态 fixture 未含新增成员索引时按已确认方案降级为快照内已知成员，重生成后自动使用完整名单。已通过系列聚合与路由单测、全量前端单测、类型检查、构建、差异检查，以及 1440 / 820 / 390 三档真实浏览器验收。
