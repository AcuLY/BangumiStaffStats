# Bangumi Staff Statistics · Design System

> 适用范围：人物排行、共同参与分析，以及两者共享的查询与人物列表组件。
>
> 视觉来源：`co-star-single-workbench-v4.html` 的高密度数据工作台结构；组件语言以项目现有 Naive UI 2.42 为准。原型使用原生 HTML/CSS 模拟 Naive UI，生产实现应直接使用 Naive UI 组件。

## 1. 产品气质

这是面向 Bangumi 用户的高密度数据工作台，不是营销页，也不是通用 SaaS 后台。

- 数据优先：通过对齐、表格、进度和明确口径建立可信度。
- 密集但不微小：正文不低于 13px，辅助文字、图表标签与表格次要信息不低于 12px。
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
│  ├─ RankedPersonList · focus variant
│  └─ PersonInspector · panel / mobile drawer
└─ Co-star
   ├─ Candidate Rail / mobile drawer
   │  ├─ Applied-position tabs
   │  └─ RankedPersonList · candidate variant
   └─ Relationship Analysis
```

### 查询状态

Query Workspace 是 App Header 的第二行集成 disclosure，同时服务人物排行与共同参与分析。收起态显示已应用查询摘要；展开态由 Query Editor 替代摘要。右侧 chevron 通过 `aria-expanded` 展开或收起 Query Editor；Desktop 展开时编辑器作为固定 Header 的覆盖层呈现，不改变 Main Workspace 的布局高度。

Desktop Header 固定在视口顶部，页面只为收起态 Header 保留起始间隙；Main Workspace 自身保持至少 `100dvh`。展开 Query Editor 时 Header 高度不参与文档流，并以 `100dvh` 为最大高度独立滚动。`<=780px` 时 Header 仍回归正常文档流，不让双行导航与查询 disclosure 长期遮挡结果。

一次完整查询是一个原子提交：

```text
Applied Query = Work Scope + Positions for current mode
```

- Work Scope 包含数据来源、用户、条目类型、收藏状态和高级条件。
- Positions 使用有序数组表达；数组顺序只用于默认展示顺序，查询结果按职位集合计算。
- 人物排行当前 UI 只允许选择一个职位，但状态始终写入 `positionsByMode.ranking: [position]`，不使用不可扩展的单值字段。
- 共同参与分析允许一次提交 `1..N` 个职位。职位输入使用单选 selector 加独立加号按钮，每次把一个职位 append 到有序已选列表；selector 不再重复显示已选 tag。
- 已选职位列表是 draft 职位的唯一完整表达，支持逐项移除；第一项标记为默认候选分组，新增和移除都保持数组顺序。
- 修改 draft 时保留已应用查询及当前结果；只有“应用查询”才同时更新作品范围和职位。

| 状态 | 摘要 | 编辑器 | 焦点 |
|---|---|---|---|
| summary | 显示 | 隐藏且 inert | chevron disclosure 可聚焦 |
| editing | 隐藏 | 显示 | 首个有效字段 |
| loading | 隐藏 | 显示 | 取消查询仍可用 |
| success | 显示 | 隐藏且 inert | 查询摘要或结果标题 |
| error | 隐藏 | 显示 | 首个错误字段 |

摘要使用紧凑的“作品范围 / 当前模式职位”两组排版，值不做 tag；桌面窄屏优先截断次要值，移动端保留两组语义。chevron 按钮只显示图标，视觉尺寸与普通控件一致且命中区至少 44px，必须有动态 `aria-label`、`title`、`aria-expanded` 和 `aria-controls`。

### 模式职责

人物排行：

- Query Workspace 中的排行职位当前是单选，因此排行局部工具栏不再重复职位选择。
- 状态和计算必须对未来多职位查询兼容：人物必须在已选作品范围内同时拥有全部职位才进入结果；该人在各职位下的参与作品取 union，按 Subject ID 去重后计算作品数、均分和综合分。
- 未来开放排行多职位时，只替换 Query Workspace 的职位输入形态，不改查询数据结构和排行计算口径。
- 默认不提供人物搜索；若正式数据量显著增长，可在列表级插入“筛选当前结果”槽位。
- 排行排序只提供作品数、我的均分、综合分三种维度；维度选择与独立升降序按钮放在同一行的紧凑控件组中，改变任一项后回到第 1 页。
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

Light 模式的 Header 使用白色半透明 chrome：`--chrome` 映射到白色 `--surface`，Header 背景可使用高不透明度的 surface mix，并保留 `backdrop-filter` 用于滚动层级。模式 tab、主题按钮、文字和边界必须使用同一组 chrome semantic tokens，不保留浅色下的深色 Header 硬编码。表格、矩阵、图表、rail 和 drawer 也都必须显式绑定 semantic token。

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

| 场景 | 生产组件 | 原型表现 |
|---|---|---|
| 全局主题 | `NConfigProvider` | CSS semantic tokens |
| 顶部模式 | `NTabs type="segment"` | Header Bar 内的 segmented tabs |
| 查询容器 | Header disclosure + `NForm` | Header 第二行；收起态显示摘要，展开态显示 editor |
| 职位输入 | `NSelect`, `NButton` | 排行单选但写入数组；共同分析为单选 selector + 加号 + 有序已选列表 |
| 候选职位浏览 | `NTabs` / 移动窄屏 `NSelect` | 只切换本地视图，不发起查询 |
| 输入/选择 | `NInput`, `NSelect` | 36px control，6px radius |
| 收藏状态 | `NCheckboxGroup` | 可换行选择 chip |
| 主/次操作 | `NButton` | primary / default |
| 条件开关 | `NSwitch` | 深粉 active rail |
| 人物列表 | `NDataTable` 或 `NList` | 共享 ranked-person primitive |
| 排行与作品表 | `NDataTable` | striped、sorting、scroll-x |
| 人物详情 | `NCard`, `NStatistic` | desktop panel / mobile drawer |
| 移动详情与选人 | `NDrawer` | right inspector / left picker |
| 分页 | `NPagination` | 数字页码 + 前后页 + 5/10/20/50 size picker |
| 状态与身份 | `NTag` | compact soft tag |
| 说明 | `NTooltip`, `NPopover` | portal 到 body，禁止伪元素 tooltip |
| 空状态 | `NEmpty` | 标题 + 一个主操作 |
| 通知 | `NMessage`, `NNotification` | 非阻塞反馈 |

### 基础尺寸

```css
--radius-card: 8px;
--radius-control: 6px;
--summary-height: 34px;
--control-height: 36px;
--touch-target-min: 44px;
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
```

同一工具栏的 input、select、button 统一使用 `--control-height` 与 `--radius-control`；icon-only disclosure、加号和移除操作使用至少 44px 命中区。查询摘要以“作品范围 / 当前模式职位”两个语义组排版，不把值做成 tag；收起操作只使用 chevron，不另设“修改查询”文字按钮或编辑器内的重复关闭入口。内容卡片禁止玻璃拟态和装饰性渐变；半透明与 `backdrop-filter` 只属于全局 Header chrome。禁止巨型圆角、pill 与小圆角混排，以及随机彩色系列。

### Typography

字体栈固定为：

```css
"Source Han Sans SC VF", "Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC", sans-serif
```

数据工作台使用固定 rem 字级，不使用随视口变化的 `clamp()`：

| Token | Size | Role |
|---|---:|---|
| `--text-caption` | 12px | 辅助信息、图表与表格标签 |
| `--text-control` | 13px | 控件、字段标签、紧凑数据值 |
| `--text-body` | 14px | 正文、人物名、主要列表内容 |
| `--text-subheading` | 16px | 阶段标题、局部分组标题 |
| `--text-section` | 19px | 面板标题 |
| `--text-panel` | 23px | 主要结果标题 |
| `--text-page` | 27px | 页面或人物主标题 |

- 权重只使用 400（正文）、600（标签、选中态、人物名）和 700（标题）。
- 连续正文至少 14px / 1.5；辅助信息至少 12px。
- 图表内部空间极受限的轴标签可保留 9–11px，但必须同时提供可访问名称，且不用于查询、导航、人物名或连续正文。
- 人物、评分、计数与分页数字默认使用 tabular numerals。

### 样式文件边界

`styles/workbench.css` 只负责按级联顺序导入模块，不承载业务规则。模块按全局壳层、排行列表、排行详情、人物选择、分析面板、查询工作区和响应式覆盖拆分；单个业务 CSS 模块保持在 500 行以内。新增职责时新建或归入对应模块，不把规则重新堆回入口文件，也不为拆分而改变既有选择器顺序。

## 5. 共享人物排行组件

### `RankedPersonList`

```ts
type RankedPersonListVariant = 'ranking' | 'candidate'

interface RankedPersonListProps {
  variant: RankedPersonListVariant
  items: PersonListItem[]
  focusedId?: number
  selectedKeys?: Set<string>
  sortBy?: 'count' | 'average' | 'overall'
  ascend?: boolean
  page: number
  pageSize: number
  total: number
  loading?: boolean
}

interface RankedPersonListEmits {
  activate: [personId: number]
  toggle: [personId: number, positionId: number]
  pageChange: [page: number]
  pageSizeChange: [pageSize: 5 | 10 | 20 | 50]
}
```

Slots：

- `toolbar`
- `columns`
- `row-leading`
- `row-avatar`
- `row-identity`
- `row-context`
- `row-volume`
- `row-metrics`
- `row-action`
- `empty`
- `pagination`
- `selected-tray`：仅 candidate。

### 启用矩阵

| Slot / 行为 | 排行 | 共同分析候选 |
|---|---|---|
| leading | 排名 | 头像上的已选状态 |
| avatar | 开启 | 开启 |
| identity | 中日文名 | 主名称 |
| context | 不重复已固定职位 | 当前职位 badge、其他已选身份 |
| volume | 当前排行维度进度 | 默认关闭 |
| metrics | 作品数、均分、综合分 | 该职位作品数 |
| whole-row click | 聚焦人物 | 选择 / 取消当前职位身份 |
| action | disclosure | 无独立操作，整行使用 `aria-pressed` |

Candidate variant 根节点使用整行 `<button>` 承担选择。整行内不再嵌套其他按钮或 select。

### 排行维度进度

进度使用当前已应用查询、当前排行职位集的完整结果集作为分母，不使用当前分页：

```ts
progress = value / max(allResultValues) * 100
```

- 作品数：`subjectCount / maxSubjectCount`。
- 我的均分：`userAverage / maxUserAverage`。
- 综合分：`overall / maxOverall`。
- 视觉最小宽度仅用于保证可见，不得作为真实百分比朗读。

进度必须表现为排行行背景中的半透明粉色矩形，宽度对应上述比例；文本与交互层位于其上方。禁止底部线状进度、渐变进度和 pill 形进度。聚焦态还需使用边框、焦点环或图标等非颜色线索。

### 排序与分页

- 排序状态由 `sortBy: 'count' | 'average' | 'overall'` 与 `ascend: boolean` 独立表达；两项控件同行展示，不占用两行工具栏。
- 分页使用 Naive UI `NPagination` 的数字页码、前后页、当前页状态与 size picker，page size 固定为 `5 / 10 / 20 / 50`。
- 当前页保持可操作且使用 `aria-current="page"`，不能通过 `disabled` 表达选中。
- 改变排序维度、升降序或 page size 时回到第 1 页；列表总数只显示人数，不在标题中重复页码。

## 6. Person Inspector

桌面放在排行右侧 panel；`≤780px` 使用从右侧弹出的 `NDrawer`，宽度约 92vw，点击左侧未覆盖遮罩关闭。

内容顺序：

1. 头像、中日文名、职业/职位、收藏与讨论。
2. 默认展开的人物简介；可在信息较长时由用户主动折叠。
3. 参与作品、已评分、我的均分、综合分、最高分、最低分。
4. 1–10 分个人评分分布。
5. “我更喜欢 / 我更保守”站评偏差作品。
6. 作品搜索、排序、每页数量、分页。
7. 封面、日期、Bangumi Rank、收藏人数、全站评分、个人评分、角色/职位。

Inspector 不展示人物 Person ID，也不提供“加入共同分析”或“查看 Bangumi 人物页”操作。详情用于浏览当前排行人物，不承担跨模式跳转。

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

- 双人 Hero 使用紧凑媒体：桌面人物卡的 media 高 `180px`；`≤980px` 切为横向人物卡，media 为 `72 × 136px`；`≤480px` 为 `60 × 148px`。图片 `object-fit: cover`，内容区按实际文字高度展开。
- 姓名、职位、均分和其他正文位于独立 content 区，不叠在照片上；Hero 不显示人物 Person ID。

### 图表

- 图表背景使用 surface 或透明。
- 网格线使用 divider。
- 主系列使用 pink，人物 B 使用中性灰；其余使用固定的灰阶、梅紫与暖色调色板，不引入青绿色点缀。
- 禁止按 Person ID 随机生成 HSL。
- 评分分布固定为 1–10 与“未评分”共 11 组，使用 `repeat(11, minmax(0, 1fr))` 在可用宽度内重排；图表自身不得产生横向滚动条。
- 数值与分类标签必须位于图表内容盒内部，辅助字号不低于 12px；窄屏可减少非关键刻度密度，但不能缩小到不可读。
- 完整说明使用 `NPopover`，不使用会被 scroll container 裁切的绝对定位 tooltip。

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

## 9. Rail 与 Drawer

Desktop：

- 共同分析使用 320–348px rail；rail 与主内容之间保留 12–16px gap，二者都位于与排行一致的居中 workspace 内。
- 折叠按钮固定在 rail 与主内容的边界，不放在 App Header，也不属于 rail 滚动内容。
- 收起后保留 56px 窄 rail、已选人数和同一展开按钮。
- rail 具有基于收起态 Header 高度计算的确定视口高度；`PersonPicker` 是唯一纵向滚动所有者，并阻断到页面的滚动链。
- 候选结果在可用宽度允许时使用紧凑双列 tile；tile 将排名与作品数合并为同一副行，不保留浪费横向空间的独立指标列。

Mobile：

- “选人”入口位于共同分析的 Main Workspace 内，不放入 App Header，也不承担 desktop collapse。
- Drawer 宽度 `min(390px, 100vw - 24px)`。
- 内部 `min-width: 0`，自身纵向滚动。
- 打开后 query、main 和 header 背景控件 inert；关闭后焦点返回 Main Workspace 中的触发入口。

## 10. Responsive

| 范围 | 排行 | 共同分析 |
|---|---|---|
| `≥1180` | 完整指标列 + inspector | 348px rail；双列 Hero/analytics 可用 |
| `918–1179` | 保留当前排序指标，次要列按槽位收敛 | 320px rail；主内容分区单列 |
| `781–917` | 紧凑排行 + inspector | 300px rail；主内容分区单列 |
| `≤780` | 单列排行 + 右侧 92vw inspector drawer | 左侧 picker drawer；主内容单列 |
| `≤480` | 紧凑 Header；可见控件仍保持 36px 且命中区至少 44px | 候选指标降级为一个；图表不横滚，只有表格/矩阵可局部滚动 |

移动端不得通过缩小文字或直接隐藏重要内容来解决宽度问题。

Header / Query Workspace 的响应式规则独立于两种业务模式：`>=781px` 固定覆盖页面，文档只保留收起态 Header 高度；Query Editor 展开时覆盖 Main Workspace 而不重新排版。`<=780px` 始终回归文档流。摘要在窄屏仍保留作品范围与职位两组信息，可对过长值使用 ellipsis。

## 11. 文案

- 前端只展示用户任务、数据口径和状态。
- 组件复用方式、共享状态、开发约束只写在代码注释或本文档中。
- 避免大段说明；优先使用明确 label、tooltip、tag、状态图标和 `details`。
- 派生指标标记为“本站计算”，并提供计算说明。
- “我的均分”遵循项目现有个人收藏规则：`collection.rate = 0` 不计入均分，但作品仍计入数量；均分向下截取两位小数。

## 12. Accessibility

- 正文对比度至少 4.5:1；边界、focus 与图形信息至少 3:1。
- 正文不低于 13px，辅助信息不低于 12px；不得为了避免 overflow 将局部字号降到规则以下。
- 粉色 focus ring 为 2px，并保留 2px offset。
- 图表颜色必须有文字、形状、位置或 pattern 的冗余编码。
- 隐藏 panel 使用 `hidden/inert/aria-hidden` 的一致状态，不留下可 Tab 的控件。
- 原生 select 使用明确 label；icon-only 按钮提供 `aria-label`。
- 尊重 `prefers-reduced-motion`。

## 13. 验收

每个 mode 在 Light / Dark 下验证 `360、390、768、917、1185、1440px`：

- 页面 `scrollWidth <= clientWidth + 1`。
- Query Workspace 是 Header 第二行的集成 disclosure；收起态显示摘要，展开态由 Query Editor 替代，chevron 正确反映 `aria-expanded`。
- Desktop Header 固定覆盖页面；Main Workspace 顶部保留准确的收起态 Header 间隙且自身至少为 `100dvh`。Query Editor 展开不会推动结果区，并可在 Header 内独立滚动；`<=780px` Header 回归文档流。
- 查询摘要保留“作品范围 / 当前模式职位”两个语义组；chevron 视觉与状态正确，命中区至少 44px。
- 作品范围和当前模式的职位作为一次原子查询提交，draft 未提交时不覆盖已应用结果。
- 排行职位 UI 只允许一个职位，但状态为数组；使用测试数据注入多职位后，人物按全职位交集过滤，作品按职位 union 去重计算。
- 共同分析通过单选 selector + 加号 + 有序已选列表应用 `1..N` 个职位；第一项是默认候选分组，本地切换职位 tab 不重新查询。
- 候选搜索、分页、职位 tab 和人物身份选择均在已应用结果上本地生效；身份变化立即重算分析。
- Desktop 候选结果在 rail 内使用紧凑双列；人物名、排名与作品数无截断碰撞，选中状态图标位于头像上层。
- 排序只包含 count / average / overall，维度与升降序同行且相互独立。
- 排行进度随当前排行维度变化，并表现为半透明粉色矩形行背景，无底部线状进度。
- `NPagination` 有数字页码、前后页和 5/10/20/50 size picker。
- 排行行不重复固定职位。
- 所有可见人物信息均无 Person ID。
- Inspector 简介初始展开，且无加入分析与 Bangumi 外链操作。
- 人物评分洞察不使用独立异色底。
- Inspector 信息完整；移动端从右侧弹出并可点左侧遮罩关闭。
- Desktop rail 边界按钮可收起/展开；mobile picker drawer 可用 Esc/遮罩/关闭按钮收起。
- Desktop `PersonPicker` 滚动到首尾时页面不跟随滚动，rail 高度始终受当前收起态 Header 高度约束。
- 共同分析与排行采用相同外边距和完整 card workspace；已选人物紧凑、分析自动刷新且无“查看分析”按钮。
- 共同分析 Hero 使用紧凑固定 media 高度，文字不压在图片上。
- 评分分布图 `scrollWidth === clientWidth`；仅表格与矩阵允许自身横向滚动。
- 正文至少 13px、辅助文字至少 12px，无超小字号。
- Light Header 是白色半透明 chrome，tab、按钮、文字和边界使用 light semantic tokens；Light 表格/矩阵/图表无暗色硬编码；Dark 无纯黑断层。
- Console 无 error；无重复 ID；两个 JSON snapshot 均可解析。
