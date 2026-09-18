## Task Boundary

| Field | Boundary |
|---|---|
| Status | Proposed；review 与 strict validate 之后才 apply；tasks 勾选只表示实现记录，不表示已提交、已推送或已发布 |
| Owner | frontend；主代理是 `bangumi_plugin.js`、`frontend/tests/app/bangumi-plugin.test.ts`、`PRODUCT.md` 与主 spec sync 的唯一写者 |
| Writable paths | `openspec/changes/frontend-move-person-entry-into-header-nav/**`, `bangumi_plugin.js`, `frontend/tests/app/bangumi-plugin.test.ts`, `openspec/specs/frontend-bangumi-person-entry/spec.md`（仅 sync）, `PRODUCT.md` 的 `### Bangumi person entry` 段 |
| Read-only protected inputs | `DESIGN.md`, `.impeccable/**`, `.agents/skills/impeccable/**`, `frontend/src/**`, 其他前端测试、`contracts/**`, `backend/**`, `operations/**`, `tmp-formal-development/**`, 归档目录与所有其他 active change |
| Deletion complement | 仅移除脚本内的独立入口块、action row 与独立状态行；不删除文件、capability、测试或 fixture |
| Mutable refs | 无；不创建或切换分支、不打 tag、不改远端 ref |
| Consumes | 实测线上 `#headerSubject` 与 `bangumi.min.css` 证据、既有入口 URL 契约、既有 jsdom 测试运行时 |
| Produces | 单一导航行入口、作品类型菜单、重写后的聚焦测试、同步后的 requirement 与 PRODUCT 描述 |
| Dependencies | 既有 `frontend-bangumi-person-entry`；无 new package |
| Deliverables | 见各任务组的实现与验收证据 |
| Acceptance | `frontend` 下 `npx vitest run tests/app/bangumi-plugin.test.ts`；`openspec validate frontend-move-person-entry-into-header-nav --strict`；`git diff --check` |
| Non-goals | 不改 URL 契约、ranking 应用、`personEntry.ts`、contracts、backend、operations；不新增依赖；不扩散样式覆盖；不恢复安装说明 |
| Operations deferred | 提交、推送、PR、合并、发布、部署、主机变更与生产激活均需单独授权 |
| Stop/rollback conditions | 权威冲突、writable path 并发改动、strict validate 失败、聚焦测试失败或修复将扩大契约时停止并向用户报告 |

禁止：`git reset --hard`、以 checkout 回滚、`git clean`、`git add -A`、宽泛递归删除、
写出 Writable paths 之外的仓库路径、改外部仓库或线上 Bangumi 状态。

## 1. 变更前检查与文档

- [x] 1.1 记录 preflight 证据：`git status --short --branch`、当前 HEAD、`git fetch origin --prune` 后的 `origin/master` 对比，确认只有既有 `?? .cache/` 未跟踪项，且本变更的 writable paths 无并发改动；不一致则停止。 — Evidence: preflight 时本地 `master` 落后 `origin/master` 8 个提交且无本地改动（仅既有 `?? .cache/`）；`git merge --ff-only origin/master` 后 HEAD = `0e2b3c2`，与 `origin/master` 一致；`git fetch`（SSH）首次成功、随后一次瞬时失败，未影响已获取的 ref。
- [x] 1.2 复核 proposal / design / delta spec 与实测线上 markup、`bangumi.min.css` 规则一致，然后运行 `OPENSPEC_TELEMETRY=0 npx --yes --package=@fission-ai/openspec@1.6.0 -- openspec validate frontend-move-person-entry-into-header-nav --strict` 并记录结果。 — Evidence: 只读抓取 `https://bgm.tv/person/103034` 与 `https://bgm.tv/css/dist/bangumi.min.css`，确认 `#headerSubject .subjectNav > ul.navTabs`、`li.collect.center`、`.navTabs > li.collect{margin-left:auto}` 与 `.dropdown` 面板规则；`openspec validate frontend-move-person-entry-into-header-nav --strict` → `Change 'frontend-move-person-entry-into-header-nav' is valid`。

## 2. 用户脚本实现（`bangumi_plugin.js`）

- [x] 2.1 删除插在 `.subjectNav` 之前的 `div#bgmss-person-entry` 块、其 `.bgmss-entry-actions` 行、独立 `[data-bgmss-status]` 行与对应样式，并在 `#headerSubject ul.navTabs` 缺失时安全返回、不注入任何部分结构。 — Evidence: 旧块、`.bgmss-entry-actions` 与独立状态行已删除；`install()` 以 `document.querySelector('#headerSubject ul.navTabs')` 为唯一入口，缺失即返回且不写 style。
- [x] 2.2 在 `ul.navTabs` 末尾追加唯一的 `li.dropdown#bgmss-person-entry`，其触发项文案为「在 Bangumi Staff Stats 中查看」，带 `role="button"`、`tabindex="0"`、`aria-haspopup`、`aria-expanded` 与 `aria-controls`，样式全部来自 Bangumi 原生 `.navTabs` / `.dropdown` 规则。 — Evidence: `tabs.append(item)`；渲染检查显示触发项与同排标签同字号/同内距/同 hover 底边颜色，并位于 `加入收藏`、`收集` 之右。
- [x] 2.3 在同一个 li 内提供 `ul#bgmss-person-entry-types` 菜单，依次包含 `anime`/`book`/`music`/`game`/`real` 五个类型链接（动画、书籍、音乐、游戏、三次元），保留固定 `https://search.bgmss.fun/ranking` 目标、`entry`/`user`/`person`/`type` 参数、`target="_blank"` 与 `rel="noopener noreferrer"`。 — Evidence: 每个链接包在各自的 `<li>` 中，复现实测发现的渲染缺陷（裸 `a` 在 `.dropdown ul` 内会 `display:inline` 排成一行）；修复后渲染为五行竖直菜单。
- [x] 2.4 实现展开/收起：click、`Enter`、`Space`、`ArrowDown` 展开，Escape、外部点击与 focus 离开时收起并把焦点还给触发项；展开态只通过作用域收窄的 `bgmss-open` 规则镜像原生 hover 声明，且脚本重复执行不产生重复入口或重复样式。 — Evidence: 渲染与 jsdom 均验证 click/Enter/Space/ArrowDown 开合、Escape 归还焦点、外部点击关闭；`li.bgmss-person-entry:hover > ul` 抵消原生悬停展开（指针停在触发项上按 Escape 后面板确实消失）。
- [x] 2.5 未知或登出身份时，五个链接移除 `href` 并标记 `aria-disabled="true"`，菜单内显示「登录 Bangumi 后可查看收藏参与作品」，且激活时不产生任何猜测查询。 — Evidence: 渲染与 jsdom 验证；未知身份下 AX 中五项均为 `link (disabled)`，菜单中出现说明文本。

## 3. 聚焦测试（`frontend/tests/app/bangumi-plugin.test.ts`）

- [x] 3.1 把夹具改为镜像真实头部结构（`h1.nameSingle`、`div.subjectNav > ul.navTabs`、五个标签、`li.collect.center`、`li.mark.center`），并断言入口是 `ul.navTabs` 的最后一个子元素、`#headerSubject` 内不再存在独立入口块、只注入一个 style。 — Evidence: `tests/app/bangumi-plugin.test.ts` 夹具与断言已更新。
- [x] 3.2 断言三个 host、五种 `type`、固定目标 origin/path、`entry`/`user`/`person` 参数集合、`rel` 以及动画首发顺序与既有身份/登录/畸形路径/元数据守卫。 — Evidence: 同文件保留并扩展原契约断言，含 `ul > li > a` 结构断言。
- [x] 3.3 断言菜单可访问性契约：`aria-expanded` 与 `bgmss-open` 同步、`aria-controls` 指向真实菜单、Escape/外部点击收起并归还焦点、`ArrowDown` 聚焦首项、未知身份时无 `href` 且显示登录说明。 — Evidence: 22 项测试全部通过。

## 4. 验收与文档同步

- [x] 4.1 在 `frontend` 下运行 `npx vitest run tests/app/bangumi-plugin.test.ts` 并记录通过/失败；如环境资源不足，记录确切失败原因而不是宣称通过。 — Evidence: `npx vitest run tests/app/bangumi-plugin.test.ts` → 22 passed；`VITEST_MAX_WORKERS=2 npx vitest run` → 53 files / 925 tests passed；`npm run typecheck` → 通过。`npm run check:architecture` 与完整 `npm run check` 无法本地运行：仓库要求 Node v24.18.0，本机 PATH 为 v24.6.0、随附运行时为 v24.19.0，命令以版本门禁失败退出（未做任何绕过）。
- [x] 4.2 同步已接受的口径到 `PRODUCT.md` 的 `### Bangumi person entry` 段，使其描述单一导航入口与合并后的作品类型菜单，不再描述主按钮＋二级菜单。 — Evidence: `PRODUCT.md` 该段已改为单一导航入口 + 五种类型菜单 + 悬停不展开。
- [x] 4.3 运行 `openspec validate frontend-move-person-entry-into-header-nav --strict` 与 owned paths 上的 `git diff --check`，并把实现、验证、提交、推送、发布、部署状态分别如实报告。 — Evidence: strict validate 通过；`git diff --check` 无输出。
- [x] 4.4 通过 `openspec-sync-specs` 把 delta 同步到 `openspec/specs/frontend-bangumi-person-entry/spec.md`，再归档本变更并运行 `openspec validate --all --strict`；保留其他 active change 的既有状态。 — Evidence: 归档由 `openspec archive … --yes` 完成并把 delta 同步进主 spec；`openspec validate --all --strict` 见 closure 记录。

## 5. 明确不执行的范围

- [x] 5.1 不在本地真实 Tampermonkey 中安装或发布脚本、不访问需要登录的 Bangumi 会话、不触碰 search.bgmss.fun 生产、不提交、不推送、不部署；浏览器渲染证据保持为“未执行”，除非用户另行授权。 — Evidence: 未安装、未发布、未触碰线上；渲染证据来自本地 loopback 预览页（非提交文件）叠加真实 `bangumi.min.css`，并在明暗两种主题下确认菜单与触发项外观；真实登录态 Bangumi 页面的端到端渲染仍未执行。
