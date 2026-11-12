---
name: continuous-deployment
description: 配置 Vercel、Cloudflare Workers 与自有服务器容器部署，约定环境、版本来源、上线验证和失败恢复。
---

# 持续部署规则

- 按目标选择 Vercel 托管、Cloudflare Workers 或服务器容器部署，不要求同时接入三种平台。先确定应用、账号、环境、域名、配置来源和运行模型；不因参考示例迁移现有运行时或拆出空应用。
- CI 验证源码，version-release 确定版本，release-publish 交付产物；部署消费确定的源码 SHA、镜像 digest 或平台版本。模板配置、平台接入和实际上线按各自任务授权执行，不因编写技能或配置就操作线上资源。
- 自动上线绑定受控分支或已验证交付事件，确认同一 SHA 的必需检查与交付结果。push、Release 创建或 workflow_run 成功本身不证明所有上线条件满足；跨工作流核对来源仓库、分支、SHA、工作流及结论，不执行不可信 artifact 内的脚本。
- Git 集成和 Actions 显式部署选择一个主要入口，避免同一变更重复上线。Git 集成的生产分支、自动提升及检查门禁需要核对平台设置，不能只从仓库配置推断；没有配置等待检查时，不宣称平台会等 CI。
- 容器接入先读取 dockerfile-build 与 docker-compose，分别沿用镜像构建和编排配置约定。部署只选择既有编排文件、参数 env 和目标镜像，不另建业务 env 模板；编排参数交给 Compose 解析，不通过 source 或 eval 执行 env 文件。
- 平台部署允许从固定源码构建；容器部署优先消费已交付镜像的 digest，不在服务器重新构建或临时解析 latest。部署记录关联源码、产物、目标和运行编号；多个应用独立部署时保持接口与数据兼容，记录实际运行组合。
- 预览、测试与生产使用明确的目标和凭据范围；预览地址不是生产流量入口，生产 Worker、域名或数据库不因 PR 预览被覆盖。fork 无凭据时保留构建验证，不通过提权执行 PR 代码取得部署密钥。
- 运行配置与构建配置分别管理，密钥不进入前端变量、构建产物或日志；Actions 按环境保存部署凭据并限制来源。服务器拉取私有镜像使用独立只读身份；服务器 SSH 校验已确认的 host key，不关闭验证或把即时扫描视为身份确认。
- 同一应用和环境协调并发，通常不中断已开始的上线；GitHub 并发组不能阻止控制台、其他仓库或本机部署。需要服务器锁或平台版本条件时同时配置；过时部署在切换前检查是否仍可上线，恢复旧版本使用明确的回滚操作。
- 跳过构建时覆盖真实输入：应用、共享依赖、锁文件、构建插件和配置。比较上次有效部署基线，缺失或无法解析时保守构建；只有代码和输出哈希相同，不足以跳过环境变量、绑定、路由或 secrets 的更新。输入清单是优化数据，不代替平台实际状态。
- 静态资源与服务分开交付时，先上传并验证新版本所引用的资源，再更新服务或切换流量；保留旧版本仍引用的资源。Workers 自带静态资源托管满足需求时可直接使用，不强制接入对象存储与 CDN。
- 明确每个平台的上传、激活和流量切换步骤。Vercel 创建部署、Workers versions upload 或 dry-run 不自动等于生产流量已切换；按实际部署 ID 和流量分配确认。直接部署命令会更新运行环境，不把它当作只读验证。
- 部署后先等待平台或容器就绪，再检查目标入口、必要业务行为和实际版本；HTTP 200、进程存活及平台命令成功不能单独证明上线完成。版本接口由构建身份生成，不回显请求提供的期望版本；等待有超时，失败保留诊断但不泄漏凭据。
- 迁移、应用更新和流量切换按兼容性安排；多实例迁移只执行一次，耗时或破坏性迁移单独处理。不能把迁移任意放进每次预览构建，也不默认撤回应用就能撤回数据库变更。
- 更新前保存旧部署身份及相关配置，区分首次部署、部分成功、恢复成功和恢复失败。仅对确认兼容的变更自动恢复；身份冲突、权限错误和确定性错误停止重试，回滚后仍验证旧版本，原上线任务保留失败状态。
- 重试沿用原 SHA 和产物，检查线上实际状态后恢复缺失阶段，不移动 tag、不删除数据卷、不默认清理旧镜像和静态资源。进程中断导致状态不明时停止自动重入，先核对当前运行版本。
- 分别报告配置完成、静态检查通过、平台部署完成、流量切换及线上验证结果；启用自动部署前用隔离环境演练成功、验证失败、恢复及恢复失败路径。技能不接入安装生命周期，管理遵循 skill-management。

## 示例

下面参考 LobeHub 的 Vercel 配置、Workbench Worker 部署和独立预览目标组织方式；服务器容器方案是通用补充，不代表其公开仓库展示了核心后端生产拓扑。账号、域名、分支、目录和预算由使用方确定。

| 场景 | 入口与随附文件 | 使用前准备 |
| --- | --- | --- |
| Vercel | 平台 Git 集成；或下方显式 CLI 片段 | 项目绑定、框架、Root Directory、安装与构建配置、环境、生产分支 |
| Cloudflare | [deploy-cloudflare.yml](assets/deploy-cloudflare.yml) | mise 工具链、锁定的 Wrangler、Worker 构建、平台账号、环境配置、版本接口 |
| 服务器容器 | [deploy-container.yml](assets/deploy-container.yml)、[deploy-container.sh](assets/deploy-container.sh) | 受信专用 Linux runner、Docker Compose、flock、Node、既有交付核验入口及服务器配置 |
| 版本验证 | [verify-deployment.mjs](assets/verify-deployment.mjs) | 返回实际构建 SHA 的非缓存 JSON 接口；接口变体按应用调整 |

模板以受保护 main 上的手动上线为起点，包含可运行的编排，项目构建、交付核验和业务接口仍需由使用方提供。自动触发应在同一 SHA 的检查或交付核验之后接入，不直接把 push 改成上线许可；Action 与 CLI 版本接入时查询当前官方文档。

**Vercel 托管。** Git 集成适合平台自动提供 PR 预览和分支部署。项目设置核对以下内容，平台机密不提交到 vercel.json：

| 配置 | 核对内容 |
| --- | --- |
| 项目与根目录 | 仓库、应用目录、框架预设、工作区依赖是否可访问 |
| 安装与构建 | 项目锁文件、工具版本、生产构建入口与输出目录 |
| 环境 | Preview / Production 的变量、外部服务、域名与访问保护 |
| 上线条件 | Production Branch、自动域名提升和适用的部署检查；未配置门禁时平台可能独立于 Actions 部署 |
| 验证与恢复 | 部署 ID、实际 SHA、独立部署 URL、生产域名和上一有效部署 |

仓库配置片段如下，仅展示安装与构建命令；这些脚本需由使用方实现。构建入口不默认带数据库迁移：

```json
{
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm run build"
}
```

需要由流水线控制提升时，使用项目锁定的 Vercel CLI，提供 VERCEL_ORG_ID、VERCEL_PROJECT_ID 和 VERCEL_TOKEN。下面是已有生产项目的命令片段，省略工具准备、源码检出、CI 门禁与部署记录；不是额外必装工作流：

```sh
set -eu
pnpm exec vercel deploy --yes --prod --skip-domain --token "$VERCEL_TOKEN" > deployment-url.txt
DEPLOYMENT_URL=$(cat deployment-url.txt)
# 在独立地址验证实际 SHA 及业务行为，通过后再提升。
DEPLOYMENT_HEALTH_URL="$DEPLOYMENT_URL/api/version" node .github/scripts/verify-deployment.mjs
pnpm exec vercel promote "$DEPLOYMENT_URL" --yes --token "$VERCEL_TOKEN"
# 再以正式域名验证同一版本；受保护地址使用平台支持的访问凭据。
```

verify-deployment.mjs 还读取 EXPECTED_SHA；SHA 必须对应本次实际构建。首次项目部署先核对平台的默认生产行为，不把遗漏 --prod 当作预览隔离。恢复时选取已核验的旧部署，并按当前平台的 promote / rollback 能力处理变量与配置差异。参见 [Git 集成](https://vercel.com/docs/git)、[deploy](https://vercel.com/docs/cli/deploy)、[promote](https://vercel.com/docs/cli/promote)。

**Cloudflare Workers。** 模板在 protected main 上选择 staging 或 production，使用同名 GitHub Environment。每个 Environment 设置 CLOUDFLARE_ACCOUNT_ID、WORKER_NAME、DEPLOYMENT_HEALTH_URL，Secret 为 CLOUDFLARE_API_TOKEN；Wrangler 的 staging/production 配置各自指定目标名称、路由、绑定及运行变量，不假设所有配置自动继承。

根脚本 build:worker 负责构建 Worker；根开发依赖锁定 Wrangler。模板执行 wrangler deploy，使用环境中的 WORKER_NAME 限定目标，并注入 DEPLOYMENT_SHA。应用的 /api/version 示例响应如下，必须真实读取该构建或运行绑定；不同平台保持同一语义：

```json
{ "revision": "0123456789abcdef0123456789abcdef01234567", "ready": true }
```

复制验证脚本到 .github/scripts/verify-deployment.mjs。返回 Cache-Control: no-store；ready 反映项目所需的就绪条件。模板保留部署日志并验证接口，但未自动解析平台部署 ID或回滚；接入时记录 Wrangler 返回的版本与部署身份，验证失败后保持失败，按平台记录恢复，不宣称已自动恢复。

需要 LobeHub 的 S3/CDN 分离方案时，在部署前增加资源上传及可访问性核验，文件名使用内容哈希；生产先保留旧资源。需要先上传再提升时改用 versions upload / versions deploy，并核对目标版本和流量比例。PR 使用独立 Worker，不复用模板中的正式目标。参见 [Wrangler](https://developers.cloudflare.com/workers/wrangler/commands/)。

**单服务器容器。** 模板只更新一个已有 Compose 项目的一个服务，不实现零停机、数据库迁移、多服务原子切换或 SSH 主机初始化。专用 self-hosted runner 标记为 deployment，只接受受保护部署工作流，不能让不可信 PR 在同一主机执行；Docker 权限等同高权限宿主访问。无专用 runner 时可以改用已验证 host key 的 SSH，远端仍执行同一部署脚本。

服务器 DEPLOY_DIR 提前维护既有 Compose、编排参数 env、应用业务 env 及只读 registry 登录。布局与职责沿用 [docker-compose](../docker-compose/SKILL.md)，Dockerfile 与构建归属沿用 [dockerfile-build](../dockerfile-build/SKILL.md)，镜像身份与交付核验沿用 release-publish。下面使用 api 服务展示参数衔接，不要求改名或重排已有项目：

```text
部署目录/
├── docker-compose.yml
├── docker-compose.production.env
└── apps/api/.env                  # 业务配置，不提交
```

编排参数文件 docker-compose.production.env 示例：

```dotenv
COMPOSE_PROJECT_NAME=example-production
API_IMAGE=example/app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
API_PORT=3000
API_RUNTIME_ENV=./apps/api/.env
```

Compose 片段如下，健康检查与其他属性按应用补齐；模板通过 --no-build 消费已交付镜像，不能在服务器重新构建：

```yaml
services:
  api:
    image: ${API_IMAGE:?set digest-qualified API_IMAGE}
    env_file:
      - ${API_RUNTIME_ENV:?set API_RUNTIME_ENV}
    restart: unless-stopped
    ports:
      - "127.0.0.1:${API_PORT:-3000}:3000"
```

GitHub Environment 的部署定位参数如下；项目名、端口与业务 env 路径仍由服务器编排参数 env 保存，不在工作流再维护一份：

| 变量 | 示例值或用途 |
| --- | --- |
| DEPLOY_DIR | 已有部署目录的绝对路径 |
| COMPOSE_FILE_PATH | docker-compose.yml，相对 DEPLOY_DIR 或使用绝对路径 |
| COMPOSE_ENV_FILE | docker-compose.production.env，相对 DEPLOY_DIR 或使用绝对路径 |
| IMAGE_VARIABLE | API_IMAGE，必须匹配 Compose 现有镜像插值变量；模板接受 *_IMAGE，保留 DEPLOY_IMAGE 给工作流输入 |
| COMPOSE_SERVICE | api，选择已有服务 |
| IMAGE_REPOSITORY | example/app，限制可部署镜像来源 |
| DEPLOYMENT_HEALTH_URL | 实际运行入口的版本与就绪接口 |

每次 Compose 查询、更新和恢复均使用同一 --env-file 与 -f。脚本仅以进程环境覆盖 IMAGE_VARIABLE 指定的镜像值，优先于编排参数文件，不修改该文件或业务 env；回滚时只把这个覆盖值换成旧 digest。参数文件中的默认镜像不会自动更新，后续人工重建也应经部署入口传入已核验 digest，避免直接 up 回到旧默认值。runner 不应另行导出端口、项目名或业务 env 路径等同名参数，以免覆盖服务器参数文件。若需要覆盖其他参数，明确记录来源与顺序。此优先级见 [Compose 插值规则](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)。

容器返回构建时写入的 revision。模板先在 hosted runner 执行使用方的 verify:delivery，它必须核验输入镜像 digest、源码 SHA、交付回执和上线资格，非零退出阻止访问部署 runner。此脚本是 release-publish 交付记录的消费入口，不是随附的占位实现；缺少时先完成该入口，不能删除步骤绕过。

输入 image 必须属于 IMAGE_REPOSITORY 且含 sha256 digest，source_sha 为对应完整 SHA。容器 OCI revision 标签必须匹配。服务器脚本再校验拉取结果，使用项目锁，等待 Compose 就绪，再验证目标接口；镜像更新失败时尝试以原 digest 恢复，并再次验证旧 revision，原任务仍失败。首次部署没有旧实例时不自动删除新容器，保留 pending 记录供人工检查。

该恢复仅适用于服务器 Compose 与运行配置保持不变、数据向后兼容的镜像更新。配置也变化时先设计包含旧配置的恢复方案。pending 记录在进程被终止或恢复失败时保留；核对实际容器、版本接口及记录后才能解除，不自动清理。脚本不停止数据库、不运行 down -v、不删除旧镜像。参见 [Compose up](https://docs.docker.com/reference/cli/docker/compose/up/)与 [Actions 部署控制](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)。

**启用与恢复验收。** 随附 [deployment.test.mjs](assets/deployment.test.mjs) 用 Node 测试验证版本等待、镜像更新与恢复控制流，部署控制流中的 Docker、锁和网络使用隔离替身；本机可用 Docker Compose 时另以真实 config 命令验证两类 env、参数路径和镜像覆盖，无需启动容器。可在 assets 目录执行 node --test deployment.test.mjs。容器脚本在更新与恢复后同时核对实际容器镜像引用和本地镜像 ID，不能用相同 SHA 的另一个 digest 冒充目标镜像。每次 Actions 运行使用独立结果文件，前置失败不展示上次成功记录。

隔离环境先执行首装、正常更新、错误 digest、版本不符、健康检查失败、旧版本恢复和恢复失败；确认失败状态不会被恢复步骤变绿。核对从外部实际访问的域名，不能只验证宿主回环地址。完成后才接自动触发，并记录环境、SHA、digest / 平台部署 ID、访问入口、前后版本和验证结论。静态检查与模拟测试不替代真实账号、网络和平台上的演练。
