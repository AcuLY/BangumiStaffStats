# 原型全局设计统一 TODO

> 2026-07-20 已从 `mypc` 最近的设计统一会话回填状态。设计依据和未决原因见 [`docs/decisions/prototype-global-design-unification.md`](../../docs/decisions/prototype-global-design-unification.md)，逐段原文见 [`docs/design-sessions/mypc/transcripts/README.md`](../../docs/design-sessions/mypc/transcripts/README.md)。

| 原项 | 当前状态 | 下一步 |
|---|---|---|
| 1. 色盘确定 | 评审基线已落实 | 固定十个色位与基本色相保持不变；已根据 Light `#C82A70` / Dark `#F16A9C` 建立两套明度和彩度，并同步到 DESIGN、palette lab、runtime 和测试。 |
| 2. 尺寸、字号、颜色等样式统一检查 | 已完成 | 单人共演两个字号遗漏已补齐；“更多选项”条目标题已确认并实现移动 12px、桌面 14px。 |
| 3. scrollbar 样式统一 | 已完成 | 10px 壳层 / 6px 组件层保持当前实现，用户确认现状没有问题。 |
| 4. 图片尺寸统一 | 已完成 | 外部人物、角色、作品图片统一 3:4，调用方只指定宽度。 |
| 5. 所有组件的样式统一 | 已完成 | 分析面板、评分图、矩阵和共享摘要保持当前实现，用户确认本项完成。 |
| 6. selector 选项 | 已完成 | 用户最终确认人物排行与共演分析共用可筛选多选 selector；当前实现已对齐，无需增加共演专用加号或有序列表。 |
| 7. 深浅色 | 暂定基线已落实 | Light `#C82A70` / Dark `#F16A9C` 作为可重开的工作基线；主色三态与配套双主题十色色盘均已进入 DESIGN，修改入口集中且有结构测试。Select 保留默认 selected / hover 背景。 |
| 8. info 文本 | 已完成 | UID、收藏时间、评分差、合并续作、评分人数、正反向标签和多职位均已有可访问说明；综合分与相对偏好同时展示通用公式、作用和当前人物实际计算，单人物共演集中复用指标说明；时间图直接显示点线编码；所有 info 文案不使用中文句号。 |
| 9. 对齐两页数据 | 已完成 | 用户确认此项已经完成并要求跳过，不再追加对齐范围或验收工作。 |
| 10. icon 尺寸 | 已延期 | 外部图片会话明确没有继续 icon 统一；候选五档不是已确认规范。 |
| 11. fallback 空白页 | 已完成 | 首次未查询保留“设置查询条件”，共演未选人物保留“选择人物”；两者都是用户错过或误收起既有入口后的明确恢复操作。 |
| 12. 工作台最大宽度 | 已完成 | 用户确认选项 3：人物排行、共演分析、Header / Query 与 Footer 共用 `1280px` 内容线；Header 背景保持全宽，移动端沿用现有视口 gutter。 |

## 可执行清单

- [x] `DR-UI-PALETTE-001`：固定十个色位与色相映射保持不变，Light / Dark 明度和彩度评审基线已成为分类色盘集中真源。
- [x] `DR-UI-TYPE-002`：单人共演排行与顶部概览数字已对齐响应式字号。
- [x] `DR-UI-TYPE-003`：“更多选项”条目标题已实现移动 12px、桌面 14px。
- [x] 当前本机的 scrollbar 与分析区组件已按现状验收，本项关闭。
- [x] `DR-UI-SELECTOR-001`：人物排行与共演分析共用可筛选多选 selector；当前 `multiple` 实现与结构测试已对齐。
- [x] `DR-UI-DATA-001`：用户确认“两页数据对齐”已经完成，本项关闭。
- [x] `DR-UI-ICON-001`：当前语境尺寸优先；Header 主题切换、查询 disclosure 与移动选人 edit 统一 18px 并对齐，关闭图标保留 12 / 14 / 16px 分级，其余有明确容器层级或光学补偿的尺寸保持现状。
- [x] `DR-UI-FALLBACK-001`：首次未查询与共演未选人物均保留唯一主 CTA，当前实现与 `DESIGN.md` 已对齐。
- [x] `DR-UI-COLOR-002`：Light `hsl(0 0% 100%)`、Dark `hsl(240 12.6% 2.4%)`，Header 各行、展开 Query Editor 与两种主题共用 `92%` 透明度的单层 chrome。
- [x] `DR-UI-COLOR-006`：Light / Dark 主体灰底、桌面内容卡片与移动页面流已按低饱和确认原型落实；Light 主体 `hsl(240 9.6% 96.2%)`，Dark 主体已收紧为与 Header 连续的近黑层级 `hsl(240 7.8% 5.8%)`。
- [x] `DR-UI-COLOR-007`：两个移动 Drawer 使用独立偏灰表面；人物选择标题栏不再重复绘制半透明背景和 blur。
- [x] `DR-UI-COLOR-003`：暂定 Light `#C82A70` / Dark `#F16A9C` 为当前工作基线；DESIGN、CSS token 与 Naive UI palette 已集中记录，后续明确提出调整时再重开。旧前端与独立原型不在本轮同步范围。
- [x] `DR-UI-COLOR-001`：用户确认后续对账优先保留当前运行效果；项目自定义交互、文字、状态与 overlay token 已同步到 DESIGN 和结构测试，Light Tabs `colorSegment` 已恢复 Naive 默认，未覆盖的 Naive 默认色不纳入同步范围。
- [x] `DR-UI-COLOR-004`：用户最终确认 Naive common 与组件中性色保留默认值，不做全量语义映射；现有主色、圆角、Scrollbar 等明确覆盖继续保留。
- [x] `DR-UI-COLOR-005`：用户最终确认保持当前 Naive UI 默认边界，不恢复已回退的 `3:1` 边框 override；自定义组件现有边界保持不变，无代码实施项。
- [x] `DR-UI-LAYOUT-001`：用户确认选项 3 为最终规范；人物排行、共演分析、Header / Query 与 Footer 共用 `1280px` 内容线，共演 1600 / 1920px 扩展已移除，移动端布局不变。
