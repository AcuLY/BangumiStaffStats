# 后端部署与运维实施指南

> 状态：正式部署前执行稿
>
> 更新日期：2026-07-23
>
> 范围：2 核 4 GiB 单机、宿主机 nginx/systemd、Docker Compose、数据目录、周更激活、回滚、日志与 Prometheus、CI/CD、双栈迁移和旧版退出。
>
> 本文只记录必须部署、操作和验证的要求，不记录架构方案比较或讨论历史。

配套文档：

- [`backend-development-implementation-guide.md`](./backend-development-implementation-guide.md)：API、updater、SQLite、缓存、上游 client、可观测埋点和开发质量门；
- [`data-logic-implementation-guide.md`](./data-logic-implementation-guide.md)：数据和统计口径；
- [`frontend-production-cleanup-and-architecture-plan.md`](./frontend-production-cleanup-and-architecture-plan.md)：前端生产接入与清理；
- [`PRODUCT.md`](../PRODUCT.md) 与 [`DESIGN.md`](../DESIGN.md)：产品和界面规范。

## 1. 使用规则

### 1.1 交付状态

本文复选框只表示对应生产单元、命令、演练和证据已经完成。Compose 能启动、容器显示 healthy 或 CI 构建成功，都不能单独视为生产验收。

每项完成至少需要：

- 版本化配置和脚本；
- 在目标同规格机器执行；
- 成功与失败路径；
- readiness、状态和日志证据；
- 回滚验证；
- 不依赖手工记忆的固定入口。

容量与阈值如依据完整基准调整，必须记录机器、数据版本、命令、前后数据和原因。不得以扩大资源、队列或超时替代问题修复。

### 1.2 本文负责

- 宿主机、nginx、systemd 和 Compose 职责；
- 生产目录、权限、secret 和持久化边界；
- Archive 周更调度、互斥、激活和数据回滚；
- 应用发布、兼容门和应用回滚；
- 资源上限、日志保留、Prometheus 和运行检查；
- 新旧双栈、Header 返回旧版、切换和退出；
- CI 发布制品和生产部署入口；
- 常见故障的可重复处置。

代码结构、OpenAPI、缓存算法和 updater 内部实现只在开发实施稿定义。

本文中的资源数值是生产 hard limit、抓取和演练基线；算法默认值、缓存成本模型、并发语义和埋点名称以开发实施稿为准。若生产调参超出其已测试范围，必须先回到开发侧补基准和质量门，不能在两份文档中各自定义一套语义。

## 2. 单机目标拓扑

```text
Internet
  → 宿主机 nginx :80/:443
      → 当前前端 release 静态目录
      → /api/v1/*                → 127.0.0.1:<new-api>
      → /api/v1/images/*         → 127.0.0.1:<new-api>
      → legacy host/statistics   → 127.0.0.1:<legacy-api>（仅迁移期）

宿主机 systemd
  → archive-update.timer
      → archive-update.service
          → activation wrapper
              → docker compose run --rm updater
              → current.json 切换
              → api restart/readiness/rollback

新版 Compose 长驻：
  - api
  - prometheus

新版 Compose 按需：
  - updater
```

### 2.1 宿主机职责

- nginx 是唯一监听公网 80/443 的进程。
- nginx 直接服务版本化前端静态目录；不为前端增加长期 nginx 容器。
- systemd timer/service 负责每周调度、主机级互斥、总超时和 wrapper 退出状态。
- 主机固定部署入口负责应用制品安装、Compose 引用、readiness 和回滚。
- nginx access/error log 使用宿主机有界轮转。
- TLS、DNS、vhost 和 Referrer-Policy 在宿主机集中配置。

### 2.2 Compose 职责

- api 和 Prometheus 是新版唯一长驻容器。
- updater 是固定镜像的 one-shot service，不设置 restart。
- api、Prometheus 和 legacy 服务端口只绑定 loopback 或 Compose 内部网络。
- `/metrics` 和 Prometheus UI 不进入公网 nginx。
- 新旧版使用不同 project name、network、loopback 端口、镜像名、env、secret、数据目录和资源限制。
- 新旧版不得共享可写 volume，不得复用同一个 `latest`。
- Compose stdout/stderr 使用 journald driver，不挂载应用自定义日志目录。

## 3. 生产目录、权限与持久化

以下为语义结构；实际绝对路径在部署仓库中固定一次，不允许脚本各自推导不同根目录。

```text
<app-root>/
  releases/
    <release-version>/
      release-manifest.json
      frontend/
  current-frontend -> releases/<release-version>/frontend
  compose/
    compose.yaml
    release.env
  data/
    updater.lock
    current.json
    update-status.json
    versions/
      <dataVersion>/
        bangumi.sqlite
        manifest.json
    .staging/
  secrets/
```

### 3.1 权限

- nginx 只读前端 current 链接。
- api 只读 `current.json` 和 versions。
- updater 可写 `.staging`、versions 和 update status，但不能操作 systemd/Docker。
- activation wrapper 能运行固定 Compose 命令、切换 current、重启 api 和读取 readiness。
- deploy 用户只能通过 forced command 或受限 sudo 调用 root 管理的固定部署入口。
- Prometheus 只写自己的 TSDB。
- secrets 不进入镜像、前端、Git、release manifest、build argument 或日志。

### 3.2 允许保留

- 当前和上一成功 SQLite snapshot；
- manifest/current/update-status；
- 有界 journal、nginx log 和 Prometheus TSDB；
- 当前和上一应用/前端 release；
- 旧生产不可变 tag、必要离线备份和迁移期制品。

### 3.3 禁止保留

- 用户收藏；
- query/result cache；
- 图片内容；
- 业务查询 session、分享记录和 requestId 索引；
- 上游响应体或认证材料；
- 无界 staging、无界旧 snapshot、无界 release 和无界日志。

## 4. 周更调度

### 4.1 systemd timer

- 每周固定时间触发，使用 `Persistent=true` 或等价机制处理关机错过的计划。
- timer 只启动固定 oneshot service，不直接拼接更新步骤。
- service 调用 root 管理的 activation wrapper。
- service 设置 6 小时硬超时；4 小时作为目标告警。
- updater 使用低 CPU/I/O 优先级，并限制到正式资源基线。
- 成功、无变化和失败都必须形成稳定退出码和 journal 事件。

### 4.2 主机锁

Archive 周更、应用部署、schema 升级和手工数据回滚共用同一个主机级 `flock`：

- 同一时刻只允许一个改变应用或数据 active 状态的事务；
- 锁文件路径固定，不通过未解析环境变量或 glob 生成；
- 取得锁前不修改 current、Compose 引用或前端链接；
- 锁被占用时稳定退出并在日志中说明当前动作，不并发等待到未知时长；
- 释放锁前必须完成成功验证或失败回滚验证。

## 5. 数据激活与回滚

### 5.1 激活事务

1. 取得主机锁。
2. 记录当前 dataVersion 和 `current.json` 内容。
3. 运行固定 digest 的 `docker compose run --rm updater`。
4. updater 无变化时记录状态并正常退出。
5. updater 发布新版本后，验证新 version/manifest/sqlite 已存在且权限正确。
6. 原子切换 `current.json`。
7. 受控重启唯一 api。
8. 等待 `/readyz`，并校验实际 dataVersion、snapshot schema 和 app version。
9. 60 秒内成功则由 wrapper 记录唯一 `update_activated` JSON 事件，包含 run_id、old/new dataVersion、duration_seconds 和 app version；有界清理过旧 snapshot。
10. 失败或超时则恢复上一 `current.json`，再次重启并验证旧版本。
11. 成功或回滚完成后释放锁；任何未恢复故障都非零退出。

切换到重启之间，旧进程继续使用已经打开的旧 snapshot。v1 接受一次短暂 503；nginx 可以使用短时友好 503 页面，但不能把请求路由到不兼容数据。

### 5.2 数据回滚

- 数据回滚只恢复上一 `current.json`/dataVersion，并重启当前发布的 API。
- 不同时更改 API 镜像、前端 release 或 release manifest。
- 回滚前验证上一 snapshot 与当前应用 schema/domain 兼容。
- 回滚后检查 `/readyz`、dataVersion、最小查询、日志和 metrics。
- 当前/上一 snapshot 都失败时停止自动循环重启，保留证据并进入人工恢复。

### 5.3 清理

- 新 snapshot ready 且至少完成一次回滚演练后，才能删除更老版本。
- `.staging` 只清理明确属于已结束 run 的目录；不得递归删除未解析路径。
- 每次构建前检查 staging、新版、当前版和回滚版所需空间。
- 磁盘空间不足时安全退出，不切换 current。

## 6. 资源基线

目标主机：2 CPU 核、4 GiB RAM。磁盘不是业务架构限制，但每次事务仍执行空间检查。

### 6.1 正式单栈

| 单元/项目 | v1 基线 |
|---|---:|
| api 容器 hard limit | 1536 MiB |
| `GOMEMLIMIT` | 1024 MiB |
| api cache logical cost | 256 MiB |
| 不同 key 重计算 | 2 执行中 + 8 排队 |
| SQLite read connections | 4 |
| 单次业务请求硬超时 | 30 秒 |
| Prometheus hard limit | 先以 512 MiB 压测 |
| updater CPU | 约 1 核，低 CPU/I/O 优先级 |
| updater 内存 | 由完整 Archive 基准固定 |
| 周更目标/硬截止 | 4 小时 / 6 小时 |
| 激活 ready 窗口 | 60 秒 |

服务目标：

| 场景 | p95 |
|---|---:|
| cache core 命中、收藏 fresh | ≤ 300 ms |
| 本地冷查询，不含 Bangumi 上游 | ≤ 5 s |
| 上游健康的显式收藏刷新 | ≤ 20 s |

验收：

- cache 满载且两个不同冷 key 并发时，api RSS 不超过约 1.2 GiB；
- updater 在线运行时整机不持续 swap、不 OOM、不使 readiness 失败；
- 队列满稳定返回 `503 SERVER_BUSY + Retry-After`，不创建无界 goroutine；
- 上游异常单独统计，不能用来掩盖本地 p95。

### 6.2 迁移期双栈

| 单元 | 起点 |
|---|---:|
| 旧 Go | 320 MiB；`GOMEMLIMIT=256MiB` |
| 旧 MySQL | 640 MiB；buffer pool 256–384 MiB |
| 旧 Redis | 320 MiB；`maxmemory=192mb` |
| 新 Go | 1024 MiB；`GOMEMLIMIT=768MiB`；冷计算并发 1 |
| Prometheus | 192 MiB |
| 新 updater | 640 MiB；约 0.75 核 |
| 旧 resident loader | 不运行 |

日常 hard limit 合计约 2496 MiB。旧/new importer 绝不并发。若必须运行当前旧 loader，先暂停 shadow 新服务和 Prometheus，并在同规格机器完成单独演练。

旧栈退出后恢复正式单栈资源，不长期保留迁移期限额。

## 7. 日志、指标与运行检查

### 7.1 journald

- api、updater 和 wrapper 的结构化 JSON 进入 journal。
- 应用相关日志保留 7–14 天，总量不超过 512 MiB。
- 不启用应用自建日切目录。
- journal 访问权限只授予运维账号。
- query 日志可能含 UID、标签和 typed 查询条件，不能作为公开 analytics 数据源。
- 不把 journal 导入业务数据库，也不提供产品查询接口。

nginx access/error log 独立轮转：

- access 只记录 path，不含 query string；
- 不记录 fragment；
- 设置明确 Referrer-Policy，避免 `?user=` 随外链泄露；
- legacy route 点击量只用 route/vhost 聚合，不增加用户级埋点。

### 7.2 Prometheus

- 单个本机 Prometheus；
- 30 秒 scrape；
- 7 天 retention；
- TSDB size 上限 512 MiB；
- UI 和 `/metrics` 只在 loopback/内网；
- Prometheus 失败不重启或阻塞 api；
- 不部署 Grafana、Loki、Tempo、OTel Collector、Pushgateway、Alertmanager 或 node exporter。

### 7.3 首批检查

至少建立可重复查询或脚本检查：

- `/readyz` 失败；
- Archive 最后成功超过 9 天；
- 持续 HTTP 5xx；
- Bangumi 429、timeout 或临时错误持续升高；
- 计算队列长期满；
- RSS 超过约 1.2 GiB；
- cache cost 超过预算 90%；
- oversize reject；
- updater 最后尝试失败或超过 6 小时；
- snapshot age、app version、dataVersion 与 release manifest 不一致。

v1 可以先使用 Prometheus 自带查询页面和 journalctl；需要固定 dashboard、通知或 tracing 时另行扩展，不能把完整观测栈塞入首版。

### 7.4 健康语义

- `/livez` 只证明进程可响应。
- `/readyz` 必须表示开发实施稿的 consumer 启动门已完整校验 current、manifest、SQLite digest/schema/dataVersion，并能执行轻量只读查询；运维脚本不复制或弱化这些校验。
- Bangumi 暂时不可用、Prometheus 不可用或本次周更失败但旧 snapshot 可用时，ready 仍成功。
- snapshot 未加载、schema 不兼容、SQLite 无法读取时，ready 失败。
- pprof 默认关闭；启用时只绑定管理监听并有明确关闭步骤。

## 8. 发布制品与 CI/CD

### 8.1 制品真相

| 制品 | 位置 | 生产引用 |
|---|---|---|
| Go API | GHCR | `image@sha256:...` |
| Python updater | GHCR | one-shot `image@sha256:...` |
| 前端 | GitHub Release 压缩包 | SHA-256 校验后安装 |
| `release-manifest.json` | 同一 Release | commit、镜像 digest、前端 digest、兼容范围 |
| Archive SQLite | 生产主机本地构建 | `current.json` |
| Prometheus | 上游已审阅镜像 | 固定版本或 digest |

生产机不从源码构建，不安装 self-hosted Actions runner，不使用 Watchtower，不跟随 `latest`，不执行 `git pull && docker compose build`。

### 8.2 `ci.yml`

PR 和普通 push：

- 默认只读权限；
- 执行开发实施稿规定的 Go/Python/OpenAPI/前端/容器测试；
- Docker build `push=false`；
- 不读取 registry write 或生产 secret；
- fork 代码不得通过 `pull_request_target` 获得发布权限。

### 8.3 `release.yml`

只接受受保护 `v*` tag 或等价显式 release：

1. 从 tag 对应的同一 Git commit 构建全部制品。
2. 先在生产机核实 CPU 架构；单机不默认多架构。
3. API/updater 推送语义版本和 commit 辅助 tag，但 manifest 记录最终 digest。
4. 前端只构建一次，生成版本化压缩包和 SHA-256。
5. 生成 release manifest，创建 GitHub Release 并附加 checksum。
6. 第三方 Actions 固定到经审阅 commit SHA。
7. SBOM/attestation 只有在部署脚本真正验证时才计入发布门。

### 8.4 `deploy.yml`

通过 `workflow_dispatch` 选择已存在且 manifest 完整的版本：

1. 进入 GitHub `production` Environment 并等待审批。
2. 只有 deploy job 可读取 SSH secret。
3. concurrency 保证单环境只有一个部署。
4. SSH 只调用服务器 root 管理的固定入口，参数只允许 release version 或 manifest digest。
5. 服务器取得主机锁，验证 manifest/checksum，拉取精确 image digest。
6. 安装新前端 release，更新 Compose image 引用。
7. 执行 `/readyz` 并校验 app version/dataVersion/schema。
8. 失败恢复上一 image digest、Compose 引用和前端链接。
9. 只有本次 release 同时升级 snapshot schema 时，部署事务才同时切换和回滚数据指针。
10. Actions 必须收到最终成功或失败状态。

初期允许维护者在服务器手工调用同一固定部署命令；稳定后启用审批 SSH，不维护第二套自动部署实现。

### 8.5 兼容门

release manifest 声明：

```text
release tag
git commit
target architecture
api image digest
updater image digest
frontend digest
OpenAPI schema version
domain version
supported snapshot schema range
```

- 当前 snapshot 兼容时，只更新代码/前端。
- 不兼容时，先用该 release 的 updater digest 构建兼容 snapshot；失败则不切换应用。
- 新 API 不能打开旧不兼容 SQLite。
- 应用发布回滚恢复 app/front；数据周更回滚只恢复 current dataVersion。
- 只有一次显式 schema 发布事务才同时持有两组状态。

### 8.6 供应链与 secret

- workflow permissions 按 job 最小化；
- 只有 release job package write；
- 只有 deploy job production Environment secret；
- GHCR 镜像不含 runtime secret；
- private GHCR 只给生产最小只读 pull credential；
- Vite 只能注入公开构建常量；
- SSH key、registry credential 和其他部署 secret 不进入前端、镜像层或 build arg；v1 不配置用户 Bangumi token；
- tag 只是人类别名，digest/checksum/manifest 才是回滚依据。

## 9. 新旧双栈迁移

### 9.1 路由

```text
search.bgmss.fun
  → 新版静态前端
  → /api/v1/*      → 新 Go + SQLite
  → /statistics    → 旧 Go（仅旧 HTML 缓存宽限期）

legacy.search.bgmss.fun
  → 旧版静态前端
  → /statistics    → 旧 Go + MySQL + Redis
```

- legacy 使用独立 host，不放 `/legacy/` 子路径。
- 新 Go 永远不读取旧 MySQL/Redis，也不实现 `/statistics`。
- 旧栈固定切换前最后成功 app 和 Archive 日期。
- 迁移期默认不运行旧 resident loader；若必须更新，改为 one-shot 并与新 updater 串行。

### 9.2 Header 返回旧版

- 新版构建变量 `VITE_LEGACY_APP_URL` 非空时渲染真正的同标签页链接；为空完全不渲染。
- 推荐值 `https://legacy.search.bgmss.fun/`。
- 桌面放在主题操作之前的弱化文本入口。
- 低于 780px 复用 Header 左侧品牌位，保留中间模式和右侧操作。
- 文案完整显示“返回旧版”，命中区至少 44px，320px 不溢出。
- 不传递新版 query、mode、人物或职位状态。
- 未提交编辑只使用正常离页保护，不新增自定义确认流程。

### 9.3 切换阶段

1. 旧版继续生产；新版 preview 使用相同 Archive release 做金标和资源验证。
2. 原子切换 `search.bgmss.fun` 前端/API；旧版保持 legacy host。
3. 旧 `/statistics` 暂时服务缓存中的旧 HTML。
4. 新服务连续完成两次真实周更和激活。
5. 完成一次新快照回滚演练。
6. 连续 14 天无未解决 P0/P1，资源/延迟达标。
7. 把 `VITE_LEGACY_APP_URL` 置空并发布。
8. legacy host 再观察 7 天。
9. legacy host 和旧 `/statistics` 限时返回 `410 Gone`。
10. 停止旧 app/MySQL/Redis。

### 9.4 退出清理

- 保留旧 git tag、不可变 release 和必要离线备份。
- 删除旧前端、旧 API、MySQL、Redis、loader、旧 updater 依赖、代理路由和 secret。
- 新版 Compose 不保留 legacy service、network、volume mount 或兼容 config。
- 数据卷最后作为单独破坏性操作，在核对备份和精确目标后处理。
- 不在普通 deploy 或 Compose down 中自动删除旧数据卷。

## 10. 运维演练

### 10.1 上线前必须完成

- [ ] 新版单栈在 2 核 4 GiB 主机完成满载压测。
- [ ] 迁移期双栈在同规格主机完成资源演练。
- [ ] 周更无变化、成功、下载失败、digest 失败、空间不足、构建超时和质量门失败。
- [ ] current 切换后 api ready 成功。
- [ ] 新 snapshot 不可用时自动恢复 previous。
- [ ] previous 也不可用时停止循环并保留证据。
- [ ] 应用 release 成功、readiness 失败和前端安装失败回滚。
- [ ] schema 兼容与不兼容两条部署路径。
- [ ] Prometheus 停止、Bangumi 不可用和本次 updater 失败时旧服务继续 ready。
- [ ] journal/TSDB/nginx log 达到上限后的轮转。
- [ ] legacy 链接、host 和 410 退出流程。

### 10.2 日常检查

- 当前 app version、release manifest 和 image digest 一致；
- current dataVersion、snapshot info metric 和 manifest 一致；
- `/livez`、`/readyz` 正常；
- 上次 Archive 成功时间小于 9 天；
- update-status 与 systemd 最近执行一致；
- RSS、swap、queue、cache、5xx 和上游错误无异常；
- journal、TSDB、release、snapshot 和 staging 空间有界；
- TLS、证书续期、nginx config test 和备份状态正常。

### 10.3 故障处置边界

| 故障 | 首选动作 | 不允许 |
|---|---|---|
| 新数据 ready 失败 | 恢复 previous current 并重启验证 | 原地修补 active SQLite |
| 新应用 ready 失败 | 恢复上一 image/front/Compose 引用 | 在生产机现场构建 |
| Archive 下载/校验失败 | 保持 current，等待下次或手工重跑 | 删除当前输入后继续 |
| updater 超时 | 终止本 run、清理其 staging | 同时启动第二 updater |
| cache/查询过载 | 观察队列和 oversize，按固定限流返回 | 无界加 goroutine/队列 |
| Bangumi 暂时故障 | 使用允许的 stale 或返回稳定上游错误 | 把 403/404 伪装成功 |
| Prometheus 故障 | 修复监控，业务继续服务 | 让 api 因监控不 ready |
| legacy 回退需要 | 使用独立 legacy host | 在新 Go 临时恢复旧协议 |

## 11. 运维实施阶段

### Phase 0：主机与安全基线

- [ ] 核实 CPU 架构、OS、Docker/Compose、nginx、systemd 和磁盘。
- [ ] 建立专用用户、目录、权限、secret 和 loopback 端口。
- [ ] 轮换旧凭据，建立 journal/nginx/TSDB 上限。
- [ ] 建立主机锁和固定部署/激活入口。

退出条件：任何服务不暴露数据库/metrics 管理口；secret 不在仓库或镜像；目录权限最小化。

### Phase 1：新版 preview

- [ ] 安装固定 digest API/updater 和版本化前端。
- [ ] 配置 preview vhost、Compose、Prometheus 和 systemd timer。
- [ ] 完成单栈资源、周更、激活和回滚演练。
- [ ] 完成开发实施稿的 release compatibility 检查。

退出条件：preview 能在无人工修补的情况下更新、回滚并持续观测。

### Phase 2：双栈影子

- [ ] 固定旧版制品和数据日期。
- [ ] 建立隔离 legacy Compose/vhost 和迁移期资源限制。
- [ ] 使用相同 Archive release 做新旧金标和真实流量观察。
- [ ] 验证 old/new updater 串行和整机峰值。

退出条件：双栈无共享写入、无 OOM/swap、旧版真实可回退。

### Phase 3：正式切换

- [ ] 原子切换正式静态目录/API 路由。
- [ ] 发布带返回旧版入口的新前端。
- [ ] 观察日志、指标、资源、错误和 legacy 使用。
- [ ] 完成两次真实周更、一次回滚和 14 天稳定门。

退出条件：没有未解决 P0/P1，服务目标满足，应用/数据回滚均再次验证。

### Phase 4：旧版退出

- [ ] 移除 Header 入口。
- [ ] legacy host 观察 7 天并限时 410。
- [ ] 停止并删除旧运行单元和兼容路由。
- [ ] 核对备份后单独处理旧数据卷。
- [ ] 恢复新版正式单栈资源基线。

退出条件：生产只长驻 api + Prometheus；updater 仅按需运行；新版配置不含 legacy 兼容分支。
