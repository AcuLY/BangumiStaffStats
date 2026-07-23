# 原型全局设计统一决策登记

> 最近同步：2026-07-23
> 会话证据：[`2026-07-18-19-prototype-global-design-unification.md`](../design-sessions/mypc/2026-07-18-19-prototype-global-design-unification.md)
> 会话原文：[`transcripts/README.md`](../design-sessions/mypc/transcripts/README.md)

> 颜色审计说明：2026-07-20 的主题色与 Naive UI override 候选实现已按用户要求全部回退。本文只保留已确认与待确认的决策记录；不得从当前代码或页面效果反推尚未确认的设计结论。

## 状态定义

- `ACCEPTED_IMPLEMENTED`：用户已确认，且在当前 HEAD 中有实现和规范依据。
- `ACCEPTED_PENDING_IMPLEMENTATION`：用户已确认规则，但实现与验收尚未完成。
- `OPEN_IMPLEMENTATION`：决策已明确，但实现、验证或文档对齐尚未完成。
- `PROVISIONAL_IMPLEMENTED`：用户同意作为当前工作基线，且已有实现与文档；后续可快速重开调整，不表示永久冻结。
- `NEEDS_DECISION`：仍需要用户选择口径，不能由实现现状反推设计结论。
- `DEFERRED`：用户明确收窄或延期了范围。
- `CLOSED_USER_CONFIRMED`：用户确认事项已完成并要求关闭，不再追加范围或验收。

## 登记表

| ID | 状态 | 主题 | 当前结论 |
|---|---|---|---|
| `DR-UI-PALETTE-001` | `PROVISIONAL_IMPLEMENTED` | 分类色盘 | 固定十个色位与基本色相保持不变；已按当前 Light / Dark 主色重建两套明度和彩度，并同步到规范、palette lab、runtime 和测试，等待页面复核。 |
| `DR-UI-TYPE-001` | `ACCEPTED_IMPLEMENTED` | 全局字号阶梯 | `10/12/14/16/20/24/28px`；18px 只用于响应式 `NStatistic`；Naive UI 保留原生 preset。 |
| `DR-UI-TYPE-002` | `ACCEPTED_IMPLEMENTED` | 单人共演字号 | “合作人物”排行移动 12px、桌面 14px；顶部两个大数移动 20px、桌面 28px。 |
| `DR-UI-TYPE-003` | `ACCEPTED_IMPLEMENTED` | 更多选项标题 | 用户确认条目标题移动 12px、桌面 14px；外层 disclosure 标题不受影响。 |
| `DR-UI-CONTROL-001` | `ACCEPTED_IMPLEMENTED` | 交互尺寸 | `<780 small / >=780 medium`，常规控件 28/34px，44px 最小命中区。 |
| `DR-UI-RESPONSIVE-001` | `ACCEPTED_IMPLEMENTED` | 主体信息容器 | 桌面端由内容表面整体卡片组织主体信息；移动端移除整体卡片，让内容直接进入灰色页面流。 |
| `DR-UI-LAYOUT-001` | `ACCEPTED_IMPLEMENTED` | 工作台统一最大宽度 | 用户确认选项 3：人物排行、共演分析、Header / Query 与 Footer 共用 `1280px` 内容线；Header 背景铺满视口，移动端布局不变。 |
| `DR-UI-SCROLLBAR-001` | `ACCEPTED_IMPLEMENTED` | Scrollbar 分级 | 壳层 10px、组件层 6px；当前本机脏改动是在既定规则内继续修正实现。 |
| `DR-UI-IMAGE-001` | `ACCEPTED_IMPLEMENTED` | 外部内容图片 | 人物、角色、作品等 `SafeImage` 统一 3:4，调用方只指定宽度。 |
| `DR-UI-IMAGE-002` | `ACCEPTED_PENDING_IMPLEMENTATION` | Bangumi 图片请求规格 | 按资源类型、语义展示宽度和 DPR 集中选择能够覆盖目标像素宽度的最小规格；禁止所有调用默认 `large`。 |
| `DR-UI-IMAGE-003` | `ACCEPTED_PENDING_IMPLEMENTATION` | 图片生命周期占位 | `SafeImage` 明确区分 loading、loaded、missing 和 error；加载中与无图片必须使用不同占位，四态均保持 3:4。 |
| `DR-UI-ICON-001` | `ACCEPTED_IMPLEMENTED` | Icon 尺寸 | 当前语境尺寸优先；Header 主题与 disclosure 图标统一为 18px 并对齐，其余有明确容器层级或光学补偿的尺寸保持现状。 |
| `DR-UI-HELP-001` | `ACCEPTED_IMPLEMENTED` | Info 帮助与 Tooltip 触发 | 所有可交互 Info 说明统一支持 hover、focus、click / tap、Escape 与 blur，并使用显式可见状态；工作台 Info 入口已按统一契约收敛。 |
| `DR-UI-SELECTOR-001` | `ACCEPTED_PENDING_IMPLEMENTATION` | 职位 selector | 两种模式继续共用一个有序多选 owner；正式版改为动态两级 selector，完整展示 Bangumi 多分类，并在同一状态上补充常用入口和配音类。 |
| `DR-UI-COLOR-001` | `ACCEPTED_IMPLEMENTED` | 基础界面色值真源 | 用户确认后续对账优先保留当前运行效果；项目自定义 token 的当前 CSS 色值已同步到 `DESIGN.md` 和结构测试，未覆盖的 Naive 默认色不复制到文档。 |
| `DR-UI-COLOR-002` | `ACCEPTED_IMPLEMENTED` | Light / Dark Header 层级 | Header 采用 Light `hsl(0 0% 100%)`、Dark `hsl(240 12.6% 2.4%)`，各行、展开面板及两种主题统一使用 `92%` 透明度。 |
| `DR-UI-COLOR-003` | `PROVISIONAL_IMPLEMENTED` | 分主题界面主色与 Select 状态 | 用户暂定 Light `#C82A70` / Dark `#F16A9C` 为当前基线；两套主色三态及固定十色色盘均已写入 `DESIGN.md`，后续可从集中入口快速修改。Select 继续保留默认 selected / hover 背景。 |
| `DR-UI-COLOR-004` | `ACCEPTED_IMPLEMENTED` | Naive UI 覆盖范围 | 用户最终确认保留 Naive common 与组件中性色默认值，不做全量语义映射；现有明确覆盖继续保留。 |
| `DR-UI-COLOR-005` | `CLOSED_USER_CONFIRMED` | 交互控件边界对比度 | 用户最终确认保持当前 Naive UI 默认边界，不恢复此前已回退的 `3:1` 边框 override；自定义组件现有边界保持不变。 |
| `DR-UI-COLOR-006` | `ACCEPTED_IMPLEMENTED` | 桌面 / 移动端主体表面配色 | 主体灰底为 Light `hsl(240 9.6% 96.2%)` / Dark `hsl(240 7.8% 5.8%)`；桌面内容表面为 Light `hsl(240 18.5% 98.3%)` / Dark `hsl(240 7.1% 9.8%)`，移动端保留直接页面流。 |
| `DR-UI-COLOR-007` | `ACCEPTED_IMPLEMENTED` | 移动端 Drawer 配色 | 两个 Drawer 使用独立的偏灰 `96%` 半透明表面；人物选择标题栏不再重复绘制背景或 blur。 |
| `DR-UI-DATA-001` | `CLOSED_USER_CONFIRMED` | “对齐两页数据” | 用户确认此项已经完成并要求跳过；不再追加范围定义或验收工作。 |
| `DR-UI-FALLBACK-001` | `ACCEPTED_IMPLEMENTED` | 初始空白页 | 首次未查询保留“设置查询条件”，共演未选人物保留“选择人物”；两者均作为错过既有入口后的明确恢复操作。 |

## 已确认项

### DR-UI-PALETTE-001

2026-07-20，用户再次确认采用调色盘会话中的固定 10 色。`DESIGN.md` 第 3 节是规范真源：

```text
#c60475, #158486, #d15c56, #8f68cb, #cd9c1f,
#549957, #1a89c5, #444898, #d55e89, #ea955e
```

- 后续会话自行替换的 `#a77400 / #6b70c5 / #b9683d` 未获用户确认，不再使用。
- `frontend/prototypes/palette-lab.html` 使用新的本地存储版本，从确认色盘开始实验，不让旧缓存覆盖新基线。
- `frontend/src/workbench/components/AnalysisDashboard.vue` 使用相同顺序；共同作品占色位 1，人物从色位 2 开始。
- 色盘仅用于分类数据。Light/Dark 下的可读性通过名称、位置、标记、数值及必要的描边或前景混合补足，不再改写这 10 个规范色值。

2026-07-22，用户因界面主色已经拆分为 Light `#C82A70` / Dark `#F16A9C`，重新开启分类色盘并要求建立深浅两套版本。当前评审基线遵循以下范围：

- 十个色位、名称、顺序和基本色相保持不变；共同作品仍占色位 1，人物从色位 2 开始。
- 色位 1 分别锚定当前 Light / Dark 主色；其余九色只调整感知明度和彩度，不改变分类语义。
- Light 版本压低偏亮的金、橙等颜色，保证主要浅色内容表面上的图形对比约 `3:1`；Dark 版本整体提高明度并适当降低彩度，避免近黑表面上的暗沉与荧光感。
- runtime 根据当前主题选择预定义数组；主题切换不得改变人物与色位之间的顺序映射。
- 本轮作为 `PROVISIONAL_IMPLEMENTED` 评审基线进入 `DESIGN.md`、`categoricalPalette.ts`、palette lab 与结构测试，页面复核后再转为最终确认。

### DR-UI-TYPE-002

- 单人共演“合作人物”排行行：移动 12px、桌面 14px。
- 单人共演顶部“我的收藏 / 合作人物”大数：移动 20px、桌面 28px。
- 实现复用现有语义字号 token，并由结构测试锁定 `<780px` 断点。

### DR-UI-TYPE-003

用户确认 Query Editor“更多选项”中的条目标题属于字段标签：

- `<780px`：`--text-caption`（12px）；
- `≥780px`：`--text-control`（14px）。

该规则只覆盖“显示 NSFW / 合并续作 / 播出时间范围”等条目标题，不改变外层“更多选项” disclosure 按钮。

### DR-UI-IMAGE-002

2026-07-23，用户确认生产前端调用 Bangumi 图片 API 时必须选择适合当前显示槽位的规格，不能沿用原型中所有调用通过默认参数请求 `large` 的实现。

**已确认规则**

- 规格选择只有一个集中 owner。调用方提供资源类型、ID、语义 CSS 展示宽度和响应式 `sizes` 信息，不直接拼 URL 或硬编码 `small | grid | large | medium | common`。
- 实施前先根据上游文档或受控响应核实人物、角色、作品各规格的真实像素宽度，并建立版本化能力表；本文不在证据不足时臆测各规格的像素值。
- 选择目标为 `CSS 展示宽度 × devicePixelRatio`。使用能够覆盖目标像素宽度的最小可用规格；若上游没有足够大的规格，才回退到该资源的最大规格。
- 固定宽度槽位可生成单一 URL；跨断点变化的槽位应由同一能力表生成准确的 `srcset/sizes` 或等价机制，交给浏览器按 viewport 与 DPR 选择。
- 后端图片代理只校验并透传显式 `type`，不替前端猜测 UI 尺寸；缺失或非法 `type` 必须失败，不能静默回退 `large`。

**验收边界**

- 规格策略单测覆盖不同资源、代表性列表/详情宽度、断点和 DPR，断言选择“最小足够规格”以及超出上限时的最大规格回退。
- 浏览器网络记录必须证明小缩略图与详情图并非统一请求 `large`，且页面没有直连 `api.bgm.tv`。
- 规格表的来源、核实日期和测试向量随实现落盘；上游规格变化只修改能力表/adapter，不逐个修改业务组件。

### DR-UI-IMAGE-003

2026-07-23，用户确认图片加载期间与确定无图片时必须使用不同占位。结合现有候选源回退，`SafeImage` 的生产状态统一为：

| 状态 | 进入条件 | 视觉与行为 |
|---|---|---|
| `loading` | 存在候选源，尚未成功加载；尝试后备源期间也属于此状态 | 使用与真实图片同尺寸的骨架表面；可选动效必须服从 `prefers-reduced-motion`。 |
| `loaded` | 任一候选源成功解码 | 显示真实图片。 |
| `missing` | 调用方没有提供任何可用源，或权威数据明确表示无图片 | 使用稳定的资源类型占位，不使用 loading 骨架。 |
| `error` | 所有候选源均失败或超时 | 使用可与 missing 区分的克制失败占位；是否提供重试动作由外层场景决定。 |

- 当前实现以 `!currentSource` 同时表示无图和候选源耗尽，必须改成显式状态机；后备源尚未耗尽时不能提前显示 error。
- loading 与 missing 至少在形状/内容上明确不同，不能只换 class 名或只依赖颜色；error 也应保留独立语义，避免把上游故障伪装成“本来没有图片”。
- 四种状态共用 3:4 固定占位盒，不得引发布局位移。紧凑占位默认 `aria-hidden`，实体名称由相邻文字提供；当图片是唯一信息载体时，调用方另行提供非重复的可访问名称。
- 组件测试覆盖 `loading -> loaded`、无源 `missing`、候选源回退和全部失败 `error`；Light/Dark 与关键 viewport 的视觉回归验证占位差异、比例和 reduced-motion。

## 配色决策明细

### DR-UI-COLOR-002

**扫描证据**

- 修复前 Dark body 约为 `#0c0d11`，Header 约为 `#07070b`，两者对比约 `1.03:1`，视觉上都是近纯黑。
- Light body 是浅灰，Header 接近白色；Light 用“surface 高于 canvas”，Dark 却用“Header 低于 canvas”，语义关系不一致。
- 用户已确认桌面和移动端的主体表面结构不同，因此本项不再假设两端使用同一套相邻背景关系。

**用户已确认的方向**

- Light / Dark 的主体内容都放在偏灰的中性表面上。
- Light Header 使用更白的颜色，Dark Header 使用更黑的颜色。
- Header Bar、收起态 Query Summary、展开态 Query Editor 使用完全相同的基色、透明度和模糊参数，视觉上是一块连续 chrome。
- Light 与 Dark 的 Header 透明度必须使用同一个数值；主题差异只来自黑 / 白基色，不能分别微调 alpha。
- 2026-07-21，用户确认统一透明度为 `92%`。
- 2026-07-21，用户初次确认 Header 基色为 Light `#FFFFFF`、Dark `#08080B`；随后在整体灰阶继续压暗时将 Dark chrome 收紧到 `hsl(240 12.6% 2.4%)`，并于同日确认当前整组方案。
- Header 与主体必须在静止状态下即可分辨，不能只依赖滚动、阴影或内容边界才看出差异。
- 2026-07-21，用户在独立 Light / Dark HTML 原型中确认 Header、主体与卡片的整组灰阶；原型见 [`surface-color-preview.html`](../../frontend/prototypes/surface-color-preview.html)。

**已确认并实施的表面映射**

| 语义表面 | Light | Dark | 用途 |
|---|---|---|---|
| Header chrome | `hsl(0 0% 100%)` / `92%` | `hsl(240 12.6% 2.4%)` / `92%` | Header Bar、Query Summary 与展开后的 Query Editor 使用同一连续半透明顶栏；两种主题共用一个 alpha。 |
| 主体灰底 | `hsl(240 9.6% 96.2%)`（约 `#F4F4F6`） | `hsl(240 7.8% 5.8%)`（约 `#0E0E10`） | Desktop 页面与人物 rail 所在底面；Mobile 主体信息直接落在此页面底色上。 |
| 内容表面 | `hsl(240 18.5% 98.3%)`（约 `#FAFAFB`） | `hsl(240 7.1% 9.8%)`（约 `#17171B`） | Desktop 主体整体卡片；Mobile 仅用于确有分组需要的局部信息块。 |
| 抬升表面 | `hsl(0 0% 100%)` | `hsl(240 6.8% 12.8%)`（约 `#1E1E23`） | 输入控件、弹出层和少量真正需要抬升的局部内容，不作为大面积主体底色。 |
| 下沉表面 | `hsl(240 10.2% 92.4%)`（约 `#EAEAEE`） | `hsl(240 8.5% 4.5%)`（约 `#0B0B0C`） | segment、表头或内嵌区，不与 Header 混用。 |
| 边界 / 分隔 | `hsl(240 7.9% 86.1%)` / `hsl(240 8.5% 90.8%)` | `hsl(240 6.1% 20.5%)` / `hsl(240 5.9% 15.8%)` | 前者用于卡片边界，后者用于内容分隔；Naive UI 控件边界按 `DR-UI-COLOR-005` 保留默认，自定义组件现有边界不变。 |

- Header 与主体采用刻意收紧的大面积表面级差，不把两者之间的低对比当成文字或控件边界的无障碍依据；Dark 实际页面约为 Header `#060608`、主体 `#0E0E10`、内容表面 `#17171B`。
- Dark 最弱辅助文字 `--text-3` 对内容表面的对比约为 `6.42:1`，仍高于常规文字 `4.5:1` 的最低要求。
- Header 基色和统一透明度最终确认为 Light `hsl(0 0% 100% / .92)`、Dark `hsl(240 12.6% 2.4% / .92)`。两种主题都沿用 `blur(16px) saturate(135%)`，无模糊能力时回退到各自不透明基色。
- 半透明只绘制一次：Header 各行可以是独立布局区，但不能让父层与 Query Editor 子层在同一像素上重复叠加相同背景，否则展开态会比收起态更不透明。
- Header 不通过加重阴影制造层级，只保留轻量底边界；品牌顶线继续独立存在。
- 该映射使用中性、略冷的灰，不引入新的品牌色或数据色，也不改已确认的固定 10 色分类色盘。

### DR-UI-COLOR-003

**扫描证据**

- Dark Select popup 默认背景约 `#48484e`，选中项使用 `#c60475` 文字与透明背景，实测文字对比约 `1.59:1`。
- 同一 active / selected 语义还会影响 Radio button、Pagination current、DatePicker active 等组件。
- 2026-07-21 移动 Dark 人物详情复核中，实际内容表面为 `#17171B`：`#FF2075` 人物名、指标与 12px“展开”约 `4.86:1`；正文 `#C2C3CB` 约 `10.18:1`，次要文字 `#9A9BA3` 约 `6.46:1`。因此本次可读性反馈指向高饱和主色的眩光感，而不是正文灰阶不足。
- 同一个 `#FF2075` 在 Light 内容表面 `#FAFAFB` 仅约 `3.52:1`，不能稳定承担普通字号文本；单一色值只能在两种主题间折中。

**决策沿革与当前评审实现**

- 2026-07-21，用户先确认柔和强调并要求同时设计 Light 模式，随后明确修订为“不改 selected 背景和 hover”。最终方案以该修订为准。
- 同日后续评审中，用户认为分主题前景色不够和谐，要求先复刻旧生产方案并检查与既有决策的冲突；因此此前 Light `#94045D` / Dark `#FFC0DA` 的专用前景 override 已撤销，当前状态重新开放确认。
- 用户随后明确要求“两种粉色统一，只要一种主色”。最终界面主色确定为旧生产 `#FF2075`；`#FF69B4` 与 `#C71585` 只作为同一色阶的 hover / pressed 状态，不再保留 `#C60475` 作为第二套界面主色。
- Naive UI 全局色盘为 `primaryColor: #FF2075`、`primaryColorHover: #FF69B4`、`primaryColorPressed: #C71585`、`primaryColorSuppl: #FF2075`。项目 CSS 的 `--primary*`、旧生产 CSS、Header 品牌装饰与活动原型已同步到同一真源。Select 不再提供 `InternalSelectMenu` 专用 override，选中文字和勾选继承 `#FF2075`，pressed 继承 `#C71585`。
- 用户复核实际页面后指出默认高亮文本仍分别使用 Light `#C71585` / Dark `#FF69B4`，与已确认主色不一致；因此 `--primary-text` 最终固定继承 `--primary: #FF2075`，旧前端静态人物名也改为同一原色。hover / pressed 色阶不再用于静态文字。
- 用户随后在移动 Dark 人物详情中指出统一后的鲜粉可读性仍不理想，并明确允许考虑 Light / Dark 使用不同主色；因此本项重新进入待确认状态，当前生产实现暂不改动。
- 2026-07-22，用户同意先制作实际页面预览。本机工作台已进入评审态：CSS semantic tokens 与 Naive UI common、Button、Radio、Tabs 同步使用 Light `#C82A70 / #D23978 / #AD215F`、Dark `#F16A9C / #FC85AF / #DA578A`；Dark 填充控件前景改为近黑 `#17171B`。该实现不是最终确认。
- 实际页面预览后，用户要求先暂定当前方案，不再重复进行最终确认；两套主色作为 `PROVISIONAL_IMPLEMENTED` 工作基线，只有后续明确提出调整时才重新打开。
- selected 背景与 selected-hover 背景继续完整保留 Naive UI 当前主题默认值；项目 override 不提供 `optionColorActive` 和 `optionColorActivePending`。
- 非选中项继续使用 Naive UI 当前主题的正常文字和交互背景。
- 本次只复刻旧生产的颜色机制；现有 6px 圆角、响应式尺寸、页面灰阶、Header / Drawer 表面和固定十色色盘均不回退。

**边界与剩余风险**

- 旧生产 `#FF2075` 只保留为决策沿革和尚未同步界面的历史基线；当前工作台的静态高亮跟随分主题主色，不再把 hover / pressed 色阶当作静态文字色。
- 当前暂定方案为同色相、分明度的低饱和双主题主色：Light `#C82A70`（`oklch(0.559 0.199 360)`，对 `#FAFAFB` 约 `5.01:1`），Dark `#F16A9C`（`oklch(0.702 0.173 359)`，对 `#17171B` 约 `6.20:1`）。Dark 填充控件前景使用近黑而不是白字。
- 备选为旧色阶 Light `#C71585` / Dark `#FF69B4`；对比度分别约 `5.20:1 / 6.75:1`，但色相更偏紫、Dark 更亮，可能仍有较强视觉刺激。
- 当前工作台运行时已应用分主题暂定基线；旧前端和独立原型仍保留 `#FF2075`，不在本轮扩大同步范围。后续修改时只更新 `DESIGN.md` 主色块、CSS 的六个 `--brand-primary-*` token 和 Naive UI 的 `WORKBENCH_PRIMARY_PALETTES`，并运行结构测试检查漂移。
- 固定十色中的 `#C60475` 只编码分类 / 数据系列，并在 palette lab 中命名为“系列粉”；它不是界面主色，不得用于普通控件、品牌装饰或交互状态。
- 主色三态的双系统冲突已经消除；Naive UI 其余中性表面、文字与状态色最终确认保留组件库默认值，不再由 `DR-UI-COLOR-004` 扩大覆盖。
- 与 `DR-UI-COLOR-002/006/007` 的 Header、主体、Drawer 灰阶无冲突；与固定十色分类色盘无冲突。

### DR-UI-COLOR-004

**扫描证据**

- Naive UI 的 primary 三态现已与项目 CSS 的唯一主色色阶同步；圆角和 scrollbar 也已有项目覆盖。
- body、popover、input、text、border、neutral hover / pressed 等仍继承 Naive 默认主题，尚未与项目 Light / Dark surface token 全量映射。
- `common.primaryColor` 会被 Naive 内部颜色计算继续处理，不能直接填写 CSS `var(...)`；若统一，需要使用可解析的同步色值。

**最终确认口径**

2026-07-22，用户先选择全量语义映射；逐项复核时明确修订为“保留默认就行”。最终规则以该修订为准：

- Naive common 及当前使用组件的中性背景、文字、边界与 neutral hover / pressed 状态继续继承组件库当前 Light / Dark 默认主题，不新增全量 semantic override。
- 已有且用途明确的字体、分主题 primary 三态、主按钮前景、Radio / Tabs 激活态、圆角、Tag、Scrollbar、Skeleton 与 Drawer 结构覆盖继续保留；本项不要求回退它们。
- `NSelect` 不新增 `InternalSelectMenu` 专用颜色覆盖，selected 与 selected-hover 背景继续使用 Naive UI 默认值。
- `DR-UI-COLOR-005` 的冲突已单独确认：Naive UI 保持默认边界，不再执行统一 `3:1` 硬约束。
- 当前代码已经符合“默认中性色 + 有限明确覆盖”的范围，因此本项关闭为已确认且已实施。

### DR-UI-COLOR-005

**扫描证据**

- 早期扫描把当时 `DESIGN.md` 中的项目自定义 `--control-border: #C8C8D0 / #515158` 误记为 Naive UI 默认边界；它们实际只属于项目 token。
- 当前页面实测的 Naive UI 默认边界为 Light `#E0E0E6`；Dark Input / Select 使用透明边界和组件库默认填充。受影响区域包括 Input、Select、Radio、Pagination 等组件；focus 状态另有 focus ring，不等于默认状态边界。

**最终确认口径**

2026-07-22，用户最初确认过 `3:1` 硬约束；在核对原始会话后明确，该约束对应的 Light `#94949c` / Dark `#66666e` Naive UI 候选映射已随全量配色候选实现一起回退。用户随后最终确认“保持现在这样不变”，以此修订此前口径：

- Naive UI 的 Input、InputNumber、DatePicker、Select、Radio、Pagination 等控件继续使用当前 Light / Dark 默认静止边界，不新增仅为达到 `3:1` 的组件 override。
- 不再把默认静止边界相对相邻 surface 达到 `3:1` 作为工作台统一硬约束；focus、hover、pressed 继续沿用当前状态表达。
- 项目自定义组件已有的 `--control-border`、Scrollbar 和其他明确边界样式保持不变，本项不要求回退或重映射。
- 当前运行代码已经符合最终口径，因此本项关闭，不产生代码改动或新增测试任务。

### DR-UI-COLOR-006

**扫描证据**

- 桌面端的 unified analysis 使用外层 `surface-panel`，主体信息包在一张整体卡片内。
- `<780px` 会去掉该外层的背景、边界与圆角，主体信息直接进入页面流。
- 用户确认这两种结构都保留，并要求分别设计，而不是为了形式一致给移动端重新套一层外卡片。

**已确认的设计前提**

- 桌面：页面背景负责衬托整体内容卡片；卡片内部再用 section 与 divider 组织信息。
- 移动：页面本身承载主体信息；只能按需要使用局部区块、分隔线和间距，不能复制桌面的整体外卡片。
- Light / Dark：主体区域均使用偏灰的中性表面，并与更白 / 更黑的 Header 保持可见区分。
- 2026-07-21，用户在实际人物排行页确认最终近黑 Dark 层级：Header 约 `#060608`、主体 `#0E0E10`、内容表面 `#17171B`；该组取代此前较亮的 Dark 灰阶记录。

**已确认并实施的响应式映射**

- Desktop：页面使用“主体灰底”；人物 rail 继续透明地落在灰底上，不新增背景卡、边框、圆角或阴影；右侧 unified analysis 使用“内容表面”作为整体卡片。
- Mobile：外层 unified analysis 继续透明、无整体卡片；页面本身使用“主体灰底”，人物概览 / 指标等确需成组的区域才使用“内容表面”。
- 两端少量真正需要抬升的局部内容可使用“抬升表面”，但不得把所有 section 再拆成一组组白卡 / 深灰卡；Select popup 的具体映射仍归 `DR-UI-COLOR-003/004`，本项不代替其决策。
- Header Bar 与 Query Workspace 视为同一个 chrome 区域，不在两行之间引入不同底色。

- Mobile 现有整体卡片边界保持移除；未来若新增局部内容表面，仍需逐块核对，不能由本项自动扩张卡片范围。

### DR-UI-COLOR-007

**扫描证据**

- 当前移动端只有两个 `NDrawer`：人物排行中的“人物详情”和共同分析中的“人物选择”；两者都从 Header 第一行底边延伸到视口底部。
- 两者外壳都使用 `.workbench-translucent-drawer`，运行时 Light 接近白色 `94%` + blur，Dark 接近黑色 `82%` + blur，实际继承的是 Header chrome，而不是主体内容表面。
- Dark Drawer 面积接近整屏，当前近黑半透明层会形成大块黑面；底层图表颜色仍会透过模糊层，在内容下方形成局部色斑。
- “人物选择”的 `picker-heading` 又绘制了一次相同半透明背景和 blur，而“人物详情”的标题栏是透明的；两个 Drawer 因透明度叠加方式不同而具有不同的顶部密度。
- 两个 Drawer 的 mask 当前都是完全透明，只负责拦截交互，不额外压暗页面。

**用户已确认的方向**

- 移动端几个 Drawer 的颜色需要作为一组共同确定，不能按业务组件各自选色。
- Drawer 使用独立的偏灰内容表面，不直接复用 Header 的白 / 黑半透明 chrome。
- 人物选择标题栏当前重复绘制半透明背景的问题必须处理。

**已确认并实施的设计**

| 语义表面 | Light | Dark | 用途 |
|---|---|---|---|
| Drawer surface | `hsl(240 18.5% 97.5%)` / `96%` | `hsl(240 7.1% 9.8%)` / `96%` | 人物详情、人物选择及未来同级移动 Drawer 的唯一外壳背景。 |
| Drawer inner raised | `hsl(0 0% 100%)` | `hsl(240 6.8% 12.8%)` | 候选人物行、指标组和确需抬升的控件，不覆盖整张 Drawer。 |
| Drawer divider | `hsl(240 8.5% 90.8%)` | `hsl(240 5.9% 15.8%)` | 标题、区块和长内容之间的轻量分隔。 |

- Drawer 与主体内容使用同一灰阶家族，但比移动页面灰底抬升一级；它不是 Header 的黑 / 白 chrome 延伸。
- Drawer 标题栏与正文在本版中属于同一个连续表面；Drawer 外壳使用 `blur(16px) saturate(135%)`，标题栏、正文容器和内部 `PersonPicker / PersonInspector` 自身保持透明，由外壳统一提供一次半透明背景。
- `96%` 透明度刻意高于 Header，保证长文本、表格和图片周围的稳定可读性，同时保留轻微的页面空间感。
- mask 第一版继续保持透明；是否需要弱遮罩不与 Drawer 表面色捆绑，后续只在发现焦点分离不足时单独确认。

**实现约束**

- 以 Drawer 外壳作为唯一半透明背景绘制层，移除 `picker-heading` 的重复背景与重复 `backdrop-filter`；人物详情标题栏和人物选择标题栏均透明继承外壳。
- 两个 Drawer 由结构测试锁定：外壳消费同一 Drawer token，标题栏不得再次绘制半透明背景。
- 实施时同步更新 `DESIGN.md`：移动 Drawer 不再与 Header 共用 `--translucent-chrome-*`，改用独立 Drawer semantic token。

### DR-UI-LAYOUT-001

**范围纠正**

2026-07-22，用户澄清“根据人类阅读习惯设置最大宽度”指整个工作台内容 body 在超宽屏上的最大宽度，不是正文、人物简介或帮助说明的段落行长。随后进一步确认人物排行与共演分析必须使用同一个固定上限；不得按 mode 或共演已选人数分叉。此前记录的 `65–75ch` 方案不属于本决策，不能据此修改连续文本容器。

**初始扫描证据**

- 基础 token `--workspace-max` 为 `1440px`，`.workbench-body` 使用 `width: min(calc(100% - 32px), var(--workspace-max))` 居中。
- 人物排行和共演分析当前都位于同一个 `.workbench-body` 内，基础状态已经消费同一个 `--workspace-max`；模式内部只分别定义 rail / 主体的 grid 列宽。
- `>=1920px` 时，共演模式已选 2 人以上会把同一 token 放大到 `1600px`；已选 5 人以上会继续放大到 `1920px`。因此内容宽度会随已选人数改变，并非统一上限。
- 用户标注的 `2560×1440` 页面已选 3 人，实测 `.workbench-body` 为 `1600px`，左右外边距各 `475px`；内部为 `348px` 人物 rail、`16px` 间距和 `1236px` 分析主体。
- Header Bar、Query Summary、Query Editor、Footer 与内容 body 都消费 `--workspace-max` 或其加上 gutter 的派生值；实施固定 body 上限时需要明确这些区域是否继续共用同一 token，不能只改一个选择器后留下左右边缘错位。
- `<780px` 已切换为单列、移除桌面 rail，并使用视口 gutter；移动端不应被桌面固定上限改变。

**固定上限候选的量化结果**

以下按用户标注的 `2560×1440` 浏览器状态计算。页面垂直 scrollbar 占 `10px`，实际可排版宽度为 `2550px`；表中“左右留白”不含右侧 scrollbar。三档都保留 `348px` rail 与 `16px` gap，收窄量全部由分析主体承担。

| 固定上限 | 左右留白 | 共演：348px rail 后的主体 | 排行：410px rail 后的主体 |
|---:|---:|---:|---:|
| `1440px` | `555px / 侧` | `1076px` | `1014px` |
| `1360px` | `595px / 侧` | `996px` | `934px` |
| `1280px` | `635px / 侧` | `916px` | `854px` |

两种模式的 rail 与主体之间都保留 `16px` gap；排行 rail 在宽桌面按其 grid 上限 `410px` 计算。共演常规 section 扣除 panel border 和左右 padding 后，三档内容宽度约为 `1026 / 946 / 866px`。

- `1440px`：保留最多图表、矩阵和工具栏空间，横向扫描距离也最长。
- `1360px`：在收束主体与保留复杂数据区空间之间居中；长标签和工具栏比 `1440px` 更早换行。
- `1280px`：主体最集中；作品元数据、标签、图例和矩阵最早接近局部换行或滚动边界。
- 人物排行的八列详情指标目前按视口 `<=1180px` 才降为四列，而不是按详情容器宽度响应；因此在 `2560px` 视口采用 `1280px` body 时，`854px` 排行主体仍维持八列，是三档中最需要验证文字省略和密度的一档。
- 三档下已选人物概览仍高于现有 `640px` 容器断点，继续保持双列，不会误切成移动结构。
- 关联扫描发现 `DESIGN.md` 记录的 rail 断点为 `1180 / 918px`，当前 CSS 实现为 `1240 / 980px`；这是独立的响应式文档／实现偏差，不作为本次最大宽度选项的隐含决定。

**实施与验收口径**

- 人物排行与共演分析共用 `1280px` 的 Desktop 内容 body 固定最大宽度；共演模式不得再按已选人数扩展到 `1600/1920px`。
- Header Bar、Query Summary、Query Editor 与 Footer 的内部内容线必须和 body 共线；Header chrome 背景仍横跨整个视口。
- 在 Ranking、两人共演、五人以上共演及 Skeleton 状态下验证最大宽度、rail / main 比例和左右居中一致。
- 在 `2560 / 1920 / 1440 / 1024px` 视口验证无横向溢出；`<780px` 继续使用现有移动布局。

**最终确认与实现**

- 2026-07-22 用户确认选项 3 为最终规范：单一 `--workspace-max: 1280px` 由 Header Bar、Query Summary、Query Editor、人物排行、共演分析和 Footer 共用；不再保留独立 body token。
- Header 半透明背景仍横跨视口；Header Bar 与 Query 外盒使用 `1280px + 32px`，配合左右 `16px` padding，使其内部内容线与 `1280px` body 对齐。
- Desktop 页面滚动区使用 `scrollbar-gutter: stable both-edges` 对称预留壳层 scrollbar；否则 Header 以完整视口居中、body 以扣除右侧 10px scrollbar 的区域居中，会产生约 `5px` 的水平错位。移动端保留单侧 gutter。
- 共演 `1600 / 1920px` 条件扩展及其运行时 class 已移除，模式或已选人数不再改变 workspace 宽度。
- `2560x1440` Dark 实测：两种模式 `.workbench-body` 均为 `1280px`、`x=635`；人物排行内部为 `410 + 16 + 854px`，共演分析为 `348 + 16 + 916px`，模式切换不再发生横向跳动，页面无横向溢出。
- `2560x1440` Dark 收起态实测：Header Bar 与 Query Summary 外盒均为 `1312px`、`x=624`，左右 `16px` padding 后内容线为 `x=640..1920`；body 与 Footer 均为 `1280px`、`x=640..1920`，两侧精确共线。
- 展开 Query 实测：全宽 overlay 为 `2560px`，Editor 外盒为 `1312px`、`x=624`，stages 与 footer 均为 `1280px`、`x=640`；展开前后内容线不变。
- 排行切换到 3 人共演后，Header / Query 内容线、`1280px` body 及 `348 + 16 + 916px` 内部网格保持不变，控制台无 error / warning。
- `390x844` Dark 实测继续使用移动单列结构，`documentElement.scrollWidth === clientWidth === 390px`，1280px token 未造成横向页面溢出。
- 用户已在实际页面确认当前效果；本项转为 `ACCEPTED_IMPLEMENTED`，并同步写入 `DESIGN.md` 作为正式规范。

### DR-UI-DATA-001

2026-07-22，用户确认“对齐两页数据”已经完成并要求跳过。本项据此关闭，不再追加“两页”范围、字段清单或验收方式；若后续重新发现具体数据偏差，应以新的、具名问题单独记录，不能恢复这条含义不明的泛化 TODO。

## 补充决策记录

### DR-UI-RESPONSIVE-001

2026-07-20，用户确认主体信息采用两套响应式表面结构：

- 桌面端：主体信息包在整体卡片中，页面背景与卡片共同建立层级。
- 移动端：主体信息直接放在页面上，不复制桌面的整体外卡片。
- 两端共享信息架构和数据含义，但背景、局部区块、分隔线、间距与 Header 邻接关系分别设计。
- 当前代码已有相应结构，但仍需在颜色决策完成后核对设计文档、实现和响应式测试。

### DR-UI-ICON-001

2026-07-22，用户重新开启此前延期的 Icon 尺寸确认，并明确选择保留关闭图标当前的语境分级：身份 Tag 内逐身份移除 12px、整个人物移除 14px、Drawer / 面板关闭 16px。三种操作的交互命中区继续统一为至少 44px；统一命中区不等于强行统一可见图形尺寸。

用户随后确认后续 Icon 默认保留现状，只有发现语义冲突或明显遗漏时才重新选择。扫描发现查询摘要 edit/search 为 20px，而同一 Header 语义中的主题切换、展开 chevron 和移动端“选人” edit 均为 18px；用户明确要求这些图标与上方主题切换图标保持相同大小并对齐。因此查询摘要 edit/search 已收敛为 18px，Desktop 查询 action 与主题按钮使用相同的 38px 操作盒；移动端查询摘要、展开 chevron 与“选人”入口的右侧操作槽统一为 44px，使图标中心与顶部主题切换槽落在同一右侧内容线上。

其余当前尺寸均有明确语境或图形补偿，继续保留：输入前缀、Info、添加与排序 16px；紧凑无结果 22px；标准空状态 28px、people 空状态 30px；候选选中勾 11px / 18px 徽标；`SafeImage` 人物 / 图片占位 28 / 24px。该规则已同步到 `DESIGN.md` 与结构测试，不启用此前未确认的五档机械映射，本项转为 `ACCEPTED_IMPLEMENTED`。

### DR-UI-HELP-001

2026-07-23，用户在系列共演卡上发现 Info 按钮 hover 后未出现 tooltip，并要求全量检查其他 Info 图标。本次按交互入口而非图形字形计数：工作台共有 8 个 `<AppIcon name="info">` 代码点，其中查询高级选项由一个 `v-for` 渲染 6 种帮助内容。另外发现旧前端一个非图标的“什么是 UID?”帮助入口，作为相邻历史问题记录，不计入工作台 Info 图标数量。

| 入口 | 当前状态 | 审计结论 |
|---|---|---|
| Query Editor “用户 UID” | `trigger="manual"`；mouseenter / leave、focus / blur、click、Escape；完整 `aria-label` 与 `aria-expanded` | **合规**，作为全量收敛基线 |
| Query Editor 高级选项 | 6 种说明共用一个显式可见状态；mouseenter / leave、focus / blur、click、Escape；完整 `aria-label` 与 `aria-expanded` | **已修复** |
| Query Editor “排行职位 / 参与职位” | 显式可见状态；mouseenter / leave、focus / blur、click、Escape；完整 `aria-label` 与 `aria-expanded` | **已修复** |
| 人物详情“综合分 / 相对偏好” | 手动 show；mouseenter / leave、focus / blur、click、Escape；完整 `aria-label` 与 `aria-expanded` | **已修复** |
| 单人共演“合作人物指标” | 手动 show；mouseenter / leave、focus / blur、click、Escape；完整 `aria-label` 与 `aria-expanded` | **已修复** |
| 系列共演“参与身份数量” | 按 subject id 手动 show；mouseenter / leave、focus / blur、click、Escape；完整 `aria-label` 与 `aria-expanded` | **合规** |
| “没有共同作品 / 系列”空状态 Info 图形 | 非按钮、无 tooltip；SVG 统一 `aria-hidden`，相邻 H2 说明状态 | **纯装饰，合规**；不改造为交互入口 |
| 旧前端“什么是 UID?”文本帮助 | Naive 默认 hover；文本 `span` 无 role、tabindex 或 ARIA | **P2 · 历史问题**，键盘不可达；不属于当前原型 Info 图标收敛的直接范围 |

统一契约已写入 `DESIGN.md` 的“Contextual help and tooltips”：不再把 `trigger="hover"` 或原生 `title` 当作完整实现；指针、键盘、触屏和辅助技术必须读取同一份说明。2026-07-23 用户确认实施后，查询高级选项、职位说明、人物详情指标和合作人物指标均改为受控 manual tooltip，并补齐完整可访问名称与展开状态；结构测试覆盖所有当前工作台交互型 Info 入口，本项转为 `ACCEPTED_IMPLEMENTED`。

浏览器回归覆盖查询高级选项、参与职位、人物详情“综合分 / 相对偏好”、单人共演“合作人物指标”和系列共演“参与身份数量”：hover、键盘 focus、click 与 `Escape` 均能正确开合，`aria-expanded` 同步，结束后无残留 tooltip，控制台无 warning / error。390px 移动视口下 Tooltip 保留 12px 右侧安全距离，没有横向溢出。

### DR-UI-COLOR-001

2026-07-20，用户确认选择口径 1：

- `DESIGN.md` 的精确 sRGB 是项目自定义 semantic token 与主动提供的 Naive override 的规范真源；未被项目覆盖的 Naive 默认色不要求复制到文档或与 CSS token 强制同值。
- 对 `DESIGN.md` 尚未定义的新 semantic token，应先把精确 sRGB 写入规范，再视为正式色值。
- 本轮候选实现已按用户要求回退；后续需等其余颜色决策完成后重新实施、统一核对和验证。
- 已确认的固定 10 色分类色盘不受本项影响。

**2026-07-22 本机对账扫描**

本次只读取 `DESIGN.md`、运行时 CSS token、主动提供的 Naive UI override 与实际页面 computed style，没有修改运行色值。以下部分已经一致，无需重新选择：

- Light / Dark 六个主色三态、主按钮前景，以及 Naive UI `common`、Button、Radio、Tabs 的 primary 映射。
- canvas、surface、surface-subtle、surface-sunken、border、divider、Header、Drawer 与浏览器 `theme-color`。
- 固定十色分类色盘及其顺序。

扫描发现的实际 sRGB 漂移如下；`≈` 表示将扫描时的 HSL / OKLCH 运行值换算到 8-bit sRGB 后的结果。已逐项确认并实施的行会保留扫描来源，同时注明当前状态：

| token | Light `DESIGN.md` / runtime | Dark `DESIGN.md` / runtime | 当前影响 |
|---|---|---|---|
| `--hover` | 扫描时 `#F3F3F5` / ≈`#F3E8EC`；现均为 `oklch(0.94 0.014 350)` | 扫描时 `#2A2A2F` / ≈`#25262C`；现均为 `oklch(0.27 0.012 280)` | 保留自定义列表、人物选择、作品列表等现有 hover 表面。 |
| `--pressed` | 扫描时 `#EDEDEF` / ≈`#EDDEE4`；现均为 `oklch(0.915 0.018 350)` | 扫描时规范缺失 / ≈`#2C2D35`；现均为 `oklch(0.3 0.015 280)` | 保留当前 Header pressed 半透明配方。 |
| `--control-border` | 扫描时 `#C8C8D0` / ≈`#928D94`；现均为 `#928D94` | 扫描时 `#515158` / ≈`#64656D`；现均为 `#64656D` | 2026-07-22 用户确认保持当前视觉；规范与 runtime 已统一为精确 sRGB。只影响项目自定义控件与 Scrollbar，不接管 Naive UI 默认边界；对内容 surface 约为 `3.11:1 / 3.10:1`。 |
| `--text-1` | 扫描时 `#1F2225` / ≈`#1E1E26`；现均为 `oklch(0.24 0.015 285)` | 扫描时 `#F5F5F7` / ≈`#EDEEF2`；现均为 `oklch(0.95 0.006 280)` | 保留当前主文字明度。 |
| `--text-2` | 扫描时 `#333639` / ≈`#37373F`；现均为 `oklch(0.34 0.014 285)` | 扫描时 `#D2D2D7` / ≈`#C2C3CB`；现均为 `oklch(0.82 0.01 280)` | 保留当前次要正文明度。 |
| `--text-3` | 扫描时 `#646A70` / ≈`#5A5A63`；现均为 `oklch(0.47 0.015 285)` | 扫描时 `#A5A5AD` / ≈`#9A9BA3`；现均为 `oklch(0.69 0.012 280)` | 保留当前辅助文字；对比约 `6.56:1 / 6.42:1`，均高于正文最低要求。 |
| `--disabled` | 扫描时 `#91969B` / ≈`#87858B`；现均为 `oklch(0.62 0.01 300)` | 扫描时 `#72727A` / ≈`#68686F`；现均为 `oklch(0.52 0.01 280)` | 当前无直接消费点，仍记录为公开语义色。 |
| `--success` | 扫描时 `#0E6B4D` / ≈`#006338`；现均为 `oklch(0.43 0.12 160)` | 扫描时规范缺失 / ≈`#3DB07C`；现均为 `oklch(0.68 0.13 160)` | 保留偏好与作品状态文字的当前值。 |
| `--warning` | 扫描时 `#845A0F` / ≈`#694900`；现均为 `oklch(0.43 0.09 80)` | 扫描时规范缺失 / ≈`#D2A657`；现均为 `oklch(0.75 0.11 80)` | 当前无直接消费点，仍记录为公开语义色。 |
| `--error` | 扫描时 `#BA2B2E` / ≈`#AC1922`；现均为 `oklch(0.48 0.18 25)` | 扫描时规范缺失 / ≈`#F97770`；现均为 `oklch(0.72 0.16 25)` | 保留查询错误和人物选择错误状态的当前值。 |
| `--overlay` | 扫描时 `rgba(31,34,37,.48)` / ≈`rgba(21,21,26,.48)`；现均为 `oklch(0.2 0.01 285 / 0.48)` | 扫描时 `rgba(0,0,0,.68)` / ≈`rgba(2,2,2,.72)`；现均为 `oklch(0.08 0.004 280 / 0.72)` | 当前两个移动 Drawer 使用透明 mask，token 暂无直接消费点。 |
| Light `--on-primary` | 扫描时规范 `#FFFFFF` / runtime ≈`#FCFCFC`；现自定义 token 均为 `oklch(0.99 0 0)` | `#17171B` / `#17171B` | 保留当前分层：Light Naive UI 填充控件继续使用 `#FFFFFF`，自定义控件使用近白 token；Dark 两层一致。 |

另有四个不属于整组 token 的孤立项：

- Light Tabs 扫描时主动覆盖 `colorSegment: #EFEFF3`，既未写入 `DESIGN.md`，也不是 Naive UI 默认的 `#F7F7FA`。2026-07-22 用户确认移除该覆盖；Light / Dark 轨道背景现均跟随 Naive UI 默认，选中主色、文字与交互状态不变。
- `ComparisonRatingDistribution.vue` 为固定十色复选框计算前景时保留当前局部 `#FFFFFF / #18181C`；它依据每个系列色的亮度选前景，不与主题 `--on-primary` 合并。
- 时间图 tooltip 保留当前局部 `black 22%` 阴影，不提升为全局 surface shadow token。
- DataTable Sorting 删除未实施的 Light `#FFF8FB` 规范，恢复为 Naive UI 当前 Light / Dark 默认中性背景，与 `DR-UI-COLOR-004` 一致。

结构测试现已同时锁定主色、主要表面、Header、Drawer、浏览器 theme-color，以及上述项目自定义交互、文字、状态和 overlay token。局部图表前景与阴影继续作为组件实现细节，不提升为全局颜色合同。

**逐项处理进度**

- `--control-border`：`ACCEPTED_IMPLEMENTED`。Light `#928D94`、Dark `#64656D`；由 `DESIGN.md`、CSS token 和结构测试共同锁定。该处理不修改 Naive UI 默认边界。
- Light Tabs `colorSegment`：`ACCEPTED_IMPLEMENTED`。已移除 `#EFEFF3` 主动覆盖，Light / Dark 均保留 Naive UI 默认中性轨道背景；结构测试禁止重新加入组件专用 `colorSegment`。
- 其余 `DR-UI-COLOR-001` 对账项：`ACCEPTED_IMPLEMENTED`。2026-07-22 用户确认“后面的都优先保留当前的”；`DESIGN.md` 与结构测试已按当前运行值对齐，未修改这些 runtime token，也未批量接管 Naive UI 默认中性色。

### DR-UI-SELECTOR-001

2026-07-22，用户先选择了“排行多选、共演单选 + 添加 + 有序列表”的分离方案；在进一步解释交互后，用户明确修订为“不用了，用同一套就行”。最终规则以该修订为准：人物排行与共演分析都使用同一套可筛选多选 selector，不增加共演专用的加号、独立已选列表、排序或移除结构。

两种模式仍保留各自的业务语义：人物排行要求人物同时具备全部所选职位，作品按各职位 union 去重；共演分析允许选择 `1..N` 个参与职位，第一项作为默认候选分组。当前 `QueryWorkspace.vue` 已让两个 mode 共用 `draftPositions` 与 `multiple` select，对应结构测试锁定了共享 owner 和多选语义。

2026-07-23，用户进一步确认正式版 selector 直接使用 Bangumi 分类，多分类职位在全部上层中出现，并在同一 selector 内提供待配置的“常用职位”快捷入口和产品定义的“配音类”。职位 canonical key 仍然唯一；分类副本、常用入口和搜索结果共用同一有序选中状态，搜索与触发器按 key 去重，分类标题不支持整组选择。动画/游戏的 main/all 声优项在“配音类”内互斥并原位替换。

Naive UI 当前 `NSelect` / `NTreeSelect` 不能安全承载相同 key 的多父节点，因此正式实现需要独立 `PositionSelector`，桌面使用 portal 弹层，移动端使用 Query Editor 内全宽面板。当前 flat `NSelect` 只是原型实现，故本项从“已实施”修订为“已确认、待实施”；详细 catalog 和质量门见 `DR-BE-POSITION-GROUP-001`。

### DR-UI-FALLBACK-001

远端 2026-07-19 会话最后明确移除了普通空状态中的“设置查询条件”“打开人物选择”“调整已选人物”三个 CTA，仅保留错误恢复操作和空状态外的既有入口。当前本机工作树随后发生了决策漂移：`WorkbenchApp.vue`、`AnalysisDashboard.vue`、对应结构测试与 `DESIGN.md` 均已恢复首次查询和共演未选人的唯一主 CTA。

2026-07-22，用户逐场景重新确认：

- 首次未查询状态保留唯一主操作“设置查询条件”。虽然 Query Editor 会在 first-run 自动展开，Header 的“暂无查询”也能重新打开，但页面内 CTA 作为面板被误收起后的明确恢复入口，避免用户面对空白结果区时失去方向；这一决定推翻远端对此按钮的删除。
- 共演分析未选人物时保留唯一主操作“选择人物”，理由相同：移动端查询成功后人物 Drawer 不会自动打开，且不能假设用户一定注意到 Header 人物选择入口；桌面端也不能只依赖用户自行理解持续可见的 rail。该 CTA 在移动端打开人物 Drawer，在桌面端提示并短暂高亮人物 rail。
- “没有共同作品”继续只显示同名状态，不恢复“调整已选人物”。错误态“重新加载”等必要恢复操作继续保留。

当前 `WorkbenchApp.vue`、`AnalysisDashboard.vue`、结构测试与 `DESIGN.md` 已符合上述决定，本项完成。
