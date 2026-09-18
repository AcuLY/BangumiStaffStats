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

依赖方向固定为 `contracts → generated consumers → backend / frontend →
operations`；本变更只在前端用户的浏览器脚本与前端测试内工作，不新增跨组件依赖。

## Context

`bangumi_plugin.js` 由用户自行发布到 `bgm.tv`、`bangumi.tv`、`chii.in`，当前在
`#headerSubject` 内部、`.subjectNav` 之前插入一个独立
`div#bgmss-person-entry`，其中包含主链接「查看我的收藏参与作品」与
`button.chiiBtn`「其他作品类型 ▾」。实测线上人物页的头部结构为：

```html
<div id="headerSubject" class="clearit">
  <h1 class="nameSingle">…</h1>
  <div class="subjectNav">
    <ul class="navTabs">
      <li><a class="focus" href="/person/103034">概览</a></li>
      <li><a href="/person/103034/album">相册</a></li>
      <li><a href="/person/103034/works">作品</a></li>
      <li><a href="/person/103034/collabs">合作</a></li>
      <li><a href="/person/103034/collections">收藏</a></li>
      <li class="collect center">…加入收藏…</li>
      <li class="mark center">…</li>
    </ul>
  </div>
</div>
```

线上样式表给出可直接复用的原生规则：

- `.navTabs{display:flex;flex-wrap:nowrap;gap:5px;…}`
- `.navTabs>li{flex:0 0 auto;font-size:14px}`
- `.navTabs>li.collect{margin-left:auto;margin-right:5px}`（右侧收藏组靠右的原因）
- `.navTabs>li>a{display:block;color:#888;padding:10px 10px 9px;border-bottom:2px solid transparent}`，hover/focus 变为 `#369cf8` 与 `#f09199` 底边
- `.dropdown{position:relative}`、`.dropdown ul{…visibility:hidden;position:fixed;top:18px;right:-5px;border-radius:15px;background:rgba(254,254,254,.9)}`、`.dropdown:hover ul{position:absolute;visibility:visible;opacity:1;display:block;z-index:99}`、`html[data-theme=dark] .dropdown ul{background:rgba(80,80,80,.7)}`
- `.navTabs>li.dropdown ul{top:auto}`，`@media (max-width:640px){.navTabs>li.dropdown ul{position:fixed}}`

用户浏览器评论（Comment 1）指向被注入的 `div#bgmss-person-entry`，要求移除；
Comment 2 指向 `div#headerSubject > div.subjectNav:nth-of-type(2) > ul.navTabs`，
要求在其中加入一项「在 Bangumi Staff Stats 中查看」，居右并和加入收藏同组，
样式与该行既有元素一致，点击展开包含动画在内的作品类型下拉，合并现有两个按钮。

## Goals / Non-Goals

**Goals:**

- 人物页头部只保留 Bangumi 自己的一行导航，其中新增一个右对齐的单一入口。
- 入口与菜单的排版、字号、配色、hover、focus 与暗色主题全部来自 Bangumi 原生类。
- 一次点击/回车/空格即可展开含「动画」在内的五种作品类型，点击某一项立即跳转。
- 保持既有入口契约：固定 `https://search.bgmss.fun/ranking`，仅
  `entry=bangumi-person`、`user`、`person`、`type` 四个参数，`type` 为单一类型。
- 保留只从已认证导航识别身份、未知身份给出「登录 Bangumi 后可查看收藏参与作品」
  且不发起猜测查询的安全行为。

**Non-Goals:**

- 不新增依赖、构建步骤、GM 授权、网络请求或第三方脚本能力。
- 不改动 `frontend/src/app/personEntry.ts` 的 URL 解析、ranking 应用或任何契约。
- 不覆盖 Bangumi 其他全局样式，不重设 `.navTabs` / `.dropdown` 的通用外观。
- 不恢复脚本安装说明、下载入口或前端产物中的脚本副本。

## Decisions

### D1：复用 Bangumi 原生 `ul.navTabs > li.dropdown` 结构，而不是自建样式块

入口渲染为 `<li class="dropdown bgmss-person-entry" id="bgmss-person-entry">`，
内含一个 `<a role="button">` 触发项与一个 `<ul>` 菜单，直接命中
`.navTabs>li>a` 与 `.dropdown ul` 规则。备选方案是继续使用自有
`.chiiBtn` 圆形按钮或自写下拉面板，但那会与同一行原生标签不一致，也需要在
深浅色主题、聚焦环、圆角与阴影上重复实现，因此否决。

### D2：追加为 `ul.navTabs` 的最后一项，靠 Bangumi 自身规则实现靠右

`.navTabs>li.collect{margin-left:auto}` 已把收藏组推到右侧；把新项追加为
最后一个 `<li>` 即可让它与加入收藏、加入黑名单、收集同组且紧贴行尾，无需
覆盖任何 Bangumi 规则。备选方案是给新项加 `margin-left:auto` 并把
`li.collect` 的 `margin-left` 归零；那会改变加入收藏的既有位置，并让两个
auto margin 平分剩余空间，因此否决。

### D3：只有激活才展开菜单，hover 不展开

触发项为 `<a role="button" tabindex="0" aria-haspopup="true"
aria-expanded="false" aria-controls="bgmss-person-entry-types">`；脚本显式处理
click、`Enter`、`Space` 与 `ArrowDown`，`Escape`、外部点击与 focus 离开时关闭
并把焦点还给触发项。用户明确要求「点击该按钮时展开」，因此脚本用
`#headerSubject .navTabs > li.bgmss-person-entry:hover > ul` 这一条只作用于本
入口的规则抵消 Bangumi 原生 `.dropdown:hover ul` 的悬停展开，展开只由
`bgmss-open` 类驱动。备选方案是保留原生 hover 展开：实测中鼠标停在触发项上按
`Escape` 后，声明状态已收起但面板仍因 `:hover` 可见，且 `aria-expanded` 必须
额外跟踪悬停才能保持真实，因此否决。该规则只作用于本入口自身，不影响 Bangumi
其他 `.dropdown`。

### D4：展开态用一条作用域收窄的规则镜像原生 hover 声明

`ul` 的默认态是 `visibility:hidden` + `z-index:-1`。脚本注入的样式使用
`#headerSubject .navTabs > li.bgmss-person-entry.bgmss-open > ul{position:absolute;
visibility:visible;opacity:1;display:block;z-index:99}`，其特异性高于原生
`.navTabs>li.dropdown ul`，且不触碰其他元素；`top:auto` 与移动端 `position:fixed`
继续由原生规则提供。

### D5：五种作品类型留在同一菜单，动画为首项，登录说明进入菜单

菜单项依次为 `anime`（动画）、`book`（书籍）、`music`（音乐）、`game`（游戏）、
`real`（三次元），全部为 `<a data-subject-type target="_blank"
rel="noopener noreferrer">`。身份未知时五个链接失去 `href`、加上
`aria-disabled="true"`，菜单内出现 `[data-bgmss-status]` 的
「登录 Bangumi 后可查看收藏参与作品」提示；这保留了原规格“显示说明且不发起
猜测查询”的要求，只是把说明放在展开后的面板内，因为独立状态行正是被移除的块。

### D6：测试夹具改为镜像真实头部结构

`frontend/tests/app/bangumi-plugin.test.ts` 的夹具改为包含
`h1.nameSingle`、`div.subjectNav > ul.navTabs`、五个标签以及
`li.collect.center`、`li.mark.center`，以便断言新项确实是 `ul.navTabs` 的最后
一个子元素、脚本不再产生任何 `#headerSubject` 直接子块，且五种类型链接与
身份/登录行为保持原契约。

### D7：不新增依赖，保留脚本元数据

继续使用 `@grant none`、`@run-at document-end`、`@noframes` 与三域
`@match`；不引入构建、打包或运行时依赖，测试沿用手头已固定的 jsdom。

## Risks / Trade-offs

- [Bangumi 结构漂移：`ul.navTabs` 缺失或改名] → 脚本在找不到目标列表时直接返回，
  不注入任何部分块；测试覆盖“无匹配路径不安装”，并断言不会渲染残留块。
- [复用 `.dropdown` 会带入原生 hover 展开，可能违反“仅点击展开”] → 用一条只命中
  本入口的 `:hover > ul` 规则抵消悬停展开，展开状态只由脚本维护的类驱动，并在
  delta 中把“悬停不展开”写成可测要求。
- [标签文字较长，窄屏 `nowrap` 行可能溢出] → 保持用户指定文案不做换行改写，
  与本行既有标签行为一致；移动端沿用原生 `position:fixed` 面板，不放大差异。
- [`z-index:-1` 的默认面板态可能被其他内容遮挡] → 展开态显式声明
  `visibility/opacity/display/z-index`，只在展开时生效。
- [脚本重复执行产生重复入口或重复样式] → 保留 `#bgmss-person-entry` 存在性守卫，
  样式元素随入口一起只注入一次，测试断言 idempotent。
- [真实登录取证不可行] → 本变更只做 jsdom 与真实 markup/CSS 证据，浏览器渲染
  证据标注为未执行，除非用户在本地 Tampermonkey 安装更新后的脚本。

## Migration Plan

1. 更新 `bangumi_plugin.js`，同步重写聚焦测试并同步 `PRODUCT.md` 的入口描述。
2. 运行 `frontend` 下的聚焦测试、`openspec validate … --strict` 与
   `git diff --check`。
3. 同步 delta 到 `openspec/specs/frontend-bangumi-person-entry/spec.md` 并归档本变更。
4. 回滚策略：还原 `bangumi_plugin.js`、`frontend/tests/app/bangumi-plugin.test.ts`
   与 `PRODUCT.md` 的本次 hunk；脚本由用户自行发布，因此不存在需要回滚的部署状态。

## Open Questions

无。入口文案、位置、样式来源与菜单选项均来自用户评论；提交、发布与真实浏览器
安装验证保持为独立授权步骤。
