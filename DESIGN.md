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
  canvas-light: "hsl(240 9.6% 96.2%)"
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

App Header 只由品牌栏、人物排行 / 共演分析模式、紧邻模式右侧的分享查询操作和主题操作构成。可折叠 Query Workspace 是主内容区的第一个任务表面，位于反馈和结果之前。人物排行模式随后使用共享人物排行 + 详情面板；共演分析模式在 Query Workspace 和反馈之后先显示紧凑人物选择摘要，桌面进入候选人物 rail、移动在摘要下原位展开候选手风琴，再进入关系分析。

查询摘要、查询编辑器、人物排行、共演分析和 Footer 共用一个 1280px 最大内容线。Header chrome 横跨视口，但内容不能随模式、已选人数或结果状态改变最大宽度。

### 响应式结构

| 视口 | 人物排行 | 共演分析 |
|---|---|---|
| 1180px 及以上 | 完整指标列 + inspector | 348px rail；分析区可双列 |
| 918–1179px | 收敛次要列，保留当前排序指标 | 320px rail；分析区单列 |
| 780–917px | 紧凑排行 + inspector | 300px rail；分析区单列 |
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

### Neutral

Light 使用低饱和冷灰：canvas 承载页面，surface 承载桌面主工作区，surface-raised 只用于输入、弹出层和少量抬升内容，surface-sunken 用于 segment、表头或内嵌区域。Header 使用独立的白色 chrome。

Dark 使用收紧的近黑层级：canvas、surface、surface-raised 与 surface-sunken 之间保持可辨但克制的级差。深色 Header chrome 比主体更深，但不能形成纯黑断层。

Header Bar 在 Light 和 Dark 均使用 84% 基色透明度与 blur(16px) saturate(135%)。正文内的 Query Summary 和展开后的 Query Editor 共同使用普通 surface；输入控件仍可使用 surface-raised。每个像素只绘制一层背景。移动 Drawer 使用独立的 96% 偏灰表面，不与 Header 或正文查询表面混用。

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
- 人物排行与单人共演“合作人物”在低于 780px 时使用 12px；780px 及以上主姓名、排名和指标使用 14px，副名保留 12px。
- 单人共演顶部关键数字在低于 780px 时为 20px，780px 及以上为 28px。

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

控件高度、字号、内边距和紧凑度优先由组件公开的 size / density API 管理。页面主工具栏与人物 Inspector 的搜索 / 排序 / 方向工具组共享断点规则：桌面使用 medium、紧凑视口使用 small；候选 rail 等其他嵌入式窄栏可以在明确设计下固定使用 small。同一工具组的 Input、Select 与方向 Button 必须共享 size 和 input control 背景。Light control background 为白色，Dark 为 10% 白色叠层，与组件库 Select 输入表面一致。自研 selector trigger 必须通过项目语义 token 同步同尺寸 Naive Select 的 text、placeholder、background、default / hover / focus outline 与 suffix icon 角色；suffix 可以保留独立 44px 命中节点，但视觉上不得出现分割线或独立 hover cell。Info/help icon 是可交互帮助，不降级为 placeholder 装饰色。排序方向使用带直线箭身的方向箭头，不使用仅由两段折线构成的 chevron。中性文字、边界与 neutral hover / pressed 可以保留组件库合格默认；项目只覆盖品牌主色、必要前景、圆角、交互 Tag、Scrollbar、Skeleton 与 Drawer 等明确设计契约。更换组件库时重新建立映射，不把原型库的 override 结构带入生产规范。

### Buttons and icon actions

- 主操作使用组件库的 primary button；Light 使用白色前景，Dark 使用近黑前景。
- 常规控件在 small / medium 下分别使用 28 / 34px 可见高度，交互命中区至少 44px。
- 同一容器、同一语义的图标必须使用相同尺寸和光学中心；不同层级可以使用不同可见尺寸，但不能因此缩小命中区。
- Header action 共享同一右侧内容线和 18px 图标基线；紧凑 Info、行内移除和 Drawer 关闭按语境分级，不建立脱离容器的机械图标尺。
- 分享查询使用标准 share 图标，固定紧邻模式切换器右侧；它与主题操作使用相同 18px 图标基线、neutral quaternary 外观和至少 44×44px 命中区，不使用品牌色填充与模式导航竞争。
- 自实现交互使用 2px focus ring 与 2px offset；组件库控件保留其合格焦点表现。forced-colors 下交还系统 Highlight。
- 跨区动作（分页、定位、揭示或替换当前 surface）只在目标请求成功提交后滚动到目标区域，聚焦具名 region 或目标控件，并短暂强调完整目标；失败、取消或 stale completion 不移动焦点。强调到期只移除视觉状态，不得主动 blur。滚动与强调服从 reduced motion。
- 分页的上一页、页码、快速跳转和下一页必须由原生可聚焦 button 承担，暴露当前/禁用状态与可访问名称；Naive 可继续拥有页码计算、size picker 与 jumper，但不得留下只能指针点击的 DIV。可见尺寸服从 small / medium，实际命中区至少 44px。

### Theme preference

- 没有保存值或保存值为 `auto` 时，页面初始主题取自系统 Light / Dark，并在页面打开期间实时跟随系统变化；系统变化本身不写入偏好。
- Header 永久只保留一个太阳 / 月亮主题操作。激活后立即切换到相反的已解析主题，不打开 Popover、菜单、设置页，也不显示固定状态或第二个重置动作。
- 切换后的主题与系统当前主题一致时保存 `auto` 并继续跟随系统；不一致时保存明确的 `light` 或 `dark` 并忽略后续系统变化。三个值都不设置过期时间。
- 同一浏览器的其他已打开标签页同步 `auto|light|dark` 与移除事件；主题仍不进入 URL、Query、分享或请求状态。

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

首次没有 Applied Query 时自动展开编辑器；成功后自动收起。校验失败、请求失败或取消时保持展开并保留 draft 与已有结果。当前主查询反馈在展开的 Query Editor 内显示时，正文不得重复渲染同一 operation/message；人物详情、合作人物和共演分析等没有编辑器 owner 的反馈继续使用正文全局位置。未变化的查询再次提交是静默 no-op：不请求、不折叠、不显示编辑器内或正文重复状态。已有 Applied Query 时切换模式，目标模式直接加载同一查询且不显示“再次应用条件”的中间空状态。普通共演查询成功且选择为空时按后端顺序尝试默认选择最多前两人及每人完整返回身份；只能原子加入不超过 20 个身份的完整人物集合，不能截断身份或把自动跳过展示成用户操作错误。移动端不能自动展开人物选择手风琴；精确分享、已保留选择和候选视图操作不触发默认选择，原型 fixture 预选不得进入生产状态。

分享图标在没有 Applied Query 时保留稳定槽位但不可用；有未应用 Draft 或下一次查询正在等待时，仍只分享当前可见结果对应的最后成功 Applied Query。按钮可访问名称和 Tooltip 使用“复制当前查询链接”。成功复制后图标短暂切换为 check，持续约 1500ms，并通过 `aria-live="polite"` 宣告“查询链接已复制”；不弹成功 Modal。Clipboard API 不可用或失败时，在按钮旁提供含只读可选链接的轻量 Popover，不能让用户丢失已经生成的链接。

分享入口在所有断点都保持在模式切换器右侧。低于 780px 时可以缩小模式控件的内部间距或隐藏品牌文字，但不能移动分享操作、缩小 44px 命中区或使其与主题按钮重叠。生成、复制和反馈属于本地即时状态，不显示 Skeleton。

人物排行与共演分析使用同一套由 Naive DynamicInput 承载的可筛选职位列表，阶段标题统一为“职位”，空行 placeholder 统一为“选择职位”。模式相关筛选语义只由标题旁的 Info icon 及其 Tooltip / 可访问名称承载，职位字段上方不重复显示辅助说明。至少保留一行 selector；每行至多选择一个职位，选择新职位直接替换本行旧值并收起目录。新增行先保持为空，删除行只删除本行值；只有非空行按当前顺序进入有序 `positionKeys`，空行不进入 Query。其他行已选职位及其互斥职位在当前目录禁用，不能产生重复 key。职位行复用作品范围完全相同的响应式规则：`width < 780px` 的阶段堆叠布局先使用两列，单行只占左列而不横跨；同一 `max-width: 520px` 规则再覆盖回单列，780px 及以上因职位阶段本身已处于右栏而保持内部单列。

职位浏览为空搜索时使用“分类 → 职位”两级结构；搜索时扁平化并按职位 key 去重，同时显示所属分类。职位实体只有一个 canonical key，但可以作为展示引用同时出现在常用入口、Bangumi 声明的全部分类和搜索结果中；任一副本状态同步。动画/游戏额外提供产品定义的“配音类”，其中 main/all 使用单选替换语义；“常用职位”位于同一 selector 内，不建立第二个目录 owner。每行 selector 复用同一目录实现，任一时刻只允许一个由 Naive UI 定位、portal 到 body 的锚定弹层处于打开状态；搜索输入属于当前行 trigger combobox，面板内不得重复搜索框。移动触发器保持 small 的 28px 可见高度与至少 44px 命中区；DynamicInput 的增删动作同样使用公开 Naive Button 和至少 44px 命中区。紧凑面板列表固定为 Naive small selector 的 212.8px 上限，以 bottom-start 为首选并在空间不足时使用组件库公开的 flip / shift 完整留在视口内，同时裁切全部子元素到同一 6px 圆角。职位 item 严格复用 Naive option 几何：small/medium 分别为 28/34px、14px/21px 字体行高、`0 12px` padding、0px 外层圆角与 0px 行间距；hover、键盘 pending 和 selected-pending 使用左右各内缩 4px、6px 圆角、300ms `cubic-bezier(.4, 0, .2, 1)` 渐变的状态层，静止选中态只保留品牌色文字与勾选。可折叠分类 item 使用主文字色，保留相同横向几何并额外增加 4px 上下 padding，small/medium 高度为 36/42px；计数与箭头使用三级文字色。搜索上下文单行内联并截断。只有 trigger 使用与相邻 Naive selector 相同的品牌 focus 状态；面板和箭头不得追加 focus border/attention halo，面板使用 Naive 等价的中性 menu shadow。弹层不得参与 Query Editor 布局或改变参数面板高度，删除当前行、关闭或跨 780px 断点时必须移除内容与 follower，并把焦点交给仍存在的等价控件。

职位目录不与窄 trigger 强制等宽，但保持改造前的紧凑尺度：桌面按内容扩展到最多 480px，并始终保留至少 12px 视口边距；紧凑视口维持单列。目录只允许纵向滚动，不出现横向 scrollbar。职位目录自身是唯一 background / 6px radius / Naive 等价 menu shadow owner，raw Popover 外壳不得再绘制第二层方形 shadow。DynamicInput 的增删动作使用普通 default 矩形 Naive Button，不使用 circle、quaternary 或 secondary；可见按钮与当前 size 等高等宽，small / medium 分别为 28×28px / 34×34px，并保留 44px 点击高度。职位行使用普通起始 flex 流：selector 以 `flex: 1 1 0` 自适应填满剩余位置，动作组固定在右侧且不使用 `space-between`；selector 与动作组之间、两个按钮之间均使用 `--space-2`（8px），最右按钮贴齐字段右边缘。

输入有值时才显示 clear action，空值不预留不可见尾槽。Select trigger 与 menu 必须使用同一 size。Tooltip / Popover portal 到 body，通过公开定位与视口感知的最大宽度保持在可视视口内。

**The One Owner Rule.** 一个选择集合只由一个列表 owner 完整表达；DynamicInput 可以用多行 selector 映射同一有序数组，但每行只拥有一个值、重复值不可选且至少保留一行。不得再建立第二套列表或并行 owner。其他表面只读呈现，并随唯一真源更新。

### Tags and chips

Tag 的外观由自身是否可操作决定：

- 可关闭、可点击移除或直接切换状态：当前主题粉色、6px 圆角矩形。
- 纯展示信息：中性边界与表面、999px 胶囊；即使位于链接或可聚焦容器内也不变粉。
- Skeleton 必须镜像真实 Tag 的矩形 / 胶囊语义及响应式高度。

主角 / 主役只提高中性色层级，不使用粉色。分类色不得用于普通 Tag。

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

生产 Skeleton 必须对应真实 pending request，并与请求影响的最小稳定布局边界一致；人物详情 Skeleton 的 intro 网格、画像尺寸、顶对齐、紧凑方角和 Drawer 内容边缘必须与最终 PersonProfile 相同：

- catalog 等待只占位职位 selector，不遮住 Header、模式和 Query Editor 其余字段。
- 新核心查询可以占位对应模式的结果主体；人物排行主等待态按最终摘要、工具栏、列头、当前 page-size 行和分页的区域/响应式轨道排布，但可见占位叶必须直接使用组件库 Skeleton，不能自绘第二套渐变、关键帧或占位组件。排行列表返回后，人物详情单独占位。候选等待不伪造已选人物或共演结果。
- 人物详情在桌面及 521–779px Drawer 使用 flush 的 160×213 画像；520px 及以下才切换为带 16px profile inset 的 96×128 画像。所有 Drawer 画像保持方角。
- 搜索、排序、分页等 view 请求保留标题、摘要、工具栏、已选人物和输入焦点，只占位列表行与分页。作品与角色使用各自真实行形状。
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

排行、候选和合作人物列表共享人物行、指标、搜索、排序和分页语言。当前排序指标用半透明粉色矩形进度；相对偏好以零点为中心，并同时用方向、颜色和正负号编码。

桌面人物详情位于结果旁的 inspector；移动使用从 Header 第一行底边延伸到视口底部的 Drawer。长简介默认收起两行，短简介完整展示；切换人物后重置。人物外链必须具名且可键盘访问。

Desktop 人物选择器先显示已选人物 tray，再显示无额外字段标签的候选职位 selector、搜索、排序与候选 tile；selector 第一项和默认值为“全部职位”，混合页每个人只出现一次并显示后端返回的实际职位集合。单一职位选项仍可切换查看；收起 rail 保留 56px。移动端人物选择摘要属于正文任务流，位于 Query Workspace / 查询反馈之后、共演分析主体之前，不进入 Header；它直接列出“姓名 · 职位”，自然换行，不显示冗余标题，并作为 disclosure 在自身下方原位展开同一 CandidatePicker。手风琴不得 teleport、锁定 body、inert/aria-hide App 或建立 modal focus trap；收起态内容不得留在 Tab 顺序。已选人物卡为只读横向结构，图片与信息分离；低于 544px 单列，544px 及以上最多双列，奇数末行保留空轨道。跨 779/780 时，若焦点位于即将卸载的 rail / 手风琴 panel，必须在新分支挂载后转交到正文人物入口 / candidateSearch；不得落到 body、自动展开手风琴或移动外部焦点。

### Charts and tables

- 图表背景使用 surface 或透明，网格线使用 divider。
- 评分分布固定为 1–10 十组并在可用宽度内重排；图表自身不能横向滚动。
- 分类系列严格使用固定十色色位；禁止按 Person ID 随机生成颜色。
- 图表数据点默认 8px，hover / keyboard focus 为 12px；最近点命中范围至少 44×44px。
- 数据表 Header 使用 raised surface，Row 使用 surface，排序保留组件库默认中性状态。
- 只有 DataTable / shared works table 和人物关系矩阵允许局部横向滚动。

### Scroll ownership

页面只负责纵向滚动。Grid / Flex 子项必须设置 min-width: 0；不能用永久 overflow-x: hidden 掩盖布局错误。普通嵌入列表使用原生滚动链，只有锁定背景的 Drawer 隔离滚动。

Scrollbar 只有两级：viewport 和 Drawer 外层为 10px shell；Tooltip、列表、矩阵和 popup 为 6px component。Query Editor 在正文流中不建立独立 scrollbar。两级共享胶囊 thumb，默认使用 control-border，hover / active 依次使用更强文字色。forced-colors 下只保留尺寸和滚动所有权，颜色交还系统。

### Copy and metric labels

可见名称与指标口径遵循 PRODUCT.md 的共享词表。DESIGN.md 只规定它们如何进入界面：

- 当前上下文已唯一确定的信息不重复显示来源、对象或范围；需要直接比较时才补充限定词。
- Placeholder 只写对象或输入边界，帮助、组合语法和统计口径进入可访问说明或邻近帮助。
- 当前模式无效的个人控件和区块直接隐藏，不保留 disabled 占位或解释性空卡片。
- 单句状态不加末尾句号；字段错误陈述无效状态，不用祈使句要求用户操作。
- 搜索、排序、分页、空状态和指标说明在所有消费点使用同一份领域词表，不由组件自行改写同义词。

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
- 主题在缺少偏好或值为 `auto` 时按系统 Light / Dark 初始化并实时变化；切到与系统不同的外观后跨刷新保持且不被系统变化覆盖，切回与系统相同的外观后保存 `auto` 并恢复跟随；全程没有主题弹层，同浏览器标签页同步，URL、Query 与分享内容不变。
- 两级 scrollbar、Drawer 高度链和原生滚动链在内外层同时可滚动时仍正确。
- 页面无横向溢出、无重复 ID、无 console error；相关 JSON snapshot 可解析。

业务语义与指标口径进入 PRODUCT.md；实现细节与可执行验收进入生产代码和测试。DESIGN.md 不依赖阶段性决策文件或原型路径才能解释当前规范。
