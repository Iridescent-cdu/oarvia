---
name: git-workflow
description: 约定分支与 PR 方向，指导仓库初始化、日常开发、发布、热修复和合并回同步。
---

# 分支与协作规则

- 根据现有分支、远端记录和待处理改动确定当前任务：初始化分支、开发 PR、发布 PR、热修复、合并或回同步；明确源分支、目标分支与操作范围，不因咨询或配置自动提交、推送、合并或发布。
- 双分支方案使用 main 保存正式发行线、canary 集成日常开发并作为默认分支；首次接入先确认正式基线与开发起点的历史关系，已有分支不覆盖或强制移动，改名和默认分支迁移按确定的初始化方案执行。
- 日常功能、修复和维护从 canary 创建 `<type>/<short-description>` 分支，PR 指向 canary；周更和功能版本从 canary 创建 release 分支，PR 指向 main。临时分支按任务创建，不提前建齐。
- 正式版热修复从 main 创建 hotfix 分支，专项迁移从 main 创建发布分支并只挑入目标修改；PR 指向 main，不带入 canary 中尚未发布的功能。
- 普通开发 PR 使用 squash，最终消息取 PR 标题并附实际 PR 编号；发布汇总使用 merge 保留原始记录，热修复使用 merge 或 squash。仅在自己的任务分支上通过 rebase 更新开发基线，不改写已发布的共享历史。
- 发布前确定比较范围、目标版本、更新说明与源码；分支名标识用途，版本以显式发布标题或确定的版本结果为准。准备 PR 不代表已经正式发布，不能把创建 tag、Release 或上传产物当作同一动作。
- 合并前核对 PR 的源、目标、实际改动、最新 head SHA 的必需检查和发布元数据；机器人改版本或解决冲突后等待更新后的检查。合并使用已核对的 PR 与 head，不绕过分支保护，源发生变化时重新核对。
- 正式发行或热修复合入 main 后回同步 canary，使用 merge 保留 main 的祖先关系，不使用 squash。允许直接更新且合并成功时记录结果；目标分支受保护或冲突时创建或复用同步 PR，在基于 canary 的同步分支解决冲突，不将 canary 合入 main，不提交冲突标记。
- 启用自动化前确认 main 与默认分支包含已启用工作流及其工具脚本，配置机器人权限、分支保护和代码合并门禁；版本工作流负责写入版本与创建标记，分发工作流负责产物交付，失败时保留各阶段状态并恢复缺失步骤。
- 首次接入按基线、工作流、真实检查、合并门禁的依赖顺序启用；目标分支缺少版本清单或工具时先完成初始化，不把初始化 PR 当作正常发版。不能要求尚无工作流能产生的检查，也不绕过已有保护解决初始化问题。
- 记录分支起点、PR 地址、源与目标、合并方式及合并 SHA，区分未合并、已合并、已创建版本和已交付产物；未实际执行的步骤作为待办，不报告完成。

## 示例

**首次接入。** 长期只需要下面两条分支：

| 分支   | 用途                   | 创建起点                              |
| ------ | ---------------------- | ------------------------------------- |
| main   | 正式发行线             | 已确认的正式版本或初始化基线          |
| canary | 默认分支，集成日常开发 | main 的基线，或包含它的已确认开发提交 |

仓库只有 master 时，先核对代码、历史与未提交改动，再选择 main 的基线和 canary 的开发起点；分支引用确定的提交，不能把未提交工作区当作正式版本。已有 main／canary 时核对用途与差异，不重建；master 的改名或保留按迁移方案处理。

main 与 canary 可以从同一初始化提交起步，但此时没有差异，不能立即创建有内容的发布 PR。后续开发合入 canary 后再准备发布；若要立即建立首版，可在发布分支做一次真实的清单定版提交，例如将根版本从 0.0.0 写为 0.1.0，再以明确标题创建发布 PR；机器人检测值已一致后不会再次递增。已有清单与版本完全一致、只需给同一提交建立标记时，可使用明确版本与 SHA 的手动版本操作。

采用随附方案时，main 和默认分支 canary 都保留已启用的版本、回同步和分发工作流及其 `.github/scripts/` 工具；仓库设置启用本方案需要的 squash 和 merge commit 合并方式。GitHub App 与分发凭据分别配置，仅创建分支不会自动生成版本或完成交付。

在 GitHub Settings 中接入这一分支方案时，按下面的归属配置。tag／Release 的写入控制、变量和凭据由所选版本、分发入口说明；项目文档记录实际仓库、分支和启用结果，不把项目 ID 写进通用技能。当前同步模板使用 GitHub.com 的 `queue: max`，其他 GitHub 部署先核对支持情况。

| 设置 | 选择与完成条件 |
| --- | --- |
| 分支与默认分支 | main/canary 引用已确认的提交，canary 为默认分支；已有分支只核对，不覆盖 |
| 合并设置 | 允许 merge 和 squash，普通 squash 消息默认用 PR 标题；本方案不使用 rebase merge |
| 长期分支保护 | 要求 PR，禁止删除和强推；审核人数按团队约定，不为单人仓库强制增加无法满足的审批 |
| CI 门禁 | 使用真实 job 的检查名，等待运行成功后绑定 GitHub Actions 来源；要求最新基线通过检查 |
| main 版本门禁 | 版本检查产生真实结果后，再要求发布 App 提供的 Release Ready；随附版本模板不处理 merge_group，因此 main 不启用 merge queue；回同步仍允许 merge |
| 验收 | 分别核对设置已保存、最新源码检查通过、PR 可按预定方式合并；缺少任一结果都不能报告链路已启用 |

如果目标分支尚无根版本与 CI，先从已提交基线建立初始化分支，通过初始化 PR 将清单、代码和基础 CI 合入正式基线，再接入依赖该基线的版本工作流。工作流首次安装、普通非发布 PR 与首个发布 PR 分开处理；初始化期间不启用尚无法产出的 Release Ready 门禁。

随后运行真实 PR 检查，核对检查名称与提供它的 App，再绑定必需检查来源并启用门禁。main 与 canary 都应保留已启用工作流及脚本，最后分别演练开发 PR、发布 PR 和回同步。已经存在保护规则时，通过满足这些规则的初始化 PR 接入，不临时取消保护或使用管理员绕过。

**日常开发。** 从更新后的开发基线创建任务分支，检查、提交后再开 PR：

| 改动 | 起点 | 临时分支示例 | PR 目标 | 合并方式 |
| --- | --- | --- | --- | --- |
| 新功能 | canary | feat/login | canary | squash |
| 日常修复 | canary | fix/login-error | canary | squash |
| 文档或工具维护 | canary | docs/api-guide、chore/update-tools | canary | squash |

下面是使用 Git 与 GitHub CLI 创建功能 PR 的命令示例。`PR_BODY_FILE` 指向已写好的本次 PR 正文文件；两个命令块之间完成实现、项目检查和提交。GitHub 网页也可以选择相同的来源、目标和标题：

```sh
git fetch origin
git switch -c feat/login origin/canary
```

```sh
git push -u origin feat/login
gh pr create --base canary --head feat/login \
  --title '✨ feat(auth): add login' --body-file "$PR_BODY_FILE"
```

提交前执行目标项目要求的检查；本地 hook 只检查它负责的内容，不代替完整检查。普通 PR 合入 canary 只完成开发集成，可以积累多个功能后再发布。

**准备发布。** 先选定本次开发范围和目标版本，再从该范围创建发布分支，正文保存英文更新说明。例如已确定发布 `1.3.0`：

```sh
git fetch origin
git switch -c release/v1.3.0 origin/canary
git push -u origin release/v1.3.0
gh pr create --base main --head release/v1.3.0 \
  --title '🚀 release: v1.3.0' --body-file "$RELEASE_NOTES_FILE"
```

`RELEASE_NOTES_FILE` 指向已核验的说明文件。分支与标题中的版本保持一致，但工作流读取的是 PR 标题或计算结果，不从分支后缀取版本。首版用明确的版本标题；周更可以使用 `release/weekly-YYYYMMDD` 和日期标题，由选定的版本策略计算 patch。

接入 PR 版本自动化时，创建 PR 后等待版本机器人提交根版本与冻结的发布清单；核对目标版本、说明、diff 和最新提交的 CI，再以 merge 合入 main。前一个版本的 tag 与公开 Release 未完成时，先恢复该版本；不要并行合入多个尚未定版的发布 PR。除首次接入时为形成有效 PR 而做的一次清单定版外，由版本工作流维护版本，不重复手改或提前打 tag。未接入版本自动化时，使用人工准备好的版本与说明，合并后对实际合并 SHA 创建标记。

GitHub 页面选择对应合并方式即可。下面只展示已检查 PR 的命令入口，`PR_NUMBER` 和 `EXPECTED_HEAD_SHA` 均来自当前 PR 的实际记录。普通开发 PR 使用：

```sh
gh pr merge "$PR_NUMBER" --squash --match-head-commit "$EXPECTED_HEAD_SHA"
```

发布汇总 PR 使用：

```sh
gh pr merge "$PR_NUMBER" --merge --match-head-commit "$EXPECTED_HEAD_SHA"
```

命令不使用管理员绕过选项。分支保护、检查或冲突阻止合并时，处理对应问题；PR head 改变后重新读取并核对，不把旧检查结果用于新提交。

合并后，版本工作流读取确定版本，在合并 SHA 上创建 tag 与 GitHub Release；Release 事件可以触发镜像等分发工作流。分别核验版本记录和产物交付，再记录 main 回同步 canary 的结果。GitHub Release 已创建但镜像失败时，状态是“版本已创建、镜像未交付”，恢复分发而不重新递增版本。

**热修复与专项迁移。** 已发布版本出现紧急问题时，从 main 创建 `hotfix/login-error`，只修目标问题，PR 指向 main，使用 `🐛 fix(auth): ...` 这类标题；核对 patch 版本、说明与 CI 后以 merge 或 squash 合入。专项迁移同样从 main 出发，只挑入需要的提交，说明结构变化、兼容性和恢复要求。两种情况都不通过合入整个 canary 来取得目标修改。

**回同步。** [sync-main-to-canary.yml](assets/sync-main-to-canary.yml) 复制到 `.github/workflows/`，监听 main push，也可手动触发。它把 main 合入 canary，受保护或冲突时创建或复用 `main → canary` PR；若需要解决冲突，改在基于 canary 的同步分支合入 main，再将该分支 PR 合回 canary。

示例在 `release-control` Environment 中读取 `RELEASE_APP_PRIVATE_KEY`，并使用 `RELEASE_APP_ID` 仓库变量，App 具有 Contents 与 Pull requests 读写权限；不检出或执行业务代码。队列保留待执行运行，手动入口只从受保护的 main/canary 运行。同步 PR 使用 merge，保留 main 的提交已进入 canary 的历史关系，避免 squash 后反复被判断为未同步。其标题只是说明同步目的，目标是 canary，不会进入指向 main 的发布链路。已同步时重跑不重复开 PR。

**按任务衔接。** 分支和合并流程只安排本次需要的阶段；已有提交、版本或产物时，直接使用这些已确认结果：

| 任务 | 对应技能 | 所需输入与结果 |
| --- | --- | --- |
| 整理提交或消息 | git-commit | 指定 diff／暂存内容／标题，得到提交范围、消息或提交 SHA |
| 确定版本与更新说明 | version-release | 源码范围、基线或已有版本，得到版本、完整 SHA、tag 与说明及状态 |
| 创建 PR、审核与合并 | git-workflow | 分支、版本与说明、检查结果，得到 PR 和实际合并 SHA |
| 构建与交付 | release-publish | 明确的版本、tag／Release 或完整 SHA、渠道，得到各产物交付记录 |

例如开发 PR 合入 canary 后可以继续积累功能；发布 PR 合入 main 后，分别跟踪版本记录、产物交付与回同步结果。已有版本或交付结果时，从相应状态继续处理。
