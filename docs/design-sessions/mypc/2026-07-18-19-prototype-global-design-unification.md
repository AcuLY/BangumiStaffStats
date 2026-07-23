# mypc 原型全局设计统一会话同步

> 同步日期：2026-07-20  
> 性质：会话证据摘要，不替代 `DESIGN.md` 中已经生效的规范。待定项统一进入 `docs/decisions/prototype-global-design-unification.md`。
> 逐段原文：[`transcripts/README.md`](transcripts/README.md)，包含相关主会话的全部 Assistant 文本。

## 同步边界

- 远端项目：`D:\Luca\Code\MyProject\BangumiStaffStats`
- 远端分支：`codex/person-workbench-unified-prototype`
- 远端工作树：clean
- 远端与本机 HEAD：`489a6078c78b365302a1c82e59de73b093a263f0`
- 结论：已提交的实现代码无需再次拉取；本次只同步会话中的设计依据和未决上下文。
- 本机已有的分析图表、矩阵、组件样式和 scrollbar 未提交改动没有被覆盖。

筛选时以 `session_meta.cwd` 和 `source=vscode` 识别用户直接发起的主会话，排除了派生子代理日志。下面 5 份 JSONL 均可完整解析，最后一条均为 `event_msg/task_complete`。原始 JSONL 继续保留在 `mypc`；仓库同时保存摘要与[可逐段审阅的文本归档](transcripts/README.md)，但不纳入数十 MB 的 reasoning、工具调用和环境上下文。

## 核心会话索引

| 主题 | 会话 ID | 时间（UTC+8） | 最后状态 | 远端原始记录 |
|---|---|---|---|---|
| 设置原型调色盘 | `019f73f3-a702-7492-aa01-7b5b83817970` | 2026-07-18 14:39–19:47 | 部分完成，后续有未确认漂移 | `C:\Users\26552\.codex\sessions\2026\07\18\rollout-2026-07-18T14-39-40-019f73f3-a702-7492-aa01-7b5b83817970.jsonl` |
| 扫描全部字号 | `019f73f5-049a-7811-be39-8af4275bebe2` | 2026-07-18 14:41–2026-07-19 22:42 | 主体完成，留 2 个遗漏和 1 个待定 | `C:\Users\26552\.codex\sessions\2026\07\18\rollout-2026-07-18T14-41-11-019f73f5-049a-7811-be39-8af4275bebe2.jsonl` |
| 扫描全部交互组件尺寸 | `019f73f5-d720-78f0-9b7a-195d93b37c29` | 2026-07-18 14:42–2026-07-19 23:44 | 完成 | `C:\Users\26552\.codex\sessions\2026\07\18\rollout-2026-07-18T14-42-04-019f73f5-d720-78f0-9b7a-195d93b37c29.jsonl` |
| 扫描全部 scrollbar | `019f752d-372d-7883-b9b0-66132ea3a2a5` | 2026-07-18 20:22–2026-07-19 15:50 | 完成 | `C:\Users\26552\.codex\sessions\2026\07\18\rollout-2026-07-18T20-22-12-019f752d-372d-7883-b9b0-66132ea3a2a5.jsonl` |
| 扫描图片和 icon 尺寸 | `019f752d-9b53-78c0-8b05-54a5130ed500` | 2026-07-18 20:22–2026-07-19 20:36 | 外部图片完成，icon 延期 | `C:\Users\26552\.codex\sessions\2026\07\18\rollout-2026-07-18T20-22-39-019f752d-9b53-78c0-8b05-54a5130ed500.jsonl` |

对应记录依次为 518、3487、3663、1252、1650 行；逐行 JSON 解析错误均为 0。

## 已确认并已落地

### 交互组件尺寸

- 严格使用 `<780px = Naive small`、`>=780px = Naive medium`。
- 常规控件为 28 / 34px；Select trigger 与 menu 同档；取消 480px 的 `large` 特例。
- Pagination 为 22 / 28px；icon-only 控件命中区至少 44×44px。
- 排行行 68 / 72px，候选行 60 / 64px，偏好作品行固定 52px。
- 主题按钮保留窄屏 34px、桌面 38px、44px 命中区和 18px 图标。
- 两个移动 Drawer 均从 Header 第一行实际底边延伸到视口底部，内部标题栏 52px。

### Scrollbar

- 壳层使用 10px：页面、Header Query Editor、两个 Drawer。
- 组件层使用 6px：Tooltip、作品/角色/已选人物列表、矩阵和 Naive popup。
- Firefox 使用 `auto / thin`；Chromium 和 Safari 使用精确 10 / 6px。
- 统一颜色及 hover/active，同时保留滚动所有权、`scrollbar-gutter` 和 overscroll 语义。

### 外部内容图片

- 人物、角色、作品等 `SafeImage` 外部内容图全部使用 3:4。
- 调用方只控制宽度，不能自行传入独立高度。
- 比例由共享 token、`SafeImage.vue` 和 `content-images.css` 集中管理。

### 字号基线

- 项目字号阶梯为 `10 / 12 / 14 / 16 / 20 / 24 / 28px`。
- `18px` 只用于响应式 `NStatistic`；Naive UI 保留自身 `size` preset。
- 移动 Query Editor 的“编辑查询 / 作品范围 / 数据来源”为 `12 / 14 / 12px`，桌面为 `16 / 16 / 14px`。
- 移动人物排行整行使用 12px；桌面排名、主名、副名、指标为 `14 / 14 / 12 / 14px`。

## 同步时需要继续处理的上下文

### 1. 分类色盘没有唯一真源（已解决）

用户在调色盘会话中最终确认的 10 色为：

```text
#c60475, #158486, #d15c56, #8f68cb, #cd9c1f,
#549957, #1a89c5, #444898, #d55e89, #ea955e
```

随后会话 `019f7503-5252-7790-b169-641dc914a344` 在图表对比度重构时直接替换了 3 色，未找到用户明确确认替换值的消息。原始记录位于 `C:\Users\26552\.codex\sessions\2026\07\18\rollout-2026-07-18T19-36-24-019f7503-5252-7790-b169-641dc914a344.jsonl`：

| 用户确认值 | 当前实现值 |
|---|---|
| `#cd9c1f` | `#a77400` |
| `#444898` | `#6b70c5` |
| `#ea955e` | `#b9683d` |

同步时，`AnalysisDashboard.vue` 使用右列的对比度修正版；`palette-lab.html` 的初始色盘既不是用户最终值，也不是当时实现值；`DESIGN.md` 尚未定义分类色 token。

> 2026-07-20 解决：用户再次确认采用原 10 色，三个后续替换值不采纳；本机已同步设计文档、实验工具、运行时代码和测试。当前规范真源见 [`DESIGN.md`](../../../DESIGN.md) 第 3 节，决策状态见 [`DR-UI-PALETTE-001`](../../decisions/prototype-global-design-unification.md#dr-ui-palette-001)。

### 2. 字号还有两个高置信遗漏（已解决）

1. 单人共演“合作人物”排行行目前移动端和桌面端都为 14px；它没有命中主排行的移动 12px 规则。
2. 单人共演顶部“我的收藏 / 合作人物”大数固定为 24px；双人/多人同类概览为移动 20px、桌面 28px。

> 2026-07-20 解决：单人共演合作排行已对齐为移动 12px、桌面 14px；顶部两个概览数字已对齐为移动 20px、桌面 28px，并补充结构测试。

### 3. “更多选项”字段标题仍待决定（已解决）

“显示 NSFW / 合并续作 / 播出时间范围”等标题当前所有宽度均为 14px：

- 若视为字段标签：移动 12px、桌面 14px。
- 若视为开关/范围控件文案：固定 14px。

原会话倾向固定 14px 以保持可读性，但用户尚未确认。

> 2026-07-20 解决：用户确认条目标题采用移动 12px、桌面 14px；外层“更多选项” disclosure 标题保持原样。

### 4. Icon 全局统一被明确延期

图片/icon 会话中，用户把范围收窄为“先仅关注外部图片”，并确认所有外部图片统一 3:4。因此 icon 审计没有进入逐项确认或实施阶段。

曾提出把 icon 收敛为 `12 / 16 / 18 / 24 / 28px` 五档，但这只是代理建议，不是已确认规范。当前 11、20、22、30px 等尺寸仍存在，不能据此直接机械改写。

## 与本机现状的对账

- `DESIGN.md` 已覆盖控件断点、3:4 图片、字号阶梯和两级 scrollbar 规则。
- 当前本机未提交改动正在继续处理分析区组件、评分图、矩阵和 scrollbar；这些属于实现收尾，不应被远端 clean 工作树覆盖。
- `frontend/prototypes/TODO.md` 原来的 11 条没有随 `489a607` 回填；本次已把它改为带状态和下一步的登记表。
- 具体决策状态及本机新增发现见 `docs/decisions/prototype-global-design-unification.md`。
