# 提交与版本发布

分支与合并流程由 `git-workflow` 约定，提交、版本准备和产物分发分别由 `git-commit`、`version-release`、`release-publish` 处理。按本次任务选择相应阶段，已有提交、版本或产物直接作为输入。本地已接入受测的版本、镜像与恢复实现；远端启用还需要下面的分支、规则和凭据配置。

## 提交校验

根 `commitlint.config.mjs` 通过 `extends` 加载 `@lobehub/commitlint-config`，不扩展 type 枚举；依赖版本保存在默认 catalog。普通提交使用 preset 支持的类型，热修复使用 `fix`，版本机器人使用 `chore(release)`；`🚀 release: ...` 是发布 PR 标题，由版本工作流识别。

`.githooks/pre-commit` 通过 `check:staged` 调用 lint-staged，再由 Ultracite 只读检查暂存文件；检查失败会阻止提交，部分暂存文件的未暂存内容由 lint-staged 隐藏并恢复。配置见根 `lint-staged.config.mjs`，不在 hook 中运行全量 CI，也不自动修复或重新暂存文件。`.githooks/commit-msg` 使用同一 Commitlint preset 校验 Git 传入的消息文件，消息不合规则阻止提交。`prepare` 设置 `.githooks` 路径，不执行检查；没有 Git 工作树的生产镜像构建会跳过设置。

```sh
mise exec -- pnpm run prepare
mise exec -- bun run check:staged
printf '%s\n' '✨ feat(api): add health endpoint' | mise exec -- pnpm run check:commit
```

普通 PR 使用 squash 时按消息规范整理最终标题；发布和热修复分支交给版本工作流识别。消息校验不代替代码检查，提交前仍执行 `mise exec -- bun run ci`。

## 发布链路

启用后，`canary` 作为开发分支，`main` 作为正式发行分支。先提交当前初始化代码，再建立这两条分支，并将默认分支设为 `canary`；默认分支必须包含下游 Release 工作流。分支调整属于后续仓库初始化操作。

| 工作流 | 触发条件 | 作用 |
| --- | --- | --- |
| Test CI | PR、main/canary push、merge_group 或手动 | 检查、测试、构建和 API 镜像构建，job 名为 check |
| E2E CI | PR、main/canary push、merge_group 或手动 | 构建后的 API Node 进程与真实 HTTP 验证 |
| Bundle Size Initialization | PR、main/canary push 或手动 | 测量 API 构建包体积；基线准备好后再切换比较与预算门禁 |
| CodeQL | 每周或手动 | 安全扫描；执行与接入条件见开发说明 |
| Release PR Version | 指向 `main` 的 PR 打开或更新 | 根据发布标题及分支识别版本，机器人原子提交根版本和发布清单，产生 Release Ready 检查 |
| Auto Tag Release | PR 合入 `main` | 按实际合并基线复核版本，创建并读回 tag/Release；可按原 PR 手动恢复 |
| Publish Docker Image | Release published 或手动指定原 tag | 独立 job 检查与发布，核验版本镜像后更新渠道，保存交付回执 |
| Sync Main to Canary | `main` push 或手动触发 | 合并正式修复回开发分支，受保护或冲突时创建同步 PR |

同一个已准备的 head 不复用于新的发布 PR；重新创建 PR 时先等待机器人写入对应计划与检查。

main 与默认分支 canary 均需包含完整 `.github/workflows/` 和 `.github/scripts/` 文件。CI 使用同一套脚本测试，`mise exec -- pnpm test:release` 可单独运行自动化行为用例。队列使用 [GitHub.com 的 `queue: max`](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)，保留待执行任务，进行中的发布不取消；仍需核对排队及运行结果。

首次 main/canary 指向同一初始化提交且没有差异时，可在 release 分支做一次真实的根清单定版提交，再创建发布 PR；机器人检测版本一致后不重复递增。首版没有稳定 tag，发布 PR 必须用显式标题，例如 `🚀 release: v0.1.0`；这只是格式示例，当前没有创建该版本。PR 正文核验后冻结为英文 Release notes。后续周更和热修复自动增加 patch，minor 和 major 继续显式指定。版本、tag 和 Release 由机器人维护，不额外配置 semantic-release。

根 `package.json` 的 `version` 是整套应用发布与镜像核验的版本来源；初始化为尚未定版的 `0.0.0`，首版由发布 PR 显式选择。不分别发布的私有子包保留自己的占位版本，不作为镜像版本来源。

`release-pr-version.yml` 原子写入根版本及 `.github/release.json`，清单冻结 PR 编号、标题、main 基线、版本策略和英文说明；当前不生成 `CHANGELOG.md`，也不发布 npm 包。正式基线只取 main 中可达的稳定 tag，并确认对应 Release 已公开且说明非空。PR 标题或正文变更后会生成新的清单提交；合并后只读取该提交的冻结记录，不使用后来修改的 PR 文本。自动发布还会比对合并事件快照中的标题和正文，确认与冻结记录一致；不一致则停止，审核后可明确恢复原冻结版本，合并后的文本编辑不影响已冻结结果。清单通过 expectedHeadOid 原子更新，PR head 并发变化时停止而不覆盖；合并后按第一父提交复核预期版本，异常跳版本不会发布。已存在同版本 tag 时校验归属，已发布相同 Release 时不重复创建；版本冲突或 main 前进时刷新发布 PR。

## 日常开发与发版

以下操作以远端初始化和保护规则已完成为前提：

| 任务 | 分支起点 | 临时分支 | PR 目标 | 合并方式 |
| --- | --- | --- | --- | --- |
| 日常功能或修复 | canary | feat/功能名、fix/问题名 | canary | squash |
| 正式发布 | canary，包含最新 main | release/vX.Y.Z 或 release/weekly-YYYYMMDD | main | merge |
| 正式版热修复 | main | hotfix/问题名 | main | merge 或 squash |
| 正式线回同步 | main | main，冲突时使用基于 canary 的同步分支 | canary | merge |

日常开发在任务分支完成实现，运行 `mise exec -- bun run ci` 后，按 Gitmoji 规范提交，再创建指向 canary 的 PR。合入 canary 只完成开发集成，不自动发布正式版。

发布时从已核验的 canary 创建 release 分支并推送，准备英文说明文件，通过网页或下面的命令创建 PR。`VERSION` 是已确定的目标版本，`RELEASE_NOTES_FILE` 是本次说明文件路径：

```sh
gh pr create --base main --head "release/v$VERSION" \
  --title "🚀 release: v$VERSION" --body-file "$RELEASE_NOTES_FILE"
```

等待机器人提交版本和发布清单后，核对版本、说明、diff，以及最新 head 的 `check` 和发布 App 的 `Release Ready`。取得当前 `PR_NUMBER`、`EXPECTED_HEAD_SHA` 后合并：

```sh
gh pr merge "$PR_NUMBER" --merge --match-head-commit "$EXPECTED_HEAD_SHA"
```

合并后分别核对 Auto Tag Release 的 tag/Release、Publish Docker Image 的 digest 与交付回执、Sync Main to Canary 的合并结果或同步 PR。前一版未完成时按下方恢复步骤处理，再准备下一版。

## GitHub 配置

以下值在 GitHub 仓库 Settings 中设置，真实私钥和访问令牌不写入仓库：

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Variable | `RELEASE_APP_ID` | 版本与同步机器人 GitHub App 的 ID |
| release-control Environment Secret | `RELEASE_APP_PRIVATE_KEY` | 安装到本仓库的 GitHub App 私钥 |
| Variable | `REGISTRY_IMAGE` | Docker Hub 的 `组织/镜像名` |
| container-publish Environment Secret | `DOCKER_REGISTRY_USER` | Docker Hub 用户名 |
| container-publish Environment Secret | `DOCKER_REGISTRY_PASSWORD` | 有目标仓库写权限的 Docker Hub 访问令牌 |

GitHub App 安装到本仓库，至少需要 Contents、Pull requests、Checks 读写权限；Pull requests 写入供同步 PR 使用，Checks 写入供 Release Ready 使用；涉及工作流变更的发版提交还需按 GitHub 权限要求配置 Workflows 权限。App token 让机器人版本提交和 Release 创建能继续触发下游 Actions。版本工作流使用 `pull_request_target` 从目标分支加载可信工作流，通过 API 读取 PR 清单，只检出该工作流版本的 `.github/scripts/`，不执行 PR-head 代码。

生产启用前必须完成：

- 建立 main/canary 并保留完整自动化文件；默认分支设 canary。
- 保护两条长期分支，禁止 force push，要求最新提交的 check 成功，来源为 GitHub Actions；CI 工作流文件迁移到 test.yml，保留 check job 名，远端绑定前核对实际运行结果。E2E 和体积检查按真实 PR 验证结果接入门禁，初始化前提见[持续集成](development.md#持续集成)。main 还要求发布 App 提供的 Release Ready 成功（检查来源绑定该 App），启用严格 up-to-date 检查且不启用 merge queue；main 的发布 PR 必须包含最新 main，按顺序完成前一个版本后再合并下一个。
- 允许普通 PR squash、发布及回同步 PR merge；配置 v* tag 创建者为发布 App，禁止更新和删除，并限制 Release 写入者。
- 预先创建 Docker Hub 目标仓库，给访问 Token 该仓库 pull/push 权限。仅版本标签设置不可变，latest/canary/beta 渠道标签保持可更新；限制其他流水线和账号写入同一镜像。
- 建立 release-control Environment，仅允许 main/canary；container-publish Environment 仅允许 main/canary 与受控 v* tag。在对应 Environment 保存发布密钥，仓库级不保留同名副本。
- 配置表中的变量和密钥，并在隔离环境演练首版、patch、冲突及失败恢复后启用实际发布。

`release` 事件的工作流来自 tagged revision，`github.workflow_sha` 并不能替代 tag/Release 写入控制。所有版本 tag 只能来自已经审核的 main/canary 发行线，恢复入口只从受保护的 main/canary 执行。

## 镜像交付

发布 Dockerfile 固定为 `apps/api/Dockerfile`，构建上下文为仓库根目录。Buildx 生成 `linux/amd64`、`linux/arm64` 镜像与多架构 manifest；正式版更新版本标签及 `latest`，canary/beta 版本只更新对应渠道。

分发从 tag 解析完整 SHA，若 Release 给出完整 `target_commitish` 则要求一致；稳定 tag 必须属于 main，预发布属于 canary。源代码清单版本须与 tag 一致。check job 运行冻结安装与项目 CI，不持有镜像凭据；publish job 使用新 runner，再次校验同一 SHA 和版本，只运行可信工具及 BuildKit 构建，不执行产品宿主脚本。

首次上传只写版本标签；通过 Docker Hub 认证后的 manifest HTTP 状态判断占用，权限失败与网络错误不会被当作不存在。已有版本只有在 SHA、版本、仓库、digest 和必需平台一致时复用。版本核验完成后才通过同一 digest 更新渠道；晚到的旧版本交付不会把较新的渠道回退。

交付结果保存为 container-delivery artifact；校验或渠道更新失败时记录 incomplete，不能据 tag 或绿色的其他 job 宣称交付完成。镜像推送不等于生产部署；服务器部署入口见下节，需完成环境准备后才可执行。

## 失败恢复

| 失败位置 | 操作 | 保持不变的身份 |
| --- | --- | --- |
| PR 版本写入、并发 head 更新 | 更新源分支／main 基线，重新运行准备步骤，等待最新 CI | 同一个 PR 的实际源码与确定的版本策略 |
| 合并事件与冻结记录不同 | 审核冻结版本后从 main/canary 按原 PR 恢复；此时 main 已合入，Release 尚未创建 | 原冻结版本、说明与实际 merge SHA |
| 发布计划缺失或关联错 PR | 停止自动恢复；审核实际 merge SHA、版本、说明与检查后人工补齐 tag/Release，或走审核的回退 PR，不强制重置 main | 原合并记录与已占用版本，不直接递增绕过 |
| tag 已创建、Release 未完成 | 重跑原 Auto Tag Release，或从 main/canary 手动填原 pull_number | 原合并 SHA、版本与 tag |
| Release 已完成、镜像失败 | 从 main/canary 手动运行 Publish Docker Image，输入原 tag，可附 expected_sha | 原源码、版本及一致的已上传镜像 |
| 镜像版本成功、渠道更新失败 | 使用同一 tag 重跑，核验已有版本后恢复渠道阶段 | 原镜像 digest，不重建覆盖 |
| main 回同步失败 | 重跑 Sync Main to Canary，冲突在基于 canary 的同步分支处理 | main 历史，PR 使用 merge |

手动恢复不会重算下一版本，不移动 tag，不覆盖冲突镜像；原 PR 未合并或不属于发布操作时明确失败。代码层回归验证不代替真实账号权限与 registry 的端到端演练。

## 容器部署

`Deploy API` 是手动部署入口，只从受保护 main 运行。将本次初始化及部署相关代码先经项目流程合入发行线，再生成带构建 SHA 的新镜像；旧镜像即使标签存在，也可能没有版本接口，不能直接认定满足部署条件。当前仅完成仓库配置和本地验证，尚未配置真实服务器或执行上线。

输入目标 `staging` / `production`、已有稳定 tag，以及成功的 `Publish Docker Image` 运行 ID。hosted check job 验证运行来自本仓库的镜像发布工作流且成功，下载该运行最新 attempt 的交付回执，复核 tag 所属发行线、SHA、版本、镜像 digest 和必需平台。生产与镜像发布共享并发组，部署脚本在持有服务器锁后、更新前再次核验 registry 身份；生产还要求镜像仍对应 latest；历史版本恢复需先审核专门的回滚操作，不绕过该校验。

检查通过后，专用 Linux runner 以 `deployment` 标签执行部署。该 runner 不能用于不可信 PR 或其他任意代码任务，需有 Docker Compose、flock、Node 和目标仓库只读拉取身份；禁止在该主机保存镜像推送身份。每个环境的部署目录分别维护生产 Compose、编排参数文件及应用业务 env；端口与项目名不得在 runner 中重复覆盖。

| GitHub 设置 | 用途 |
| --- | --- |
| Environment staging / production | 限制 main 来源，审核要求按实际团队设置；check 与 deploy 均使用该环境 |
| Repository Variable REGISTRY_IMAGE | 与镜像发布使用同一仓库，不填写标签 |
| Environment Variable DEPLOY_DIR | 对应服务器部署目录的绝对路径 |
| Environment Variable DEPLOYMENT_HEALTH_URL | 真实部署入口的 `/api/version` 地址，需可从 runner 访问 |
| Environment Secrets DEPLOY_REGISTRY_USER / DEPLOY_REGISTRY_PASSWORD | hosted check 核验私有镜像的只读拉取身份；公开镜像可不配置；服务器自身另行预登录 |

服务器首次准备时，复制仓库的 `docker-compose.production.yml` 及 `docker-compose.production.env.example`，将后者保存为 `docker-compose.production.env`。填入实际 `COMPOSE_PROJECT_NAME`、API 端口、已交付镜像及 `API_RUNTIME_ENV` 路径；业务 env 从 `apps/api/.env.example` 按环境准备，服务器真实值不提交。生产 Compose 不含构建配置，不要求服务器保存源码、pnpm 或 Bun。

脚本使用 `--env-file docker-compose.production.env` 和生产 Compose，临时以 `API_IMAGE` 覆盖本次 digest。参数和业务 env 不改写；后续人工重建也通过已核验 digest 的部署入口执行，不能直接 up 回到参数文件中的旧默认镜像。API 仅绑定宿主回环地址，由既有反向代理提供外部 HTTPS；域名、证书、访问策略按服务器实际配置维护。

更新前核验旧服务、保存旧镜像身份。更新后核对实际容器镜像引用与镜像 ID，再验证版本接口。失败时仅在 Compose、运行配置不变且数据兼容的前提下恢复旧 digest；恢复成功仍将原任务标为失败。首装失败、恢复失败或中断保留部署目录的 `deployment-pending.txt`，后续自动重入被阻止，核对线上状态后才能解除。不会删除数据卷或清理旧镜像。

部署结果保存在当前运行的 `api-deploy-*` artifact。上线前在隔离服务器演练首装、正常更新、错误身份、健康验证失败、恢复及恢复失败，再核对外部域名与实际运行版本；本地模拟不能替代这些演练。现在不自动监听 Release 上线，也未启用 Vercel 或 Cloudflare 部署。
