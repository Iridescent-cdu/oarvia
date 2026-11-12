---
name: version-release
description: 确定版本号，编写 changelog 和发布说明，配置版本写入、tag 与 GitHub Release。
---

# 版本规则

- 根据源码范围、目标版本或已有 tag／Release，确定本次是整理说明、写入版本，还是创建版本标记；只执行已授权的版本操作，不自动提交业务代码或分发产物。
- 使用 SemVer。同一应用共享版本；分别发包的包维护各自清单和 tag 前缀，按依赖兼容性与打包内容决定是否联动。
- 每条发行线由一个入口写入版本；机器人与人工不重复递增。采用 PR 自动化时，合并定版根据实际合并基线复核预期版本，只校验已写入值，不再修改清单或对其加一。
- 采用 PR 自动发版时，以正式发行线基线中可达的最新正式 tag 为基准；标题严格匹配 `🚀 release: vX.Y.Z` 时采用高于已发布版本的显式值，首版必须显式指定。minor／major 由明确的发行意图选择，不能仅凭 feat 推断 minor。
- 自动 patch 先识别 `release/*`、`hotfix/*`，再识别标题的 `style/feat/fix/refactor/hotfix/build`；`docs/chore/ci/test/perf` 标题本身不触发发版。PR 清单由机器人更新后，重跑仍以正式 tag 计算，不在已更新版本上再次递增。
- 正式发行线的清单、tag 与公开 Release 应对应同一已定版版本；合并后尚未完成 tag／Release 时先恢复该版本，不继续准备下一版。
- tag 绑定完整源码 SHA，不覆盖已有 tag；版本被占用、源码不一致或并发出现更高版本时，先解决冲突再定版，不覆盖或重复创建版本记录。
- 发布说明基于已核验的提交、PR 和 diff，比较基线须属于对应发行线并被目标范围包含；排除预发布基线，涵盖期间热修复，去除重复变更，不推测编号、作者身份或统计。
- 技术 changelog、英文 Release notes 与产品文章分别维护；项目维护 changelog 时在定版阶段归档，保留人工内容和自动生成区域的边界，重跑不重复生成说明，产品文章不阻塞发版。
- PR 自动化将核验后的版本、基线与发布说明固定到受检提交；合并后核对实际合并提交与合并事件快照，变化或身份冲突时停止发布。人工不重复改版本或打 tag。
- 发布检查绑定实际源码与可信检查来源，PR 更新后等待相应检查；带写权限的元数据工作流不执行 PR-head 代码，发布凭据只交给可信工作流。
- 接入版本自动化时区分权限与凭据已保存、App 鉴权成功、版本提交与标记已核验三个状态；仅看到 App、Secret 名称或绿色安装步骤，不能认定版本链路已验证。
- 记录目标版本、比较范围、完整 SHA、tag、发布说明及创建状态；已有 Release 的正文只在明确要求更新时修改。

## 示例

只给 `v1.9.0` 整理说明时，核对目标 tag／SHA 与比较基线，输出 notes 即可；无需更改清单或创建新 tag。手动准备首版时，指定版本与完整 SHA，核对清单版本及占用后创建标记。二者都不需要先建立 PR 自动化。

采用 PR 版本入口时，读取给定 PR 的分支和标题，版本以显式标题或计算结果为准，不从分支名后缀解析。例如 `🚀 release: v1.9.0` 指定版本 `1.9.0`。

正式版本 tag 使用 `vX.Y.Z`。例如 `🚀 release: v1.9.0` 选择显式 minor，周更日期标题 `🚀 release: YYYYMMDD` 通过 release 分支走自动 patch；若已有正式 tag 为 `v1.8.4`，PR 被更新到 `1.8.5` 后重跑仍保持 `1.8.5`。

开发预发布使用下一正式 patch 的 `-canary.N`，手动测试版本使用 `-beta.N`，同一版本的序号递增；PR 预览版本包含 PR 编号和构建号。例如正式版为 `1.9.0` 时，开发版本可以是 `1.9.1-canary.1`。

准备周更说明时，获取最新远端记录，选择 `main` 上可达的最近正式 tag；不要直接取上一次周更，因为期间可能已有热修复。分别发包的包只取自己的 tag。确认该基线被发布分支包含，再按范围核对变更；无法确认的 GitHub handle、编号或统计省略，不能用 Git 作者名代替 handle。

发布 PR 正文经核验后冻结为 GitHub Release 的英文正文，按发布类型选用 [release-notes.md](assets/release-notes.md) 中的一种模板：

| 类型 | 内容 |
| --- | --- |
| 周更／minor | 范围、Highlights、领域变更、升级影响、贡献者、Full Changelog 比较链接 |
| 热修复 | 范围、1–3 条修复、升级动作、负责人 |
| 迁移 | 结构变化、执行方式、兼容性、失败处理和恢复要求 |

占位字段替换为已核验信息，删除无内容章节；模板中的兼容或恢复假设不能直接当结论。需要维护 `CHANGELOG.md` 时，在定版阶段同步归档；不手改自动区域，也不将已有静态 JSON 的格式转换当作新变更生成。

以下配置适用于 GitHub.com、main/canary 和根清单稳定版；两个工作流分别负责 PR 版本写入和合并后的版本标记：

| 配置 | 输入 | 输出 |
| --- | --- | --- |
| [release-pr-version.yml](assets/release-pr-version.yml) | 指向 main 的同仓库 PR、正式 tags、根 package.json | 发布 PR 的版本与清单提交、各 PR 的 Release Ready 检查 |
| [auto-tag-release.yml](assets/auto-tag-release.yml) | 实际合并提交中的版本、发布清单；或手动给出已合并 PR 编号恢复 | tag 与 GitHub Release |
| [release.mjs](assets/release.mjs) | GitHub API、PR 与提交元数据 | 共用的版本校验、原子写入和恢复逻辑 |
| [release.test.mjs](assets/release.test.mjs) | Node 内建测试运行器 | 版本、并发、冲突和恢复的回归验证 |

两个 YAML 放到 `.github/workflows/`，两个 mjs 文件放到 `.github/scripts/`，保持文件名一致；main 与默认分支均保留完整自动化文件。YAML 使用 `github.workflow_sha` 检出其对应版本的工具，不从 PR head 加载脚本。先由版本工作流原子更新根清单与 `.github/release.json`，后者记录版本、main 基线、PR 编号、标题和发布说明；再由合并定版工作流读取冻结记录并在合并 SHA 上创建 tag 和 Release；版本冲突时更新 PR。示例管理根 `package.json` 与发布清单，技术 changelog、包级版本与预发布序号需要相应的生成或版本入口。

PR 自动化使用受保护的 `release-control` Environment，仅允许 main/canary 部署；在该 Environment 配置 `RELEASE_APP_PRIVATE_KEY`，`RELEASE_APP_ID` 可用仓库变量。所需 App 权限见下表。App token 使版本提交和 Release 事件能继续触发 Actions；仅整理说明时不需要 App 凭据。

GitHub 版本入口的配置与验收如下；创建 App 时关闭不使用的 webhook，只安装到目标仓库，组织和账号权限不随仓库权限一并扩大。

| 配置 | 用途与验收 |
| --- | --- |
| App Contents 读写 | 原子写入版本、创建 tag 与 Release；核对实际提交 SHA 和创建后的标记 |
| App Pull requests 读取 | 读取 PR；同一 App 还负责创建同步 PR 时才增加写入权限 |
| App Checks 读写 | 写入并读取 Release Ready，合并门禁和定版校验都绑定该 App |
| App Workflows 写入 | App 的提交或分支同步涉及工作流文件时配置，不因普通版本写入一律要求 |
| App Metadata 只读 | GitHub App 的基础权限，不授予无关的仓库管理、Secrets 或组织写权限 |
| RELEASE_APP_ID | 非敏感 ID 放仓库变量，核对与检查来源的 App 一致 |
| RELEASE_APP_PRIVATE_KEY | 私钥放 release-control Environment Secret；只核验名称和鉴权结果，不在日志或文档中输出内容 |
| Environment 来源 | release-control 只允许受保护的 main/canary；仓库级不保留同名私钥副本 |
| 版本写入基线 | main 已包含合法根版本及所需工具，再运行依赖它们的 PR 版本处理 |

先用真实 PR 验证 App token 能创建、PR 元数据可读取，版本准备或检查结果属于实际 head；再将 Release Ready 绑定为 main 的必需检查。首次定版另外核对 tag 的源码、Release 正文和公开状态；异常版本、占用冲突及中断恢复按随附测试与恢复入口验证。只有 Secret 名称存在时记录“凭据已保存，鉴权待验证”。

main 要求最新提交的代码检查和发布 App 提供的 `Release Ready` 成功，启用严格的分支最新检查，不使用 merge queue；该检查未覆盖 merge_group。发布说明或版本意图变化会生成新的清单提交，旧 SHA 的绿灯不授权新内容。合并定版核验 PR head 的检查来源 App ID，只读取合并提交中的冻结记录，不读取后来修改的标题或正文。自动发布还会比对合并事件快照中的标题和正文，确认与冻结记录一致；不一致则停止，审核后可明确恢复原冻结版本，合并后的文本编辑不影响已冻结结果。

版本元数据工作流使用 `pull_request_target` 和同仓库 guard，只检出工作流版本的工具，通过 API 读取 PR 数据，不执行 PR-head 代码。更新清单用 GraphQL `expectedHeadOid` 防止覆盖并发提交；PR 的实际代码检查在无发布凭据的工作流中完成，不强制脚本命名为 `ci`。

模板按实际合并提交的第一父提交复核版本，正式 tag 按 main 祖先关系筛选，其他分支的高版本不会改变本发行线的计算；同名 tag 已被占用仍会停止。首版显式指定，后续 patch 在实际 main 基线上复核。批量发包、其他 tag 前缀或预发布的写入策略另行适配，不把这些 YAML 当作多包自动化。

发布队列使用 `queue: max` 保留待执行任务、`cancel-in-progress: false` 保留进行中的任务；仍需检查 GitHub 的队列容量及运行结果。版本未完成时先恢复，连续发布不以跳过前一版来解决冲突。tag 通过 create-ref 创建并读回校验，已有 tag 不能移动；Release 创建后再次读回 tag、公开状态和正文，旧版恢复不会覆盖更新版本的 latest。

同一受检 head 不复用于新的发布 PR；重新准备并等待该 PR 的清单与检查。合并事件与计划不符时 main 可能已经写入版本，但 Release 未创建，先核对状态再恢复。若计划缺失或属于另一个 PR，自动恢复会拒绝；核对实际合并 SHA、版本、基线、说明和检查后，使用明确版本与 SHA 的人工定版入口补齐 tag/Release，或通过审核的回退 PR 撤销未完成版本，不强制重置 main。

失败后可重跑原运行，或从受保护的 main/canary 手动运行 Auto Tag Release，填写原已合并 PR 的 `pull_number`。它使用原 merge SHA 和版本；未合并、非发布 PR、错误版本或 tag 归属冲突都会失败，不会绿色空跑。使用 `node --test .github/scripts/release.test.mjs` 执行回归测试。

在 GitHub 规则集中，正式 `v*` tag 的创建权限与已创建 tag 的不可变约束分别配置：创建规则仅允许发布 App，更新／删除限制不向该 App 开放绕过，确保机器人也不能移动正式 tag。Release 写入者通过仓库及 App 权限控制；需要锁定已发布说明或附件时，再按交付方式选择 Release 不可变设置。

若使用 Release 事件启动产物分发，相应工作流需存在于默认分支。事件工作流可能来自 tagged revision，`github.workflow_sha` 本身不能代替 tag 控制与工作流审核。
