## Capability Boundary

| Field | Boundary |
|---|---|
| Status | 用户已确认实施；主代理 review 与 strict validate 之后才 apply；不表示已验证、已提交或已发布 |
| Owner | frontend；主代理集成审查；`bangumi_plugin.js`、`frontend/tests/app/bangumi-plugin.test.ts` 与 `PRODUCT.md` 单写者 |
| Writable paths | `openspec/changes/frontend-move-person-entry-into-header-nav/**`, `bangumi_plugin.js`, `frontend/tests/app/bangumi-plugin.test.ts`, `openspec/specs/frontend-bangumi-person-entry/spec.md`（仅 sync）, `PRODUCT.md` 的 `### Bangumi person entry` 段 |
| Read-only protected inputs | `DESIGN.md`, `.impeccable/**`, `.agents/skills/impeccable/**`, `frontend/src/**`, 其他前端测试、`contracts/**`, `backend/**`, `operations/**`, `tmp-formal-development/**`, 归档目录与所有其他 active change |
| Deletion complement | 删除脚本内的独立入口块、其 action row 与独立状态行；不删除任何文件、capability、测试或 fixture |
| Mutable refs | 无；不切分支、不打 tag、不改远端 ref、不改生成契约或浏览器持久状态 |
| Consumes | 实测 `https://bgm.tv/person/103034` 的 `#headerSubject` 结构与 `bangumi.min.css` 的 `.navTabs` / `.dropdown` 规则；既有 person-entry URL 契约；既有身份识别逻辑 |
| Produces | 单一导航行入口与其作品类型菜单、重写后的聚焦测试、同步后的 requirement 文本 |
| Dependencies | 既有 `frontend-bangumi-person-entry` capability 与消费该 URL 的 `frontend/src/app/personEntry.ts`；无新依赖 |
| Deliverables | strict-valid 的变更文档、更新后的 `bangumi_plugin.js`、重写后的聚焦测试与 diff 检查 |
| Acceptance | `frontend` 下 `npx vitest run tests/app/bangumi-plugin.test.ts`；`openspec validate frontend-move-person-entry-into-header-nav --strict`；own paths 上的 `git diff --check` |
| Non-goals | 不改入口 URL 参数、ranking 应用、`personEntry.ts`、contracts、backend、operations；不新增依赖；不扩散覆盖 Bangumi 样式；不恢复脚本安装说明或下载入口 |
| Operations deferred | 提交、推送、PR、合并、发布、部署、主机变更与生产激活均需单独授权 |
| Stop/rollback conditions | 权威冲突、writable path 出现并发改动、strict validate 失败或修复将扩大入口契约时停止；回滚为本变更目录的精确删除加三个 owned 文件 hunk 的还原 |

本 capability 只覆盖前端用户的浏览器脚本与前端测试，依赖方向为
`contracts → generated consumers → backend / frontend → operations`；它不创建
第二个统计权威，也不修改 `frontend/src/app/personEntry.ts` 的 URL 解析。

## MODIFIED Requirements

### Requirement: Bangumi person pages expose safe authenticated-user navigation
The existing root `bangumi_plugin.js` is maintained separately for the user's direct publication to HTTPS Bangumi hosts `bgm.tv`, `bangumi.tv`, and `chii.in`. Its navigation contract SHALL add exactly one idempotent native-style entry inside the person page's own `#headerSubject` navigation list (`ul.navTabs`) on exact `/person/<positive safe integer>` pages, as the last item of that list so it stays grouped with the right-aligned 加入收藏, 加入黑名单 and 收集 items. The entry SHALL read “在 Bangumi Staff Stats 中查看”, SHALL reuse Bangumi's own navigation-tab and dropdown presentation (`ul.navTabs > li` with the native `.dropdown` panel) instead of an injected block above or beside the tab row, and SHALL NOT add a separate page-level block, action row or status row. Activating the entry by pointer, touch or keyboard SHALL expand one work-type menu whose items are 动画, 书籍, 音乐, 游戏 and 三次元, with 动画 first, and each item SHALL immediately navigate to its single work type; hovering the collapsed entry alone SHALL NOT expand it. Identity SHALL come only from authenticated navigation, never person/profile/body links. Unknown or logged-out identity SHALL show “登录 Bangumi 后可查看收藏参与作品” inside the expanded menu and not launch a guessed user query. The destination SHALL be fixed to `https://search.bgmss.fun/ranking`. The application SHALL NOT require script installation documentation, a download entry, or a bundled script copy as a delivery or acceptance gate.

#### Scenario: Default and secondary entries
- **WHEN** a logged-in user opens the person page and activates the single navigation entry
- **THEN** the menu SHALL offer 动画, 书籍, 音乐, 游戏 and 三次元 in that order, and activating one SHALL build a URL with URL/URLSearchParams containing only `entry=bangumi-person`, `user=<uid>`, `person=<id>` and `type=<single type>`
- **AND** 动画 SHALL be the first option, the entry SHALL be the last child of `ul.navTabs` inside `#headerSubject`, and no cookie, token or page text SHALL be transmitted

#### Scenario: Pointer hover does not expand the menu
- **WHEN** the pointer rests on the collapsed entry without activating it
- **THEN** the work-type menu SHALL stay collapsed and the entry SHALL keep reporting its collapsed state

#### Scenario: Installation and access
- **WHEN** the userscript runs twice, encounters a body user link, or the menu is operated by keyboard/touch
- **THEN** there SHALL be exactly one entry, unrelated identities SHALL be ignored, and Escape or an outside click SHALL close the menu and return focus appropriately

#### Scenario: Unknown identity in the merged menu
- **WHEN** the logged-in identity is unknown or a login link is present
- **THEN** all five work-type destinations SHALL be non-navigable and the expanded menu SHALL show 登录 Bangumi 后可查看收藏参与作品
