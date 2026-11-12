# 开发与验证

项目当前提供独立后端与共享 API 契约，前端尚未初始化。工具版本由根 `mise.toml` 管理，依赖版本由 `pnpm-workspace.yaml` 的 catalog 管理，安装结果记录在 `pnpm-lock.yaml`。

## 启动

首次使用时准备工具、安装依赖，并按需复制本地环境配置：

```sh
mise trust
mise install
mise exec -- pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
mise exec -- bun run dev
```

API 默认监听本机 3000 端口。开发使用 Bun，生产构建与启动使用 Node；依赖始终通过 pnpm 安装。

| 入口                      | 用途                                        |
| ------------------------- | ------------------------------------------- |
| `POST /rpc/system/health` | oRPC RPC 接口，建议使用类型安全客户端调用   |
| `GET /api/health`         | REST 健康检查，仅表示进程可响应             |
| `GET /api/version`        | 构建 SHA 与进程就绪标记，部署验证使用       |
| `GET /api/spec.json`      | OpenAPI 规范                                |
| `/api/`                   | Scalar API 文档，需要浏览器能访问其外部资源 |

健康检查尚不反映数据库或外部服务状态。初始化未接入数据库、认证或 Agent 执行系统，也未启用跨域访问；增加这些能力时应配置对应实现和测试。

## 开发边界

- `packages/contract` 使用 `oc` 定义输入、输出、错误和 OpenAPI 元数据。
- `apps/api` 使用 `implement` 实现契约，同一个 router 提供 RPC 和 REST。
- 共享包通过公开入口导出源码；API 构建将契约打包进 Node ESM 产物，运行时不要求 Node 解析共享包的 TypeScript 源码。
- 按实际业务增加服务端领域模块，不预建空包。昂贵的鉴权中间件只挂载一次，必要时通过 context 缓存结果。
- 所有 oRPC 包保持同一个 v2 版本；更新前检查官方变更，不将 v1 写法混入 v2。

## 验证与生产运行

```sh
mise exec -- bun run check
mise exec -- bun run build
mise exec -- pnpm start
```

`check` 聚合只读代码检查、Knip、类型检查、Vitest 和 Node 自动化脚本测试；`fix:code` 单独执行自动修复。`ci` 执行检查、生产构建和 API 产物 E2E。源码测试覆盖真实 HTTP 上的 RPC、REST、文档规范、错误请求及环境变量校验，自动化脚本测试覆盖版本、镜像发布和体积比较。

## 持续集成

| 工作流 | 触发 | 验证内容 |
| --- | --- | --- |
| `test.yml` / Test CI | PR、main/canary push、merge_group、手动 | 代码与格式、Knip、类型、源码测试、自动化脚本、生产构建、Docker 构建；保留 `check` job 名 |
| `e2e.yml` / E2E CI | PR、main/canary push、merge_group、手动 | 构建后通过独立 Node 进程验证 REST、OpenAPI、错误请求恢复与正常退出 |
| `codeql.yml` / CodeQL | 每周、手动 | 扫描 Actions、JavaScript/TypeScript；采用 advanced setup，避免与 default setup 重复 |
| `bundle-size.yml` / Bundle Size Initialization | PR、main/canary push、手动 | 初始化阶段只测量当前 API JavaScript 原始体积及逐文件 gzip 体积，不进行预算比较 |

API E2E 使用本机临时端口，不安装浏览器或连接外部服务。可在构建后单独执行 `mise exec -- bun run test:e2e`；失败诊断写入忽略提交的 `artifacts/api-e2e/`。

体积脚本位于 `.github/scripts/bundle-size.mjs`，预算在该文件集中维护；统计 `apps/api/dist` 中的 `.mjs`，要求生产入口存在且非空，不包含 source map 和外部运行依赖。比较要求双方 schema、测量方式、指标集合及完整 SHA 一致，缺失或无效报告直接失败。新增指标需同时配置预算并明确迁移。

本地先构建，再生成测量报告；输出写入临时目录，默认记录当前 Git HEAD，未提交源码的测量仅用于本地验证，不作为已交付版本证据：

```sh
mise exec -- bun run build
mise exec -- bun run size:report --out /tmp/oarvia-size.json
```

当前使用技能随附的 bundle-size-initialize.yml 初始化流程，项目内仍命名为 bundle-size.yml。先将构建及测量入口合入目标分支，确认该分支的 push 运行生成有效报告；后续 PR 再以技能中的 bundle-size.yml 比较模板替换同一路径，验证 base 与 merge SHA 的预算比较。两阶段模板不同时安装，初始化测量不作为预算门禁。启用比较后，base 构建失败仍为检查失败；预算超限先生成 Markdown 报告，再让 Compare Bundle Size 失败。

`check` 的 job 名保持不变；上传工作流后核对实际检查名称与来源，再按发布说明配置门禁。CodeQL 只定时运行，不作为每个 PR 必须出现的检查。当前配置和本地验证不代表 GitHub 上已执行成功，也不接入生产部署。

分支、提交、发布 PR、镜像交付及失败恢复见[提交与版本发布](release.md)；发布流程测试可单独执行 `mise exec -- bun run test:release`。

依赖更新执行 `mise exec -- bun run dep:update`。新增依赖时，根包使用默认 catalog，子包使用各自的命名 catalog。

## 技能管理

项目自有技能在 `skills/<技能名>/SKILL.md` 中维护唯一源码，名称登记到 `skills/skills.json` 数组，通过相对软链接暴露到 `.agents/skills/`。UI 组件规则见 [ui-components](../skills/ui-components/SKILL.md)，用于约定后续 `packages/ui` 的组件归属和使用方式。

```sh
mise exec -- bun run skills:link
```

初始化、增删自有技能或需要恢复链接时，手动执行上述命令。技能链接不接入依赖安装生命周期，依赖安装、CI 和生产镜像构建不要求技能目录或链接存在。链接脚本会先检查所有选中技能的冲突，重复执行保留正确链接；遇到同名实体目录、错误或失效链接时失败，不覆盖现有内容。可用 `mise exec -- bun run skills:link <技能名>` 只接入指定技能。

通用 CI、文档治理和技能管理规则由远程 `iridescent-collective/skills` 技能库维护，项目通过 Vercel skills CLI 以 copy 模式安装，来源与内容哈希由 `skills-lock.json` 记录，不纳入项目自有技能清单。更新时先在技能库提交并推送，再从远程重新安装，不依赖本机同级源码目录：

```sh
mise exec -- pnpm dlx skills add iridescent-collective/skills --skill continuous-integration documentation-governance skill-management --agent codex --copy --yes
```

已有外部来源技能保留在 `.agents/skills/` 的实体目录中，来源记录沿用根 `skills-lock.json`，不纳入自有技能清单。升级或移除它们时，先核对来源和本地修改。

## 容器

编排参数与业务运行环境分别维护。仓库中的 development 编排文件用于本地运行生产形态的镜像，不启用源码热更新：

```sh
cp apps/api/.env.example apps/api/.env
docker compose --env-file docker-compose.development.env up --build -d
docker compose --env-file docker-compose.development.env down
```

Compose 文件从编排 env 读取 Dockerfile、构建上下文、镜像和端口，从 `API_RUNTIME_ENV` 指定的 `apps/api/.env` 注入业务变量，复用应用模板；容器通过 `environment` 覆盖运行模式、监听地址和内部端口。已有 `.env` 时无需重复复制。修改业务变量后需重新创建容器。真实环境文件不提交，密钥不进入镜像。

镜像在 Node 中构建并使用非 root 用户运行。CI 安装同一 mise 工具链，冻结安装后执行检查、构建及镜像构建。

## 部署接入

当前仅接入 API 的服务器容器部署，入口为 `.github/workflows/deploy-container.yml`。上线前核验已有 Release、镜像交付运行及回执，服务器消费确定的 digest；环境、runner、配置文件与首次演练见[提交与版本发布](release.md#容器部署)。Vercel 和 Cloudflare 技能保留供对应应用接入，当前没有前端或 Worker 应用，不创建空部署流程。

构建时可通过 `BUILD_SOURCE_SHA` 写入完整源码 SHA；镜像发布将已解析 SHA 作为 Docker 构建参数传入。`/api/version` 返回构建中的 `revision` 和 `ready`，禁用缓存；未指定 SHA 的本地构建返回 `revision: null, ready: false`，不能作为部署验证成功的版本。运行时环境变量或请求参数不能替换已构建产物的版本。当前 ready 仅表示有构建身份且进程可响应，尚未接入数据库就绪验证。
