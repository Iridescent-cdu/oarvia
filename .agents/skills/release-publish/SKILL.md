---
name: release-publish
description: 配置产物构建与分发工作流，发布 npm 包、容器镜像及下载附件，核验交付并处理恢复。
---

# 分发规则

- 接收已有 Release、tag，或明确的版本、完整源码 SHA 和目标渠道；构建前解析并冻结可变引用，核对版本与源码身份，构建和重建期间不重新选择 HEAD 或计算版本。
- 检查与构建使用确定的源码、锁文件和配置；验证完成后发布同一份产物，上传后核验内容，再切换渠道或更新清单，发布阶段不重新构建或运行包生命周期脚本。
- 必需检查通过 job 或步骤依赖阻塞分发；其他工作流的绿灯、独立的 tag 检查或版本记录存在，不能代替当前 SHA 的发布前检查。
- 正式版、预发布和 PR 预览隔离渠道；npm 正式版进入 latest，预发布进入 canary／beta；镜像保留不可变版本标签，只有正式版更新 latest，PR 产物不进入正式渠道。
- npm 包已配置 Trusted Publisher 且源码仓库与运行环境满足要求时使用 OIDC；尚未配置、首次注册包或环境需要 Token 时使用 Token。私有包或其他 registry 另行配置访问权限、地址和查询认证，不能只替换凭据。
- 常规检查与打包 job 不持有发布凭据；镜像等需要构建并推送的任务只对可信源码执行，并把凭据限制在必要的推送步骤。凭据不交给不可信 PR 代码。Token 认证和 OIDC 来源证明分别配置，不因开启 id-token 权限就认定为免 Token 发布。
- 同一目标串行发布，正式上传不取消正在进行的运行；只有身份和完整性一致的已有产物可复用，不覆盖不可变版本，也不把“版本已存在”直接当作成功。
- 分别核验包版本及完整性、镜像 digest、下载附件、更新清单或部署运行版本。多平台汇总必须等待必需平台成功，CI artifact 或部分平台成功不等于整版交付。
- 发布 Docker Hub 镜像时确定可写的账号或组织命名空间、认证、仓库可见性及部署方拉取权限；采用推送前认证查询方案时，先创建目标仓库并确认发布身份具有 pull/push 权限。
- 保存源码与交付记录；重建读取原源码身份，热修复基线选已核验交付的版本，不用手写成功状态补齐缺失证据。
- 中断时只恢复缺失阶段；身份冲突、权限缺失及确定性错误停止重试，试运行、跳过、部分成功和完成分别报告。
- 回滚前确认数据、迁移与客户端兼容性，使用已交付产物或渠道指针，不移动正式 tag，不默认数据库可逆；清理旧产物时保留当前清单、保留版本和恢复路径仍引用的内容。
- 工作流配置、分发、部署和撤回按各自授权执行；镜像入库不等于部署，部署任务需核验实际运行版本。

## 示例

下面按 npm 包、容器镜像、多平台下载产物和 PR 预览四种任务展开。随附 Docker 配置提供完整工作流；正文代码块展示关键步骤或配置差异，省略范围在对应段落说明。工作流放 `.github/workflows/`，可复用步骤放 `.github/actions/`，命令和工具版本由目标项目确定。

四种场景都先确定构建身份：已有 Release 从 tag 解析完整 SHA，只有 tag 时解析该 tag；手动指定版本和 SHA 时核对清单或产物元数据。Release 的 `target_commitish` 若为分支名，只描述来源；若为完整 SHA，则应与 tag 一致。后续 checkout 使用已解析的 SHA。类型、测试和构建使用实际存在的脚本，不强制命名为 `ci`，也不要求使用某种包管理器或运行时。

**发布 npm 包或 CLI。** 工作区中的包清单合入开发分支后，读取包名、版本与目录，判断是否需要发布；手动入口可以指定同样的源码和包。下面只展示自动入口，`development` 和 `packages/cli` 是示例值；共享依赖、锁文件和工具链是否纳入触发路径，按该包的真实构建输入确定：

```yaml
on:
  push:
    branches: [development]
    paths:
      - packages/cli/package.json
      - .github/workflows/publish-package.yml
  workflow_dispatch:

concurrency:
  group: publish-package
  cancel-in-progress: false
```

路径变化不等于版本变化。查询 registry 后，未占用的正式版本应高于当前稳定版本；预发布核对所属渠道。已有版本先核验源码记录和包完整性，不能仅因存在就报告成功。`404`、权限失败和网络失败分别处理；私有包的无权限响应不能当成“尚未注册”。手动重跑沿用原版本及 SHA，不再计算版本。

构建 job 冻结安装依赖，运行包自己的检查与构建脚本。CLI 再对实际打包入口执行 `--version`、`--help` 等冒烟检查，确认生成的模板、帮助文件等运行依赖进入包。以下是使用 pnpm 的构建步骤片段，省略了 checkout 和工具准备；包路径、脚本及 CLI 入口按实际产物替换：

```sh
set -eu
pnpm install --frozen-lockfile
pnpm --dir packages/cli run check
pnpm --dir packages/cli run build
node packages/cli/dist/cli.mjs --version
node packages/cli/dist/cli.mjs --help
mkdir -p "$RUNNER_TEMP/npm-package"
cd packages/cli
npm pack --ignore-scripts --json --pack-destination "$RUNNER_TEMP/npm-package"
```

构建命令需显式覆盖代码生成和其他打包准备，不能假定 `npm pack` 会运行 `prepublishOnly`。从 pack 的 JSON 结果取得包名、版本、文件名和 integrity，核对清单后把唯一 tarball 与这些元数据传给发布 job。发布 job 通过 `needs: build` 等待检查成功，下载 artifact 并重新计算哈希对照构建结果，不重新检出业务源码构建。下文的 `TARBALL`、`CHANNEL`、`PACKAGE_NAME`、`VERSION` 和 `INTEGRITY` 均指经校验的上游结果，文件路径可能包含空格，命令中保留引用。

认证只选择下面一种。OIDC 适用于已配置 Trusted Publisher、源码仓库与运行环境满足 npm 要求的包；首次注册包、尚未配置 Trusted Publisher 或环境需要 Token 时选择 Token。以下片段省略了工具准备、artifact 下载及完整性检查，插入实际发布 job 使用。

OIDC 发布 job 配置 `id-token: write`，安装支持 Trusted Publishing 的 npm CLI，并在 npm 包 Settings 绑定实际 GitHub owner、repository 和工作流文件名。包清单的 `repository` 指向同一仓库，monorepo 标明包目录；构建 job 不授予 OIDC 写权限：

```yaml
permissions:
  contents: read
  id-token: write
steps:
  # TARBALL 与 CHANNEL 已从上游结果校验并设置为环境变量。
  - name: Publish checked package
    run: npm publish "$TARBALL" --ignore-scripts --access public --tag "$CHANNEL" --registry https://registry.npmjs.org
```

Token 方式使用有目标包或 scope 发布权限的 granular access token，设置合适有效期及无人值守发布所需的 2FA 选项，保存为 GitHub Secret `NPM_TOKEN`。下面展示 registry 配置与凭据注入，`NODE_VERSION` 变量填写项目实际使用的 Node 版本；Token 只进入发布步骤，不写入源码、构建 job 或 artifact：

```yaml
steps:
  - uses: actions/setup-node@v6
    with:
      node-version: ${{ vars.NODE_VERSION }}
      registry-url: https://registry.npmjs.org
  - name: Publish checked package
    env:
      NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
    run: npm publish "$TARBALL" --ignore-scripts --access public --tag "$CHANNEL" --registry https://registry.npmjs.org
```

`NODE_VERSION` 仅表示这一片段的版本来源，使用 mise 等工具管理时替换 setup 步骤，不新增第二份工具版本。上面两种认证都按公开 npm 包展示；私有包或其他 registry 还需调整 access、registry 地址及元数据查询认证。具体前提见 [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) 和 [npm CI/CD Token 配置](https://docs.npmjs.com/using-private-packages-in-a-ci-cd-workflow/)。

Token 认证也可为满足来源证明条件的公开包添加 `--provenance` 及 `id-token: write`；该 OIDC 权限用于证明来源，npm 认证仍使用 Token。不能因出现 `--provenance` 就把两种认证合并成同一方案。

发布后检查 registry 中的版本、integrity 与 dist-tag，示例命令如下。已存在且完整性相同的版本可跳过上传，但仍执行渠道核验；渠道不符时分别报告，不覆盖版本或直接改标签掩盖问题：

```sh
set -eu
test "$(npm view "$PACKAGE_NAME@$VERSION" version --registry https://registry.npmjs.org)" = "$VERSION"
test "$(npm view "$PACKAGE_NAME@$VERSION" dist.integrity --registry https://registry.npmjs.org)" = "$INTEGRITY"
test "$(npm view "$PACKAGE_NAME" "dist-tags.$CHANNEL" --registry https://registry.npmjs.org)" = "$VERSION"
```

**发布容器镜像。** 使用 Docker Hub 存放镜像；已有 Release 或手动指定 tag 时，先解析源码身份，再选择 Dockerfile、构建上下文和目标平台。

Docker Hub 命名空间使用自己可写的账号或组织，不能从 GitHub 组织名直接推断。按交付范围选择仓库的公开或私有可见性；公开镜像验证匿名拉取，私有镜像验证部署环境的只读拉取身份。

版本 App 负责源码版本、tag 和 Release，Docker Hub 身份负责产物上传。发布凭据放受保护的 Environment，GitHub 默认工作流令牌保持只读。

针对 GitHub.com、main/canary、Docker Hub 的应用镜像，可使用随附的完整配置：

| 文件 | 复制位置 | 用途 |
| --- | --- | --- |
| [release-docker.yml](assets/release-docker.yml) | .github/workflows/release-docker.yml | Release 触发或手动恢复，检查与发布使用独立 runner |
| [container-release.mjs](assets/container-release.mjs) | .github/scripts/container-release.mjs | 固定源码、认证查询、验证镜像身份并推进渠道 |
| [container-release.test.mjs](assets/container-release.test.mjs) | .github/scripts/container-release.test.mjs | 交付及恢复行为测试 |

三份文件保留在 main 和默认分支。模板使用根 mise 配置、pnpm 锁文件与 `ci` 脚本，移植时替换环境和检查调用；`DOCKERFILE` 默认 Dockerfile。使用 `node --test .github/scripts/container-release.test.mjs` 验证行为。

首次接入 Docker Hub 时，按下面的顺序准备：

1. 在 Docker Hub 选择可写的账号或组织命名空间，创建目标镜像仓库，例如 `example/app`，确定公开或私有可见性。
2. 创建具有 Read & Write 权限的个人访问 Token，或使用已授权目标仓库 pull/push 的组织访问 Token；已有合适且未过期的 Token 可以复用，不要求每个项目重新创建。
3. 在 GitHub 配置下表的镜像地址与凭据，再验证认证查询、上传及远端镜像身份。

| GitHub 配置位置 | 名称 | 示例值或用途 |
| --- | --- | --- |
| Repository Variable | REGISTRY_IMAGE | example/app，不包含版本标签 |
| container-publish Environment Secret | DOCKER_REGISTRY_USER | Token 对应的 Docker Hub 登录身份；个人 Token 使用账号用户名，组织 Token 使用组织名 |
| container-publish Environment Secret | DOCKER_REGISTRY_PASSWORD | 访问 Token，不使用账号密码 |

`container-publish` 只允许 main/canary 与受控 `v*` tag，仓库级不保留同名发布密钥副本。Token 直接保存到 Secret，不写入代码、日志或发布说明。

Docker Hub 支持在首次 `docker push` 时自动创建仓库，并使用命名空间的默认可见性；提前创建不是平台硬性限制。随附工具在上传前需要查询仓库访问权限与版本占用，因此本方案先建仓库，再运行发布。个人 Token 与仓库的创建顺序本身不强制，复用 Token 时仍需核对权限和有效期。参见 [Docker Hub 自动创建仓库说明](https://docs.docker.com/docker-hub/settings/#configure-default-repository-privacy)。

镜像入口的启用条件是 registry 与镜像路径已确定、所需身份已接入、Environment 来源受限，以及同一 SHA 的完整上传与远端核验成功。分别报告设置保存、构建通过、上传成功、渠道完成和部署验证状态；首次接入还需演练版本已存在、上传中断和渠道更新失败后的恢复。

该配置的 check job 不接触发布凭据；publish job 是干净 runner，只运行可信工具和隔离的 BuildKit 构建，不再执行产品宿主脚本。先检查 tag 属于 main 或对应 canary 发行线，并验证源码清单版本；发布前再次解析 tag，比对检查 job 的 SHA 和版本。

新版本只上传版本标签；通过 Docker Hub 的 TLS 认证端点确认 pull 权限，再按 manifest HTTP 状态区分不存在与权限、网络错误。已存在镜像必须匹配源码 SHA、版本、仓库和必需平台；一致时复用，冲突时停止。核验 digest 后才更新渠道，较旧版本恢复不会回退较新渠道。交付回执记录 digest、平台身份和渠道状态；失败回执明确为 incomplete，不作为成功证据。

启用前将版本 tag 与 registry 版本标签设为不可变，并限制其他发布写入者；GitHub 并发组只约束本仓库运行，不能阻止其他账号或流水线写入同一镜像。人工恢复从受保护 main/canary 运行，输入原 tag 和可选完整 SHA；沿用原源码，重新验证已有版本后完成缺失阶段。`release` 事件需要受控的 tag 与已审核工作流，不能执行任意标签中的发布代码。下面的片段继续说明可选的构建编排方式。

随附模板使用一个 Buildx job 构建多架构 manifest；构建耗时较高时，也可将架构拆到原生 runner 并行执行。下面只展示并行方式的矩阵，省略环境、登录和构建步骤；不需要所有项目都提供这两个架构：

```yaml
strategy:
  fail-fast: false
  matrix:
    include:
      - platform: linux/amd64
        runner: ubuntu-latest
      - platform: linux/arm64
        runner: ubuntu-24.04-arm
runs-on: ${{ matrix.runner }}
```

每个构建 job 使用相同 SHA，按 digest 推送，并上传以平台命名的 digest artifact；如果镜像还需测试，拉取并测试该 digest，不在测试后重建另一份镜像。只有推送步骤持有最小范围的仓库凭据，凭据不注入 Dockerfile 或构建上下文。

汇总 job 通过 `needs` 等待所有必需架构成功，核对 digest 完整且架构无缺失，再创建版本 manifest。下面的 `IMAGE`、`VERSION` 及两个 digest 来自已校验的发布输入和构建结果，示例只展示汇总命令：

```sh
set -eu
docker buildx imagetools create \
  --tag "$IMAGE:$VERSION" \
  "$IMAGE@$DIGEST_AMD64" \
  "$IMAGE@$DIGEST_ARM64"
docker buildx imagetools inspect "$IMAGE:$VERSION"
```

记录 manifest digest，核对远端版本包含预期平台后再更新 `latest/canary/beta` 等渠道标签；正式版才进入 `latest`。版本标签已存在时先比对交付记录和 digest，身份冲突则停止，不覆盖已有版本。重跑时可复用一致的架构 digest、恢复缺失架构及汇总阶段。镜像入库的完成条件是远端 digest 和平台可核验；部署到服务器后，还需核验实际运行的镜像版本。

**发布多平台下载产物。** CLI、桌面应用等需要不同 OS／架构的文件时，先确定同一版本、渠道与完整源码 SHA，再按平台构建。下面只展示 jobs 的依赖关系、矩阵与附件上传，构建、签名、哈希生成、文件清单核对和下载步骤均需按产物补齐；不是可直接运行的完整工作流：

```yaml
jobs:
  build:
    runs-on: ${{ matrix.runner }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - target: darwin-arm64
            runner: macos-latest
          - target: win32-x64
            runner: windows-latest
          - target: linux-x64
            runner: ubuntu-latest
    # steps: 按 target 检查、构建、签名，并上传唯一命名的 artifact。
  publish:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      # 已下载并核对所有必需平台文件及哈希，RELEASE_TAG 为已验证的版本 tag。
      - uses: softprops/action-gh-release@v3
        with:
          tag_name: ${{ env.RELEASE_TAG }}
          files: release/*
          fail_on_unmatched_files: true
```

每个平台的文件名与 artifact 名包含版本和目标平台，避免合并时互相覆盖；macOS 不同架构的更新元数据需要合并时，使用对应打包器的规则，不能仅重命名后覆盖。签名及公证仅在相应平台和发行方式要求时配置，密钥不进入普通构建产物。

汇总先按预期文件清单核对平台数量、文件、大小和哈希，再上传现有 Release 的附件；glob 匹配成功不能代替清单检查，上传步骤也不重新计算版本、创建另一份 tag 或替换说明。若还需要对象存储或客户端更新服务，先上传版本化文件并核验可下载，再切换相应渠道的更新清单；各目标分别记录结果。

手动验证构建时只上传 CI artifact，不切换渠道，不记录正式交付完成。重建同版本读取原源码记录，多仓库分别固定 SHA，同时记录锁文件及构建配置；不能从当前 HEAD 重新选择依赖源码。交付记录包含运行编号、平台、远端位置、哈希或 digest 与清单状态。

例如 Windows 附件已上传、Linux 构建失败时，核对已有 Windows 文件，使用原源码恢复 Linux 阶段；所有必需平台及更新清单核验前报告部分成功。只有源码记录而没有上传证据时，重新检查交付目标，不能补写成功状态。热修复基线选择已核验交付的版本；回滚先检查迁移及客户端兼容性，再复用已交付产物或按授权调整渠道指针。清理按渠道区分，保留仍被当前清单、保留版本及恢复路径引用的产物。

**提供 PR 预览。** 包、镜像和下载文件都可以在 PR 中预览，复用对应产物的检查和构建步骤。低成本构建按路径触发，昂贵的多平台或镜像构建可按标签触发；PR head SHA 固定构建源码，产物身份包含 PR 编号及 SHA。以下仅展示标签触发入口，修改代码后仍会重跑，移除标签后跳过构建：

```yaml
on:
  pull_request:
    types: [opened, reopened, synchronize, labeled, unlabeled]
concurrency:
  group: preview-${{ github.event.pull_request.number }}
  cancel-in-progress: true
jobs:
  build:
    if: contains(github.event.pull_request.labels.*.name, 'build-preview')
    permissions:
      contents: read
    # runs-on 与 steps 按预览产物配置；不传正式发布凭据。
```

不可信 PR 代码只在无发布凭据的构建环境执行；有写权限的评论、预览发布步骤使用可信配置及工具，校验产物所属 PR、SHA 和预期内容，不把下载的 PR 脚本当可信脚本执行。fork 缺少某服务的身份时，可保留 artifact 构建结果并明确标注未发布；需要维护者授权的发布步骤另行配置，不通过 `pull_request_target` 直接执行 PR-head 代码获取凭据。

预览成功后提供实际使用入口，而不只报告构建绿色：

| 产物 | 示例交付方式 | 提供给试用者的内容 |
| --- | --- | --- |
| npm 包或 CLI | tarball artifact，或已配置身份的包预览服务 | 下载后的 `npm install ./package.tgz`，或服务返回的安装命令；CLI 可使用 `npm exec --package=安装地址 -- 命令名` |
| 镜像 | 预览仓库中的 `pr-编号-SHA` 标签及 digest | 完整拉取地址、digest、启动所需配置 |
| 多平台文件 | PR 对应的 artifact 或预发布附件 | 各平台下载入口、版本身份和哈希 |

预览地址和安装命令取自实际发布结果，不拼造成功链接；重复运行更新同一 PR 的结果说明，指向本次 SHA。过期清理仅处理预览命名空间及不再引用的产物，不移动正式 tag，不更新 `latest`，也不删除正式恢复路径所需的文件。预览可取消旧构建，正式分发仍按目标串行且不中断上传。
