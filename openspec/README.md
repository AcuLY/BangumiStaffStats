# OpenSpec 文档导航

本页整理当前文档的职责、相关变更与验收记录。2026-09-11 核对基线为本地
`b675b8d`（应用、契约、界面与文档）和 `0dbc468`（工作约定与换行规则）。
这里的整理不改变产品行为，也不代替测试、提交、合并或部署证据。

## 阅读顺序

1. [AGENTS.md](../AGENTS.md) 定义工作约定与文档权威顺序。
2. [PRODUCT.md](../PRODUCT.md) 定义查询、统计、身份和恢复语义。
3. [DESIGN.md](../DESIGN.md) 定义视觉、交互、响应式和动效；
   [设计侧车](../.impeccable/design.json) 是其展示用派生信息，
   [surface brief](../.impeccable/surfaces/route.md) 说明页面任务。
4. [config.yaml](config.yaml) 承接仓库约定；[specs](specs/) 给出当前接受的能力，
   [changes](changes/) 保存具体变更、任务和证据。
5. [frontend/ARCHITECTURE.md](../frontend/ARCHITECTURE.md)、
   [backend/README.md](../backend/README.md) 和
   [operations/README.md](../operations/README.md) 分别解释实现边界与运行流程。

## 本轮相关能力

| 主题 | 当前主规范 | 相关变更 |
|---|---|---|
| 查询壳、普通导航、标签页恢复 | [frontend-query-shell](specs/frontend-query-shell/spec.md) | [移除公开分享](changes/contracts-remove-query-sharing/)、[查询恢复](changes/frontend-persist-query-session/) |
| 共演“全部”与精确人物身份 | [contracts-co-star-position-scope](specs/contracts-co-star-position-scope/spec.md)、[frontend-cross-position-co-star](specs/frontend-cross-position-co-star/spec.md) | [跨职位范围](changes/contracts-expand-co-star-position-scope/) |
| 详情、共演与排行联动 | [frontend-person-workspace-links](specs/frontend-person-workspace-links/spec.md)、[frontend-person-inspector](specs/frontend-person-inspector/spec.md) | [人物工作区联动](changes/contracts-link-person-workspaces/) |
| 手机选人、合作与多人结果 | [frontend-co-star-vertical](specs/frontend-co-star-vertical/spec.md) | [查询与共演布局](changes/frontend-polish-query-and-co-star-workspace/) |
| Skeleton、图标、Tag、设计元数据 | [frontend-design-system](specs/frontend-design-system/spec.md)、[frontend-accessibility](specs/frontend-accessibility/spec.md) | [上下文加载](changes/frontend-align-contextual-loading-layouts/)、[xicons](changes/frontend-adopt-xicons/)、[NTag](changes/frontend-unify-ntag-surfaces/) |
| 产物身份与体积门禁 | [contracts-artifact-compatibility](specs/contracts-artifact-compatibility/spec.md)、[frontend-foundation](specs/frontend-foundation/spec.md) | [产物验收同步](changes/contracts-sync-artifact-acceptance/) |

## 现行规则与旧记录

- 共演的“全部”是操作范围，不是目录中的职位 key，也不是排行的全部职位 AND 条件。
  从详情进入时选中“全部”和目标身份，其他查询参数不变；不保存跳转来源或旧分析快照。
- 手机选人使用正文内展开；人物详情才使用低于 960px 的 Drawer。
  控件尺寸仍以 780px 为界，候选栏宽度边界是 917px、1185px。
- 公开分享已移除；历史变更里的分享协议和 v1 恢复记录不能作为恢复该功能的依据。
  当前恢复使用 `bgmss-query-session-v2`，只保存已接受意图。
- 旧变更中尚存的原始设计用于解释当时的工作。继续实施或归档前，应按 PRODUCT、DESIGN
  和上述现行能力核对差异；不能把旧的 Header 选人入口、底部选人 Drawer 或来源返回状态带回主规范。
- 小范围样式、文案和机械修复遵循 AGENTS.md 的比例原则；实质性能力、契约、架构和运行变更
  才需要完整 OpenSpec 规划。文档同步不会自动放宽产品或发布验收。

## 验收记录如何阅读

`tasks.md` 的勾选表示对应任务记录，`openspec validate` 表示规范格式和结构通过；
两者都不单独证明全量测试、浏览器验证、归档或部署已完成。历史命令结果应保留日期、
目标和当时状态，最新记录只覆盖明确相同的事项。

| 事项 | 最近记录与当前判断 |
|---|---|
| 本地提交 | 应用与配套规范基线为 `b675b8d`；文档核对随后续提交保存 |
| 本地“全部”服务 | 跨职位变更任务中已记录 2026-09-11 启动 8080/5174 并验证成功，较早的启动受阻记录属于历史；本轮不据此宣称服务持续在线 |
| Frontend 完整门禁 | 最近记录仍有 `scrollbar-system.test.ts` 对旧 Partners tooltip 的断言失败；本轮未重跑或修改测试 |
| Backend 完整门禁 | 旧 `backend/pkg` 测试已在工作区整理时移至本机保留目录，这一阻塞源已移走；完整门禁尚未因此重新验证。较早的 `control.json` hash mismatch 也需复查 |
| 归档 | 尚有完整验收任务未完成，因此本轮不批量归档、不补勾未验证事项 |
| 远端与生产 | 文档核对不构成推送、合并或部署证据；发布状态以对应 PR、CI 与部署记录为准 |

设计侧车可以随已确认的文档更新，但它不承担发布证明。重新验收时使用组件 README
和任务清单中的命令，并将新的准确结果写入对应变更，而不是删除历史失败记录。
