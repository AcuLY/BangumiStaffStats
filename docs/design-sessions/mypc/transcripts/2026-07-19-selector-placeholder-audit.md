# mypc 会话原文：Selector 与 Placeholder 全量扫描

> 这份文件按时间顺序保留远端主会话中全部 `assistant/output_text` 原文；没有二次改写或截断。

- 会话 ID：`019f795c-ca77-78c3-8d04-acb1edc619ba`
- 远端原始记录：`C:\Users\26552\.codex\sessions\2026\07\19\rollout-2026-07-19T15-52-39-019f795c-ca77-78c3-8d04-acb1edc619ba.jsonl`
- 会话开始：2026-07-19 15:52:39 UTC+8
- 分支：`codex/person-workbench-unified-prototype`
- 完整性：8 段 assistant 文本，9645 个 UTF-16 字符，485 行 JSONL，解析错误 0
- Assistant 文本规范哈希：`sha256:6a2f5322b56843b5dcf6d892f46f37318969627083dec81d0274c859f25c5ca6`

## 阅读说明

- Assistant 正文逐段原样保留；标题和时间戳是本次同步添加的导航。
- 与正文相邻的用户消息以折叠块保留，便于判断某条结论对应哪次反馈。
- 自动注入的插件列表、环境信息、子代理通知，以及 reasoning、工具调用和工具输出不在本文件中。
- 哈希算法：依次写入每段 Assistant 文本的 UTF-8 字节长度（8 字节大端）和原文字节，再计算 SHA-256。

---

## 用户上下文 001 · 2026-07-19 15:52:42 UTC+8

<details>
<summary>展开远端记录中的原始用户消息</summary>

<pre>[$impeccable](D:\\Luca\\Code\\MyProject\\BangumiStaffStats\\.agents\\skills\\impeccable\\SKILL.md) 对当前的原型做一次彻底扫描，整理出所有selector的选项和交互的组件的placeholder文本，我需要做统一
</pre>

</details>

## Assistant output 001 · 2026-07-19 15:52:53 UTC+8

我会按 `impeccable` 的审计方法来做：先确认“当前原型”的真实入口和数据源，再同时从源码与实际渲染界面盘点所有下拉/筛选选项，以及输入类交互组件的 placeholder，最后给你一份可直接用于统一文案的清单。这个项目有既往原型约定，我也会先快速核对相关记忆，避免扫错目录或旧版本。

## Assistant output 002 · 2026-07-19 15:53:30 UTC+8

`impeccable` 的项目上下文已确认：这是 `product/web` 型高密度数据工作台，当前设计基线明确要求排行与共同分析共享查询组件。下一步我会先锁定最新原型入口；不会只搜 HTML 属性，还会追踪由 JavaScript、数据数组、模板分支和组件 props 动态生成的选项与占位文案。

## Assistant output 003 · 2026-07-19 15:53:57 UTC+8

我已经确认，当前活跃原型不是早期单页 HTML，而是 `frontend/person-workbench.html` 启动的 Vue 工作台；工作区里还有数个历史静态原型，不能混入主清单。我会把“当前工作台”作为主范围，并把所有条件分支（人物排行/共同分析、个人收藏/全站数据、桌面/窄屏）分别核对，历史原型只做差异提示。

## Assistant output 004 · 2026-07-19 15:55:12 UTC+8

为了确认源码清单与真实界面一致，我会补用 in-app Browser 做渲染态核对；这是 `impeccable` 要求的实际表面验证，尤其能发现条件渲染、默认态和移动端替换控件。它只会打开本地开发页，不会修改项目。

## Assistant output 005 · 2026-07-19 16:14:40 UTC+8

渲染态已经确认了条件分支：默认落在“共演分析”，查询编辑器里的高级输入只有打开对应开关后才真正挂载；标签输入还要再点“添加标签”才出现。因此清单会区分“默认可见 / 条件可见 / 动态生成”，避免把源码里存在但界面永远不出现的值混在一起。

## Assistant output 006 · 2026-07-19 16:56:21 UTC+8

## 当前进度

- 已完整执行 `impeccable` 初始化流程：读取技能、运行 `context.mjs`、读取 `product` register。
- 已确认当前原型入口是：

  `frontend/person-workbench.html` → `frontend/src/workbench/main.ts` → `WorkbenchApp.vue`

  `frontend/prototypes/*.html` 属于历史原型，已排除。
- 全程只读，未修改任何文件；当前工作树本身已有大量用户改动。
- 已完成源码扫描和本地 `127.0.0.1:4174/person-workbench.html` 渲染态核对，覆盖：
  - 人物排行 / 共演分析
  - 查询编辑器及所有高级条件
  - 个人收藏 / 全站数据
  - 0 人 / 1 人 / 2 人以上分析分支
  - 动态标签输入、动态职位、排序、分页

## 已确认结果

- 直接存在 8 个 `NSelect` 声明，复用后形成约 21 个实际 selector 场景。
- 当前共有 20 个不同的非空 placeholder。
- 另有：
  - 分页“跳至”输入的空 placeholder
  - Naive UI 继承的 `请选择`
  - 下拉无匹配项继承的 `无数据`

主要 selector 选项已经完整整理：

- 条目类型：动画；书籍、音乐、游戏、影视当前 disabled。
- 动画职位：声优、监督、脚本、音乐、系列构成、音响监督。
- 其他 disabled 类型的 dormant 职位词表也已整理。
- 排行、候选人物、人物详情作品/角色、单人物合作、多人物共同作品的全部排序选项。
- 所有分页规格、图表维度、评分来源、密度模式和条件 selector。
- 2026 年运行时年代选项：2020 年代至 1950 年代。

20 个 placeholder 包括：

- `例如 lucay126`
- `最早时间` / `最晚时间`
- `指定年代`
- `最低分` / `最高分`
- `最低差值` / `最高差值`
- `最少人数` / `最多人数`
- `输入标签后回车`
- `选择排行职位…` / `选择参与职位…`
- `＋ 添加身份…`
- `筛选当前结果…`
- `搜索人物或 ID`
- `搜索合作作品`
- `搜索中日文标题、人物或角色名…`
- `搜索中日文标题或角色名…`
- `搜索角色双语名或来源作品…`

## 高优先级不统一项

1. `共演分析 / 共同参与分析 / 共演分析结果 / 参与职位` 混用。
2. `我的分数 / 全站分数` 与 `我的评分 / 全站评分` 混用。
3. 全站模式对个人专属选项的策略不统一：有的隐藏、有的 disabled、有的仍可选。
4. 搜索 placeholder 有的带 `…`，有的不带。
5. 候选人物用 `筛选当前结果…`，但能力和 aria-label 都是人物搜索；其他人物搜索写 `搜索人物或 ID`。
6. `最早时间 / 最晚时间` 实际是月份选择器，建议考虑 `开始月份 / 结束月份`。
7. `＋ 添加身份…` 与带真实加号图标的 `添加标签` 语法不一致。
8. 单人物合作分页显示 `N / 页`，其他分页为 `每页 N 人/部/个角色`。
9. 已选人物空提示写“至少两个人物”，但实际选 1 人即可进入单人物合作分析。
10. 排行职位当前实现和提示都是多选，但 `DESIGN.md` 仍写当前只允许单选。
11. 全站排行渲染验证发现仍显示“我的均分”和个人综合分，偏好列仅变为 `—`，属于更深的语义冲突。

## 待完成

- 等待 `/root/runtime_surface_scan` 子代理返回最终运行态差异。
- 将 selector 完整表、placeholder 完整表和统一建议整理成最终中文回复。
- 最终回复应明确：
  - 范围是当前 Vue 原型，不含历史 HTML。
  - 未修改文件。
  - 建议先统一术语规则，再改文案。
- Browser 最后应执行 `browser.tabs.finalize({ keep: [] })`；当前 `auditTab` 停留在“全站数据 + 人物排行”状态。
- 因本轮使用了项目记忆，最终正式回复末尾仍需保留 memory citation。

## 关键源码

- `frontend/src/workbench/components/QueryWorkspace.vue`
- `frontend/src/workbench/components/QueryDateRange.vue`
- `frontend/src/workbench/components/PersonPicker.vue`
- `frontend/src/workbench/components/RankingWorkbench.vue`
- `frontend/src/workbench/components/PersonInspector.vue`
- `frontend/src/workbench/components/AnalysisDashboard.vue`
- `frontend/src/workbench/components/SinglePersonCooperation.vue`
- `frontend/src/workbench/components/SubjectWorkBrowser.vue`
- `frontend/src/workbench/components/WorkListToolbar.vue`
- `frontend/src/workbench/composables/useSubjectWorkBrowser.ts`
- `frontend/public/workbench-data/position-data.json`

<oai-mem-citation>
<citation_entries>
MEMORY.md:116-168|note=[identified current workbench prototype scope and historical prototype boundary]
MEMORY.md:275-322|note=[used prior co-star workbench structure and interaction verification context]
</citation_entries>
<rollout_ids>
019f51bd-2c83-7771-b968-507741a2c3a6
019f4c63-4f44-7352-8589-1baddd2a1b2e
</rollout_ids>
</oai-mem-citation>

## Assistant output 007 · 2026-07-19 16:56:30 UTC+8

源码与运行态两层扫描已经完成；我正在把所有选择器按“位置—当前选项—状态/条件”归并，并将 placeholder 单独去重，最后会附上一份可直接用作统一规范的建议清单。范围只包含当前 Vue 工作台原型，不把历史 HTML 原型混进来。

## Assistant output 008 · 2026-07-19 17:02:29 UTC+8

扫描完成。范围是当前工作树中的 Vue 原型：

`frontend/person-workbench.html → frontend/src/workbench/main.ts → WorkbenchApp.vue`

未计入 `frontend/prototypes/*.html` 历史原型，也未修改任何文件。源码直接声明了 8 处 `NSelect`，经过组件复用和条件分支形成约 21 个实际 selector 场景；另外还有 tabs、checkbox、switch、分页等选择控件。

## 一、Selector 选项清单

### 1. 全局与查询编辑器

| Selector | 当前选项 | 条件/状态 |
|---|---|---|
| 工作台模式 | `人物排行`、`共演分析` | 始终显示 |
| 主题 | `浅色`、`深色` | 图标按钮 |
| 数据来源 | `个人收藏`、`全站数据` | 始终可选 |
| 条目类型 | `动画`；`书籍`、`音乐`、`游戏`、`影视` | 目前只有动画可用，其余 disabled |
| 收藏状态 | 动画：`看过`、`在看`、`搁置`、`抛弃` | 仅个人收藏 |
| 时间快捷范围 | `近 1 年`、`近 3 年`、`近 5 年` | 开启时间范围后显示 |
| 年代 | `2020 年代` 至 `1950 年代` | 2026 年运行时生成 |
| 排行职位 | 当前条目类型的职位，多选 | 人物排行 |
| 参与职位 | 当前条目类型的职位，多选 | 共演分析 |

更多选项开关完整词表：

- `显示 NSFW 条目`
- `合并续作`
- `播出时间范围`
- `收藏时间范围`
- `我的评分范围`
- `全站评分范围`
- `个人－全站评分差范围`
- `全站评分人数范围`
- `正向标签`
- `反向标签`

其中收藏时间、我的评分、评分差仅个人收藏可用；合并续作仅动画可用。

数值控件没有固定选项：

- 我的评分、全站评分：`0–10`，步长 `0.5`
- 评分差：`−10–10`，步长 `0.5`
- 评分人数：最小 `0`，步长 `100`

### 2. 职位选项完整词表

当前可达的动画职位：

- `声优`
- `监督`
- `脚本`
- `音乐`
- `系列构成`
- `音响监督`

代码中保留、但因条目类型 disabled 而暂不可达的职位：

- 书籍：`作者`、`出版社`、`连载杂志`、`文库`、`插图`、`人物原案`、`脚本`、`原作`、`作画`、`译者`、`客串`、`出品方`、`文库品牌`
- 音乐：`艺术家`、`作曲`、`编曲`、`作词`、`厂牌`、`原作`、`录音`、`插图`、`脚本`、`制作人`、`出版方`、`乐器`、`声乐`、`母带制作`、`混音`
- 游戏：`声优（仅主役）`、`声优`、`开发`、`发行`、`游戏设计师`、`剧本`、`美工`、`音乐`、`关卡设计`、`人物设定`、`原画`、`动画制作`、`原作`、`导演`、`程序`
- 影视：`原作`、`导演`、`编剧`、`音乐`、`执行制片人`、`制片人/制作人`、`监制`、`剪辑`、`摄影`、`主演`、`配角`、`制作`、`出品`

### 3. 人物排行

| Selector | 当前选项 |
|---|---|
| 排行排序 | `作品数`、`我的均分`、`综合分`；个人收藏额外 `相对偏好` |
| 排序方向 | `升序`、`降序` |
| 每页人物数 | `每页 5 人`、`每页 10 人`、`每页 20 人` |
| 详情类别 | `作品`、`角色`；角色仅包含声优职位时出现 |
| 显示密度 | `详细`、`缩略` |
| 作品排序 | `全站评分`、`我的评分`、`收藏人数`、`Bangumi Rank`、`收藏日期` |
| 角色排序 | `戏份类型`、`作品数`、`角色名` |
| 作品每页数量 | `每页 5/10/20/50 部` |
| 角色每页数量 | `每页 5/10/20/50 个角色` |
| 图表维度 | `按分数`、`按时间` |
| 图表数据来源 | `我的分数`、`全站分数`；全站模式下前者 disabled |

人物排行结果本身是动态单选，选项来自当前查询返回的人物，不是固定词表。

### 4. 共演分析：人物选择

| Selector | 当前选项 |
|---|---|
| 添加身份 | 已应用参与职位中，该人物尚未拥有且确有作品的职位 |
| 浏览职位 | `${职位名} · ${候选人数} 人` |
| 候选排序·个人 | `作品数`、`我的均分`、`全站均分`、`人物名` |
| 候选排序·全站 | `作品数`、`全站均分`、`人物名` |
| 排序方向 | `升序`、`降序` |
| 每页人物数 | `每页 5/10/20/50 人` |
| 候选人物 | 由职位、查询条件和搜索动态生成 |

### 5. 共演分析：选择 1 人

| Selector | 当前选项 |
|---|---|
| 合作职位 | `全部职位` + 已应用参与职位；只有一个职位时隐藏 |
| 合作人物排序·个人 | `作品数`、`我的均分`、`综合分`、`相对偏好` |
| 合作人物排序·全站 | `作品数`、`全站均分`、`综合分`、`偏好（仅个人收藏）`；最后一项 disabled |
| 合作人物分页 | `5 / 页`、`10 / 页`、`20 / 页`、`50 / 页` |
| 指标领先人物 | `合作数最高`、`均分最高`、`综合分最高`、`偏好分最高` |
| 合作作品密度 | `详细`、`缩略` |
| 合作作品排序·个人 | `我的评分`、`全站评分`、`收藏日期`、`作品标题` |
| 合作作品排序·全站 | `全站评分`、`收藏日期`、`作品标题` |
| 合作作品分页 | `每页 5/10/20/50 部` |

### 6. 共演分析：选择 2 人以上

| Selector | 当前选项 |
|---|---|
| 对比图维度 | `按分数`、`按时间` |
| 对比图数据来源 | `我的分数`、`全站分数`；全站模式下前者 disabled |
| 图表系列 | `共同作品` + `${序号} · ${人物名}` |
| 共同作品密度 | `详细`、`缩略` |
| 共同作品排序 | `我的评分`、`全站评分`、`收藏日期`、`作品标题` |
| 共同作品分页 | `每页 5/10/20/50 部` |

所有分页还包含动态页码和 `跳至` 输入。

## 二、Placeholder 完整清单

当前共有 **20 个不同的非空 placeholder**：

| # | 精确文本 | 使用场景 |
|---:|---|---|
| 1 | `例如 lucay126` | 个人收藏 UID |
| 2 | `最早时间` | 时间范围开始月份 |
| 3 | `最晚时间` | 时间范围结束月份 |
| 4 | `指定年代` | 年代 selector |
| 5 | `最低分` | 我的评分、全站评分下限 |
| 6 | `最高分` | 我的评分、全站评分上限 |
| 7 | `最低差值` | 评分差下限 |
| 8 | `最高差值` | 评分差上限 |
| 9 | `最少人数` | 全站评分人数下限 |
| 10 | `最多人数` | 全站评分人数上限 |
| 11 | `输入标签后回车` | 正向、反向标签 |
| 12 | `选择排行职位…` | 排行职位多选 |
| 13 | `选择参与职位…` | 参与职位多选 |
| 14 | `＋ 添加身份…` | 已选人物追加身份 |
| 15 | `筛选当前结果…` | 候选人物搜索 |
| 16 | `搜索人物或 ID` | 排行、合作人物搜索 |
| 17 | `搜索合作作品` | 单人物合作作品 |
| 18 | `搜索中日文标题、人物或角色名…` | 多人物共同作品 |
| 19 | `搜索中日文标题或角色名…` | 人物详情作品 |
| 20 | `搜索角色双语名或来源作品…` | 人物详情角色 |

另外还有三类框架级文本：

- 分页 `跳至` 输入的 placeholder 是空字符串。
- 未显式提供 placeholder 的空 `NSelect` 会继承 `请选择`。
- 下拉没有匹配项时统一继承 `无数据`。

相关的 placeholder-like 空状态文案还有：

- `添加标签`
- `暂无查询`
- `尚未开始查询`
- `设置查询条件`
- `尚未选择人物`
- `从下方候选中选择至少两个人物。`
- `选择一位人物开始分析`
- `打开人物选择`
- `请选择一位合作人物`

## 三、建议采用的统一规则

### 术语

建议先固定以下词表，再逐项改文案：

| 概念 | 建议统一 |
|---|---|
| 模式名称 | `共同参与分析` |
| 原始评分 | `我的评分`、`全站评分` |
| 聚合值 | `我的均分`、`全站均分` |
| 差值 | `我的评分与全站评分差` |
| 职位 | `排行职位`、`参与职位` |
| 人物附加职位 | `身份` |
| 搜索行为 | 一律以 `搜索…` 开头 |
| 分页 | `每页 N 人/部/个角色` |

这里推荐“共同参与分析”而不是“共演分析”，因为当前支持监督、脚本、音乐等非表演职位。

### Placeholder 最小改动方案

- `最早时间 / 最晚时间` → `开始月份 / 结束月份`
- `指定年代` → `选择年代`
- `输入标签后回车` → `输入标签并按 Enter`
- `选择排行职位…` → `选择排行职位`
- `选择参与职位…` → `选择参与职位`
- `＋ 添加身份…` → 图标 + `添加身份`
- `筛选当前结果…` → `搜索人物或 ID`
- 所有搜索 placeholder 去掉末尾 `…`
- `例如 lucay126` → `例如：lucay126`
- 分页跳转输入补充 `页码` placeholder

### 必须先解决的语义冲突

1. 全站排行运行态仍显示 `我的均分` 和基于个人数据的综合分，偏好列只变成 `—`。这不是单纯文案问题，需要先确定全站指标定义。

2. 个人专属选项在全站模式下，有的隐藏、有的 disabled、有的仍可选。建议统一为：个人专属控制项全部隐藏；只有需要解释模式差异时才保留 disabled。

3. 已选人物空状态写“至少两个人物”，但实际选 1 人即可进入单人物合作分析。应改为 `从下方候选中选择至少一位人物。`

4. 单人物合作分页使用 `N / 页`，其他位置使用 `每页 N 人/部/个角色`。

5. 排行职位当前实现是多选，但 `DESIGN.md` 仍写“只允许选择一个职位”。需要确定产品规则后同步实现与文档。

6. `收藏日期` 排序实际可能回退到作品日期；如果保留该名称，应避免把两种日期混为同一语义。

关键源码位置：[QueryWorkspace.vue](/D:/Luca/Code/MyProject/BangumiStaffStats/frontend/src/workbench/components/QueryWorkspace.vue:386)、[QueryDateRange.vue](/D:/Luca/Code/MyProject/BangumiStaffStats/frontend/src/workbench/components/QueryDateRange.vue:73)、[PersonPicker.vue](/D:/Luca/Code/MyProject/BangumiStaffStats/frontend/src/workbench/components/PersonPicker.vue:167)、[RankingWorkbench.vue](/D:/Luca/Code/MyProject/BangumiStaffStats/frontend/src/workbench/components/RankingWorkbench.vue:39)、[PersonInspector.vue](/D:/Luca/Code/MyProject/BangumiStaffStats/frontend/src/workbench/components/PersonInspector.vue:31)、[AnalysisDashboard.vue](/D:/Luca/Code/MyProject/BangumiStaffStats/frontend/src/workbench/components/AnalysisDashboard.vue:32)、[SinglePersonCooperation.vue](/D:/Luca/Code/MyProject/BangumiStaffStats/frontend/src/workbench/components/SinglePersonCooperation.vue:250)、[position-data.json](/D:/Luca/Code/MyProject/BangumiStaffStats/frontend/public/workbench-data/position-data.json:1)。

<oai-mem-citation>
<citation_entries>
MEMORY.md:151-159|note=[Impeccable workflow context and historical prototype scope]
</citation_entries>
<rollout_ids>
019f51bd-2c83-7771-b968-507741a2c3a6
</rollout_ids>
</oai-mem-citation>

