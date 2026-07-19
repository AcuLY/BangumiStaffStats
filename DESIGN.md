# Bangumi Staff Statistics · Design System

> 适用范围：人物排行、共同参与分析，以及两者共享的查询与人物列表组件。
>
> 视觉来源：`co-star-single-workbench-v4.html` 的高密度数据工作台结构；组件语言以项目现有 Naive UI 2.42 为准。原型使用原生 HTML/CSS 模拟 Naive UI，生产实现应直接使用 Naive UI 组件。

## 1. 产品气质

这是面向 Bangumi 用户的高密度数据工作台，不是营销页，也不是通用 SaaS 后台。

- 数据优先：通过对齐、表格、进度和明确口径建立可信度。
- 密集但不微小：连续正文与常规项目自有控件文字不低于 14px；辅助文字、图表标签与表格次要信息不低于 12px。Naive UI 原生 preset 由组件库管理，不作为项目字号例外。
- 粉色主导：粉色表示品牌、主操作、当前模式和关键选中态。
- 单一品牌色：粉色承担品牌、主操作、焦点和信息提示；人物 B 与次要数据使用中性色区分。
- 中性色组织：页面、卡片、表格、普通数据与非激活控件均使用黑白灰层级。
- 单一工作台：排行与共同分析共享查询和人物数据，但保留不同任务语义。

## 2. 信息架构

```text
App Header
├─ Header Bar
│  ├─ Brand
│  ├─ Mode Tabs: 人物排行 / 共同参与分析
│  └─ Theme
└─ Query Workspace · integrated disclosure
   ├─ Applied Query Summary · collapsed state
   └─ Query Editor · expanded state

Main Workspace
├─ Ranking
│  ├─ RankedPersonList · ranking variant
│  └─ PersonInspector · panel / mobile drawer
└─ Co-star
   ├─ Candidate Rail / mobile drawer
   │  ├─ Applied-position tabs
   │  └─ PersonPicker candidate tiles + selected tray
   └─ Relationship Analysis
```

### 查询状态

Query Workspace 是 App Header 的第二行集成 disclosure，同时服务人物排行与共同参与分析。收起态显示已应用查询摘要，并以右侧 edit 图标进入 Query Editor；展开态由 Query Editor 替代摘要，并以 chevron 收起。Desktop 展开时编辑器作为固定 Header 的覆盖层呈现，不改变 Main Workspace 的布局高度。

Desktop Header 固定在视口顶部，页面只为收起态 Header 保留起始间隙；Main Workspace 自身保持至少 `100dvh`。展开 Query Editor 时 Header 高度不参与文档流，并以 `100dvh` 为最大高度独立滚动。`<780px` 时 Header 回归正常文档流，不让双行导航与查询 disclosure 长期遮挡结果。

一次完整查询是一个原子提交：

```text
Applied Query = Work Scope + Positions for current mode
```

- Work Scope 包含数据来源、用户、条目类型、收藏状态、合并续作和高级条件；合并续作作为动画查询参数放在“更多选项”中。
- “更多选项”按基础开关、时间范围、评分范围、评分规模和标签五组呈现；双列时同组条件成对同行，单列时保持相同语义顺序。条件顺序固定为 `NSFW / 合并续作`、`播出时间 / 收藏时间`、`我的评分 / 全站评分`、`个人－全站评分差 / 全站评分人数`、`正向标签 / 反向标签`。
- 收藏人数范围不再作为查询条件，由全站评分人数范围替代。收藏时间指收藏记录最后更新时间，不等同于首次收藏时间；收藏时间和评分差必须提供可访问的 info 说明。
- 播出时间与收藏时间共用月份起止和“近 1 / 3 / 5 年、指定年代”快捷范围。我的评分、收藏时间和评分差仅在个人收藏模式显示；全站评分与全站评分人数在两种数据来源下均可用。
- Positions 使用有序数组表达；数组顺序只用于默认展示顺序，查询结果按职位集合计算。
- 人物排行当前 UI 只允许选择一个职位，但状态始终写入 `positionsByMode.ranking: [position]`，不使用不可扩展的单值字段。
- 共同参与分析允许一次提交 `1..N` 个职位。职位输入使用单选 selector 加独立加号按钮，每次把一个职位 append 到有序已选列表；selector 不再重复显示已选 tag。
- 已选职位列表是 draft 职位的唯一完整表达，支持逐项移除；第一项标记为默认候选分组，新增和移除都保持数组顺序。
- 修改 draft 时保留已应用查询及当前结果；只有“应用查询”才同时更新作品范围和职位。

| 状态 | 摘要 | 编辑器 | 焦点 |
|---|---|---|---|
| summary | 显示 | 隐藏且 inert | edit disclosure 可聚焦 |
| editing | 隐藏 | 显示 | 首个有效字段 |
| loading | 隐藏 | 显示 | 取消查询仍可用 |
| success | 显示 | 隐藏且 inert | 查询摘要或结果标题 |
| error | 隐藏 | 显示 | 首个错误字段 |

摘要保留“作品范围 / 当前模式职位”两个语义组，但视觉上只展示参数值，不显示组名或数字序号，值不做 tag；所有宽度下都必须自然换行并完整展示，不使用 ellipsis 截断查询参数。收起态 edit 按钮与展开态 chevron 都只显示图标，视觉尺寸与普通控件一致且命中区至少 44px，必须有动态 `aria-label`、`title`、`aria-expanded` 和 `aria-controls`。

### 模式职责

人物排行：

- Query Workspace 中的排行职位当前是单选，因此排行局部工具栏不再重复职位选择。
- 状态和计算必须对未来多职位查询兼容：人物必须在已选作品范围内同时拥有全部职位才进入结果；该人在各职位下的参与作品取 union，按 Subject ID 去重后计算作品数、均分、综合分和相对偏好。
- 未来开放排行多职位时，只替换 Query Workspace 的职位输入形态，不改查询数据结构和排行计算口径。
- 默认不提供人物搜索；若正式数据量显著增长，可在列表级插入“筛选当前结果”槽位。
- 排行排序提供作品数、我的均分、综合分、相对偏好四种维度；相对偏好只在个人收藏模式可用。维度选择与独立升降序按钮放在同一行的紧凑控件组中，改变任一项后回到第 1 页。
- 行点击表示聚焦一个人物，并在桌面 inspector / 移动 drawer 中展示完整信息。

共同参与分析：

- Query Workspace 一次应用作品范围和 `1..N` 个参与职位；提交后候选结果刷新并回到第 1 页。
- 多职位查询产生“同一作品范围下、每个职位各自的候选人物集”，不要求候选人物同时拥有全部职位。
- 候选栏通过本地 tabs 浏览已应用职位，默认打开有序数组中第一个职位。切换 tab 只切换当前候选视图，不重新查询作品范围或职位数据。
- 候选人物搜索、分页和当前 tab 都是已应用结果上的本地状态，不属于 Applied Query。候选默认按当前职位作品数降序，不再提供选择状态或排序控件。
- 人物选择以 `personId + positionId` 身份为单位；整行点击选择或取消当前职位身份，已选人物中可管理同一人的多个已应用职位。已选条目保留头像、主名称、身份与数字序号；身份变化后分析结果立即刷新。
- 右侧始终是关系分析，不复用人物 inspector。

## 3. 颜色

### 品牌与功能主色

鲜粉 `#FF2075` 只用于 Header 顶线、标志等较大品牌装饰。需要承载白字的按钮与 tab 使用对比度合格的深粉。

```css
:root {
  --brand-decorative: #ff2075;

  --primary: #c60475;
  --primary-hover: #d42281;
  --primary-pressed: #b40069;
  --primary-soft: #fff0f6;
  --primary-text: #a30660;

}
```

关键对比度：

- `#C60475` / 白：约 5.71:1。
- `#D42281` / 白：约 4.83:1。
- `#A30660` / 白：约 7.63:1。

### Light

```css
:root,
:root[data-theme="light"] {
  color-scheme: light;

  --canvas: #f5f5f7;
  --surface: #ffffff;
  --surface-subtle: #fafafc;
  --surface-sunken: #f7f7fa;
  --hover: #f3f3f5;
  --pressed: #ededef;

  --border: #e0e0e6;
  --divider: #efeff5;
  --control-border: #c8c8d0;

  --text-1: #1f2225;
  --text-2: #333639;
  --text-3: #646a70;
  --disabled: #91969b;

  --chrome: var(--surface);
  --chrome-raised: var(--surface-subtle);
  --chrome-text: var(--text-1);
  --chrome-muted: var(--text-3);
  --chrome-border: var(--border);
  --focus-on-chrome: var(--focus);

  --success: #0e6b4d;
  --warning: #845a0f;
  --error: #ba2b2e;
  --overlay: rgba(31, 34, 37, .48);
}
```

Light 模式的 Header 使用白色半透明 chrome：`--chrome` 映射到白色 `--surface`。Header、查询浮层和移动端 drawer 统一使用 `--translucent-chrome-*` 语义变量；背景、hover、pressed、边界、滤镜和无滤镜回退值不得在组件内重复硬编码。移动端 drawer 使用透明但可交互拦截的 mask，使模糊层直接合成在页面主体之上，不在两者之间垫一层均匀黑色。人物详情 drawer 通过公开的 height 参数从 Header 第一段的实测底部开始，内容不会进入第一段背后；详情标题在抽屉内部吸顶，不覆盖 Naive UI 内部节点。模式 tab、主题按钮、文字和边界必须使用同一组 chrome semantic tokens，不保留浅色下的深色 Header 硬编码。表格、矩阵、图表、rail 和 drawer 也都必须显式绑定 semantic token。

### Dark

```css
:root[data-theme="dark"] {
  color-scheme: dark;

  --canvas: #101014;
  --surface: #18181c;
  --surface-subtle: #202024;
  --surface-sunken: #151519;
  --hover: #2a2a2f;

  --border: #3d3d43;
  --divider: #303036;
  --control-border: #515158;

  --text-1: #f5f5f7;
  --text-2: #d2d2d7;
  --text-3: #a5a5ad;
  --disabled: #72727a;

  --primary: #d91a80;
  --primary-hover: #e63893;
  --primary-pressed: #bd0b6d;
  --primary-soft: #3b1428;
  --primary-text: #ff8abd;

  --overlay: rgba(0, 0, 0, .68);
}
```

Dark 模式的层级来自表面亮度差与 1px 边框，不依赖大片纯黑或宽阴影。

### 使用预算

- 粉色：主按钮、当前 mode tab、关键选中行、当前排行维度、人物 A 和主数据系列。
- 中性色：人物 B、普通行、共同部分、额外人物/系列与非激活控件。
- 琥珀/红/绿：只表示 warning/error/success，不作装饰。

## 4. Naive UI 组件映射

### Naive UI 样式边界

- 组件自身的高度、字号、内边距和紧凑度只通过 Naive UI 原生 `size` prop 选择，不用项目 CSS 重写。
- Naive UI 原生 size preset 属于组件库边界，不参与项目字号机械调整；项目在 `GlobalThemeOverrides` 中主动写入的字号属于项目样式，必须映射到本文语义阶梯并纳入字号审计。
- 项目样式不得命中 `.n-*`、`:deep(.n-*)` 或 `--n-*` 内部变量；`npm run check:naive-css` 负责阻止回归。
- 页面布局只能作用于自有容器或组件实例上的自有 class。若 Naive UI 没有对应布局 prop（例如窄屏 Pagination 换行），必须用自有 class 隔离并在代码中注明特殊原因，不得继续选择内部节点。

| 场景 | 生产组件 | 原型表现 |
|---|---|---|
| 全局主题 | `NConfigProvider` | CSS semantic tokens |
| 顶部模式 | `NTabs type="segment"` | Header Bar 内的 segmented tabs |
| 查询容器 | Header disclosure + `NCollapseTransition` | Header 第二行；收起态显示摘要，编辑器内“更多选项”平滑展开 |
| 职位输入 | `NSelect`, `NButton` | 排行单选但写入数组；共同分析为单选 selector + 加号 + 有序已选列表 |
| 候选职位浏览 | `NTabs` / 移动窄屏 `NSelect` | 只切换本地视图，不发起查询 |
| 输入/选择 | `NInput`, `NInputNumber`, `NDatePicker`, `NSelect` | 数值范围沿用双侧步进按钮；36px control，6px radius |
| 收藏状态 | `NCheckboxGroup` | 可换行选择 chip |
| 主/次操作 | `NButton` | primary / default |
| 条件开关 | `NSwitch` | 深粉 active rail |
| 人物列表 | `NDataTable` 或 `NList` | 共享 ranked-person primitive |
| 排行与作品表 | `NDataTable` | striped、sorting、scroll-x |
| 人物详情 | `NCard`, `NStatistic` | desktop panel / mobile drawer |
| 移动详情与选人 | `NDrawer` | bottom inspector / bottom picker |
| 分页 | `NPagination` | 数字页码 + 前后页；人物排行使用 5/10/20 size picker，其他列表使用 5/10/20/50 |
| 查询标签 | `NDynamicTags` | 具名“添加标签”触发按钮，命中区至少 44px |
| 状态与身份 | `NTag type="primary"` | 已选职位使用强调色 compact tag |
| 格内角色身份 | `CharacterRoleTag` | 排行作品、角色来源与共演列表共享；主角/主役由组件统一强调 |
| 说明 | `NTooltip`, `NPopover` | portal 到 body，禁止伪元素 tooltip |
| 空状态 | `NEmpty` | 标题 + 一个主操作 |
| 通知 | `NMessage`, `NNotification` | 非阻塞反馈 |

同一人物或角色下的格内身份列表统一按 `主角/主役 → 配角 → 客串 → 其他` 展示；同类型条目保持原始顺序。可见项、折叠计数、完整 Tooltip 与无障碍文本必须消费同一份排序结果。

### 基础尺寸

```css
--radius-card: 8px;
--radius-control: 6px;
--touch-target-min: 44px;
--content-image-aspect-ratio: 3 / 4;
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
```

所有常规交互控件共享严格断点：视口 `<780px` 使用 Naive UI `small`，视口 `≥780px` 使用 `medium`；780px 本身必须落入 `medium`。该规则覆盖主控件与辅助控件，包括 Header modes、Query Editor、日期快捷项、年代与数值范围、工具栏、PersonPicker、分页、图表切换和 Select popup。Select trigger 与 menu 必须使用同一档 size，不得用 CSS 强制统一高度，也不得保留 480px 或 Drawer 专属的 `large` 例外。

视觉上需要保持紧凑的自实现控件可使用 22 / 28 / 34px 的可见盒，但交互命中区仍至少为 `--touch-target-min`。Header 主题按钮是独立视觉规格：`≥780px` 为 38px、`<780px` 为 34px，外层命中区均为 44px，图标固定 18px。icon-only disclosure、信息、加号、移除和关闭操作也都使用至少 44px 命中区。查询摘要保留“作品范围 / 当前模式职位”两个可访问语义组，视觉上只展示参数值，不把值做成 tag；收起态使用 edit 图标进入编辑，展开态使用 chevron 收起，不另设“修改查询”文字按钮或编辑器内的重复关闭入口。内容卡片禁止玻璃拟态和装饰性渐变；半透明与 `backdrop-filter` 只用于全局 chrome 层，包括 Header、查询浮层和移动端 drawer，不下放到普通内容卡片。禁止巨型圆角、pill 与小圆角混排，以及随机彩色系列。

### 外部内容图片

**3:4 内容图片规则。** 所有从外部内容源加载的人物、角色和作品图片统一使用 `--content-image-aspect-ratio: 3 / 4`。适用范围包括排行、候选与已选人物头像，Person Inspector 肖像，共同分析 Hero 与指标引导头像，角色完整卡片与缩略卡片，以及作品列表、偏好列表和共同作品中的封面。品牌标志、功能图标、评分星标和图表不属于此规则。

- `SafeImage` 是内容图片比例的唯一所有者。调用方只声明语义宽度，不得传入独立高度；图片固有 `width` / `height` 属性也必须按 3:4 派生。业务组件与响应式 CSS 不得覆盖该比例，或重新写入与宽度不匹配的固定高度。
- 宽度可按语义角色和断点变化，高度必须始终由 `width × 4 / 3` 自动计算。Desktop、tablet、mobile、列表、Drawer 与 Hero 均无比例例外；空间不足时缩小宽度或重排内容，禁止压成正方形、3:2 或通过拉伸填满容器。
- 内容图片在 3:4 媒体框内使用 `object-fit: cover`，禁止非等比拉伸。人物与角色使用 `object-position: center 20%` 优先保留面部，作品封面使用居中裁切；需要调整构图时只改变裁切焦点，不改变比例。
- 加载中、加载失败和无图片占位必须占用同一个 3:4 媒体框，避免布局跳动。占位图标不参与比例计算，其视觉尺寸由图标系统另行定义；任何占位状态都不得改变外层几何尺寸与可访问名称。

### Typography

字体栈固定为：

```css
"Source Han Sans SC VF", "Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC", sans-serif
```

数据工作台使用固定 rem 字级，不使用随视口变化的 `clamp()`：

| Token | Size | Role |
|---|---:|---|
| `--text-micro` | 10px | 空间受限且有可访问名称的图表刻度与极次要图表信息 |
| `--text-caption` | 12px | 辅助信息、图表与表格标签 |
| `--text-control` | 14px | 项目自有控件、字段标签、紧凑数据值 |
| `--text-body` | 14px | 正文、人物名、主要列表内容 |
| `--text-subheading` | 16px | 阶段标题、局部分组标题 |
| `--text-section` | 20px | 面板标题 |
| `--text-panel` | 24px | 主要结果标题 |
| `--text-page` | 28px | 页面或人物主标题 |

- 项目自有 Naive theme override 必须使用 rem 并落在同一偶数阶梯：模式 Tabs 使用对应 preset，不通过局部 CSS 改字号；同一 `small` / `medium` preset 在所有业务区域保持同一含义。结果统计可按信息密度使用 16/18/20px 对应的 `1/1.125/1.25rem`，其中 18px 只作为 `NStatistic` 的响应式数据档，不扩展为通用正文或标题 token。
- Naive UI 原生 preset 的内部字号不复制进项目 token，也不做机械改写。
- 项目 CSS 的 `font-size` 只引用语义 token，不直接写 px；项目 override 只写 rem。历史 13/19/23/27px 分别上调并归入 14/20/24/28px 语义级，不保留奇数字号分支。
- `--text-control` 与 `--text-body` 同为 14px 是刻意合并数值而非合并职责：控件依靠 600 权重、颜色与控件结构建立层级，正文依靠 400 权重与 1.5–1.65 行高建立阅读节奏；两个语义 token 继续分开，避免未来按职责调整时重新追踪选择器。
- `<780px` 的 Query Editor 使用一组明确的结构标签例外：编辑器 disclosure 标题和字段标签为 `--text-caption`（12px），阶段标题为 `--text-body`（14px）；输入、Radio、Button、Select 等实际控件使用 `small` preset。`≥780px` 时实际控件统一使用 `medium`。
- `<780px` 的人物排行主列表使用明确的紧凑行例外：排名、人物主名、人物副名和四项主指标统一为 `--text-caption`（12px），依靠 600/400 权重、颜色和列位置维持层级；`≥780px` 排行行继续使用 14px 主名、排名与指标，副名保持 12px。
- 权重只使用 400（正文）、600（标签、选中态、人物名）和 700（标题）。
- 连续正文至少 14px / 1.5；辅助信息至少 12px。
- 图表内部空间极受限的轴标签可使用 10px `--text-micro`；其他辅助文字不低于 12px。微型字号必须同时提供可访问名称，且不用于查询、导航、人物名或连续正文。
- 人物、评分、计数与分页数字默认使用 tabular numerals。

### 换行、截断与完整文本

- Query Summary 的已应用查询参数在所有宽度下自动换行并完整展示；不得使用单行省略或多行截断。Header 高度随摘要内容自然增长，并由现有 Header 高度同步机制为 Main Workspace 保留准确空间。
- 人物选择器、职位列表等高密度紧凑列表允许对单个人物名或职位名使用单行 ellipsis，但截断节点必须同时提供内容完全一致的原生 `title`，使指针悬停时可以查看全文。承载多个身份、人物或职位的集合型文本应优先换行，不得把整组信息压成一个省略项。
- 作品中文主标题最多显示两行，超出后截断；日文副标题固定单行，超出后显示 `…`。两者都必须提供内容完全一致的原生 `title`，以便查看完整标题。

### 样式文件边界

`styles/workbench.css` 只负责按级联顺序导入模块，不承载业务规则。模块按全局壳层、排行列表、排行详情、人物选择、分析面板、查询工作区和响应式覆盖拆分；单个业务 CSS 模块保持在 500 行以内。新增职责时新建或归入对应模块，不把规则重新堆回入口文件，也不为拆分而改变既有选择器顺序。

## 5. 共享人物排行组件

### `RankedPersonList`

```ts
type RankedPersonListVariant = 'ranking' | 'cooperation'

interface RankedPersonListProps {
	variant: RankedPersonListVariant
	items: Array<Person | CooperationPerson>
	rankOffset?: number
	metric?: 'count' | 'average' | 'overall' | 'preference'
	focusedId?: number
	averageLabel?: string
}

interface RankedPersonListEmits {
	activate: [personId: number]
}
```

### 启用矩阵

| 行为 | 排行 | 单人物合作排行 |
|---|---|---|
| leading | 排名 | 排名 |
| identity | 中日文名 | 主名称与合作职位 |
| progress | 当前排行维度进度 | 默认关闭 |
| metrics | 作品数、均分、综合分、相对偏好始终同时显示；当前排序列只改变高亮 | 同一套指标结构，文案使用合作口径 |
| whole-row click | 聚焦人物并打开详情 | 聚焦合作人物并更新共同作品 |

共同分析的候选列表不再经过 `RankedPersonList` 的 candidate 分支，而由 `PersonPicker` 维护其真实的候选 tile、选择态、已选人物 tray 与分页。`selected-tray` / `selected-person-row` 仍是有效结构，必须保留；只删除无消费者的旧 `--selected-row-height` token。排行/合作行高为 `≥780px` 72px、`<780px` 68px；PersonPicker 候选行为 `≥780px` 64px、`<780px` 60px；偏好作品行固定 52px。

### 排行维度进度

进度使用当前已应用查询、当前排行职位集的完整结果集作为分母，不使用当前分页：

```ts
progress = value / max(allResultValues) * 100
```

- 作品数：`subjectCount / maxSubjectCount`。
- 我的均分：`userAverage / maxUserAverage`。
- 综合分：`overall / maxOverall`。
- 相对偏好：以零点为中心，正值向右、负值向左，各自按完整结果集中的最大绝对值缩放到半行宽；零值不显示宽度。
- 视觉最小宽度仅用于保证可见，不得作为真实百分比朗读。

普通维度的进度必须表现为排行行背景中的半透明粉色矩形，宽度对应上述比例；相对偏好使用中央基线，正向为浅粉、负向为中性灰，并同时显示正负号，不能只依赖颜色表达方向。文本与交互层位于其上方。禁止底部线状进度、渐变进度和 pill 形进度。聚焦态还需使用边框、焦点环或图标等非颜色线索。

### 相对偏好口径

相对偏好回答的是“用户对这些作品的评分，比全站评分高或低多少”。该维度采用与现有综合分严格一致的数量收缩结构，不计算分值边际效应，不校准用户个人的宽松度或评分斜率，也不按全站评分票数修正：

1. 单部作品偏好为 `个人评分 - 全站评分`，0 是有效的中性结果，必须参与平均。
2. 默认每部有效作品是一个统计单元；启用合并续作时，先对同系列作品的单部偏好求算术平均，再让每个系列等权。
3. `n` 是有效作品数，或合并后的有效系列数，必须为整数。
4. 人物最终偏好分为 `平均偏差 × n / (n + 5)`，即以 5 个中性作品作为 0 分先验，和现有综合分的作品数量加权完全同形。

人物偏好结果保留有效作品数、涉及系列数、整数统计单元数、未收缩平均偏差和收缩后得分。1–2 个统计单元标记为低样本，3–9 个为中等样本，10 个及以上为高样本；无有效评分对时显示 `—` 并排在有结果人物之后。

### 排序与分页

- 排序状态由 `sortBy: 'count' | 'average' | 'overall' | 'preference'` 与 `ascend: boolean` 独立表达；两项控件同行展示，不占用两行工具栏。切换全站模式时若当前为相对偏好，回退到作品数。
- 分页使用 Naive UI `NPagination` 的数字页码、前后页、当前页状态与 size picker，page size 固定为 `5 / 10 / 20 / 50`。
- `AdaptivePagination`、页码按钮与 size picker 全部遵循 `<780px = small`、`≥780px = medium`；不得根据页数、列表类型或 Drawer 状态另选尺寸。
- 当前页保持可操作且使用 `aria-current="page"`，不能通过 `disabled` 表达选中。
- 改变排序维度、升降序或 page size 时回到第 1 页；列表总数只显示人数，不在标题中重复页码。

## 6. Person Inspector

### 共享作品浏览器

人物详情的“参与作品”和共演分析的“共同参与作品”统一使用 `SubjectWorkBrowser`。标题、搜索与排序工具栏、`SubjectWorkList` 和 `AdaptivePagination` 只维护一套结构与响应式规则；页面通过 `role` / `participants` 插槽保留各自的身份语义。

搜索、排序、缺失值顺序、分页复位与页码收敛由 `useSubjectWorkBrowser` 统一管理。各页面只注入可搜索字段、排序选项与比较器；新增排序维度时扩展页面配置，不修改共享组件分支。人物排行、作品、角色与共同参与作品的“搜索 / 排序类型 / 升降序”始终组成同一行工具栏；升降序统一使用独立方向按钮，不使用第二个 select，窄屏通过弹性列宽收缩而不换行。工具栏输入、排序 selector、menu 与方向按钮统一消费全局 `small / medium` 断点；排序 selector 的触发框允许省略当前值，但展开菜单必须脱离触发框宽度并完整显示选项。

排行职位包含声优（position `102`）时，人物详情在同一浏览器标题区使用 `NTabs` 切换“作品 / 角色”。角色按 Character ID 聚合，同一角色来自多部作品时只出现一张卡片；完整卡片展示头像、中日文名、戏份类型和全部来源作品，缩略卡片严格只保留缩小头像与双语名。作品与角色各自保留搜索、排序、分页状态，共用缩略模式开关；非声优查询不出现角色 tab。人物排行顶部统计同时增加当前结果内去重后的角色数。

桌面放在排行右侧 panel；`<780px` 使用从底部弹出的 `NDrawer`，其顶部与 Header 第一行底边对齐并一直延伸到视口底部，点击上方未覆盖遮罩关闭。Header 第一行高为 `≥780px` 56px、`<780px` 52px；计入 3px 顶部品牌边后，Drawer 起点 fallback 分别为 59px / 55px。Drawer 内部标题栏固定 52px。

内容顺序：

1. 头像、中日文名与右上角职业/职位；不展示收藏人数、讨论数或“当前焦点”状态。
2. 直接展示人物简介正文，不显示重复的“人物简介”标题；可在信息较长时由用户主动折叠。
3. 参与作品、已评分、我的均分、全站均分、综合分、相对偏好、最高分、最低分。
4. 1–10 分个人评分分布。
5. “我更偏爱 / 我更保守”的代表作品；同时显示我的评分、全站评分和两者直接相减得到的单作偏好，并标注“本站计算”。
6. 作品 / 角色 tab（仅声优查询）、搜索、排序、每页数量、分页。
7. 作品模式展示封面、日期、Bangumi Rank、收藏人数、全站评分、个人评分和角色/职位；角色模式展示角色双语名、戏份类型与来源作品。

人物统计在详情容器宽度充足时使用放大的数字并将说明同行展示；容器变窄后自动恢复为数字在上、说明在下，禁止为维持同行而压缩或裁切说明。

Inspector 不展示人物 Person ID，也不提供“加入共同分析”操作。人物主名称后提供 Bangumi 人物页外链按钮；该按钮只承担外部资料跳转，不触发站内模式切换。

移动 drawer 要求：

- `aria-modal="true"`，背景 inert，body 锁滚动。
- `Esc`、关闭按钮、左侧遮罩均可关闭。
- Tab 被限制在 drawer 内。
- 关闭后焦点回到触发人物行。

## 7. 共同参与分析

### 工作区与已选人物

- 共同分析与排行使用相同的居中内容宽度、页面外边距和卡片分块语言；rail、page head、Hero、图表和表格区均是边界完整的 surface card，不允许 rail 与 main 直接贴满视口左右边缘。
- 避免卡片套卡片：一个语义分区只保留一层边框与表面；内部依靠分隔线、间距和排版建立层级。
- 查询编辑器中的参与职位使用“单选 selector + 加号”逐项添加，selector options 排除已选项。有序已选列表显示数字序号、职位名、第一项的“默认展示”状态和逐项移除操作；不在 selector 下再重复拼接整个职位字符串。
- 候选栏的职位 tabs 只来自共同分析的已应用职位数组；桌面用 tabs，窄屏可为避免溢出改用等价单选控件。两者都是本地结果导航，不是第二个查询入口。
- 候选搜索只筛选当前职位 tab 的已加载人物；分页只切分该本地结果。切换 tab、搜索词或 page size 时回到第 1 页。
- 已选人物条目使用紧凑布局，显示头像、主名称、多身份管理、移除操作和数字序号，不展示日文副名、作品数或 Person ID。
- 人物或身份变化后自动重算分析，加载状态在结果区就地表达；禁止额外“查看分析”或“重新运行”按钮。

### 人物 Hero

头像与文字分区，禁止把姓名、职位和均分全部压在照片上。

```text
Profile Card
├─ media: portrait
└─ content: name / position / counts / average
```

人物 A 使用粉色，人物 B 只使用中性灰文字或细描边。照片本身不得叠加大面积色彩 wash。

- 所有人数共用同一套人物卡 DOM、统一的 3:4 媒体比例、三项指标和响应式规则；恰好两人时只允许标题与合作默契口径不同，不改变人物卡视觉结构。逻辑状态只保留 `pair` 与 `group`，`group` 覆盖 3 人及以上，不为 5 人另建 `summary` 模式。
- 人物卡使用可换行的横向 tile；media 宽度由对应的响应式语义槽位决定，高度始终由 3:4 自动推导，不随卡片高度纵向拉伸。每张卡的“参与作品 / 已评分 / 我的均分”保持三等列，注释不换行且不得越出内容盒。
- 姓名、职位、均分和其他正文位于独立 content 区，不叠在照片上；Hero 不显示人物 Person ID。

### 参与作品分布

- 2 人、3–4 人和 5 人以上共用同一个逐人物比较组件；每位人物一行，显示参与作品总数、全员共同数和相对最大作品数的长度。
- 条形只编码比例，不在极窄区间内放文字。精确数量与“全员共同”口径始终位于条形外；极小的共同区间可保留 2px 可见下限，但不能篡改外部数值。
- 3 人以上的非共同部分统一称为“非全员共同”，不能称为“单独参与”，因为其中可能仍包含两两或部分人物交集。
- 3 人以上统一展示高频两两组合；两两关系矩阵始终直接展示，宽度超出时只在矩阵自身滚动，不按 5 人阈值切换信息架构或折叠模式。

### 图表

- 图表背景使用 surface 或透明。
- 网格线使用 divider。
- 主系列使用 pink，人物 B 使用中性灰；其余使用固定的灰阶、梅紫与暖色调色板，不引入青绿色点缀。
- 禁止按 Person ID 随机生成 HSL。
- 评分分布固定为 1–10 共 10 组，不展示“未评分”，使用 `repeat(10, minmax(0, 1fr))` 在可用宽度内重排；图表自身不得产生横向滚动条。
- 数值与分类标签必须位于图表内容盒内部，辅助字号不低于 12px；窄屏可减少非关键刻度密度，但不能缩小到不可读。
- 完整说明使用 `NPopover`，不使用会被 scroll container 裁切的绝对定位 tooltip。
- 图表切换控件遵循全局 `<780px = small`、`≥780px = medium`。可交互数据点默认视觉直径 8px，hover / keyboard focus 为 12px；最近点命中范围至少 44×44px，且图表使用自己的可见焦点表现，不套用普通按钮 focus ring。

人物评分洞察与所在卡片使用相同 surface 或透明背景，不增加独立异色底块；分组关系依靠标题、间距和分隔线表达。

### 表格

共同作品与排行表统一 `NDataTable` 语言：

- Header：`#FAFAFC` / dark surface-subtle。
- Row：surface；偶数行只允许极轻微条纹。
- Hover：hover token。
- Sorting：light `#FFF8FB`，不得整列高饱和粉底。
- 封面列固定，人物职位列给 `minWidth`。
- `scroll-x` 只属于表格容器，不允许页面横向滚动。

## 8. Overflow 所有权

页面只负责纵向滚动。永久 `body { overflow-x: hidden }` 不得用来掩盖布局错误；原型使用 `overflow-x: clip` 作为最终防护前，必须验证页面 `scrollWidth <= clientWidth + 1`。

允许横向滚动的局部容器只有：

- DataTable / shared works table。
- 人物关系矩阵。

评分分布等图表必须在容器内重排，不属于允许横向滚动的例外。图表根节点、plot 与所有 grid 子项均需 `min-width: 0`，并验证 `scrollWidth === clientWidth`。

```css
.data-scroll-x {
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  scrollbar-gutter: stable;
}
```

所有 grid/flex 子项必须设置 `min-width: 0`。头像、封面与 media 才能使用 `overflow: clip`；列表外壳不能裁掉 focus ring。

页面内嵌的纵向列表使用原生滚动链：列表自身可滚动时优先滚动列表；列表无需内部滚动时，列表上的滚动直接交给页面。查询浮层、移动端 drawer 等锁定背景的模态表面仍隔离滚动链。

### Scrollbar 视觉分级

Scrollbar 只分为壳层与组件两级，视觉宽度不得由各功能自行定义：

- 壳层 scrollbar 使用 `--scrollbar-shell-size: 10px`，适用于页面 viewport、Header 内的 Query Editor，以及两个移动端 Drawer 的外层滚动面。
- 组件 scrollbar 使用 `--scrollbar-component-size: 6px`，适用于 tooltip、作品列表、角色列表、已选人物列表、横向人物关系矩阵，以及 Naive UI Select / DatePicker / Pagination 的 popup。
- 两级共用 `--scrollbar-radius: 999px`；track 透明，thumb 默认使用 `--control-border`，hover 使用 `--text-3`，active 使用 `--text-2`。thumb 与相邻 track / surface 的边界对比度至少为 `3:1`。

原生 scrollbar 在 Firefox 使用 `scrollbar-width: auto / thin` 表达两级，在 Chromium / Safari 使用 WebKit scrollbar 精确应用 `10px / 6px`。Naive UI 的全局公开 `Scrollbar` theme override 固定为组件级 `6px`；移动端 Drawer 通过 `scrollbarProps.themeOverrides` 局部覆盖为壳层 `10px`，并保留 `native-scrollbar="false"`。不得选择 `.n-*` 私有类或改写 `--n-*` 内部变量。

Teleport 到应用根节点之外的 popup 必须从 root 级 token 取得 scrollbar 样式，不能依赖 `.workbench-app` 作用域。自定义样式必须保留既有 `scrollbar-gutter`、`overscroll-behavior` 与滚动所有权；视觉分级不得改变滚动链。外层 Drawer 与内部列表同时可滚动时，外层始终为 `10px`，内层始终为 `6px`。在 forced-colors 模式下将颜色控制交还系统，但仍保留两级尺寸与所有权语义。

## 9. Rail 与 Drawer

Desktop：

- 共同分析使用 320–348px rail；rail 与主内容之间保留 12–16px gap，二者都位于与排行一致的居中 workspace 内。
- 折叠按钮固定在 rail 与主内容的边界，不放在 App Header，也不属于 rail 滚动内容。
- 收起后保留 56px 窄 rail、已选人数和同一展开按钮。
- rail 具有基于收起态 Header 高度计算的确定视口高度；`PersonPicker` 是唯一纵向滚动所有者，但在无需内部滚动时将滚动链交给页面。
- 候选结果在可用宽度允许时使用紧凑双列 tile；tile 将排名与作品数合并为同一副行，不保留浪费横向空间的独立指标列。

Mobile：

- “选人”入口位于 App Header 的移动端上下文行，只在共同分析且 Query Editor 收起时显示，不承担 desktop collapse；入口不显示人物图标或“人物选择”标题，直接列出每位已选人物的“姓名 · 职位”，右侧复用 Query Summary 的 edit 图标。每个人物是完整换行单元，人数较多时允许 Header 随内容自然增高且不截断信息。
- Drawer 使用底部 sheet，宽度避开稳定的页面 scrollbar gutter；与人物详情 Drawer 一样从 Header 第一行底边延伸到视口底部，不保留 `min(88dvh, 760px)` 组件高度或内部 `min-height`。内部标题栏固定 52px。
- 内部 `min-width: 0`，自身纵向滚动。
- 打开后 query、main 和 header 背景控件 inert；关闭后焦点返回 Header 中的触发入口。

## 10. Responsive

| 范围 | 排行 | 共同分析 |
|---|---|---|
| `≥1180` | 完整指标列 + inspector | 348px rail；双列 Hero/analytics 可用 |
| `918–1179` | 保留当前排序指标，次要列按槽位收敛 | 320px rail；主内容分区单列 |
| `780–917` | 紧凑排行 + inspector | 300px rail；主内容分区单列 |
| `<780` | 单列排行 + 底部 inspector drawer | Header 选人入口 + 底部 picker drawer；主内容单列 |

移动端不得通过缩小文字或直接隐藏重要内容来解决宽度问题。

Header / Query Workspace 的响应式规则独立于两种业务模式：`≥780px` 固定覆盖页面，文档只保留收起态 Header 高度；Query Editor 展开时覆盖 Main Workspace 而不重新排版。`<780px` 始终回归文档流。查询摘要在所有宽度下完整换行展示所有已应用条件，不使用 ellipsis；移动端仍可通过结构调整将参数分行，但不得隐藏内容。480px 只允许继续承担必要的内容重排或列降级，不得再改变交互控件 size。

## 11. 文案

- 前端只展示用户任务、数据口径和状态。
- 组件复用方式、共享状态、开发约束只写在代码注释或本文档中。
- 避免大段说明；优先使用明确 label、tooltip、tag、状态图标和 `details`。
- 派生指标标记为“本站计算”，并提供计算说明。
- “我的均分”遵循项目现有个人收藏规则：`collection.rate = 0` 不计入均分，但作品仍计入数量；均分向下截取两位小数。

## 12. Accessibility

- 正文对比度至少 4.5:1；边界、focus 与图形信息至少 3:1。
- 连续正文与常规项目自有控件文字不低于 14px，辅助信息不低于 12px；Naive UI 原生 preset 不由项目 CSS 或局部 theme override 缩小，不得为了避免 overflow 将局部字号降到规则以下。
- 所有自实现交互统一使用 2px 粉色 `:focus-visible` ring 与 2px offset；Naive UI 控件保留组件库自身焦点表现，图表保留专用焦点表现。列表、tray、浮层和媒体容器不得裁掉外扩焦点环。
- Info 操作的可见盒为 24px、图标 16px、命中区 44px；简介展开/收起使用 12px 文字、32px 可见布局、44px 命中区。
- Footer 链接与所有可聚焦的溢出触发器命中高度至少 44px。
- 图表颜色必须有文字、形状、位置或 pattern 的冗余编码。
- 隐藏 panel 使用 `hidden/inert/aria-hidden` 的一致状态，不留下可 Tab 的控件。
- 原生 select 使用明确 label；icon-only 按钮提供 `aria-label`。
- 所有文本输入在有值时提供清除按钮；空值时不保留不可见清除按钮的尾部槽位，避免窄屏输入区被无效压缩。
- 工作台 tooltip 使用统一视口边界：支持上下翻转，距可视视口至少 12px；长文本换行，超高内容在浮层内滚动，视口变化后重新校正位置。
- 尊重 `prefers-reduced-motion`。

## 13. 验收

每个 mode 在 Light / Dark 下验证 `360、390、768、779、780、781、917、1185、1440px`；其中 779px 必须为 `small`，780px 与 781px 必须为 `medium`：

- 页面 `scrollWidth <= clientWidth + 1`。
- 所有外部人物、角色和作品图片在 Light / Dark、全部验收宽度及加载中、加载失败、无图片状态下均保持 3:4；运行时满足 `abs(width / height - 0.75) <= 0.01`。响应式只允许改变语义宽度，不得改变比例或注入独立高度。
- 所有 tooltip 在窄屏、视口边缘和内容换行后仍完整落在可视视口内，且不会扩大页面 `scrollWidth`。
- Query Workspace 是 Header 第二行的集成 disclosure；收起态显示摘要并使用 edit 图标进入编辑，展开态由 Query Editor 替代并使用 chevron 收起，二者正确反映 `aria-expanded`。
- Query Editor 在 `<780px` 时依次使用 12px 编辑器标题、14px 阶段标题、12px 字段标签；`≥780px` 时对应为 16px、16px、14px。全部 Naive UI 控件、Select menu 与辅助切换同时命中统一的 small / medium 档。
- 人物排行主列表在 `<780px` 时排名、主副姓名与四项指标均为 12px；`≥780px` 时排名、主姓名与指标为 14px，副名为 12px。所有排行行必须消费同一规则，不能只缩小选中行或当前排序列。
- Desktop Header 固定覆盖页面；Main Workspace 顶部保留准确的收起态 Header 间隙且自身至少为 `100dvh`。Query Editor 展开不会推动结果区，并可在 Header 内独立滚动；`<780px` Header 回归文档流。
- 所有可滚动表面只使用两级 scrollbar：页面、Header Query Editor 与移动端 Drawer 外层为壳层 `10px`，tooltip、列表、矩阵及 popup 为组件层 `6px`；两级在 Light / Dark、hover / active、forced-colors 与外层/内层同时滚动时均保持正确样式、至少 `3:1` 的边界对比度和原有滚动所有权。
- 查询摘要保留“作品范围 / 当前模式职位”两个可访问语义组，视觉上只显示参数；所有宽度下自动换行并完整显示全部已应用条件；edit 与收起 chevron 的纵向位置一致，使用紧凑视觉盒与至少 44px 命中区。
- 更多选项的五组语义顺序在双列和单列布局中保持一致；两个时间范围可应用快捷范围，个人模式可同时应用我的评分、全站评分、评分差和全站评分人数，切换全站模式后不展示或执行个人专属条件。
- 作品范围和当前模式的职位作为一次原子查询提交，draft 未提交时不覆盖已应用结果。
- 排行职位 UI 只允许一个职位，但状态为数组；使用测试数据注入多职位后，人物按全职位交集过滤，作品按职位 union 去重计算。
- 共同分析通过单选 selector + 加号 + 有序已选列表应用 `1..N` 个职位；第一项是默认候选分组，本地切换职位 tab 不重新查询。
- 候选搜索、分页、职位 tab 和人物身份选择均在已应用结果上本地生效；身份变化立即重算分析。
- Desktop 候选结果在 rail 内使用紧凑双列；人物名、排名与作品数无截断碰撞，选中状态图标位于头像上层。人物名或职位名采用单行 ellipsis 时必须具有完整 `title`。
- 作品列表中文主标题最多两行，日文副标题单行显示；超出时分别截断或显示 `…`，且两者都有完整 `title`。
- 声优查询的排行统计同时显示人物、条目和去重角色数；非声优查询不显示角色统计。
- 声优人物详情可通过 `NTabs` 切换作品和角色；角色按 Character ID 跨作品聚合，完整卡片含双语名、戏份类型和全部来源作品，缩略卡片只含缩小头像与双语名，两个模式均可搜索、排序和分页。
- 排序包含 count / average / overall / preference，维度与升降序同行且相互独立；排行榜在个人收藏模式始终同时显示作品数、均分、综合分和偏好分，排序只改变对应列高亮；全站模式不提供 preference 排序。
- 人物排行、人物详情作品/角色和共同参与作品的搜索、排序类型、升降序控件在所有验收宽度下保持同一行，无横向溢出；同一断点下相同 Naive UI preset 的 computed 尺寸一致，Select trigger 与 menu 同档且菜单选项无省略。
- 排行进度随当前排行维度变化；普通维度为半透明粉色矩形，相对偏好以零点为中心并同时用方向、颜色和正负号编码，无底部线状进度。
- 相对偏好只使用个人与全站均有效的评分对，单作直接以个人评分减全站评分；详情显示有效作品数、平均偏差、作品数权重和收缩后得分。人物得分严格使用整数 `n` 和 `n/(n+5)` 数量权重。
- 原型数据可由 `npm --prefix frontend run generate:workbench -- --jsonlines-dir <dump>` 离线重建；收藏行原样保留，站评、评分票数、系列关系、职位和人物关联来自同一份完整 JSONLines dump。
- `NPagination` 有数字页码和前后页；人物排行每页最多 20 人，候选人物及作品/角色列表仍提供 5/10/20/50 size picker；所有分页在 779/780/781px 分别命中 small/medium/medium。
- 排行行不重复固定职位。
- 所有可见人物信息均无 Person ID。
- Inspector 简介初始展开且无加入分析操作；人物主名称后提供可访问的 Bangumi 人物页外链按钮。
- 人物评分洞察不使用独立异色底。
- Inspector 信息完整；移动端从 Header 第一行底边弹出并覆盖到视口底部，可点上方遮罩关闭；PersonPicker Drawer 使用相同高度链，两者内部标题栏均为 52px。
- Desktop rail 边界按钮可收起/展开；mobile picker drawer 可用 Esc/遮罩/关闭按钮收起。
- Desktop `PersonPicker` 在自身无需内部滚动时由页面继续滚动，rail 高度始终受当前收起态 Header 高度约束。
- 共同分析与排行采用相同外边距和完整 card workspace；已选人物紧凑、分析自动刷新且无“查看分析”按钮。
- 共同分析 Hero 使用既定响应式 media 宽度与 3:4 比例，高度由比例自动推导且不纵向拉伸；文字不压在图片上。
- 评分分布图 `scrollWidth === clientWidth`；仅表格与矩阵允许自身横向滚动。
- 连续正文与常规项目自有控件文字至少 14px、辅助文字至少 12px；10px 仅用于具备完整可访问名称的空间受限图表信息，Naive UI 原生 preset 不计入项目 token 的机械改写。
- Light Header 是白色半透明 chrome，tab、按钮、文字和边界使用 light semantic tokens；Light 表格/矩阵/图表无暗色硬编码；Dark 无纯黑断层。
- Console 无 error；无重复 ID；两个 JSON snapshot 均可解析。
