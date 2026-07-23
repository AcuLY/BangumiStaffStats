# 正式重写开发总计划

> 状态：开发规划基线。本文只规定正式新版的开发顺序、边界、所有权和退出门；运维实施暂缓。
>
> 原型 oracle：`644b7748674e553f863d0ffd61d029f86fdc0717`

## 1. 目标

本轮工作的目标是在新分支中从零建立新版 Bangumi Staff Statistics：

- 对用户可见的外观、交互、文案、状态边界和响应式行为，以固定 oracle 和现行产品、设计文档为证据，保持一致；
- 在一致性之外实现现行文档已经定义、但原型尚未具备的正式 API、真实数据、分享查询、渐进加载、错误恢复和可观测性；
- 使用 clean-room architecture。旧代码只能作为行为证据、golden 来源和差异定位线索，不复用其目录、状态机、请求层、计算边界或部署结构；
- Go 后端是统计计算唯一权威，Python updater 只生成不可变 Archive，Vue 前端只负责交互状态、展示和可视化；
- 先完成可在开发环境内完整验收的产品与制品，生产运维、发布、迁移和切换另立后续 OpenSpec。

“正式开发完成”只表示本文的开发验收门全部通过，不表示已经发布、部署或完成生产迁移。

## 2. 权威顺序

出现冲突时按下列顺序处理；不得由实现者自行选择较低层规则：

1. [PRODUCT.md](../PRODUCT.md)：产品目标、查询语义、指标和用户可见业务行为。
2. [DESIGN.md](../DESIGN.md)：视觉 token、交互、状态、响应式和无障碍验收。
3. `tmp-formal-development/decisions/prototype-data-logic-audit.md`：基线 change 应用后迁入的已确认数据决策。
4. 本文：跨前端、后端、updater 和外部依赖的综合 DAG、所有权、阶段退出门和开发/运维边界。
5. 四份分散实施指南：
   - [数据逻辑实施指南](./data-logic-implementation-guide.md)
   - [后端开发实施指南](./backend-development-implementation-guide.md)
   - [前端生产清理与架构计划](./frontend-production-cleanup-and-architecture-plan.md)
   - [后端运维实施指南](./backend-operations-implementation-guide.md)，当前仅用于划清延期边界。
6. 已审核的根 OpenSpec capability 和 active change：一个有界变更的可执行契约。
7. 固定 oracle commit：用于外观、交互、状态、响应式和旧统计输出的比较证据，不是架构真源。

本文高于四份旧分散指南，只统筹跨层依赖、change 边界、所有权、开发顺序和 operations deferred；它不得改写 PRODUCT、DESIGN 或 accepted data decision。分散指南继续拥有各自层内的具体实现约束，但其旧阶段顺序、跨层假设或运维范围若与本文冲突，以本文为综合控制面并回到对应指南修订歧义。

若任何 approved bounded OpenSpec 与更高权威冲突，必须停止 apply，先修订并重新审核相关权威和 spec；OpenSpec、任务备注或实现代码均不得静默覆盖上层语义。

## 3. Oracle 与 clean-room 边界

### 3.1 必须保持的外部行为

除经 OpenSpec 明确批准的差异外，正式实现必须保持：

- 人物排行与共演分析的整体信息架构；
- Query Draft、Applied Query、query revision、取消和错误后的状态连续性；
- 排行、候选、人物详情、合作人物和共演分析的分区加载边界；
- Light/Dark、桌面 inspector、移动 drawer、职位 selector、selected tray 和分享入口的交互语义；
- `360 / 390 / 768 / 779 / 780 / 781 / 917 / 1024 / 1185 / 1440px` 的响应式结构；
- PRODUCT 与 DESIGN 中已经确认的文案、指标名、空状态、错误状态和无障碍行为。

每个影响用户可见行为的 proposal 必须把行为标为：

- `PRESERVE_ORACLE`：以固定 oracle 和现行权威文档为比较对象；
- `INTENTIONAL_DELTA`：由 PRODUCT、DESIGN 或已确认数据决策明确授权；
- `NEW_CAPABILITY`：原型没有，但正式开发必须新增。

### 3.2 禁止复用的内容

- 不复制旧前后端目录结构作为新版骨架；
- 不保留旧 TypeScript 统计计算作为生产权威；
- 不保留 prototype fixture、预选人物、伪 loading 或页面级请求状态机；
- 不继承旧 MySQL、Redis、常驻 Python loader、单一 `/statistics` 请求或旧部署结构；
- 不通过重命名旧组件、旧 store 或旧 API client 冒充 clean-room 实现。

允许从 oracle 提取最小 golden、截图、文案和行为矩阵，但提取物必须进入明确的测试或契约路径，并记录来源 commit。

### 3.3 补充证据提交不改变 oracle

Gate 0 开始前还存在一份被旧 `.gitignore` 隐藏、因此不在固定 oracle 中的已验证 Go 回归测试：

- 唯一路径：`backend/internal/core/subject/rate_test.go`；
- 行数：47；
- SHA-256：`e662fa678ce94c1f2b72fbc67d4e8d5fc53e7d882356a69c9af4b57ad462ef74`；
- Git blob：`3d52f6e505596819bad687d817d286f7a85d7c06`；
- `644b7748674e553f863d0ffd61d029f86fdc0717` 不包含该路径。

为满足“完整保存当前有效证据”而又不把旧测试带入 clean-room tip，baseline implementation subagent 必须先创建一个本地 supplemental evidence commit。该 commit 必须满足：

1. 单一 parent 恰为固定 oracle；
2. 相对 parent 的 tree diff 只新增上述唯一路径；
3. 文件行数、SHA-256 和 Git blob 同时匹配；
4. 本地 `codex/person-workbench-unified-prototype` 只能从固定 oracle 安全 fast-forward 到该 commit；
5. `codex/formal-rewrite` 在该证据 commit 的普通 ancestry 上继续 Gate 0 清理；
6. 不 push、不改 remote、不把 supplemental commit 宣称为新的视觉/交互/状态/响应式 oracle。

固定 oracle 仍是 `644b7748674e553f863d0ffd61d029f86fdc0717`。supplemental commit 只保存被忽略的回归证据；其未知 commit SHA 不得预先写死，必须由上述 parent/path/hash 谓词验证。

在任何清理前，已由主 agent 审核的 Gate 0 控制内容还必须由 approval manifest 封存，并以 subject `chore: approve formal rewrite baseline spec` 创建本地 planning-approval commit。`.approval-manifest.json` 的 `manifest.files` 不包含 manifest 自身；它逐项记录根 `openspec/config.yaml`、本文、active change 的 `.openspec.yaml`、`proposal.md`、`design.md`、capability spec、按“checkbox 全部未勾选且嵌入 manifest digest 使用规范占位符”归一化验证的 `tasks.md`，以及六个根 OpenSpec skill 文件。manifest 自身不能自哈希，其 whole-file SHA-256 由 `tasks.md` 中嵌入的固定值锁定。planning-approval commit 的单一 parent 必须是已验证的 supplemental evidence commit；相对 parent 的 tree diff 必须精确等于 `manifest.files` 路径集合再加上额外路径 `.approval-manifest.json`。它只锁定审批内容，不表示清理已经 apply；后续每个 mutation phase 都必须同时验证 `manifest.files` 的逐文件 hash、归一化 tasks、tasks 中嵌入的 manifest whole-file SHA-256，以及 planning commit 的精确 path delta。

上述 planning 封存规则只有以下两个穷举、封闭且已经观察到的工具兼容修复；第二项完成后不再存在任何 planning recovery、planning reseal 或 planning amend 余量。它们不涵盖 cleanup commit 之后由归档工具生成输出的纯格式 canonicalization；该阶段只允许 5.4 节明确记录的一次 post-archive output canonicalization reseal：

1. **第一项，safety-layer 命令修复，已完成且已耗尽。** 执行环境的破坏性操作安全层在命令实际执行前拒绝了原已审核的 `rm -rf --`；拒绝前后均未发生任何删除、移动、覆盖或其他 cleanup mutation，且 `frontend/node_modules/` 与 `frontend/dist/` 被重复验证为仓库内预期的 canonical real directory、均不包含 tracked file、目录树均未改变。主 agent 因而只批准把 active tasks 中该唯一调用改为 `rm -r --`，复审并重新封存受影响的控制内容；apply 子 agent 已在任何 cleanup mutation 前原位 amend 尚未发布的 planning-approval commit。随后批准的 `rm -r --` 已执行，两个 generated directory 现在必须持续 absent。本项不能再次触发。
2. **第二项，binary/non-UTF-8 deletion-complement 修复，是最后一项 planning 兼容修复。** 在两个 generated directory 已删除、3.2 节的 audit move、两个 link edit 和 `.gitignore` edit 已完成但仍全部 unstaged、index 仍为空的精确状态下，显式 `apply_patch` deletion-complement patch 在验证阶段因 tracked binary/non-UTF-8 文件无法由该文本补丁工具解析而失败；失败未删除任何 deletion-complement 路径，也未改变 index 或上述 3.2 变更。只有在重新证明这些状态谓词后，主 agent 才可批准以下窄替代：严格 UTF-8 且不含 NUL 的 complement 文件仍逐文件使用显式 `apply_patch` delete hunk；只有下列预先固定并验真的 36 个路径可逐路径执行非递归 `rm -- '<literal-path>'`，每次调用只带一个字面量目标：

```text
.superpowers/.DS_Store
.superpowers/concepts/fonts/harmonyos-sans-sc/HarmonyOS_Sans_SC_Bold.ttf
.superpowers/concepts/fonts/harmonyos-sans-sc/HarmonyOS_Sans_SC_Medium.ttf
.superpowers/concepts/fonts/harmonyos-sans-sc/HarmonyOS_Sans_SC_Regular.ttf
.superpowers/concepts/fonts/harmonyos-sans-sc/LICENSE.txt
.superpowers/concepts/fonts/source-han-sans/SourceHanSansSC-VF.otf.woff2
artifacts/person-card-audit-2026-07-21/01-six-people-1024-baseline.png
artifacts/person-card-audit-2026-07-21/02-five-people-1024-baseline.png
artifacts/person-card-audit-2026-07-21/03-four-people-1024-baseline.png
artifacts/person-card-audit-2026-07-21/04-three-people-1024-baseline.png
artifacts/person-card-audit-2026-07-21/05-three-people-406-baseline.png
artifacts/person-card-audit-2026-07-21/06-six-people-2560-baseline.png
artifacts/person-card-audit-2026-07-21/07-three-people-1024-final.png
artifacts/person-card-audit-2026-07-21/08-five-people-1024-final.png
artifacts/person-card-audit-2026-07-21/09-six-people-1024-final.png
artifacts/person-card-audit-2026-07-21/10-four-people-1024-final.png
artifacts/person-card-audit-2026-07-21/11-six-people-2560-final.png
artifacts/person-card-audit-2026-07-21/12-six-people-406-final.png
artifacts/person-card-audit-2026-07-21/13-three-people-406-final.png
artifacts/person-card-audit-2026-07-21/14-three-people-320-final.jpg
artifacts/person-card-audit-2026-07-21/15-six-people-1024-final.jpg
artifacts/person-card-audit-2026-07-21/16-five-people-before-after-comparison.jpg
artifacts/person-card-audit-2026-07-21/17-five-people-1024-final.jpg
artifacts/person-card-audit-2026-07-21/18-five-people-2560-final.jpg
artifacts/person-card-audit-2026-07-21/19-three-people-1024-final.jpg
artifacts/person-card-narrow-audit-2026-07-21/01-three-people-516-before.jpg
artifacts/person-card-narrow-audit-2026-07-21/02-three-people-516-after.jpg
artifacts/person-card-narrow-audit-2026-07-21/03-three-people-516-comparison.jpg
artifacts/person-card-narrow-audit-2026-07-21/04-five-people-516-after.jpg
artifacts/person-card-narrow-audit-2026-07-21/05-six-people-516-after.jpg
artifacts/person-card-narrow-audit-2026-07-21/06-six-people-320-after.jpg
artifacts/person-card-narrow-audit-2026-07-21/07-five-people-1024-after.jpg
frontend/public/bgmss.png
frontend/public/info.png
frontend/public/star.png
frontend/public/star_unrated.png
```

执行第二项前，apply 子 agent 必须重新打印完整 tracked deletion complement，并机械证明：上述集合恰好是其中“严格 UTF-8 解码失败或包含 NUL”的完整子集，无增无减；每一项均为 canonical repository root 内、tracked、存在且非 symlink 的 regular file，位于 deletion complement、未命中 retained allowlist，`git ls-files --stage` mode/Git blob、worktree SHA-256 和媒体类型均匹配 active tasks 中预先封存的逐路径 ledger，且 worktree `git hash-object` 等于当前 planning `HEAD:<path>` blob。其余 complement 路径必须全部通过严格 UTF-8 且无 NUL 检查。删除时禁止 `rm -r`、`rm -R`、`rm -f`、任何组合短选项、`git rm`、glob、command substitution、运行时派生目标、循环扩权或其他递归/宽范围调用；任何路径缺失、分类漂移、mode/blob/hash/type 漂移或集合差异都必须停止，不得自动扩大清单。每个显式删除后还必须证明目标 absent，最终 deletion set 精确等于预先打印的 complement。

planning 阶段两项 recovery 的控制面 diff 都只能包含六个既有 planning paths：本文、active `tasks.md`、`.approval-manifest.json`、`proposal.md`、`design.md` 和 `specs/contracts-rewrite-baseline/spec.md`。第一项的唯一语义执行变化是 `rm -rf --` → `rm -r --`；第二项的唯一语义执行变化是为上述固定 36-path 子集增加逐路径非递归 `rm --` fallback，同时保留其余文本文件的逐文件 `apply_patch` deletion。其余变化只能是机械 recovery gates、相同例外的一致性记录、状态记录和必需的 hash/digest 传播；六个路径之外的已审核内容必须逐字节不变。第二项 reseal 期间，apply 子 agent 只能暂存这六个控制路径并原位 amend 当前尚未发布的 planning-approval commit，必须保持 3.2 的五个工作树 path changes unstaged、两个 generated directory absent、index 除这六项外为空。

每次原位 amend 都必须分别记录 old/new OID，并证明 replacement commit 仍以同一 supplemental evidence commit 为唯一 parent、subject 完全不变、相对 parent 仍是同一精确 14-path delta、新 tree 精确包含当次重新封存的内容且新版 approval seal 通过。两个 replacement 都占用原 planning-approval commit 在四提交链中的同一个位置，不产生第五次提交；后续步骤只能引用第二次 amend 产生的最终 replacement OID。本节不授权祝福任何其他 drift，也不授权第三次 planning reseal/amend、rebase、额外提交或其他历史改写。

可重建的 `frontend/node_modules/` 和 `frontend/dist/` 未进入 supplemental 或 planning commit，并已由第一项修复后批准的命令删除；它们必须持续 absent，不得为第二项修复重建。旧实现 tip 中的 `rate_test.go` 仍由 supplemental evidence ancestry 保存，但必须随 tracked deletion complement 从 clean-room cleanup tip 移除。

cleanup commit 之后，归档工具输出发生了一次最终且可重现的 EOF 格式冲突；它不回写 planning commit，也不重开上述两项 planning recovery。冲突前置状态被固定为：`HEAD=c5435f0a7584bf63aeddf9d33738b15485fbd19e`，原 13 个 archive paths 的 staged tree 为 `4ec4543e89350085e0d3844c753e20c4383af9fd`，`git status --porcelain=v1` 输出的 SHA-256 为 `9b23c78289168f1400aa44911d96dfbec6449af115d4c649ddb6efcb4d76699c`；OpenSpec 原始同步输出 hash 保持 `79dd241c931be329170461e5ed0153a619595d34bacefeb5acdeb0f759f327fb`，替换正式 Purpose 后、EOF 为双 LF 的 root spec hash 是 `73ba0c12b7d3fd69592621d716f08a3a5ce7cdb16bb2853c3eca0e780862cd07`。该状态下 `git diff --cached --check` 的唯一错误精确为 `openspec/specs/contracts-rewrite-baseline/spec.md:327: new blank line at EOF.`；把这份仅替换 Purpose 的内容单独规范化为单 LF会得到 `7b25486958464cfc4d0788dc6d206251ec5bfa7707ee25eb0754c1ba4d0d265c`，该值只作为原 Purpose-only 单 LF证据 hash、固定冲突的另一端，不是最终批准的 root spec。本次 master plan amendment 只由被委派的 master-plan subagent owner 修改本文产出；main agent 只修改 archived OpenSpec/root spec，审核该 master amendment，并把两者的组合结果纳入新 seal。main agent 在 archived delta 与 root capability 中同步加入治理该窄例外的 post-archive canonicalization requirement/scenario，且两者的 requirements 必须 byte-identical；最终重新批准的 synchronized root spec 必须为单 LF、`28036` bytes，SHA-256 精确为 `78a68814751b268f802979742d683fb1a72945ff7f3e030e1da0f2121c8cf02f`。finalization 子 agent 不得重跑 archive、改变已批准语义、修改其他已生成文件、改写 cleanup/planning 历史或增加提交，只能按新 seal 验证、暂存和提交这些已批准 bytes。post-archive seal 必须同时锁定原 planning approval manifest whole-file SHA-256 `f42737d0d31bab3c04bb2d95a4e8b64a832340e3728e793656ac8314902b5635` 和重新封存后的 archived seal；最终只暂存原 13 个 archive paths 加本文共 14 个 no-renames paths，且 `git diff --cached --check` 必须通过。该唯一 canonicalization reseal 仍进入第四个且最终的 archive/sync commit，不产生第五个提交。

## 4. 固定技术栈与依赖准入

### 4.1 固定基线

- 前端：Vue 3、Vite、TypeScript、Pinia、Naive UI、native `fetch`。
- 后端：Go 1.26，标准库 `net/http` 为 HTTP 基线。
- Updater：Python one-shot process，生成不可变 SQLite Archive。
- 契约：版本化 OpenAPI、JSON Schema、manifest、golden 和跨语言 contract tests。
- 数据边界：Python 写新 Archive；Go 只读；前端不读取 Archive、不复制统计算法。

### 4.2 质量库准入

测试、浏览器验收、schema 校验、静态分析和基准所需的质量库不一刀切禁止，但必须由对应 change 的 spec 逐项说明：

1. 解决的具体质量问题；
2. 标准库或现有依赖为何不足；
3. 可替代方案；
4. 所有者和使用路径；
5. bundle、运行时、维护或供应链成本；
6. 可执行的准入和移除门。

禁止引入第二套状态管理、HTTP client、统计实现、组件系统或无明确消费者的抽象。生产依赖和仅开发依赖必须分开记录。

## 5. OpenSpec 与角色纪律

### 5.1 单根治理

- 主仓只允许根 `openspec/`；禁止 `frontend/openspec/`、`backend/openspec/`、`updater/openspec/` 等嵌套 root。
- 主仓 capability 必须且只能使用一个所有权前缀：
  - `contracts-`：跨语言 wire、manifest、共享 fixtures/goldens 和集成契约；
  - `backend-`：Go 只读 API、统计权威、缓存和上游 adapter；
  - `updater-`：Python Archive producer；
  - `frontend-`：Vue UI、交互状态和可视化。
- 一个 change 可以包含多个跨层 capability，但每个 capability 必须分别声明 Owner 和 Owned paths；`backend-`、`updater-` 或 `frontend-` owner 不得以“schema/golden/API 增量”为由直接写入 `contracts/**`。共享契约、golden、OpenAPI 和跨语言验收路径始终由同一 change 中显式列出的 `contracts-*` capability 与 Contracts owner 负责。
- `/Users/luca/dev/bangumi-collection-go` 是独立仓库，使用自己的 OpenSpec、分支和 capability 命名，不写入主仓 change。

### 5.2 Spec-before-apply

每个 change 的顺序固定为：

1. spec 子 agent 创建或更新 `proposal.md`、delta `specs/`、`design.md` 和 `tasks.md`；
2. 主 agent 审核并可修改 spec，核对权威、owned paths、依赖、非目标和验收；
3. `openspec validate --strict` 通过；
4. 主 agent明确记录“spec 已审核”，之后才可派 apply 子 agent；
5. apply 子 agent只修改 approved owned paths；
6. 主 agent做只读 diff 审核、命令验收和浏览器验收；
7. 未满足退出门不得开始依赖它的 change。

全部实际开发、测试实现、清场、文件迁移和外部仓库代码变更都由子 agent完成。主 agent不直接实现产品代码，只负责 spec 审核、必要的 spec 修订和验收。

Gate 0 的 tree 验收不得只看 `git ls-files` 或 proposed index。它必须同时枚举物理文件树、ignored 文件和 untracked 文件，明确识别被旧 ignore 规则隐藏的证据与可重建输出；tracked allowlist 通过但仍残留未批准 physical path 时，Gate 0 仍然失败。

本文所称“物理工作树精确匹配”只比较仓库内的文件与符号链接集合及其路径，不把空目录视为 Git baseline 的组成部分。清理后可以存在不含文件或符号链接的空目录；一旦其中残留未批准文件或符号链接，Gate 0 即失败。

### 5.3 每个 change 的强制字段

每个 change 的 `proposal.md`、`design.md` 和 `tasks.md` 都必须分别显式写出以下字段，不能只依赖其他 artifact 的隐含说明，也不能使用“相关目录”“所有开发能力”等无法机械核对的宽泛别名：

- Owner；
- Writable/Owned paths；
- Read-only protected inputs；
- Consumes；
- Produces；
- Dependencies；
- Deliverables；
- Acceptance；
- Non-goals；
- Operations deferred；
- Stop/rollback conditions；
- Status：investigated、specified、implemented、verified、committed、pushed、released、deployed 分开记录。

`Writable/Owned paths` 必须枚举该 change 可以写入、移动或删除的精确路径或可机械展开的窄范围；`Read-only protected inputs` 必须枚举可读取但不得修改的权威、oracle、golden、用户文件和跨仓库输入。`Dependencies` 在生成具体 change 时必须展开成确切 change ID，不得保留 wave 名、`all development capabilities` 或其他组别别名。

### 5.4 Gate 0 的提交、归档与双重验收

`establish-formal-rewrite-baseline` 是唯一需要在同一 change 内依次锁定审批内容、停在 staged candidate、创建清理提交并完成 OpenSpec 归档的基线 change。Gate 0 的 ancestry 和状态顺序固定为：

```text
oracle
  -> supplemental evidence commit
  -> planning-approval commit（仅按 3.3 节两个已观察到的封闭式兼容修复原位替换；第二次后 planning 锁死）
  -> staged cleanup candidate + 第一次主 agent 只读验收
  -> cleanup commit
  -> archive/sync candidate + 唯一 post-archive output canonicalization reseal
  -> archive/sync commit（第四个且最终提交）
  -> 第二次主 agent 只读验收
```

1. apply 子 agent 创建并验证只包含 `rate_test.go` 的 supplemental evidence commit；其单一 parent 必须是固定 oracle，并按 3.3 节的 CAS 约束仅把本地 prototype branch fast-forward 到该 evidence commit。
2. 在主 agent 已审核全部 Gate 0 OpenSpec artifacts 后，apply 子 agent 验证 approval manifest，并创建 subject 精确为 `chore: approve formal rewrite baseline spec` 的 planning-approval commit。该提交的单一 parent 必须是 supplemental evidence commit，相对 parent 的 delta 必须精确等于 3.3 节的 `manifest.files` 路径集合加额外的 `.approval-manifest.json`；manifest whole-file SHA-256 必须等于 tasks 中嵌入的固定值。不得把清理、迁移、`.gitignore` 或其他保留文件混入该提交。已观察到的第一次 safety-layer 修复和第二次 binary/non-UTF-8 修复各自只允许以重新封存并经主 agent 明确复审的 tree 原位 amend 这个尚未发布的 commit；每次都必须记录 old/new OID，并重新证明同一单一 parent、同一 subject、同一精确 14-path delta、新 tree 与新版 seal。第二次 amend 期间只能暂存六个 control paths，3.2 的五个 path changes 必须保持 unstaged，两个 generated directory 必须保持 absent；后续步骤只能引用第二次 amend 产生的最终 replacement OID，且不得再做 planning reseal 或 planning amend。
3. apply 子 agent 以最终 planning-approval replacement commit 为 `HEAD` 完成精确清场、文档迁移、最小 `.gitignore` 和根 OpenSpec 候选。tracked deletion complement 中严格 UTF-8 且无 NUL 的文件必须逐文件使用显式 `apply_patch` delete hunk；只有 3.3 节固定并重新验真的 36 个 binary/non-UTF-8 路径可以逐路径使用单目标、非递归 `rm --`。只暂存 approved cleanup paths，并停止在 staged cleanup candidate；此时不得创建 cleanup commit。
4. 主 agent 对 staged candidate 做第一次只读验收：同时检查 proposed index、物理文件与符号链接集合、ignored/untracked、oracle、supplemental 和 planning ancestry/delta、`manifest.files` 逐项 hash、tasks 中嵌入的 manifest whole-file SHA-256、OpenSpec strict validation、staged diff 与 candidate tree；主 agent 不改实现、不提交。
5. 只有主 agent 明确记录 pre-commit staged candidate 已通过后，finalization 子 agent 才能创建精确 cleanup commit。该提交的单一 parent 必须是已验证的 planning-approval commit，内容必须与已验收的 staged candidate tree 完全一致。
6. 同一 finalization 子 agent 随后 sync/archive `establish-formal-rewrite-baseline`，把 delta spec 同步为根 `openspec/specs/contracts-rewrite-baseline/spec.md`，把完整 change 移入带日期的 `openspec/changes/archive/`；同步后、创建提交前，它必须只把 OpenSpec 生成的默认 `TBD` Purpose 替换为已审核的正式 baseline Purpose：`Define the clean-room repository baseline, governance boundaries, immutable prototype evidence, and acceptance gates required before any formal frontend, backend, updater, or shared-contract implementation begins.`。原始同步输出 hash 必须保持 `79dd241c931be329170461e5ed0153a619595d34bacefeb5acdeb0f759f327fb`。已经观察到的双 LF curated 输出 hash `73ba0c12b7d3fd69592621d716f08a3a5ce7cdb16bb2853c3eca0e780862cd07` 会使 `git diff --cached --check` 唯一报出 `openspec/specs/contracts-rewrite-baseline/spec.md:327: new blank line at EOF.`；原 Purpose-only 内容规范化为单 LF时的证据 hash `7b25486958464cfc4d0788dc6d206251ec5bfa7707ee25eb0754c1ba4d0d265c` 只固定该冲突的另一端。因此，在 3.3 节固定的 pre-state 上，由被委派的 master-plan subagent owner 只修改本文产出本次 amendment；main agent 只修改 archived OpenSpec/root spec，把 post-archive canonicalization requirement/scenario 同步加入 archived delta 与 root capability并证明 requirements byte-identical，随后审核本文 amendment并把组合结果纳入 new archived seal，令该 seal 同时锁定原 planning seal `f42737d0d31bab3c04bb2d95a4e8b64a832340e3728e793656ac8314902b5635`。最终重新批准的 synchronized root spec 必须为单 LF、`28036` bytes、hash `78a68814751b268f802979742d683fb1a72945ff7f3e030e1da0f2121c8cf02f`。finalization 子 agent 不得重跑 archive、改变已批准语义或其他文件、增加提交，只能按 seal 验证并暂存这些 bytes；最终精确暂存原 13 个 archive paths 加本文，形成相对 cleanup parent 的 14 个 no-renames paths，并要求 cached diff check、严格验证和 post-archive seal 全部通过后再创建独立 archive/sync commit。该提交的单一 parent 必须是 cleanup commit，且仍是 Gate 0 第四个和最终提交。
7. 主 agent 对 post-archive stable baseline 做第二次只读验收：active change 已消失，根 spec 与 archived change 存在且严格验证通过，根 spec 不含默认 `TBD` Purpose、精确使用上述已审核 Purpose、包含新增 post-archive canonicalization 治理要求、EOF 为单 LF、大小为 `28036` bytes且 hash 为 `78a68814751b268f802979742d683fb1a72945ff7f3e030e1da0f2121c8cf02f`，其 requirements 与 archived delta byte-identical；original planning seal 与 new archived seal 均通过，archive/sync commit 相对 cleanup parent 精确为 14 个 no-renames paths，四次本地提交的精确 parent、subject、path delta 和 content 均符合约束，物理文件与符号链接集合仍精确，ignored/untracked 为空，`git status --porcelain` 为空。
8. 只有第二次验收通过，Gate 0 才结束，Wave 1 才可开始。

上述 supplemental evidence、planning approval、cleanup、archive/sync 是 Gate 0 仅允许的四次本地提交；3.3 节穷举的两个原位 amend 只依次替换同一个尚未发布的 planning-approval commit，不增加提交数量，且不存在第三次 planning reseal/amend。cleanup 后只有 3.3 和本节共同固定的一次 post-archive output canonicalization reseal：它只解决已观察到的 EOF/cached-diff-check 冲突，进入同一个最终 archive/sync commit，不重跑 archive、不改语义也不增加提交。整个 Gate 0 禁止其他提交，也禁止 push、PR、tag、release 或 deploy。任一步失败都必须保留可审核证据并停止；不得重新生成 approval manifest 追认本例外之外的 drift，不得祝福其他内容变化，亦不得用额外修补提交绕过已锁定的审批内容或已验收的 staged candidate。

### 5.5 Impeccable sidecar 时序

`bootstrap-frontend-foundation` 只负责定义 `.impeccable/design.json` 的 regeneration contract、触发时机和最终 owner，并把现存 sidecar 明确标记为相对 clean-room frontend 的 stale input；它不得修改或再生成该文件。实际写入和再生成只属于 `harden-frontend-design-and-accessibility`，且必须等两个 frontend vertical 退出后按其已审核 spec 执行。在此之前，所有 change 都把该 sidecar 作为只读保护输入。

## 6. 总体依赖 DAG

表中依赖表示 apply 依赖。依赖 change 的 spec 审核通过后，可以提前起草下游 spec；依赖 change 的实现退出门通过前，不得 apply 下游 change。

```text
Wave 0
establish-formal-rewrite-baseline
  +--> define-shared-query-wire
  |      +--> bootstrap-frontend-foundation
  |      +--> bootstrap-backend-runtime
  |
  +--> define-archive-manifest-contract
         +--> bootstrap-updater-runtime
         +--> bootstrap-backend-runtime

External lane
bootstrap-bangumi-collection-go-openspec
  --> harden-bangumi-collection-go-v0-1-0
  --> explicit push / PR / tag authorization
  --> fixed public v0.1.0

Wave 2
define-archive-manifest-contract + bootstrap-backend-runtime
  --> implement-backend-archive-consumer

define-archive-manifest-contract
  + bootstrap-updater-runtime
  + implement-backend-archive-consumer
  --> produce-immutable-archive
      --> derive-position-catalog-and-cast

bootstrap-backend-runtime
  + define-shared-query-wire
  + implement-backend-archive-consumer
  --> implement-backend-http-and-observability
      --> implement-image-proxy

implement-backend-archive-consumer
  + derive-position-catalog-and-cast
  + define-shared-query-wire
  --> implement-query-result-set
      --> implement-statistics-series-sort-evidence

implement-backend-archive-consumer
  + derive-position-catalog-and-cast
  + implement-backend-http-and-observability
  --> expose-dynamic-catalog

Wave 3
harden-bangumi-collection-go-v0-1-0 [exit: fixed public v0.1.0]
  + implement-query-result-set
  --> admit-public-collection-client
      + implement-statistics-series-sort-evidence
      + implement-backend-http-and-observability
      --> implement-bounded-query-cache

expose-dynamic-catalog
  + implement-statistics-series-sort-evidence
  + implement-bounded-query-cache
  --> expose-rankings
      +--> expose-candidates
      +--> expose-person-detail
              --> expose-partners
expose-candidates + expose-partners
  --> expose-co-star

Wave 4
bootstrap-frontend-foundation
  + expose-dynamic-catalog
  --> implement-frontend-query-shell

implement-frontend-query-shell
  + expose-rankings
  + expose-person-detail
  + implement-image-proxy
  --> implement-frontend-ranking-vertical

implement-frontend-query-shell
  + implement-frontend-ranking-vertical
  + expose-candidates
  + expose-partners
  + expose-co-star
  --> implement-frontend-co-star-vertical

implement-frontend-co-star-vertical
  --> harden-frontend-design-and-accessibility

Wave 5
produce-immutable-archive
  + derive-position-catalog-and-cast
  + implement-backend-archive-consumer
  + implement-backend-http-and-observability
  + implement-image-proxy
  + implement-query-result-set
  + implement-statistics-series-sort-evidence
  + expose-dynamic-catalog
  + admit-public-collection-client
  + implement-bounded-query-cache
  + expose-rankings
  + expose-candidates
  + expose-person-detail
  + expose-partners
  + expose-co-star
  + implement-frontend-query-shell
  + implement-frontend-ranking-vertical
  + implement-frontend-co-star-vertical
  + harden-frontend-design-and-accessibility
  --> produce-development-artifacts
      --> complete-integrated-development-acceptance
```

主仓 DAG 共 27 个 change，按上述边方向拓扑排序后无环：Archive consumer 不依赖 producer，只先消费 contracts change 提供的最小 fixture；producer 再以该 consumer 完成 full smoke，因此不会形成 producer/consumer 验收闭环。前端 co-star vertical 明确排在 ranking vertical 之后，最终集成验收排在 artifacts 之后。

Wave 5 图中列出的 19 个 ID 是 `produce-development-artifacts` 的确切直接依赖，不是可继续保留在 OpenSpec 中的组别别名；创建该 change 时必须把这 19 个 ID 逐项写入 `proposal.md`、`design.md` 和 `tasks.md`。`complete-integrated-development-acceptance` 的确切直接依赖是 `produce-development-artifacts`，其传递闭包覆盖上述 19 个 change 及它们的前置 change。

`expose-dynamic-catalog` 有意早于公开收藏 source 和 query cache。它只读取已通过启动门的不可变 Archive，并服务 frontend query shell 的职位与 capability 发现；它不读取 personal collection、不依赖 collection client，也不执行昂贵排行计算，因此这一早期依赖不是遗漏。rankings/candidates 等业务 endpoint 仍必须等待 collection source、statistics 和 bounded cache。

## 7. 阶段与 Change 明细

### Wave 0：可逆清场与治理基线

| Change | Owner / capability | Owned paths | Depends | Deliverables | Acceptance | Non-goals | Exit |
|---|---|---|---|---|---|---|---|
| `establish-formal-rewrite-baseline` | Contracts / `contracts-rewrite-baseline` | 仅该 change 批准的精确保留/删除清单、根 OpenSpec、总计划、最小 `.gitignore`、本地 branch refs，以及四次有序本地提交（supplemental evidence、planning approval、cleanup、archive/sync） | 无 | 固定 oracle；以单 parent/唯一路径/hash 谓词保存被忽略的 `rate_test.go` 并安全 fast-forward 本地 prototype ref；以 `chore: approve formal rewrite baseline spec` 和 manifest seal 锁定精确 14-path planning delta；只按 3.3 节依序处理已经观察到的 safety-layer 与 binary/non-UTF-8 两项封闭式 planning 兼容修复，均原位替换同一未发布 planning commit；保留 LICENSE、PRODUCT、DESIGN、四份指南、总计划、迁入的 data audit、根 Impeccable 和根 OpenSpec；从 rewrite tip 删除其余旧内容、旧测试、两个 generated directory 和嵌套 OpenSpec；严格 UTF-8 且无 NUL 的 deletion complement 逐文件用 `apply_patch`，固定 36-path binary/non-UTF-8 子集才可逐路径用单目标非递归 `rm --`；经 staged candidate 验收后提交 cleanup，再 sync/archive 根 spec、替换默认 `TBD` Purpose；对已观察到的双 LF/cached-diff-check 冲突只做一次 post-archive output canonicalization reseal：master-plan subagent owner 只修改本文，main agent 只修改 archived OpenSpec/root spec、审核本文 amendment并把组合结果纳入 seal，以单 LF root spec 提交 | supplemental、planning、cleanup、archive 的 parent/subject/tree/path/hash 谓词全部通过；两次 planning compatibility amend 各自有 old/new OID、新 seal、同一 evidence parent、同一 subject 与同一 14-path delta，第二次还证明 generated dirs absent、3.2 五项保持 unstaged、index 仅暂存六个 control paths；36-path 集合预先精确列出并证明恰好等于 complement 的 strict-UTF-8-fail-or-NUL 子集，各 blob 与 planning `HEAD` 一致；pre-commit staged candidate 的 tracked allowlist、物理文件/符号链接、ignored/untracked、strict validation 同时通过；cleanup tree 精确等于主 agent 已验收 candidate；post-archive pre-state 的 HEAD/tree/status/root hashes 和唯一 cached-check 错误匹配 3.3 节，raw root hash 保持不变，`7b25486958464cfc4d0788dc6d206251ec5bfa7707ee25eb0754c1ba4d0d265c` 只作为原 Purpose-only 单 LF冲突证据，最终 synchronized root spec 为 `28036` bytes/hash `78a68814751b268f802979742d683fb1a72945ff7f3e030e1da0f2121c8cf02f` 且 requirements 与 archived delta byte-identical，original planning seal 与 new archived seal 同时通过，archive delta 精确为 14 个 no-renames paths；archive 后 active change 消失、根 spec/archived change 严格有效，工作树干净；oracle 与 evidence 可由 ancestry 读取；根 skills 与 oracle 副本 hash 一致；无 repo 外写入 | 不创建四次有序提交之外的提交；不做第三次 planning reseal/amend，不在唯一 post-archive EOF canonicalization 之外 reseal 或追认 drift；不重跑 archive、不改变 root spec 语义或其他已生成文件；不扩大 36-path 清单，不对其余文本文件使用 `rm`，不使用 recursive/glob/command substitution/derived target/loop expansion/`git rm`/`rm -f`；不保留默认 `TBD` Purpose；不创建新版 Go/Python/Vue/CI/Docker/infra；不 apply 后续 change；不 push、不发布 | 主 agent 先只读验收 staged candidate，再只读验收 post-archive stable baseline；两次都通过、archive/sync commit 完成且 `git status --porcelain` 为空后，才能进入 Wave 1 |

### Wave 1：共享契约与三端空骨架

| Change | Owner / capability | Owned paths | Depends | Deliverables | Acceptance | Non-goals | Exit |
|---|---|---|---|---|---|---|---|
| `define-shared-query-wire` | Contracts / `contracts-query-wire` | `contracts/openapi/**`, `contracts/schemas/query/**`, `contracts/goldens/query/**` | `establish-formal-rewrite-baseline` | personal/global 判别联合；PositionKey；tag 逻辑；sort/page/search；error envelope；share fragment v1；语言无关正反例 | schema lint、示例校验和正反例 golden 通过；规范化期望输出稳定；Go/TS codegen 输入可生成且无 schema-level error | 不要求尚未存在的 Go/TS runtime 执行 consumer test；不实现 endpoint、store 或统计 | versioned schema、goldens 和生成可行性证据齐全，实际 consumer tests 明确移交 backend/frontend foundation |
| `define-archive-manifest-contract` | Contracts / `contracts-archive-manifest` | `contracts/schemas/archive/**`, `contracts/goldens/archive/**` | `establish-formal-rewrite-baseline` | SQLite schema version、manifest、dataVersion、digest、兼容性和最小有效/损坏 fixtures；语言无关校验向量 | schema lint、正反例 fixture 和 dataVersion/digest 向量自洽；Python/Go codegen或解析模型输入可生成且无 schema-level error | 不要求尚未存在的 Python/Go runtime 执行 consumer test；不下载数据、不建完整 Archive、不激活版本 | contract bundle 与生成可行性证据齐全，实际 producer/consumer tests 明确移交 updater/backend foundation |
| `bootstrap-backend-runtime` | Backend / `backend-runtime-foundation` | `backend/**`, 仅其必要根级 toolchain 文件 | `define-shared-query-wire`, `define-archive-manifest-contract` | Go 1.26 module、依赖方向、空 API process、生成契约接入、基础测试命令；Go 对 query/archive 最小正反例的 consumer contract tests | build/test/vet 通过；Go 生成模型无 drift；Go 能接受最小合法 query/archive contract 并拒绝指定错误版本/结构；业务包不反向依赖 transport | 不实现查询、缓存、图片代理、Docker | 空 process 可启动/停止，Go consumer contract tests 和生成检查通过 |
| `bootstrap-updater-runtime` | Updater / `updater-runtime-foundation` | `updater/**` | `define-archive-manifest-contract` | Python package、one-shot CLI 外壳、契约读取、测试和类型/静态检查入口；Python 对 archive 正反例的 producer-side contract tests | clean environment 可安装并运行空命令；Python 能接受最小合法 archive contract 并拒绝指定错误版本/结构；无 daemon、scheduler 或激活逻辑 | 不抓取/构建完整 Archive，不写 `current.json` | updater 质量命令和 Python archive contract tests 稳定通过 |
| `bootstrap-frontend-foundation` | Frontend / `frontend-foundation` | 仅 `frontend/**`；`.impeccable/design.json` 为 read-only protected input | `define-shared-query-wire` | Vue 3 + Vite + TS + Pinia + Naive UI + native fetch；单 SPA；生成 DTO 接入；测试/浏览器工具按 spec 准入；TS 对 query/wire 正反例的 adapter contract tests；定义 sidecar regeneration contract/timing，标记现存 sidecar stale，并登记最终 owner | build/unit/typecheck 通过；TS 生成类型无 drift并能消费最小合法 wire golden；错误版本/结构在 adapter 边界稳定拒绝；只有一个 state owner 和 request adapter；生产入口无 fixture；sidecar 内容/hash 未改变且 regeneration handoff 可核对 | 不实现排行/共演业务，不复制统计；不修改或再生成 `.impeccable/design.json` | 空 SPA 可启动且无 console error，TS consumer contract tests、依赖准入记录和 sidecar handoff 完整 |

### Wave 2：数据、领域和运行时能力

| Change | Owner / capability | Owned paths | Depends | Deliverables | Acceptance | Non-goals | Exit |
|---|---|---|---|---|---|---|---|
| `implement-backend-archive-consumer` | Backend / `backend-archive-consumer` | `backend/internal/archive/**`，以及 backend foundation 在 spec 中枚举的启动装配文件 | `define-archive-manifest-contract`, `bootstrap-backend-runtime` | 严格只读 Archive consumer 和启动门：一次性严格解析 `current.json`；校验 manifest/digest/schema/table/index/dataVersion 一致；read-only/no-create 打开；integrity/sentinel/catalog-domain smoke；成功后原子发布 store/ready | 未知字段、非法路径、文件缺失、digest/schema/table/index/dataVersion 不一致或 sentinel 失败均关闭新句柄并保持 not-ready；API 不修改 snapshot、不自动回退；最小合法 fixture 可发布 ready | 不生成 Archive；不切换 `current.json`；不实现生产回滚或进程内热切换 | 最小合法/损坏/不兼容 fixtures 的 Go consumer tests 全通过，后续 producer、HTTP readiness、catalog 和 domain 可依赖同一 consumer |
| `produce-immutable-archive` | Updater / `updater-archive-producer`; Contracts / `contracts-archive-goldens` | Updater：`updater/**`；Contracts：`contracts/goldens/archive/**` | `define-archive-manifest-contract`, `bootstrap-updater-runtime`, `implement-backend-archive-consumer` | 下载、SHA-256、暂存、stream build、schema/reference/quality/integrity checks、manifest；由 Contracts owner维护跨语言最小/完整 Archive golden | 中途失败无可消费版本；active DB 不原地改写；同输入逻辑数据和 dataVersion 稳定；完整来源 smoke 使用已实现的 Go 只读 consumer 验证 | 不调度、不 `flock`、不切 `current.json`、不重启 API | 完整 producer 输出通过 Go consumer 全部启动门和 smoke query |
| `derive-position-catalog-and-cast` | Updater / `updater-position-catalog`; Contracts / `contracts-position-catalog` | `updater/**`, `contracts/schemas/catalog/**`, `contracts/goldens/catalog/**` | `produce-immutable-archive` | 动态职位目录、多上层分类、固定常用职位、main/all 互斥、dormant staffset、exact cast 数据 | canonical key 稳定；多分类不复制实体；常用顺序精确；只接受 exact same-subject cast；无法证明时阻塞而非推断 | 不做跨作品 cast credit，不做 API/UI selector | catalog/cast synthetic 与完整数据质量门通过 |
| `implement-backend-http-and-observability` | Backend / `backend-http-runtime`, `backend-observability` | `backend/**` | `bootstrap-backend-runtime`, `define-shared-query-wire`, `implement-backend-archive-consumer` | 严格 JSON、requestId、错误 envelope、limits/timeouts/cancel；`/livez`、`/readyz`、`/metrics`、结构化事件；readiness 只消费 archive consumer 的已发布状态 | 多余字段和超大 body 被拒；取消向下传播；consumer 任一启动门失败时保持 not-ready；指标低基数且日志无 UID/token | 不重复实现 Archive 校验；不部署 Prometheus，不写 systemd/nginx；不产生 `update_activated` | transport/fuzz/race/health tests 全通过，readiness 与 consumer 状态一致 |
| `implement-image-proxy` | Backend / `backend-image-proxy` | `backend/**` | `implement-backend-http-and-observability` | 同源图片代理、resource/type/size 白名单、上游超时、缓存头和安全错误 | 非开放代理；host/path/规格绕过测试通过；错误不泄露上游 body | 不为 UI 猜图片尺寸，不做 CDN/生产 cache 配置 | 代理 contract 和 SSRF 负例通过 |
| `implement-query-result-set` | Backend / `backend-query-result-set`; Contracts / `contracts-query-goldens` | Backend：`backend/**`；Contracts：`contracts/goldens/query-domain/**` | `define-shared-query-wire`, `implement-backend-archive-consumer`, `derive-position-catalog-and-cast` | personal/global 分离；查询归一化；过滤；多职位 AND；作品 union + Subject ID 去重；tag 布尔逻辑；identity；由 Contracts owner维护跨语言 result-set goldens | search/sort/page 不改变基础集合；global 不读取个人字段；标签逻辑和缺失值通过共享 goldens；所有查询只经只读 Archive consumer | 不计算最终指标，不分页 HTTP response | 与数据指南的结果集合 goldens 一致，consumer/domain integration 通过 |
| `implement-statistics-series-sort-evidence` | Backend / `backend-statistics-authority`; Contracts / `contracts-statistics-goldens` | Backend：`backend/**`；Contracts：`contracts/goldens/statistics/**` | `implement-query-result-set` | 均分、综合分、偏好、评分分布、系列连通分量、严格总序、摘要、evidence；由 Contracts owner维护跨语言统计 goldens | `0/null` 不计评分；`[6,7,7] -> 6.66`；五个中性样本；缺失指标永远最后；stable ID 最终破同分；`.5` 向上分箱 | 前端不复制算法；不以评分人数加权综合分 | 跨语言历史 golden 与新 Go 权威结果一致或有已批准 delta |
| `expose-dynamic-catalog` | Backend / `backend-catalog-api`; Contracts / `contracts-catalog-api` | Backend：`backend/**`；Contracts：`contracts/openapi/openapi.yaml`, `contracts/goldens/api/catalog/**` | `derive-position-catalog-and-cast`, `implement-backend-archive-consumer`, `implement-backend-http-and-observability` | catalog endpoint、版本/来源元数据、正式错误；Contracts owner先定义并验证 catalog wire | API 返回 key 与 query 接受 key 完全一致；加载失败不伪装为空；未知/休眠职位有 scenario；handler 只消费已发布只读 store | 不实现排行或前端 selector | OpenAPI 无 drift，handler 与 Archive consumer integration 通过 |

### External lane：`bangumi-collection-go`

此 lane 不计入主仓 27 个 change，由独立仓库、独立 OpenSpec 和独立分支治理。外部仓库的固定开发基线是 `8173f44911360150a5a5a7c6418021d1014fe85b`；OpenSpec bootstrap 和 hardening 分支都必须从该 commit 的普通 ancestry开始。

以下现有用户文件不属于 hardening 输入或提交内容，必须在整个 lane 中原样保护：

- untracked `CLAUDE.md`；
- untracked `note`；
- ignored `.claude/settings.local.json`。

任何 preflight、branch 操作、OpenSpec bootstrap、测试或本地提交都不得覆盖、删除、暂存或提交这些路径；其出现也不得被误报为 hardening 产物。

| Checkpoint / Change | Owner / paths | Depends | Deliverables | Acceptance | Non-goals / protection | Exit |
|---|---|---|---|---|---|---|
| `bootstrap-bangumi-collection-go-openspec` | External client owner；仅该仓库 OpenSpec/branch metadata | 无 change 依赖；前置条件为用户确认外部仓库范围和 exact baseline `8173f44911360150a5a5a7c6418021d1014fe85b` | 独立根 OpenSpec；建议分支 `codex/v0.1.0-hardening`；精确 baseline、现状和保护路径清单 | branch 基线可由 ordinary ancestry 验证；除 OpenSpec 外零产品代码变化；`CLAUDE.md`、`note`、`.claude/settings.local.json` 内容和状态均未改变且未进入 index | 不修改主仓；不 clean/reset/checkout 覆盖用户文件；不暂存或提交保护路径；不 push | 外部 change 严格验证通过，三条保护路径仍保持原有 untracked/ignored 状态 |
| `harden-bangumi-collection-go-v0-1-0` | External capability `collection-client-v0-1-0`；仅外部仓库批准 paths | `bootstrap-bangumi-collection-go-openspec` | 完整 DTO；自动分页；client-wide QPS；429/5xx/transport retry + `Retry-After`；typed/sanitized errors；确定性去重排序；httptest/race/CI；Go 1.26 | 不是 `[no test files]`；分页/限速/retry/errors/dedupe 均有测试；race 和 CI 通过；三条保护路径未被覆盖、删除、暂存或提交 | 不接主仓 cache/统计；不接 token/OAuth；不把保护路径纳入 hardening；不擅自 push/PR/tag | 主 agent验收本地 commit 和保护路径状态后，另获授权才 push/PR/tag；固定公开 `v0.1.0` 后主仓可准入 |

### Wave 3：公开收藏准入、缓存和正式 API

| Change | Owner / capability | Owned paths | Depends | Deliverables | Acceptance | Non-goals | Exit |
|---|---|---|---|---|---|---|---|
| `admit-public-collection-client` | Backend / `backend-public-collection-source` | `backend/**` | `harden-bangumi-collection-go-v0-1-0`, `implement-query-result-set`；前者还必须已获授权并发布固定公开 `v0.1.0` | 薄 adapter；公开收藏；字段映射；空收藏与 UID 不存在/私密/禁止访问错误 | 正式 `go.mod` 固定 tag 且无 `replace`；不接收 token/Cookie；consumer contract tests 通过 | 不 fork 客户端逻辑，不建 OAuth | 个人 scope 上游错误分类和 mapping 全通过 |
| `implement-bounded-query-cache` | Backend / `backend-query-cache` | `backend/**` | `admit-public-collection-client`, `implement-statistics-series-sort-evidence`, `implement-backend-http-and-observability` | typed weighted LRU、immutable values、singleflight、并发闸门、digest；1h fresh、transient stale 最多 30m；256 MiB/32 MiB | global/personal key 隔离；昂贵 core key 不含 search/sort/page；仅瞬时错误 stale；race/驱逐/内存基准通过 | 不引入 Redis/AOF，不缓存前端选择态 | cache correctness、budget 和 cancellation gate 通过 |
| `expose-rankings` | Backend / `backend-rankings-api`; Contracts / `contracts-rankings-api` | Backend：`backend/**`；Contracts：`contracts/openapi/openapi.yaml`, `contracts/goldens/api/rankings/**` | `expose-dynamic-catalog`, `implement-statistics-series-sort-evidence`, `implement-bounded-query-cache` | 两 scope 排行、完整摘要、稳定名次、search/sort/page；Contracts owner先定义 rankings wire 和 scenarios | 先完整排序定名次再搜索分页；摘要不随分页变化；全站无相对偏好；缺失不用 0 冒充 | 不返回人物详情 | OpenAPI 无 drift，shared golden、integration、race 通过 |
| `expose-candidates` | Backend / `backend-candidates-api`; Contracts / `contracts-candidates-api` | Backend：`backend/**`；Contracts：`contracts/openapi/openapi.yaml`, `contracts/goldens/api/candidates/**` | `expose-rankings` | 各职位完整人数、当前职位分页列表、搜索 total 和名次；Contracts owner先定义 candidates wire | 完整职位人数与搜索 total 分开；默认职位为有序数组第一项；response 不含前端 selected state | 不分析共演 | OpenAPI 无 drift，候选 shared golden 与分页 scenarios 通过 |
| `expose-person-detail` | Backend / `backend-person-detail-api`; Contracts / `contracts-person-detail-api` | Backend：`backend/**`；Contracts：`contracts/openapi/openapi.yaml`, `contracts/goldens/api/person-detail/**` | `expose-rankings`, `derive-position-catalog-and-cast` | 人物资料、完整统计、标签、图表、偏好 evidence、作品/系列/角色分页；Contracts owner先定义 detail wire | 只有 cast query 才有角色 section；appearance 指向 exact 原始作品；分页不重算摘要/图表 | 不提供合作人物 | OpenAPI 无 drift，detail shared golden 与 cast scenarios 通过 |
| `expose-partners` | Backend / `backend-partners-api`; Contracts / `contracts-partners-api` | Backend：`backend/**`；Contracts：`contracts/openapi/openapi.yaml`, `contracts/goldens/api/partners/**` | `expose-person-detail` | 单人物合作总数、leaders、分页人物、职位过滤；Contracts owner先定义 partners wire | 不返回共同作品；职位过滤重算全集/摘要/leaders/list；普通 view 操作不重算完整摘要 | 不返回 pair/matrix | OpenAPI 无 drift，单人 operation shared golden 通过 |
| `expose-co-star` | Backend / `backend-co-star-api`; Contracts / `contracts-co-star-api` | Backend：`backend/**`；Contracts：`contracts/openapi/openapi.yaml`, `contracts/goldens/api/co-star/**` | `expose-candidates`, `expose-partners` | 2–10 人、最多 20 identity；pair；多人矩阵；共同原始作品与系列视图；Contracts owner先定义 co-star wire | 每人先 identity union，再做人物间原始作品 intersection，最后系列合并；同系列不同作品不算共同参与 | 不建立服务端 session/queryId | OpenAPI 无 drift，limit、identity、pair、matrix 和 series shared goldens 通过 |

### Wave 4：前端垂直切片

| Change | Owner / capability | Owned paths | Depends | Deliverables | Acceptance | Non-goals | Exit |
|---|---|---|---|---|---|---|---|
| `implement-frontend-query-shell` | Frontend / `frontend-query-shell` | `frontend/**` | `bootstrap-frontend-foundation`, `expose-dynamic-catalog`, `define-shared-query-wire` | 单 SPA；`/ranking`、`/co-star`；Header/Query Workspace；Draft/Applied/revision；Catalog/Query/Resource stores；share fragment | mode switch 不自动 apply；失败/取消保留 Draft 和旧结果；apply 原子提交；catalog pending 只占 selector；无 Applied Query 时分享禁用 | 不放 production fixture；不实现统计 | 状态机 unit tests、真实 catalog integration 和基础浏览器验收通过 |
| `implement-frontend-ranking-vertical` | Frontend / `frontend-ranking-workspace` | `frontend/**` | `implement-frontend-query-shell`, `expose-rankings`, `expose-person-detail`, `implement-image-proxy` | 排行、人行、inspector/drawer、详情 operation、搜索排序分页和局部 loading | 排行先显示、详情独立等待；旧响应不能覆盖新人；本地交互无伪 Skeleton；刷新保留摘要、工具栏和焦点 | 不实现共演 tray/analysis | 桌面/移动真实 API vertical E2E 通过 |
| `implement-frontend-co-star-vertical` | Frontend / `frontend-co-star-workspace` | `frontend/**` | `implement-frontend-query-shell`, `implement-frontend-ranking-vertical`, `expose-candidates`, `expose-partners`, `expose-co-star` | 复用已验收的 person/entity/detail/media primitives，建立 candidate rail/drawer、唯一 selected tray、单人合作、多人共演和 identity 管理 | 不复制或分叉 ranking vertical 的 person/detail primitives；selected 只由前端叠加；tray 是唯一修改入口；分析区只读；1/2/3+ 人 operation 正确；只接受最新响应 | 不与 ranking vertical 并行 apply；不建立第二套 person primitive、selector 或 selected owner | ranking vertical 已退出后，全 operation E2E、复用边界、取消与快速切换测试通过 |
| `harden-frontend-design-and-accessibility` | Frontend / `frontend-design-system`, `frontend-accessibility` | `frontend/**`；唯一获准实际写入和再生成 `.impeccable/design.json` 的 change | `implement-frontend-ranking-vertical`, `implement-frontend-co-star-vertical` | DESIGN token 映射、SafeImage 四态、响应式重排、tooltip/focus/scroll、统一词表、生产 bundle denylist；按 foundation handoff 的 contract/timing 重新生成 Impeccable sidecar | 两模式 × Light/Dark × 全 viewport；无横向溢出、重复 ID、console error；44px target；图片 3:4 四态无位移；网络不直连 `api.bgm.tv`；sidecar 与最终 frontend 结构一致 | 不在两个 vertical 退出前修改 sidecar；不以装饰改版替代 fidelity；不依赖组件库私有 DOM | 视觉、交互、状态、响应式和 a11y matrix 全绿，sidecar regeneration 已由其唯一 owner 验收 |

### Wave 5：开发制品与集成验收

| Change | Owner / capability | Owned paths | Depends | Deliverables | Acceptance | Non-goals | Exit |
|---|---|---|---|---|---|---|---|
| `produce-development-artifacts` | Contracts / `contracts-artifact-compatibility`; Backend / `backend-build-artifact`; Updater / `updater-build-artifact`; Frontend / `frontend-build-artifact` | Contracts：`contracts/artifacts/**`, `.github/workflows/ci.yml`；Backend：`backend/Dockerfile`, `backend/build/**`；Updater：`updater/Dockerfile`, `updater/build/**`；Frontend：`frontend/build/**` 及该 change spec 逐个枚举的既有 build config | `produce-immutable-archive`, `derive-position-catalog-and-cast`, `implement-backend-archive-consumer`, `implement-backend-http-and-observability`, `implement-image-proxy`, `implement-query-result-set`, `implement-statistics-series-sort-evidence`, `expose-dynamic-catalog`, `admit-public-collection-client`, `implement-bounded-query-cache`, `expose-rankings`, `expose-candidates`, `expose-person-detail`, `expose-partners`, `expose-co-star`, `implement-frontend-query-shell`, `implement-frontend-ranking-vertical`, `implement-frontend-co-star-vertical`, `harden-frontend-design-and-accessibility` | API/updater 不可变本地构建、前端静态制品、checksums、SBOM、compatibility manifest、可重复 local smoke；每个 owner 只写自己的 paths | 本地可重复构建/启动；版本和 Archive schema 兼容检查一致；CI 只 test/build 且 `push=false`；跨层 manifest 只由 Contracts owner组装 | 不以 coordinator 身份任意修改其他 owner 源码；不写 production Compose、release/deploy workflow；不推 registry | 三类 owner 制品和 Contracts manifest 在干净环境 smoke 通过 |
| `complete-integrated-development-acceptance` | Contracts / `contracts-development-acceptance` | 仅 `contracts/acceptance/**` | `produce-development-artifacts` | 只读编排已有跨语言 contract、完整 Archive、真实 API/UI E2E、oracle shadow/golden diff、race、浏览器矩阵和开发环境性能命令，并保存集成验收矩阵/结果格式 | 所有 change 自己的测试和 exit gate 已先通过；最终 harness 不补写 backend/updater/frontend 测试或产品代码；生产入口无 fixture；外观/交互/状态/响应式符合 oracle 或有批准 delta | 不在最终验收 change 中修补任何 owner 的遗漏；失败回到对应 owner change/spec；不部署、不生产压测、不宣称 SLO 或生产就绪 | 只读集成矩阵全绿并记录“开发验收完成；运维未开始”，方可提议后续 operations change |

## 8. 开发期允许的运维邻接内容

以下内容属于开发契约，可在对应 capability 中实现和测试：

- `/livez`、`/readyz`、`/metrics`；
- 低基数指标、结构化 application/query/updater events；
- `update-status.json`、Archive manifest、compatibility manifest 和 `current.json` 的 schema/reader/local fixture；
- updater 的不可变输出、自校验和失败安全；
- Dockerfile 或等价不可变本地构建定义、checksums、SBOM、local smoke；
- test/build CI，且不推镜像、不发布、不部署；
- 损坏 Archive、schema 不兼容、上游超时、cache stale、取消和并发故障注入；
- 完整 Archive benchmark 和开发/CI 环境的 CPU、内存、延迟特征记录。

这些结果只能证明开发实现和制品契约，不得当作生产资源验收或运维演练证据。

## 9. 必须延期的运维内容

以下事项必须进入未来用户明确批准的 operations OpenSpec：

- `/srv` 等生产目录、系统用户、权限、secrets 和 TLS；
- nginx、systemd、生产 Compose、timer、`flock` 和真实周期运行；
- `current.json` 实际激活、API restart、readiness rollback 和旧版本清理；
- `update_activated` 事件；它只能由未来的运维激活 wrapper 发出；
- 生产 CPU/RAM limits、SLO 签收、Prometheus scrape/alert 和日志/TSDB retention；
- registry push、GitHub Release、release workflow、deploy workflow、SSH 和 production Environment；
- preview/双栈、旧主机/旧路由、两次周更观察、生产回滚演练；
- 14+7 天观察、410、旧卷与旧系统删除。

外部 `bangumi-collection-go` 的 push、PR 和 tag 也必须在动作前单独授权；它们不是主仓开发 change 自动获得的权限。

## 10. 全局 Definition of Done

只有同时满足下列条件，才能把正式新版标记为“开发验收完成”：

### 10.1 规范与所有权

- 所有 active change 的 proposal/specs/design/tasks 已严格验证并经主 agent审核；
- 每个实现 diff 只触及批准的 owned paths；
- 根只有一个 OpenSpec；capability 前缀和依赖方向合规；
- 没有未记录的跨仓库写入、依赖替换或外部状态变更。
- Gate 0 的 tracked、文件/符号链接 physical、ignored 和 untracked 四类检查均通过；固定 oracle 保持不变，supplemental evidence commit 仅满足单 parent、唯一路径和固定 hash 谓词，本地 prototype branch 的 fast-forward 可验证且从未 push。
- Gate 0 的 planning-approval commit 以 supplemental evidence commit 为单一 parent，subject 为 `chore: approve formal rewrite baseline spec`；其 delta 精确等于 `manifest.files` 逐项记录的根 config、总计划、active change metadata/proposal/design/spec/normalized tasks 和六个根 skills，再加上额外路径 `.approval-manifest.json`。`manifest.files` 逐项 hash、normalized-task hash、tasks 中嵌入的 manifest whole-file SHA-256 和 planning commit 精确 path delta 均通过，且 manifest 不以自哈希冒充完整性证据。
- Gate 0 第一项、现已耗尽的 safety-layer repair 证据证明：原 `rm -rf --` 在任何 mutation 前被拒绝，两个 canonical/no-tracked generated directory 在拒绝前后均未改变，主 agent 复审并重封受限变更，apply 子 agent 记录第一次 amend 的 old/new OID；该 replacement 具有同一 evidence parent、同一 subject、同一精确 14-path delta、已复审的新 tree 和通过的新版 seal。批准的 `rm -r --` 随后只删除两个 generated directory，且它们持续 absent。
- Gate 0 第二项、也是最终 planning compatibility repair 的证据证明：显式 `apply_patch` complement patch 因 binary/non-UTF-8 解析失败时没有删除任何 complement 文件、index 为空、3.2 的五个 path changes 保持 unstaged、两个 generated directory 保持 absent；主 agent 只重封六个 control paths，apply 子 agent 只暂存这六项并记录第二次 amend 的 old/new OID。最终 planning replacement 仍具有同一 evidence parent、同一 subject、同一精确 14-path delta、新 tree 和新版 seal；预先固定的 36-path 集合恰好等于完整 complement 中严格 UTF-8 解码失败或含 NUL 的子集，每项为 root 内 tracked regular non-symlink、未命中 allowlist且 worktree blob 等于 planning `HEAD`，只有它们逐路径使用了单目标非递归 `rm --`；其余文本删除仍逐文件使用 `apply_patch`。两次 replacement 始终只占四提交链中的 planning 位置，未产生第五次提交；不存在第三次 planning reseal/amend、清单扩张、`git rm`、`rm -f`、递归、glob、command substitution、运行时派生目标或 loop expansion。
- Gate 0 唯一 post-archive output canonicalization reseal 的证据证明：cleanup commit/前置 `HEAD` 为 `c5435f0a7584bf63aeddf9d33738b15485fbd19e`，原 13 个 archive paths 的 staged tree 为 `4ec4543e89350085e0d3844c753e20c4383af9fd`，原 staged status SHA-256 为 `9b23c78289168f1400aa44911d96dfbec6449af115d4c649ddb6efcb4d76699c`；raw root spec hash 为 `79dd241c931be329170461e5ed0153a619595d34bacefeb5acdeb0f759f327fb`，双 LF curated hash 为 `73ba0c12b7d3fd69592621d716f08a3a5ce7cdb16bb2853c3eca0e780862cd07`，且唯一 cached diff check 错误精确为 `openspec/specs/contracts-rewrite-baseline/spec.md:327: new blank line at EOF.`。原 Purpose-only 内容规范化为单 LF会得到证据 hash `7b25486958464cfc4d0788dc6d206251ec5bfa7707ee25eb0754c1ba4d0d265c`，它只固定冲突另一端。被委派的 master-plan subagent owner 只修改本文产出 amendment；main agent 只修改 archived OpenSpec/root spec，把新增 post-archive canonicalization requirement/scenario 同步写入 archived delta 与 root capability，审核本文 amendment，并把组合结果纳入 new archived seal。最终 root spec 为单 LF、`28036` bytes、hash `78a68814751b268f802979742d683fb1a72945ff7f3e030e1da0f2121c8cf02f`，其 requirements 与 archived delta byte-identical。finalization 子 agent 没有重跑 archive，也未改变这些重新批准的语义或其他已生成文件。post seal 同时验证原 planning seal `f42737d0d31bab3c04bb2d95a4e8b64a832340e3728e793656ac8314902b5635` 与 new archived seal；最终 archive/sync staging 精确为原 13 个 archive paths 加本文共 14 个 no-renames paths，cached diff check 通过，且没有第五个提交。
- Gate 0 已完成两次主 agent 只读验收；cleanup commit 以 planning-approval commit 为单一 parent且 tree 精确等于已验收的 staged candidate，随后以 cleanup commit 为单一 parent 的独立 archive/sync commit 已生成根 spec 和 archived change；finalization 子 agent 已把同步生成的默认 `TBD` Purpose 精确替换为 5.4 节的已审核正式 baseline Purpose，并完成上述唯一 EOF canonicalization；active baseline change 已消失、OpenSpec strict validation 通过、工作树干净，四次 Gate 0 本地提交均未 push，且不存在额外 Gate 0 提交。

### 10.2 数据与计算

- Archive producer 失败不会产生可消费版本，Go 只读 consumer 能拒绝损坏/不兼容数据；
- Go consumer 严格解析 `current.json`，验证 manifest/digest/schema/table/index/dataVersion 一致，以 read-only/no-create 打开并执行 integrity/sentinel；只有全部通过才原子发布 store/ready，任一失败均关闭新句柄并保持 not-ready；
- exact cast、series、rating、overall score、preference、sorting 和摘要全部通过 named goldens；
- personal/global 数据源和 cache key 空间严格隔离；
- 前端没有第二份统计权威。

### 10.3 API 与状态

- catalog、rankings、candidates、person detail、partners、co-star 和 image proxy 均符合 versioned contract；
- 请求限制、错误分类、取消、旧响应保护、分页和 operation 边界有自动化证据；
- health、readiness、metrics 和 updater status 可本地验证，且不包含生产激活行为。

### 10.4 前端与 oracle

- 正式 production entry 只使用真实 API，不引用 prototype fixture；
- 外观、交互、文案、状态、响应式与 oracle/PRODUCT/DESIGN 一致，所有差异均有批准分类；
- 两模式在 Light/Dark 和全部指定 viewport 上无横向溢出、重复 ID、console error；
- keyboard、focus、tooltip、drawer、scroll、loading/error/empty、SafeImage 四态和 reduced motion 均通过验收；
- 浏览器网络不直接访问 `api.bgm.tv` 图片资源。

### 10.5 质量与制品

- Go test/race/vet、Python test/static checks、frontend typecheck/unit/build、contract tests 和 browser E2E 全绿；
- 新增质量库均有已审核的价值、成本、所有权和准入门；
- 三类开发制品可重复构建，checksums/SBOM/compatibility manifest 一致；
- 完整 Archive 和代表性查询有性能特征，但不冒充生产 SLO。

### 10.6 状态表述

最终报告必须分别列出：

- specified；
- implemented；
- verified；
- committed；
- pushed；
- released；
- deployed。

本计划结束时允许的最高结论是：

> 正式新版开发验收完成；运维、发布、部署、生产迁移和旧系统退役尚未开始。
