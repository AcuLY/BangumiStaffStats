---
name: Bangumi Staff Statistics
description: 面向 Bangumi 收藏与全站数据的高密度 Staff 排名与共演分析界面
colors:
  primary-light: "#C82A70"
  primary-light-hover: "#D23978"
  primary-light-pressed: "#AD215F"
  primary-dark: "#F16A9C"
  primary-dark-hover: "#FC85AF"
  primary-dark-pressed: "#DA578A"
  primary-soft-light: "color-mix(in oklab, #C82A70 8%, hsl(240 18.5% 98.3%))"
  primary-soft-dark: "color-mix(in oklab, #F16A9C 20%, hsl(240 7.1% 9.8%))"
  on-primary-light: "#FFFFFF"
  on-primary-dark: "#17171B"
  canvas-light: "#FFFFFF"
  surface-light: "hsl(240 18.5% 98.3%)"
  surface-raised-light: "hsl(0 0% 100%)"
  surface-sunken-light: "hsl(240 10.2% 92.4%)"
  border-light: "hsl(240 7.9% 86.1%)"
  divider-light: "hsl(240 8.5% 90.8%)"
  control-border-light: "#928D94"
  control-background-light: "rgb(255 255 255)"
  control-text-light: "rgb(51 54 57)"
  control-placeholder-light: "rgb(194 194 194)"
  control-outline-light: "rgb(224 224 230)"
  canvas-dark: "hsl(240 7.8% 5.8%)"
  surface-dark: "hsl(240 7.1% 9.8%)"
  surface-raised-dark: "hsl(240 6.8% 12.8%)"
  surface-sunken-dark: "hsl(240 8.5% 4.5%)"
  border-dark: "hsl(240 6.1% 20.5%)"
  divider-dark: "hsl(240 5.9% 15.8%)"
  control-border-dark: "#64656D"
  control-background-dark: "rgb(255 255 255 / 10%)"
  control-text-dark: "rgb(255 255 255 / 82%)"
  control-placeholder-dark: "rgb(255 255 255 / 38%)"
  control-outline-dark: "transparent"
  chrome-light: "hsl(0 0% 100%)"
  chrome-dark: "hsl(240 12.6% 2.4%)"
  text-primary-light: "oklch(0.24 0.015 285)"
  text-secondary-light: "oklch(0.34 0.014 285)"
  text-tertiary-light: "oklch(0.47 0.015 285)"
  text-primary-dark: "oklch(0.95 0.006 280)"
  text-secondary-dark: "oklch(0.82 0.01 280)"
  text-tertiary-dark: "oklch(0.69 0.012 280)"
  success-light: "oklch(0.43 0.12 160)"
  warning-light: "oklch(0.43 0.09 80)"
  error-light: "oklch(0.48 0.18 25)"
  success-dark: "oklch(0.68 0.13 160)"
  warning-dark: "oklch(0.75 0.11 80)"
  error-dark: "oklch(0.72 0.16 25)"
  series-light-01: "#C82A70"
  series-light-02: "#288183"
  series-light-03: "#C05852"
  series-light-04: "#916FC8"
  series-light-05: "#A07703"
  series-light-06: "#579459"
  series-light-07: "#368FC4"
  series-light-08: "#5B62AB"
  series-light-09: "#D96D92"
  series-light-10: "#C97F4E"
  series-dark-01: "#F16A9C"
  series-dark-02: "#61A8AA"
  series-dark-03: "#EF8E86"
  series-dark-04: "#BEA0F2"
  series-dark-05: "#D2AB59"
  series-dark-06: "#87BD87"
  series-dark-07: "#6FB7E9"
  series-dark-08: "#8992D6"
  series-dark-09: "#FFA9C3"
  series-dark-10: "#FDB78C"
typography:
  page:
    fontFamily: "Source Han Sans SC VF, Source Han Sans SC, Noto Sans CJK SC, PingFang SC, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  panel:
    fontFamily: "Source Han Sans SC VF, Source Han Sans SC, Noto Sans CJK SC, PingFang SC, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
  section:
    fontFamily: "Source Han Sans SC VF, Source Han Sans SC, Noto Sans CJK SC, PingFang SC, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  subheading:
    fontFamily: "Source Han Sans SC VF, Source Han Sans SC, Noto Sans CJK SC, PingFang SC, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: "Source Han Sans SC VF, Source Han Sans SC, Noto Sans CJK SC, PingFang SC, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: "Source Han Sans SC VF, Source Han Sans SC, Noto Sans CJK SC, PingFang SC, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
  caption:
    fontFamily: "Source Han Sans SC VF, Source Han Sans SC, Noto Sans CJK SC, PingFang SC, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
  micro:
    fontFamily: "Source Han Sans SC VF, Source Han Sans SC, Noto Sans CJK SC, PingFang SC, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 400
    lineHeight: 1.3
rounded:
  control: "6px"
  card: "8px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  primary-button-light:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.on-primary-light}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    height: "34px"
  primary-button-dark:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.on-primary-dark}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    height: "34px"
  input-medium:
    backgroundColor: "{colors.surface-raised-light}"
    textColor: "{colors.text-primary-light}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    height: "34px"
  input-small:
    typography: "{typography.caption}"
    rounded: "{rounded.control}"
    height: "28px"
  interactive-tag-light:
    backgroundColor: "{colors.primary-soft-light}"
    textColor: "{colors.primary-light}"
    typography: "{typography.caption}"
    rounded: "{rounded.control}"
  interactive-tag-dark:
    backgroundColor: "{colors.primary-soft-dark}"
    textColor: "{colors.primary-dark}"
    typography: "{typography.caption}"
    rounded: "{rounded.control}"
  surface-panel-light:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.text-primary-light}"
    rounded: "{rounded.card}"
    padding: "{spacing.lg}"
  surface-panel-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-primary-dark}"
    rounded: "{rounded.card}"
    padding: "{spacing.lg}"
---

# Design System: Bangumi Staff Statistics

## Overview

**Creative North Star: "可信的社区数据分析界面"**

Bangumi Staff Statistics 把 Bangumi 的社区识别、粉色品牌线索和高信息密度，收敛成一套清晰、可信、数据优先的产品界面。设计服务于查询、比较和继续浏览；它不是营销页，也不是通用 SaaS 仪表盘。视觉层级依靠对齐、字号、间距、表面和明确的数据口径建立，而不是依靠装饰。

界面允许密集，但不能微小或拥挤。桌面端用完整分析界面承载高密度信息，移动端通过结构重排保留含义，不通过缩小字号或隐藏关键数据解决宽度。状态、统计口径和交互反馈必须可预测，让熟悉数据工具的用户可以直接进入任务。

**Key Characteristics:**

- 高密度、可扫描、数据优先
- 单一粉色品牌语义，Light / Dark 分主题取值
- 冷灰表面层级，桌面完整分析界面、移动直接页面流
- 熟悉、标准的产品交互词汇，实现技术可以替换
- 所有视觉状态都有文字、结构或形状上的冗余表达

### 文档职责与稳定边界

本文只规定人物排行、共演分析及其共享组件的稳定设计契约，不绑定原型目录、组件库或 token 文件路径：

| 内容 | 长期职责 |
|---|---|
| [PRODUCT.md](PRODUCT.md) | 产品目标、用户、业务语义和指标口径 |
| [DESIGN.md](DESIGN.md) | 视觉 token、交互规则、响应式结构和验收基线 |
| 生产实现与测试 | 运行时行为和可执行验证；目录与技术选型由生产迁移决定 |
| [.impeccable/design.json](.impeccable/design.json) | 从当前 DESIGN.md 生成的展示侧车；实现或规范变化后重新生成 |

当前原型代码可以作为设计扫描和验证证据，但不是长期规范真源。把原型开发成生产前端时，应按当时的组件库、目录结构和运行态重新映射本文语义 token，不保留仅因原型实现而存在的路径或私有 API。

### 信息架构

App Header 只由品牌栏、人物排行 / 共演分析模式、右侧“回到旧版”入口和主题操作构成；“回到旧版”固定紧邻主题操作左侧。可折叠 Query Workspace 是主内容区的第一个任务表面，位于反馈和结果之前。人物排行模式随后使用共享人物排行 + 详情面板；共演分析模式在 Query Workspace 和反馈之后先显示紧凑人物选择摘要，桌面进入候选人物 rail、移动在摘要下原位展开候选手风琴，再进入关系分析。

查询摘要、查询编辑器、人物排行、共演分析和 Footer 共用一个 1280px 最大内容线。Header chrome 横跨视口，但内容不能随模式、已选人数或结果状态改变最大宽度。

### 响应式结构

| 视口 | 人物排行 | 共演分析 |
|---|---|---|
| 1185px 及以上 | 完整指标组 + inspector | 348px rail；人物卡按自身容器宽度分列 |
| 960–1184px | 完整指标组 + inspector | 320px rail；人物卡按自身容器宽度分列 |
| 917–959px | 单列排行 + inspector drawer，保留完整指标组 | 320px rail |
| 780–916px | 单列排行 + inspector drawer，保留完整指标组 | 300px rail |
| 低于 780px | 单列排行 + 底部 inspector drawer | 正文人物选择摘要 + 原位候选手风琴 |

**The 780 Rule.** 低于 780px 的常规表单与操作控件使用紧凑档，780px 及以上使用标准档；480px 不得建立第二套控件尺寸体系。

### 动效

动效只解释状态：查询面板展开、排序方向、选择反馈、图表数据进入和 loading。常规反馈为 150–180ms；复杂面板或图表可使用 200–260ms 的平滑减速曲线。自研控件精确复刻 Naive option 状态时沿用其 300ms `cubic-bezier(.4, 0, .2, 1)` 背景渐变，避免与相邻原生 Select 的指针切换反馈断裂。所有动画必须在 prefers-reduced-motion 下关闭或退化为即时状态变化。

## Colors

颜色系统由四个互不混用的层次组成：品牌主色、冷灰表面、语义状态色和分类数据色。Frontmatter 中的 token 是规范值；生产实现必须建立集中、可测试的语义映射，但映射文件、组件库适配层和目录结构可以变化。规范混用 hex、HSL、OKLCH 与 color-mix，frontmatter 保留这些 canonical CSS 值，不做有损的 hex 转换；仅要求十六进制色值的外部 linter 可能给出提示。

### Primary

- **Brand Pink Light**：Light 主题的品牌、主操作、焦点、当前模式和关键选中态；填充控件使用近白前景。
- **Brand Pink Dark**：Dark 主题中承担同一语义；填充控件使用近黑前景，避免白字眩光。
- hover / pressed 只在交互期间出现，静态文字只能使用当前主题的 primary。

当前 Light / Dark 主色是 PROVISIONAL_IMPLEMENTED 工作基线；只有用户明确要求调整时才重新开启评审。更新时必须同步 frontmatter、生产语义 token、组件库主题适配和相应结构测试，具体路径由当时实现决定。

Light 主色对主要内容表面的文字对比约 5.01:1，Dark 主色约 6.20:1。正文必须达到 4.5:1；图形、边界和焦点信息以 3:1 为最低目标。组件库静止边界可保留其合格默认值，不为形式统一强行覆盖。

**The Single Pink Rule.** 同一主题只有一种静态粉色语义；品牌、主操作、焦点和普通选中态不得各自发明粉色。

Header 品牌图标与浏览器 favicon 使用同轮廓的双主题 SVG：浅色 `bgmss-light.svg` 为 `#C82A70`，深色 `bgmss-dark.svg` 为 `#F16A9C`，均随应用主题同步切换。保留原电视、天线、对话尾部和放大镜构图及 Header 显示尺寸。

### Neutral

Light 使用低饱和冷灰：canvas 承载页面，surface 承载桌面主工作区，surface-raised 只用于输入、弹出层和少量抬升内容，surface-sunken 用于 segment、表头或内嵌区域。Header 使用独立的白色 chrome。

Dark 使用收紧的近黑层级：canvas、surface、surface-raised 与 surface-sunken 之间保持可辨但克制的级差。深色 Header chrome 比主体更深，但不能形成纯黑断层。

Header Bar 在 Light 和 Dark 均使用 72% 基色不透明度与 blur(16px) saturate(135%)。正文内的 Query Summary 和展开后的 Query Editor 共同使用普通 surface；输入控件仍可使用 surface-raised。每个像素只绘制一层背景。移动 Drawer 使用独立的 96% 偏灰表面，不与 Header 或正文查询表面混用。

### Data series

分类和多系列比较固定使用 frontmatter 中 series-light-01…10 / series-dark-01…10 的顺序。共同作品使用色位 1，人物从色位 2 开始；超过可用色位时按固定顺序循环。主题切换只能替换整套预定义数组，不能改变数据到色位的映射。

分类色只能编码图表和多系列数据，不得进入品牌、按钮、普通 Tag 或装饰。颜色不能成为唯一编码；每个系列还要有名称、位置、数值、形状或标记。必要时用描边、前景混合或 pattern 提升图形边界，不改写规范色值。

### Semantic states

success、warning、error 只表达对应状态，不能从分类色盘借色。disabled 不能作为正文或空状态说明文字；这类文字仍需满足正文对比度。

## Typography

全界面使用 Source Han Sans SC VF 优先的单一无衬线栈。它同时承担标题、控件、正文和数据，保持产品界面的熟悉感与高密度扫描效率；不引入展示字体或与其相近的第二套无衬线。

### Hierarchy

- **Page**（28px / 700）：页面级空状态和少量最高层标题。
- **Panel**（24px / 700）：人物详情或分析面板的重点标题。
- **Section**（20px / 700）：主要内容分区和桌面重点统计。
- **Subheading**（16px / 600）：查询编辑器标题、阶段标题和局部标题。
- **Body / Control**（14px）：连续正文、项目自有控件、列表主信息和桌面数据。
- **Caption**（12px）：辅助文字、表格次要信息、移动紧凑排行和图表标签。
- **Micro**（10px）：只允许出现在空间受限且已有完整可访问名称的图表信息中。

组件库原生 size preset 由组件库管理，不作为项目字号例外；项目主动覆盖的字号必须映射到上述语义阶梯。18px 只用于响应式统计数字的中间档，不成为通用 token。

### Responsive type

- Query Editor 在低于 780px 时依次使用 12px 编辑器标题、14px 阶段标题、12px 字段标签和 12px“更多选项”条目标题；780px 及以上分别为 16 / 16 / 14 / 14px。
- 人物排行主姓名使用 15px / 22px 行高、常规字重 400，副名使用 14px / 20px 行高；两行内容作为整体相对 36×48px 头像垂直居中，不拉伸行高。显示头像时，姓名列额外增加 8px 起始内边距，使头像到姓名的可见间距与居中序号到头像的间距接近；表头与骨架同步，隐藏头像时不增加此内边距。长姓名按当前字号和实际列宽使用 CSS 省略号，不按固定字符数截断，并保留完整名称 title。多人共演已选人物卡片的姓名标题使用 16px / 1.25 行高，与现有次级标题字号一致。排行排名和指标以及单人共演“合作人物”保留原有紧凑字号：低于 780px 使用 12px，780px 及以上使用 14px，合作人物列表直接复用人物排行的行、表头、指标刻度和骨架；合作人物依次显示主名、原文名、合作职位三行；职位行使用 12px / 18px，名字沿用现有字号。整行点击加入共演，不再提供额外的“查看详情”按钮；加载骨架同步为三行。
- 单人和多人共演直接复用同一个人物卡片：96px 宽画像铺满至少 128px 高的人物单元，16px 姓名、12px 身份与“查看详情”文字入口在右上，16px 数字与 12px 标签在右下宫格。单人额外显示合作人数，保持同一字号、间距和图片规则，不另设 20/28px 数字或 72px 图片例外。各指标最高合作人物使用独立宫格，数字同为 16px：全站三列，个人四列且窄容器降为两列。单人分析区在 780px 及以上保留外层卡片边界、圆角和面板阴影，窄屏融入正文；内部不增加背景填色。合作人物标题旁不提供指标说明图标或浮层。

### Text behavior

标题使用 text-wrap: balance，较长说明使用自然换行。中文主标题最多两行，原文副标题单行；采用双行名称的表面固定中文名在上、原文名在下，任一名称缺失或两者相同时都在两行重复现有名称。截断内容必须保留完整双语 title 或等价可访问名称。查询摘要与移动人物选择摘要不得截断，必须自然换行并随内容增高。

表格、排行榜、指标台账和身份标记使用 tabular-nums。所有自包含统计宫格遵循“数字在上、说明在下、同起点左对齐”；末行不满时保留空轨道，不拉宽已有单元。

**The Density-with-meaning Rule.** 密度来自对齐和层级，不来自小于规范的字号、压缩命中区或删除必要语义。

## Elevation

系统以色调分层和边界为主，阴影为辅。Light surface panel 只使用低幅 0 1px 2px oklch(0.2 0.01 285 / 0.06)；Dark surface panel 不使用阴影。普通内容卡片不能同时叠加 1px 边框与宽模糊装饰阴影。

Header 和移动 Drawer 是仅有的半透明 chrome 层。Query Workspace 是正文 surface，只使用边界和低幅 panel shadow 表达分组，不使用 blur、浮层边缘阴影或覆盖层级。普通内容卡片、统计块、列表行和图表禁止玻璃拟态。

层级 token 只使用语义尺度：sticky 为 20，drawer 为 50。新增 dropdown、modal、toast 或 tooltip 时必须扩展语义尺度，禁止直接写 999 或 9999。

**The Flat-by-default Rule.** 静止内容保持平面；只有真实的覆盖、浮层或交互状态可以获得抬升。

## Components

### Component library boundary

生产实现可以继续使用当前组件库，也可以在迁移时替换。无论技术选型如何，只使用公开组件 API、公开主题入口和项目自有 class；不得依赖库的私有 DOM、内部变量或偶然生成的选择器。

控件高度、字号、内边距和紧凑度优先由组件公开的 size / density API 管理。人物排行、候选人物、合作人物、人物 Inspector 和共同作品的搜索 / 排序 / 方向工具组及其禁用等待态必须复用同一个 SearchSortToolbar。共享组件统一使用 780px 断点：780px 及以上使用 medium，低于 780px 使用 small；候选 rail 等窄栏不设置独立尺寸例外。Input、Select、Select menu、方向 Button 及工具组内附加筛选控件必须消费同一个 size；调用方只提供值、选项、标签和事件，不覆盖内部尺寸。同一工具组共享 input control 背景。Light control background 为白色，Dark 为 10% 白色叠层，与组件库 Select 输入表面一致。自研 selector trigger 必须通过项目语义 token 同步同尺寸 Naive Select 的 text、placeholder、background、default / hover / focus outline 与 suffix icon 角色；suffix 可以保留独立 44px 命中节点，但视觉上不得出现分割线或独立 hover cell。Info/help icon 是可交互帮助，不降级为 placeholder 装饰色。排序方向使用带直线箭身的方向箭头，不使用仅由两段折线构成的 chevron。中性文字、边界与 neutral hover / pressed 可以保留组件库合格默认；项目只覆盖品牌主色、必要前景、圆角、交互 Tag、Scrollbar、Skeleton 与 Drawer 等明确设计契约。更换组件库时重新建立映射，不把原型库的 override 结构带入生产规范。

### Buttons and icon actions

除 BGMSS 品牌图片与 favicon 外，业务图标统一使用 Naive UI 推荐的 xicons 中 `@vicons/ionicons5@0.13.0` 线框图标，直接渲染库提供的 Vue SVG 组件。`AppIcon` 管理语义名称映射，`InfoIcon` 统一承载 InformationCircleOutline；QueryIcon、CoStarIcon 复用相同映射。按需静态导入，不复制图标路径、不混用其他图标族；图标继承 currentColor，并保留调用方尺寸、排序旋转、命中区及按钮可访问名称。图标本身仅作装饰，不新增焦点。评分图表等数据 SVG 与 Naive UI 内部控件图标保持原有职责。此规则取代此前手绘 info 图形路径的一致性要求。

- 主操作使用组件库的 primary button；Light 使用白色前景，Dark 使用近黑前景。
- 常规控件在 small / medium 下分别使用 28 / 34px 可见高度，交互命中区至少 44px。
- 搜索、排序依据和方向三个控件在移动端也保持单行；排序框按当前可用选项中最长标签预留文字及箭头空间，搜索框弹性分配剩余宽度。方向按钮保留文字和箭头，最小宽度为 80px。带职位筛选时，DOM、键盘和可见顺序统一为“搜索 → 职位 → 排序依据 → 方向”；容器宽度足够时四项同行，否则搜索独占首行，职位、排序依据和方向保持在第二行。按容器可用宽度换行，不以 viewport 断点强制拆分，也不把职位独占一行。
- 同一容器、同一语义的图标必须使用相同尺寸和光学中心；不同层级可以使用不同可见尺寸，但不能因此缩小命中区。
- Header action 共享同一右侧内容线和 18px 图标基线；主题切换使用 44×44px 方形圆角按钮，与旧版入口保持相同高度、默认圆角和 neutral quaternary 外观；紧凑 Info、行内移除和 Drawer 关闭按语境分级，不建立脱离容器的机械图标尺。
- “回到旧版”使用 neutral quaternary 图标加文字链接按钮，固定紧邻主题操作左侧，保留至少 44px 的命中高度及清晰焦点，不使用品牌色填充与模式导航竞争。
- 自实现交互使用 2px focus ring 与 2px offset；组件库控件保留其合格焦点表现。forced-colors 下交还系统 Highlight。
- 跨区动作（分页、定位、揭示或替换当前 surface）只在目标请求成功提交后滚动到目标区域，聚焦具名 region 或目标控件，并短暂强调完整目标；失败、取消或 stale completion 不移动焦点。强调到期只移除视觉状态，不得主动 blur。滚动与强调服从 reduced motion。
- 分页的上一页、页码、快速跳转和下一页必须由原生可聚焦 button 承担，暴露当前/禁用状态与可访问名称；Naive 可继续拥有页码计算、size picker 与 jumper，但不得留下只能指针点击的 DIV。可见尺寸服从 small / medium，实际命中区至少 44px。

### Theme preference

- 没有保存值或保存值为 `auto` 时，页面初始主题取自系统 Light / Dark，并在页面打开期间实时跟随系统变化；系统变化本身不写入偏好。
- Header 永久只保留一个太阳 / 月亮主题操作。激活后立即切换到相反的已解析主题，不打开 Popover、菜单、设置页，也不显示固定状态或第二个重置动作。
- 切换后的主题与系统当前主题一致时保存 `auto` 并继续跟随系统；不一致时保存明确的 `light` 或 `dark` 并忽略后续系统变化。三个值都不设置过期时间。
- 同一浏览器的其他已打开标签页同步 `auto|light|dark` 与移除事件；主题仍不进入 URL、Query、本地查询恢复或请求状态。

**The System-First Theme Rule.** `auto` 以系统主题为唯一真源并实时跟随；同一个主题按钮切到与系统不同的外观时长期保存 Light / Dark，切回与系统相同的外观时自动恢复 `auto`。不得用隐藏 TTL、弹层、设置页、第二个重置动作或常驻三态控件增加主题操作负担。

### Contextual help and tooltips

- 可交互 Info 帮助使用语义化 `button`；默认为 16px 图标、24px 可见操作盒与至少 44×44px 的实际命中区，并保留明确的 `focus-visible` 轮廓。
- 同一份帮助必须同时可由指针、键盘与触屏获取：`mouseenter` / `focus` / click 或 tap 打开，`mouseleave` / `blur` / `Escape` 关闭。当前实现直接使用组件库 Tooltip 的公开 `show`、`style` 与 `content-class` API，并由调用处维护显式可见状态；不新增仅转发样式的包装组件，不依赖组件库隐式 hover 行为，也不把原生 `title` 当作唯一帮助通道。
- 按钮的可访问名称必须表明说明对象，并通过完整 `aria-label` 或明确关联的说明内容让辅助技术读取同一口径；有开合状态时同步 `aria-expanded`。Tooltip 只承载简短说明；需要交互控件时改用 popover。
- 同一局部分组同时只显示一个帮助浮层。浮层使用组件库公开定位能力与视口感知的最大宽度，在边缘自动翻转，内容允许换行并在过高时内部滚动，不被卡片或列表的 overflow 裁切；不得通过私有浮层 class 或内部定位 DOM 二次修正位置。
- 仅表达空状态等无交互语义的 Info 图形保持非按钮与 `aria-hidden`，由相邻可见文本承担状态名称，不为装饰图形补造 tooltip。

### Inputs and query workspace

Query Workspace 是主内容区的第一个 disclosure，位于反馈和当前模式结果之前。收起态显示完整的已应用参数并用 edit 图标进入编辑；展开态在同一 surface 内由摘要衔接 Query Editor，并用 chevron 收起。所有视口都在文档流内展开并自然下推结果，不 teleport、不建立独立页面级滚动区，也不成为 Header、Drawer 或固定覆盖层。

首次空状态中的“设置查询条件”是参数面板的揭示入口：激活后页面滚动到顶部、展开编辑器并给整个 Query Workspace 一次短暂的 focus 色外圈强调。桌面 fine-pointer personal 模式聚焦 UID；compact、触屏或 global 模式聚焦具名 Query Workspace，避免强制软键盘。摘要本身的普通展开不触发该强调；滚动和强调动效服从 `prefers-reduced-motion`，强调到期不清空焦点。

首次没有 Applied Query 时自动展开编辑器；成功后自动收起。校验失败、请求失败或取消时保持展开并保留 draft 与已有结果。当前主查询反馈在展开的 Query Editor 内显示时，正文不得重复渲染同一 operation/message；人物详情、合作人物和共演分析等没有编辑器 owner 的反馈继续使用正文全局位置。未变化的查询再次提交是静默 no-op：不请求、不折叠、不显示编辑器内或正文重复状态。已有 Applied Query 时切换模式，目标模式直接加载同一查询且不显示“再次应用条件”的中间空状态。普通共演查询成功且选择为空时先从原查询职位按后端顺序选择第一位可完整容纳的人物及其完整身份，再展开全部可用职位的候选浏览；只能原子加入不超过 20 个身份的完整人物集合，不能截断身份或把自动跳过展示成用户操作错误。移动端不能自动展开人物选择手风琴；精确标签页恢复、已保留选择和候选视图操作不触发默认选择，原型 fixture 预选不得进入生产状态。

“回到旧版”始终可用，使用同页固定链接 `https://search.bgmss.fun/old/`，不附加当前查询或部署前缀。按钮不依赖 Applied Query、Draft、catalog 或请求状态，也不显示复制反馈或 Skeleton。

旧版入口与主题按钮放入同一个始终居右的操作容器，旧版入口紧邻主题按钮左侧并带 18px 跳转图标。桌面显示“回到旧版”，低于 780px 时省略为“旧版”；可访问名称始终为“回到旧版”。低于 780px 时可以缩小模式控件内部间距或隐藏品牌文字，但不能缩小 44px 命中区、裁剪按钮文字或使 Header 操作重叠。

人物排行与共演分析使用同一套由 Naive DynamicInput 承载的可筛选职位列表，人物排行与共演分析阶段标题均为“职位”，空行 placeholder 统一为“选择职位”。共演控件在职位目录提供独占的“全部”选项；选中后只显示一行“全部”，不能与具体职位叠加，排行不提供该选项。从人物详情进入共演时自动选择“全部”，摘要同步显示该范围。初始选人和选人后跨职位浏览的语义由标题旁的 Info icon 及其 Tooltip / 可访问名称说明，职位字段上方不重复显示辅助说明。至少保留一行 selector；每行至多选择一个职位，选择新职位直接替换本行旧值并收起目录。新增行先保持为空，删除行只删除本行值；只有非空行按当前顺序进入有序 `positionKeys`，空行不进入 Query。其他行已选职位及其互斥职位在当前目录禁用，不能产生重复 key。职位行复用作品范围完全相同的响应式规则：`width < 780px` 的阶段堆叠布局先使用两列，单行只占左列而不横跨；同一 `max-width: 520px` 规则再覆盖回单列，780px 及以上因职位阶段本身已处于右栏而保持内部单列。

职位目录分隔线与行高亮区域共用左右 4px 内缩。大类展开使用 220ms 减速高度过渡，收起使用 160ms 过渡，同时轻微淡入淡出；收起过程立即移除内容的键盘可达性，减少动态效果时不播放过渡。职位浏览为空搜索时使用“分类 → 职位”两级结构；搜索时扁平化并按职位 key 去重，同时显示所属分类。职位实体只有一个 canonical key，但可以作为展示引用同时出现在常用入口、Bangumi 声明的全部分类和搜索结果中；任一副本状态同步。动画/游戏额外提供产品定义的“配音类”，其中 main/supporting/guest/minor/narrator/voice-library/all 使用单选替换语义；单独范围分别标为声优（主役/配角/客串/闲角/旁白/声库），全部范围保持声优，所有名称不含“仅”；“常用职位”位于同一 selector 内，不建立第二个目录 owner。每行 selector 复用同一目录实现，任一时刻只允许一个由 Naive UI 定位、portal 到 body 的锚定弹层处于打开状态；所有屏幕尺寸下 trigger 均为独立选择按钮，搜索框单独位于弹层首行、选项列表上方，打开目录和选择完成均不聚焦搜索输入，仅用户主动点选搜索框时进入输入状态。移动触发器保持 small 的 28px 可见高度与至少 44px 命中区；DynamicInput 的增删动作同样使用公开 Naive Button 和至少 44px 命中区。紧凑面板列表固定为 Naive small selector 的 212.8px 上限，以 bottom-start 为首选并在空间不足时使用组件库公开的 flip / shift 完整留在视口内，同时裁切全部子元素到同一 6px 圆角。职位 item 严格复用 Naive option 几何：small/medium 分别为 28/34px、14px/21px 字体行高、`0 12px` padding、0px 外层圆角与 0px 行间距；hover、键盘 pending 和 selected-pending 使用左右各内缩 4px、6px 圆角、300ms `cubic-bezier(.4, 0, .2, 1)` 渐变的状态层，静止选中态只保留品牌色文字与勾选。可折叠分类 item 使用主文字色，保留相同横向几何并额外增加 4px 上下 padding，small/medium 高度为 36/42px；计数与箭头使用三级文字色。搜索上下文单行内联并截断。只有 trigger 使用与相邻 Naive selector 相同的品牌 focus 状态；面板和箭头不得追加 focus border/attention halo，面板使用 Naive 等价的中性 menu shadow。弹层不得参与 Query Editor 布局或改变参数面板高度，删除当前行、关闭或跨 780px 断点时必须移除内容与 follower，并把焦点交给仍存在的等价控件。

职位目录不与窄 trigger 强制等宽，但保持改造前的紧凑尺度：桌面按内容扩展到最多 480px，并始终保留至少 12px 视口边距；紧凑视口维持单列。目录只允许纵向滚动，不出现横向 scrollbar。职位目录自身是唯一 background / 6px radius / Naive 等价 menu shadow owner，raw Popover 外壳不得再绘制第二层方形 shadow。DynamicInput 的增删动作使用普通 default 矩形 Naive Button，不使用 circle、quaternary 或 secondary；可见按钮与当前 size 等高等宽，small / medium 分别为 28×28px / 34×34px，并保留 44px 点击高度。职位行使用普通起始 flex 流：selector 以 `flex: 1 1 0` 自适应填满剩余位置，动作组固定在右侧且不使用 `space-between`；selector 与动作组之间、两个按钮之间均使用 `--space-2`（8px），最右按钮贴齐字段右边缘。

输入有值时才显示 clear action，空值不预留不可见尾槽。Select trigger 与 menu 必须使用同一 size。Tooltip / Popover portal 到 body，通过公开定位与视口感知的最大宽度保持在可视视口内。

**The One Owner Rule.** 一个选择集合只由一个列表 owner 完整表达；DynamicInput 可以用多行 selector 映射同一有序数组，但每行只拥有一个值、重复值不可选且至少保留一行。不得再建立第二套列表或并行 owner。其他表面只读呈现，并随唯一真源更新。

### Tags and chips

Tag 的外观由自身是否可操作决定：

- 可关闭、可点击移除或直接切换状态：当前主题粉色、6px 圆角矩形。
- 纯展示信息：中性边界与表面、999px 胶囊；即使位于链接或可聚焦容器内也不变粉。
- Skeleton 必须以单个完整圆角块覆盖真实 Tag 的整个占位盒，镜像其宽高、矩形 / 胶囊语义及响应式尺寸，并包含边框与内边距占用的空间；禁止“保留真实 Tag 外壳、只替换内部文字”的形式。

主角 / 主役、配角、客串等戏份标签使用相同的中性 NTag 样式，不额外提高主役层级，不使用粉色。分类色不得用于普通 Tag。

### Cards and containers

桌面主体使用完整 8px surface panel；低于 780px 时移除外层 card chrome，让内容进入 canvas 页面流。只有真正需要分组的局部信息块保留 surface。Query Workspace 为保持摘要与编辑器是一套 disclosure，可在紧凑视口保留一层 1px 边界、8px 圆角和低幅 surface shadow，但内部不得再嵌套卡片。其他卡片不能嵌套卡片，也不能用大圆角或装饰阴影制造层级。

### Content images

- 外部人物、角色和作品图片统一使用 3:4；调用方只指定语义 CSS 宽度和响应式 `sizes`，不注入独立高度，也不直接硬编码 Bangumi `type`。
- 共享图片策略维护经上游证据核实的资源规格能力表，按 `CSS 展示宽度 × devicePixelRatio` 选择能够覆盖目标像素宽度的最小规格；没有足够大的规格时才使用最大规格。禁止所有场景默认请求 `large`。
- 固定槽位可生成单一同源 URL；跨断点变化的槽位使用同一能力表生成准确的 `srcset/sizes` 或等价选择。后端代理只校验并透传显式规格，不替 UI 猜尺寸。
- `SafeImage` 显式区分 `loading | loaded | missing | error`：无候选源是 missing，候选源尚未成功是 loading，任一源成功是 loaded，全部候选源失败或超时才是 error。
- loading 使用骨架表面，missing 使用稳定的资源类型占位，error 使用独立的失败占位；至少 loading 与 missing 必须在形状/内容上明显不同，不能只靠颜色区分。四态保持同一 3:4 占位盒，不产生布局位移。
- 图片动效服从 `prefers-reduced-motion`。紧凑占位默认隐藏于辅助技术，人物/作品名称由相邻文本提供；图片是唯一信息载体时由调用方提供非重复的可访问名称。

### Empty, loading and error states

页面 / 分区空状态使用具备标题层级和可选直接操作的完整状态组件，局部列表或文本搜索无结果使用组件库的紧凑 empty primitive。Loading、error、数据不足和单字段缺失不能套用 empty primitive。

生产 Skeleton 必须对应真实 pending request，并与请求影响的最小稳定布局边界一致；人物详情加载结构直接复用 PersonProfile／Inspector 的布局类与容器规则，不维护另一套头像、统计网格和抽屉内边距样式。人物详情 Skeleton 的 intro 网格、画像尺寸、顶对齐、头像圆角和 Drawer 内容边缘必须与最终 PersonProfile 相同：

- catalog 等待保留职位 selector 的真实控件外观和高度，在控件中显示加载指示并禁用选择，不遮住 Header、模式和 Query Editor 其余字段。
- 新核心查询可以占位对应模式的结果主体；人物排行主等待态按最终摘要、工具栏、列头和当前 page-size 行的区域/响应式轨道排布，但可见占位叶必须直接使用组件库 Skeleton，不能自绘第二套渐变、关键帧或占位组件。排行列表返回后，人物详情单独占位。候选等待不伪造已选人物或共演结果。
- 列头等请求时已知信息直接显示：作品 / 系列由已提交查询的合并续作选项确定，等待期间编辑 Draft 不得改变该标签。同构列表首次等待和搜索 / 翻页等待复用同一组骨架；作品、角色、候选、合作及共演卡片保留头像、名称、身份和指标等真实内部结构，不以一个大矩形代替整张卡片。
- 共演评分分布等待态采用简化柱状图轮廓：坐标轴、1–10 分组、独立竖向柱体及组间留白。柱体高度仅为中性占位，不表达实际评分分布，也不以逐行满宽横条填充图表。
- 分页不使用 Skeleton；首次尚无分页数据时隐藏，已有结果的局部等待保留真实分页并处于 pending / disabled 状态。界面分包等待使用对应业务区域的同一加载布局；共演候选尚未返回时不伪造已选人物或共演结果。
- 共演核心查询等待候选返回时，右侧也显示分析结构占位；已知单个人物沿用合作布局，其余使用共演布局。人数尚未确定时不显示虚假的人物、选中人数或“0 人共演”。此状态覆盖候选模块等待，并与后续分析请求的骨架连续衔接；候选搜索、排序和翻页不替换已解析的右侧分析。
- 人物详情在所有视口和展示形态（右侧 inspector 与上拉 Drawer）下，顶部资料统一使用 96×128 圆角画像、无操作区的详情将职业信息放在名称区右上角；带“查看共演”操作的排行详情按下述资料操作布局将职业信息放在姓名下方左对齐。顶部资料和统计宫格左右边缘与下方正文分区对齐（520px 及以下 Drawer 为 12px，较宽 Drawer 为 24px，右侧 inspector 为 16px）。人物详情统计宫格按实际容器宽度自适应：单元以 7rem 为最小可读宽度并均分剩余空间，容器不足时自然换行，ready 与 Skeleton 共用规则。允许三加一等自然排列；宽度足够时尽量合并行数，不为了整齐而固定为两列或四列。标签必要时自然换行，完整保留说明按钮，不以缩小字号或省略号解决宽度；ready 与 Skeleton 复用相同规则。统计宫格外框、顶部和内部分隔线统一为单层 1px，相邻单元只由一侧绘线；所有人物详情宫格保留圆角及下方 16px 间距；所有宽度下的末行空轨道背景透明，仅实际指标单元绘制底色和边界。Drawer 内容通过 Scrollbar 的公开 content-style 预留与滚动条等宽的独立空间，滚动条不得覆盖文字或图表。
- 共演分析在所有视口下沿用人物详情的顶部布局：人物概览与下方正文共用左右内容线（780px 及以上 16px，低于 780px 为 12px 并与上方查询面板和人物选择入口的外侧边缘对齐），画像保留 96px 宽度和至少 128px 的卡片高度，并以 cover 填满整个人物单元高度；圆角由人物网格的共用外框裁切，姓名、身份与个人指标位于画像右侧。人物网格共用一个圆角外框，底色和各人物单元背景透明，保留原有分隔线结构：人物之间、头像与右侧内容之间、姓名身份区与个人指标区之间、两个个人指标之间均使用单层 1px divider；奇数末行的空轨道保留，不出现整块 divider 底色。组合统计在下方使用自适应圆角宫格：单元以 9rem 为最小宽度，按容器宽度自动排列并均分剩余空间；容器不足 9rem 时缩至可用宽度，标签自然换行，四项指标在宽度足够时同排，末行空轨道保持透明。人物卡中的参与职位使用 / 分隔，保留中文括号相邻侧的紧凑间距。人物区仍按可用内容宽度低于 544px 单列、544px 及以上最多双列排布。移动端外层背景透明且不绘制顶部横线，不增加嵌套面板；ready 与 Skeleton 共用此布局。多人共演的“查看详情”位于姓名与身份下方，使用零 padding 的 span 文字入口，保留 button 语义、Tab 焦点、Enter/Space 激活和 44px 命中区；不占据独立的整行操作栏。评分表现区不加顶部 padding；无共同作品的多人组合仍先显示组合评分对比，再显示“没有共同作品”，两人空结果继续保留唯一空态。
- 搜索、排序、分页等 view 请求保留标题、摘要、工具栏、已选人物和输入焦点，只占位待返回的列表动态数据，分页保留真实 pending 控件。作品与角色使用各自真实行形状。
- 单人物时占位合作人物分析；两人及以上时占位共演分析。候选 rail 和已选人物 tray 在分析请求期间保持真实内容。
- 已解析内容不得因为无关 operation 一起切换为 Skeleton；纯本地交互不显示 Skeleton。成功响应到达后立即展示，不设置人为最短播放时间。
- 每个等待分区使用 `aria-busy="true"` 和一个邻近的 polite status；装饰性 Skeleton 子项对辅助技术隐藏。搜索输入不因结果刷新而卸载，pending 控件只在会产生冲突时禁用。

| 场景 | 标题 | 操作 |
|---|---|---|
| 人物排行首次尚未查询 | 尚未开始查询 | 无；Query Editor 已展开 |
| 共演分析首次尚未查询 | 尚未开始查询 | 唯一主操作“设置查询条件” |
| 人物排行完整查询为零 | 没有符合查询条件的人物 | 无；不显示摘要、工具栏、表格或分页 |
| 共演尚未选人 | 尚未选择人物 | 唯一主操作“选择人物” |
| 已选人物没有共同作品 | 没有共同作品 | 无说明、无按钮 |
| 人物搜索无结果 | 没有符合搜索条件的人物 | 保留搜索控件 |
| 作品搜索无结果 | 没有符合搜索条件的作品 | 保留搜索控件 |
| 角色搜索无结果 | 没有符合搜索条件的角色 | 保留搜索控件 |

页面级、完整分析区和嵌入结果区的空状态高度基线分别为 360 / 420 / 300px。内容簇必须真正居中，间距来自 spacing token，不得依赖拉伸的 Grid track。人物排行的首次查询与完整零结果在所有宽度下直接融入 canvas，不绘制背景、边界或阴影；两者保留同一 360px 居中布局。低于 780px 的共演未选人状态同样移除背景、边界与阴影。搜索导致当前页无人但完整人物数非零时仍属于局部列表空结果，必须保留摘要、搜索、排序与分页恢复控件。

空状态、无结果、数据不足、加载 / 错误保护和缺失提示中的单句文案不加句号。局部动态结果使用 polite status；校验和请求错误在 Query Editor 内使用对应 status / alert。

### Ranking, inspector and people picker

共演以一位来源人物开始分析，再允许从全部可用职位继续选人。已选人物区域在仅一人时显示“点选下方候选人物，查看与已选人物的共演情况”，提示使用现有人物图标与居中文字组成上下排列的一组，在已选列表下方的剩余空间内水平、垂直居中，上下保留 12px 内边距；窄屏单人区继续按内容收拢；窄屏收起的人物选择摘要保留“可继续选择人物，进行多人共演分析”，展开时隐藏这行重复提示及对应可访问文案；不弹窗、不自动展开选人面板，多人时隐藏提示。合作指标卡隐藏头像时，数值与指标说明在左，人名在右侧垂直居中；有头像时保留原布局。合作职位筛选使用完整可用职位目录，独立于排行查询职位和左侧候选浏览的筛选值；宽度由最长选项文本及箭头内边距决定，不拉伸占用剩余空间，合作搜索框以 8rem 为换行基准，窄屏空间不足时允许工具组另起一行并靠左排列。

人物联动复用现有详情内容：共演页面低于 960px 使用人物详情抽屉，960px 及以上在右侧分析区原位展示独立详情卡片，不增加第三栏；左侧选人栏仍遵循 780px 断点。宽屏卡片顶部提供“返回共演分析”，窄屏关闭抽屉返回；临时隐藏原分析保留其浏览状态。增删人物或身份后退出详情并呈现更新后的分析。跨 960px 时保留正在查看的人物，并把卸载区域中的焦点转移到新的详情容器。排行详情增加“查看共演”，共演人物入口增加独立“查看详情”，不改变原有排行行打开详情和合作行进入两人共演的点击行为。共演详情操作区不重复展示姓名／职位和排名摘要，“返回共演分析”与“在排行中查看”在同一行自然排列；未知排名等待／失败独立于详情正文。排行详情不保留顶部操作栏，姓名、副名和职位信息靠左，右侧提供“查看共演”按钮；跨模式使用 Header 普通导航，保留两个模式当前状态，不记录跳转来源、旧分析快照或排行视图回滚，也不增加返回人物排行／返回原分析入口。

排行、候选和合作人物列表共享人物行、指标、搜索、排序和分页语言。当前排序指标用半透明粉色矩形进度；相对偏好以零点为中心，并同时用方向、颜色和正负号编码。

人物排行以 ranking-pane 容器内容宽度 380px 为头像阈值：大于 380px 保留头像，380px 及以下隐藏头像及对应表头空列，名次、双语姓名和完整指标组始终同行；姓名仍保留主名 / 副名两行，长姓名使用省略号。表头、结果行与加载骨架共用此规则，不通过缩小字号挤入内容。

人物排行行底与人物简介区共用 surface 背景色；结果行、选中行和加载骨架共用行底色。深浅色参照相近的感知明度差组织行底与进度：浅色进度使用品牌色与行底的 OKLab 不透明混色（普通 12%、正向偏好 16%），保持清淡的粉色，避免透明叠灰造成浑浊；浅色未选中行悬停时，进度区以同样比例改与悬停行底混色，使整行反馈连续且可辨。深色保留原有品牌色透明叠层（普通 9%、正向偏好 12%），选中边界仍使用品牌色。查询摘要的编辑图标靠右对齐，图标框右侧留距与摘要文字左侧留距一致。

人物排行在视口宽度至少 960px 时将人物详情放在右侧 inspector，使排行栏、间隔与至少 480px 的详情内容同时容纳；低于 960px 时排行占满正文宽度，点击人物后使用从 Header 第一行底边延伸到视口底部的 Drawer。控件 small / medium 与共演模式仍沿用 780px 断点。Drawer 以 240ms 减速动画从下往上进入，关闭时以 180ms 动画向下收起，结束后再恢复背景交互与入口焦点；prefers-reduced-motion 下即时切换。Drawer 正文使用 Scroll ownership 中的 shell scrollbar（780px 及以上 10px、较窄视口 6px），内容溢出时常显，复用页面主体的 thumb 颜色与圆角；轨道从 Drawer 顶部关闭栏下方开始，不覆盖头部。长简介默认收起两行，行尾以“展开”替代省略号且不另占一行，展开后保留“收起”；短简介完整展示；切换人物后重置。人物外链必须具名且可键盘访问。

Desktop 人物选择器先显示已选人物 tray，再显示无额外字段标签的候选职位 selector、搜索、排序与候选 tile；selector 第一项和默认值为“全部职位”，混合页每个人只出现一次并显示后端返回的实际职位集合。仅选中部分当前候选身份时，卡片显示部分选中标记与文字，点击补齐该人物身份，不增加第二个同名人物。已选人物行按换行后的标签内容自然撑高，由列表滚动，不压缩行高导致标签越界。身份按钮高 24px、换行 gap 4px，small NTag 之间约留 6px；单人提示不能压缩普通双身份行，极多身份只在达到四行触控高度的列表上限后滚动。单一职位选项仍可切换查看；桌面选人栏保持常驻，不提供整栏收起按钮。移动端人物选择摘要属于正文任务流，位于 Query Workspace / 查询反馈之后、共演分析主体之前，不进入 Header；它直接列出“姓名 · 职位”，自然换行，不显示冗余标题，并作为 disclosure 在自身下方原位展开同一 CandidatePicker。手风琴不得 teleport、锁定 body、inert/aria-hide App 或建立 modal focus trap；收起态内容不得留在 Tab 顺序。已选人物卡为只读横向结构，图片与信息分离；低于 544px 单列，544px 及以上最多双列，奇数末行保留空轨道。跨 779/780 时，若焦点位于即将卸载的 rail / 手风琴 panel，必须在新分支挂载后转交到正文人物入口 / candidateSearch；不得落到 body、自动展开手风琴或移动外部焦点。

人物排行详情的作品／系列卡片只在存在配音证据时显示“配音角色”，不重复普通职位。角色以常规字重名称和紧凑戏份标签显示，按实际容器宽度排入最多两行；溢出计数 `… +N` 与最后一条角色同排，通过 hover、键盘聚焦或点击显示完整列表，Escape、失焦或指针离开关闭。保留后端返回的每条角色与戏份，系列标签显示该条证据的作品数，单作品不添加恒为 1 的计数。

### Charts and tables

所有真实内容 Tag（标签分组、作品属性、角色戏份、已选人物身份）统一使用 Naive UI `NTag`，查询标签编辑保留内部使用 NTag 的 `NDynamicTags`。中性 Tag 使用 `small`、`round`，视觉状态交由组件主题管理；选中身份保留 primary 语义与键盘可用的移除操作。标签组名称与右侧整组 Tag 垂直居中，不用手动上边距补偿。角色的可见、测量副本与完整浮层使用相同 NTag 几何；对应加载占位继续用 22px 高的圆角 NSkeleton。

共演双栏布局（780px 及以上）右侧分析区正文保留 16px 左右内边距；窄屏保留 12px 左右内边距。

- 共演工作台在 780px 及以上的双栏布局中，左侧人物选择 rail 透明、无外层卡片边框和阴影，右侧分析区使用 surface 卡片（边框、8px 圆角和 panel shadow）；内部人物概览、统计宫格、作品卡片保持各自结构。单人物合作与加载骨架遵循同一外层分工；移动端沿用人物选择折叠面板。
- 人物详情与共演分析的正文分区标题统一使用 18px；标签分组名称列按文字固有宽度排列，与标签内容相隔 12px，不保留固定 104px 空轨道。共演标签标题栏按内容自然撑高，不用 44px 最小高度制造底部留白。
- 人物详情 Drawer 打开时 Header 保持可点击和可键盘访问，仅 Header 下方正文设为 inert；切换共演分析自动收起 Drawer，保留当前人物状态并将焦点留在模式导航。该 Drawer 不声明页面级 aria-modal，Tab 可在 Header 与 Drawer 之间移动；关闭或 Escape 恢复可见入口焦点。
- 人物详情、共演分析（含单人合作）内部不绘制内容块 divider，使用既有 padding / margin 留白分组；顶部资料与标签之间保留 16px 留白。ready 与 Skeleton 必须同步。查询编辑器保留标题下方、阶段之间和操作区上方的 ContentDivider / NDivider，阶段线在 780px 及以上为纵向、较窄视口为横向；职位目录浮层的分组同样保留。卡片、宫格、表格边框、图表轴线和 Header / Drawer 外壳边界由原 owner 保留。
- 人物详情正文保持一致的左右内容线（右侧 inspector 为 16px，较宽 Drawer 为 24px，520px 及以下手机 Drawer 为 12px），分区之间通过留白区分，加载骨架遵循同一规则。
- 独立底色容器内的中性分割线统一将 `--divider` 映射为 `--border`：浅色更深、深色更浅。该规则覆盖查询编辑器、人物详情与移动 Drawer、共演与合作面板、候选手风琴、项目弹层及有底色的行；内部统计网格、作品卡片边框和分隔继承同一颜色。直接位于 canvas 上的排行表头等仍使用原有 `--divider`，组件库控件自身的边框继续由公开主题管理。
- 共演结果正文在桌面沿用人物详情的 16px 左右内边距；低于 780px 时统一为 12px，使人物概览、组合统计、标签、图表与作品正文对齐上方查询面板和人物选择入口的外侧边缘；分区之间仅使用留白，不再绘制 divider。人物详情与共演标签均使用“官方标签、社区标签、我的标签”分组名称，并使用 Naive UI NTag 的 small、round 样式，底色、边框和深浅色适配由组件主题管理；保留 12px 字号和两列标签分组布局，未设置等空标签同样使用 NTag，加载态使用与其 22px 高度一致的完整圆角 Skeleton。组合统计宫格的网格与指标单元背景均为透明，使用单层 1px 外框、单侧内部分隔线，不以 gap 底色叠加边框；ready 与 Skeleton 共用同一套规则。
- 共演相对偏好的空状态与作品卡片共用 54px 最小行高，空状态文字垂直居中；加载态复用相同的行容器。
- 图表背景使用 surface 或透明，网格线使用 divider。
- 评分分布固定为 1–10 十组并在可用宽度内重排；图表自身不能横向滚动。
- 分类系列严格使用固定十色色位；禁止按 Person ID 随机生成颜色。
- 图表数据点默认 8px，hover / keyboard focus 为 12px；最近点命中范围至少 44×44px。
- 人物按时间评分图保留每部作品的独立散点，同季度多个作品在季度区间内横向错开；折线连接后端返回的季度均分。浮层展示作品名、作品评分、原始日期与季度均分。季度刻度使用“冬季、春季、夏季、秋季”，季度宽度不足 24px 时隐藏季节标签，保留自动避让的年份刻度。
- 数据表 Header 使用 raised surface，Row 使用 surface，排序保留组件库默认中性状态。
- 只有 DataTable / shared works table 和人物关系矩阵允许局部横向滚动。组合评分矩阵使用独立的 8px 圆角外框覆盖滚动视口，保证四角边线连续；矩阵块顶部 padding 为 0，不绘制块间 divider，ready 与 Skeleton 共用外框。

### Scroll ownership

共同作品和已选人物列表使用约 20px 扩散范围的上下边缘阴影提示尚未显示的内容；到顶或到底时隐藏对应阴影，不溢出时两侧均隐藏。阴影固定在可视区边缘、避开滚动条且不拦截点击；已选人物区域底部不再绘制固定分隔线。

Header 作为独立的半透明覆盖层固定在顶部，正文滚动时从其下方经过，保留内容透过 Header 的效果。页面使用 NScrollbar，`.app-page-scroll` 标识页面滚动区域；滚动轨道从实时测量的 Header 底边开始，Header 右侧不出现滚动条。正文与 Footer 占满动态视口，内容顶部预留 Header 高度，滚动定位使用同一高度避开遮挡。Grid / Flex 子项必须设置 min-width: 0；不能用永久 overflow-x: hidden 掩盖布局错误。普通嵌入列表使用原生滚动链，只有锁定背景的 Drawer 隔离滚动。

Scrollbar 只有两级：Header 下方的页面滚动区和人物详情 Drawer 外层在视口宽度至少 780px 时为 10px shell，低于 780px 时统一收窄为 6px；Tooltip、列表、矩阵和 popup 保持 6px component。Drawer 内容预留宽度随滚动条同步变化。Query Editor 在正文流中不建立独立 scrollbar。两级共享胶囊 thumb，默认使用 control-border，hover / active 依次使用更强文字色。forced-colors 下只保留尺寸和滚动所有权，颜色交还系统。

移动端共演面板底部不绘制边框线；页脚顶部保留横贯视口内容区的分隔线；共同作品列表与分页之间不添加分隔线。

### Copy and metric labels

可见名称与指标口径遵循 PRODUCT.md 的共享词表。DESIGN.md 只规定它们如何进入界面：

- 当前上下文已唯一确定的信息不重复显示来源、对象或范围；需要直接比较时才补充限定词。
- Placeholder 只写对象或输入边界，帮助、组合语法和统计口径进入可访问说明或邻近帮助。
- 当前模式无效的个人控件和区块直接隐藏，不保留 disabled 占位或解释性空卡片。
- 单句状态不加末尾句号；字段错误陈述无效状态，不用祈使句要求用户操作。
- 搜索、排序、分页、空状态和指标说明在所有消费点使用同一份领域词表，不由组件自行改写同义词。
- 列表不显示“起止条目 / 总数”提示；候选人物标题旁、合作人物标题下也不显示混合职位范围的整段副文案。分页保留页码、每页数量和跳转控件；章节计数、完整统计摘要、职位选项人数及已选人数保持原有表达。

**The Context-First Copy Rule.** 先由当前任务和上下文消除冗余，再补充真正需要的限定词；标签负责命名，说明负责解释，控件负责动作。

## Do's and Don'ts

### Do

- **Do** 用对齐、字号、间距、表面和明确口径管理高信息密度。
- **Do** 在 Light / Dark 下分别消费对应 primary、surface 与 series token。
- **Do** 保留 Bangumi 的社区归属和粉色识别，同时使用一致、现代的交互规范。
- **Do** 让桌面 Header、Query、排行、共演分析和 Footer 共用 1280px 内容线。
- **Do** 在移动端重排结构并保留含义，而不是隐藏关键内容。
- **Do** 为所有状态提供文字、形状、位置或数值上的冗余编码。
- **Do** 让隐藏 panel 同步使用 hidden、inert 与 aria-hidden，不留下可 Tab 的控件。
- **Do** 让 tooltip 在视口边缘翻转、换行并在超高时内部滚动。
- **Do** 让 Header 主题按钮保持一键 Light / Dark 切换；结果与系统不同时保存明确偏好，与系统相同时自动保存 `auto`，全程不打开第二个界面。
- **Do** 让自研 selector trigger 通过项目 token 对齐同尺寸 Naive Select 的文本、placeholder、背景、状态边界和 suffix icon；独立命中节点不形成独立视觉单元。
- **Do** 让职位多选通过一个 Naive DynamicInput owner 增删互斥 selector 行；至少保留一行，空行不进入 Query，非空行按可见顺序映射。
- **Do** 让职位行复用作品范围的 `<780px` 双列与 `max-width:520px` 单列规则，单行只占左列；桌面双阶段布局内保持内部单列。
- **Do** 让职位目录保持最多 480px 的紧凑内容宽度、纯纵向滚动和唯一圆角阴影 owner；职位行用普通 flex 起始流让 selector 拉伸、正方形动作组贴右，不使用 `space-between`；selector 到动作组及两个按钮之间各留 8px，并保留 44px 点击高度。

### Don't

- **Don't** 做成通用 AI 或 SaaS 仪表盘，不使用营销型大标题和无意义指标卡。
- **Don't** 使用紫色渐变、渐变文字、玻璃拟态、装饰性发光或与任务无关的动效。
- **Don't** 嵌套卡片，或同时给同一元素叠加 1px 边框与 16px 以上的宽模糊装饰阴影。
- **Don't** 在卡片、分区或输入上使用 32px 以上圆角；卡片保持 8px，控件保持 6px。
- **Don't** 用大面积留白牺牲数据浏览效率，也不要用小于规范的字号把桌面内容硬塞进移动端。
- **Don't** 只依赖颜色表达状态、数据系列、相对偏好或选择关系。
- **Don't** 在内容卡、列表项、提示或警告上使用大于 1px 的彩色侧边条。
- **Don't** 为普通页面添加装饰网格、条纹背景、手绘 SVG 或无意义编号脚手架。
- **Don't** 选择组件库私有节点或内部变量，不重新发明标准表单、滚动条和 modal affordance。
- **Don't** 把原型 fixture、加载保护或预选人物当成生产状态机。
- **Don't** 让主题偏好通过隐藏 TTL 自动失效，也不要增加主题弹层、设置页、第二个重置动作或常驻三态控件。
- **Don't** 让自研表单控件使用通用 surface、border 或三级文字冒充 Naive control token，也不要选择组件库私有 DOM / 变量来追平外观。
- **Don't** 在单个职位 selector 内堆叠可关闭 Tag 代替互斥切换，也不要允许不同 selector 行选择重复或互斥的职位。
- **Don't** 把职位目录放大成宽面板、暴露横向 scrollbar 或叠加 raw Popover 方形阴影，也不要把增删动作做成 circle、quaternary 或 secondary。

### Verification baseline

每个模式必须在 Light / Dark 下验证 360、390、768、779、780、781、917、1024、1185 和 1440px：

- 页面 scrollWidth 不得超过 clientWidth + 1；评分分布图 scrollWidth 必须等于 clientWidth。
- 779px 必须命中 small，780 / 781px 必须命中 medium。
- Header、Query、Main Workspace 与 Footer 的内容线一致；切换模式或人物数量不改变 1280px 上限。
- 所有外部内容图片在 loading、missing、error 和 loaded 状态下都保持 3:4。
- 代表性列表缩略图与详情图按展示宽度、viewport 和 DPR 请求最小足够的 Bangumi 规格，不统一请求 `large`；网络面板中不得直连 `api.bgm.tv`。
- 图片 loading、missing、error 和 loaded 四态可稳定复现；loading 与 missing 的占位在 Light/Dark 下均能不依赖颜色辨认，候选源耗尽前保持 loading，四态切换无布局位移。
- Query Summary、移动人物摘要和长文案完整换行；截断文本有完整 title 或可访问名称。
- 自定义 focus ring 不被列表、tray、浮层或 media container 裁切。
- 每个可交互 Info 帮助都必须逐点验证 hover、键盘 focus、click / tap、`Escape` 与 blur；说明内容不得只存在于 `title`。
- 主题在缺少偏好或值为 `auto` 时按系统 Light / Dark 初始化并实时变化；切到与系统不同的外观后跨刷新保持且不被系统变化覆盖，切回与系统相同的外观后保存 `auto` 并恢复跟随；全程没有主题弹层，同浏览器标签页同步，URL、Query 与本地查询恢复内容不变。
- 两级 scrollbar、Drawer 高度链和原生滚动链在内外层同时可滚动时仍正确。
- 页面无横向溢出、无重复 ID、无 console error；相关 JSON snapshot 可解析。

业务语义与指标口径进入 PRODUCT.md；实现细节与可执行验收进入生产代码和测试。DESIGN.md 不依赖阶段性决策文件或原型路径才能解释当前规范。

### 人物职业信息（2026-09-11）

界面拼接的分隔符（如 `·`、`/`、`+`）与中文括号 `（`、`）` 相邻时，只移除括号一侧额外添加的空格或分隔间距；普通文字间距保持原样。例如 `声优（主役）· 用户`、`音乐人 / 声优`。查询摘要、图例、身份说明、悬浮提示和读屏文本遵循同一规则，不改写原始名称或简介里的空格。

人物详情姓名下的职业行只展示人物资料的 `career`，不混入当前查询职位；中文职业名称以 ` / ` 分隔。中文名保持主标题层级，原文名与职业行使用常规字重；职业行使用辅助文字颜色，避免三行形成粗、细、粗的交替强调。

### Loading review decision (2026-09-08)

只把尚未由后端返回的动态信息做成 Skeleton。固定标题、表头、评分／职位说明、图例与坐标刻度、搜索／排序／切换组件和分页不使用 Skeleton；已有查询参数或已解析数据可确定的文字保持真实。Tag 若需要占位，仍以一个完整圆角块保留整个标签的尺寸，不恢复“标签外壳＋内部文字骨架”。图集不按普通／含角色统计重复展示人物详情框架。

Skeleton 的固定盒与文字行盒应复用实际内容的结构和排版规则；不要为占位行另设更大的行高或额外副行。排行摘要在已知包含角色统计时保留同样的字段与字号，作品卡仅在查询具备配音角色时预留对应角色区域。对照审核区分稳定布局偏差与后端条数、文字长度、标签换行、系列成员数导致的自然尺寸变化。

单人物合作的最高指标卡采用横向信息布局：头像与姓名在左，数值与指标名在右并右对齐，卡片最小高度 72px；按单张卡片的内容宽度适配，低于 10rem 时改为人物在上、指标在下的左对齐布局。姓名允许换行，保留原有点击、悬停、禁用和焦点行为；加载骨架共用布局。
